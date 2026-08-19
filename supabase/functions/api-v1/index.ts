import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// CORS Headers
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
      },
    },
    status,
  );
}

function sortKeysRecursively(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursively);
  }
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysRecursively(obj[key]);
  }
  return sorted;
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(data),
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const rawPath = url.pathname
    .replace(/^\/functions\/v1/, "")
    .replace(/^\/api-v1/, "");
  const path = rawPath.replace(/\/+$/, "") || "/";

  // 1. Healthcheck Endpoint
  if (path === "/health" || path === "/") {
    return jsonResponse({
      status: "ok",
      version: "1.2.0-phase3",
      timestamp: new Date().toISOString(),
    });
  }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL") ||
    Deno.env.get("API_URL") ||
    "http://127.0.0.1:54321";
  const supabaseServiceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY") ||
    "";

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // 2. Authentication & JWT Extraction
  const authHeader =
    req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse(
      "AUTH_REQUIRED",
      "Authorization Bearer token required",
      401,
    );
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const { data: userData, error: userError } =
    await serviceClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return errorResponse(
      "AUTH_INVALID_CREDENTIALS",
      "Valid session token required",
      401,
    );
  }

  const user = userData.user;
  const userId = user.id;

  // Extract JWT claims (AAL, role) from token
  let jwtAal = "aal1";
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4 !== 0) {
        base64 += "=";
      }
      const payloadJson = atob(base64);
      const claims = JSON.parse(payloadJson);
      jwtAal =
        claims.aal ||
        (claims.amr &&
        claims.amr.some((m: { method: string }) => m.method === "totp")
          ? "aal2"
          : "aal1");
    }
  } catch {}

  // 3. Read Body
  let body: Record<string, any> = {};
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    try {
      const text = await req.text();
      if (text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      return errorResponse(
        "INVALID_JSON",
        "Request body must be valid JSON",
        400,
      );
    }
  }

  try {
    // -------------------------------------------------------------
    // Helper: Execute Idempotent Mutative Operation (Section 13, 14, 15)
    // -------------------------------------------------------------
    async function runIdempotentOp(
      scope: string,
      operation: string,
      operationArgs: Record<string, any>,
    ): Promise<Response> {
      const idempotencyKey =
        req.headers.get("Idempotency-Key") ||
        req.headers.get("idempotency-key");

      if (!idempotencyKey) {
        return errorResponse(
          "IDEMPOTENCY_KEY_REQUIRED",
          "Idempotency-Key header is required for this operation",
          400,
        );
      }

      if (!UUID_V4_REGEX.test(idempotencyKey)) {
        return errorResponse(
          "VALIDATION_ERROR",
          "Idempotency-Key must be a valid UUID v4",
          400,
        );
      }

      const canonicalPayload = JSON.stringify(sortKeysRecursively(body));
      const fingerprint = await sha256Hex(
        `${userId}:${req.method}:${path}:${canonicalPayload}`,
      );

      const { data, error } = await serviceClient.rpc(
        "execute_idempotent_operation",
        {
          p_actor_id: userId,
          p_scope: scope,
          p_key: idempotencyKey,
          p_fingerprint: fingerprint,
          p_operation: operation,
          p_args: operationArgs,
        },
      );

      if (error) {
        if (error.message.includes("IDEMPOTENCY_FINGERPRINT_MISMATCH")) {
          return errorResponse(
            "IDEMPOTENCY_FINGERPRINT_MISMATCH",
            "Request payload fingerprint does not match original request",
            422,
          );
        }

        // Map domain errors
        let errCode = "BAD_REQUEST";
        let errMsg = "Operation failed";

        if (error.message.includes("BUSINESS_ALREADY_EXISTS")) {
          errCode = "BUSINESS_ALREADY_EXISTS";
          errMsg = "User already owns a business entity";
        } else if (error.message.includes("TAX_ID_EXISTS")) {
          errCode = "TAX_ID_EXISTS";
          errMsg = "Business with tax ID already exists";
        } else if (error.message.includes("BUSINESS_NOT_FOUND")) {
          errCode = "BUSINESS_NOT_FOUND";
          errMsg = "Business does not exist";
        } else if (error.message.includes("BUSINESS_INACTIVE")) {
          errCode = "BUSINESS_INACTIVE";
          errMsg = "Cannot perform operation on inactive business";
        } else if (error.message.includes("AUTH_FORBIDDEN")) {
          errCode = "AUTH_FORBIDDEN";
          errMsg = "Action forbidden for current user role";
        } else if (error.message.includes("INVALID_LOCATION_SCOPE")) {
          errCode = "INVALID_LOCATION_SCOPE";
          errMsg =
            "One or more location IDs are invalid or belong to another business";
        } else if (error.message.includes("MEMBER_ALREADY_EXISTS")) {
          errCode = "MEMBER_ALREADY_EXISTS";
          errMsg = "User is already a member of this business";
        } else if (error.message.includes("DRIVER_NOT_FOUND")) {
          errCode = "DRIVER_NOT_FOUND";
          errMsg = "Driver profile not found";
        } else if (error.message.includes("ACCOUNT_RESTRICTED")) {
          errCode = "ACCOUNT_RESTRICTED";
          errMsg = "Account is restricted";
        } else if (error.message.includes("LICENSE_PLATE_EXISTS")) {
          errCode = "LICENSE_PLATE_EXISTS";
          errMsg = "Vehicle with license plate is already registered";
        } else if (error.message.includes("NATIONAL_ID_EXISTS")) {
          errCode = "NATIONAL_ID_EXISTS";
          errMsg = "National ID number already registered";
        } else if (error.message.includes("LICENSE_EXISTS")) {
          errCode = "LICENSE_EXISTS";
          errMsg = "Driver license already registered";
        } else if (error.message.includes("UPLOAD_UNVERIFIED")) {
          errCode = "UPLOAD_UNVERIFIED";
          errMsg = "Upload authorization not found or invalid";
        } else if (error.message.includes("EXPIRED_UPLOAD_REF")) {
          errCode = "EXPIRED_UPLOAD_REF";
          errMsg = "Upload reference has expired";
        } else if (error.message.includes("DOCUMENT_ALREADY_SUBMITTED")) {
          errCode = "DOCUMENT_ALREADY_SUBMITTED";
          errMsg = "Active document already submitted for this type";
        } else if (error.message.includes("DOCUMENTATION_INCOMPLETE")) {
          errCode = "DOCUMENTATION_INCOMPLETE";
          errMsg = "Driver must have vehicle and all 3 required documents";
        } else if (error.message.includes("AUTH_ADMIN_ROLE_REQUIRED")) {
          errCode = "AUTH_ADMIN_ROLE_REQUIRED";
          errMsg = "Administrative role required";
        } else if (error.message.includes("AUTH_MFA_REQUIRED")) {
          errCode = "AUTH_MFA_REQUIRED";
          errMsg = "AAL2 MFA required";
        } else if (error.message.includes("INVALID_ARGUMENT")) {
          errCode = "INVALID_ARGUMENT";
          errMsg = "Invalid request arguments";
        }

        return errorResponse(errCode, errMsg, 400);
      }

      const isCached = data?.is_cached === true;
      const status = data?.response_status || 200;
      const resBody = data?.response_body || {};

      return jsonResponse(
        resBody,
        status,
        isCached ? { "X-Cache": "HIT" } : {},
      );
    }

    // -------------------------------------------------------------
    // Route 1: POST /businesses or /business/onboarding (Section 16)
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/businesses" || path === "/business/onboarding")
    ) {
      const legalName = body.legal_name || body.legalName;
      const brandName = body.brand_name || body.brandName || null;
      const taxId = body.tax_id || body.taxId;

      if (!legalName || !taxId) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "legal_name and tax_id are required",
          400,
        );
      }

      return await runIdempotentOp("business_creation", "create_business", {
        legal_name: legalName,
        brand_name: brandName,
        tax_id: taxId,
      });
    }

    // -------------------------------------------------------------
    // Route 2: POST /businesses/:id/locations or /business/locations (Section 17, 18)
    // -------------------------------------------------------------
    const bizLocationMatch = path.match(/^\/businesses\/([^\/]+)\/locations$/);
    if (
      req.method === "POST" &&
      (bizLocationMatch || path === "/business/locations")
    ) {
      const businessId =
        bizLocationMatch?.[1] || body.business_id || body.businessId;
      const name =
        body.location_name || body.name || body.branch_name || body.branchName;
      const addressText =
        body.address_text ||
        body.addressText ||
        body.branch_address ||
        body.branchAddress;
      const latitude =
        body.latitude !== undefined
          ? body.latitude
          : body.lat !== undefined
            ? body.lat
            : body.branchLatitude;
      const longitude =
        body.longitude !== undefined
          ? body.longitude
          : body.lng !== undefined
            ? body.lng
            : body.branchLongitude;
      const phone = body.phone || null;

      if (
        !businessId ||
        !name ||
        !addressText ||
        latitude === undefined ||
        longitude === undefined
      ) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "business_id, location_name, address_text, latitude, and longitude are required",
          400,
        );
      }

      return await runIdempotentOp(
        `business_location:${businessId}`,
        "create_business_location",
        {
          business_id: businessId,
          location_name: name,
          address_text: addressText,
          latitude: Number(latitude),
          longitude: Number(longitude),
          phone,
        },
      );
    }

    // -------------------------------------------------------------
    // Route 3: POST /businesses/:id/members or /business/members (Section 19)
    // -------------------------------------------------------------
    const bizMemberMatch = path.match(/^\/businesses\/([^\/]+)\/members$/);
    if (
      req.method === "POST" &&
      (bizMemberMatch || path === "/business/members")
    ) {
      const businessId =
        bizMemberMatch?.[1] || body.business_id || body.businessId;
      const targetUserId = body.user_id || body.userId;
      const role = body.role;
      const locationIds = body.location_ids || body.locationIds || [];

      if (!businessId || !targetUserId || !role) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "business_id, user_id, and role are required",
          400,
        );
      }

      if (!Array.isArray(locationIds) || locationIds.length === 0) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "At least one location_id is required for member assignment",
          400,
        );
      }

      return await runIdempotentOp(
        `business_member:${businessId}`,
        "add_business_member",
        {
          business_id: businessId,
          target_user_id: targetUserId,
          role: role.replace("business_", ""),
          location_ids: locationIds,
        },
      );
    }

    // -------------------------------------------------------------
    // Route 4: POST /driver/onboarding
    // -------------------------------------------------------------
    if (req.method === "POST" && path === "/driver/onboarding") {
      const nationalIdNumber =
        body.national_id_number || body.nationalIdNumber || body.national_id;
      const licenseNumber =
        body.license_number || body.licenseNumber || body.license;

      if (!nationalIdNumber || !licenseNumber) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "national_id_number and license_number are required",
          400,
        );
      }

      return await runIdempotentOp("driver_onboarding", "register_driver", {
        national_id_number: nationalIdNumber,
        license_number: licenseNumber,
      });
    }

    // -------------------------------------------------------------
    // Route 5: POST /driver/vehicles or /driver/vehicle (Section 24)
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/driver/vehicles" || path === "/driver/vehicle")
    ) {
      const make = body.make || body.vehicle_make || body.vehicleMake;
      const model = body.model || body.vehicle_model || body.vehicleModel;
      const year =
        body.year !== undefined
          ? body.year
          : body.vehicle_year !== undefined
            ? body.vehicle_year
            : body.vehicleYear;
      const color = body.color || body.vehicle_color || body.vehicleColor;
      const licensePlate =
        body.license_plate ||
        body.licensePlate ||
        body.vehicle_license_plate ||
        body.vehicleLicensePlate;

      if (!make || !model || year === undefined || !color || !licensePlate) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "make, model, year, color, and license_plate are required",
          400,
        );
      }

      return await runIdempotentOp("driver_vehicle", "register_vehicle", {
        make,
        model,
        year: Number(year),
        color,
        license_plate: licensePlate,
      });
    }

    // -------------------------------------------------------------
    // Route 6: POST /driver/documents/upload-authorization (Signed Upload, Section 4, 6)
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/driver/documents/upload-authorization" ||
        path === "/driver/documents/signed-upload")
    ) {
      const documentType = (body.document_type || body.documentType || "")
        .toUpperCase()
        .trim();
      const mimeType = (body.mime_type || body.mimeType || "")
        .toLowerCase()
        .trim();
      const sizeBytes = Number(body.size_bytes || body.sizeBytes || 0);

      const validTypes = [
        "NATIONAL_ID",
        "DRIVER_LICENSE",
        "VEHICLE_REGISTRATION",
        "CRIMINAL_RECORD",
        "INSURANCE",
      ];
      if (!validTypes.includes(documentType)) {
        return errorResponse(
          "INVALID_DOCUMENT_TYPE",
          "document_type must be NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION, CRIMINAL_RECORD, or INSURANCE",
          400,
        );
      }

      // Strict allowed MIME types (NO WEBP, Section 4)
      const allowedMimes = ["image/jpeg", "image/png", "application/pdf"];
      if (!allowedMimes.includes(mimeType)) {
        return errorResponse(
          "INVALID_MIME_TYPE",
          "Allowed MIME types are image/jpeg, image/png, application/pdf",
          400,
        );
      }

      if (sizeBytes < 1 || sizeBytes > 10485760) {
        return errorResponse(
          "INVALID_FILE_SIZE",
          "File size must be between 1 byte and 10MB",
          400,
        );
      }

      // Authorize via database RPC
      const { data: authData, error: authError } = await serviceClient.rpc(
        "authorize_driver_document_upload",
        {
          p_actor_id: userId,
          p_document_type: documentType,
          p_mime_type: mimeType,
          p_size_bytes: sizeBytes,
        },
      );

      if (authError || !authData) {
        if (authError?.message?.includes("ACCOUNT_RESTRICTED")) {
          return errorResponse(
            "ACCOUNT_RESTRICTED",
            "Restricted drivers cannot upload documents",
            400,
          );
        }
        return errorResponse(
          "UPLOAD_AUTHORIZATION_FAILED",
          "Could not create upload authorization",
          400,
        );
      }

      const storagePath = authData.storage_path;
      const uploadId = authData.upload_id;

      // Generate signed upload URL with TTL <= 15 minutes (900 seconds)
      const { data: signedData, error: signedError } =
        await serviceClient.storage
          .from("driver-documents")
          .createSignedUploadUrl(storagePath);

      if (signedError || !signedData) {
        return errorResponse(
          "SIGNED_URL_FAILED",
          "Could not generate signed upload URL",
          500,
        );
      }

      let uploadUrl = signedData.signedUrl;
      uploadUrl = uploadUrl
        .replace(/http:\/\/kong:8000/g, "http://127.0.0.1:54321")
        .replace(/http:\/\/localhost:8000/g, "http://127.0.0.1:54321");
      if (uploadUrl.startsWith("/")) {
        uploadUrl = `http://127.0.0.1:54321${uploadUrl}`;
      }

      return jsonResponse(
        {
          upload_id: uploadId,
          upload_url: uploadUrl,
          storage_path: storagePath,
          expires_at: authData.expires_at,
        },
        200,
      );
    }

    // -------------------------------------------------------------
    // Route 7: POST /driver/documents or /driver/documents/commit (Section 7, 10)
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/driver/documents" || path === "/driver/documents/commit")
    ) {
      const uploadId = body.upload_id || body.uploadId;
      const documentType = (body.document_type || body.documentType || "")
        .toUpperCase()
        .trim();

      if (!uploadId || !documentType) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "upload_id and document_type are required",
          400,
        );
      }

      // Check upload authorization in private table
      const { data: authRecord, error: authLookupError } = await serviceClient
        .from("driver_document_upload_authorizations")
        .select("*")
        .eq("upload_id", uploadId)
        .maybeSingle();

      if (authLookupError || !authRecord) {
        return errorResponse(
          "UPLOAD_UNVERIFIED",
          "Valid upload authorization not found",
          400,
        );
      }

      if (authRecord.driver_id !== userId) {
        return errorResponse(
          "UPLOAD_UNVERIFIED",
          "Upload authorization does not belong to actor",
          403,
        );
      }

      if (new Date(authRecord.expires_at) < new Date()) {
        return errorResponse(
          "EXPIRED_UPLOAD_REF",
          "Upload authorization has expired",
          400,
        );
      }

      if (authRecord.committed_at) {
        return errorResponse(
          "UPLOAD_UNVERIFIED",
          "Upload authorization has already been committed",
          400,
        );
      }

      // Verify physical storage object existence in bucket (fail-closed, Section 7)
      const storagePath = authRecord.storage_path;
      const parts = storagePath.split("/");
      const folderName = parts.slice(0, -1).join("/");
      const fileName = parts[parts.length - 1];

      const { data: fileList, error: listError } = await serviceClient.storage
        .from("driver-documents")
        .list(folderName, { search: fileName });

      const fileObj = fileList?.find((f) => f.name === fileName);

      let actualSize = fileObj?.metadata?.size;
      let actualMime = fileObj?.metadata?.mimetype;

      if (!actualSize || !actualMime) {
        // Fallback: download file to verify bytes directly
        const { data: downloadData, error: downloadError } =
          await serviceClient.storage
            .from("driver-documents")
            .download(storagePath);

        if (downloadError || !downloadData) {
          return errorResponse(
            "UPLOAD_UNVERIFIED",
            "Uploaded file not found in storage bucket",
            400,
          );
        }

        actualSize = downloadData.size;
        actualMime = downloadData.type || authRecord.mime_type;
      }

      if (
        !actualSize ||
        actualSize < 1 ||
        actualSize > authRecord.max_size_bytes
      ) {
        return errorResponse(
          "INVALID_FILE_SIZE",
          "Uploaded file size does not match authorization",
          400,
        );
      }

      return await runIdempotentOp(
        `driver_document:${userId}:${documentType}`,
        "commit_driver_document",
        {
          upload_id: uploadId,
          document_type: documentType,
          file_size: actualSize,
          mime_type: actualMime,
        },
      );
    }

    // -------------------------------------------------------------
    // Route 8: Admin Driver Verification Queue & Detail (Section 25)
    // -------------------------------------------------------------
    if (req.method === "GET" && path === "/admin/verifications/drivers") {
      // Validate Admin Profile Role
      const { data: profileData } = await serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .maybeSingle();

      const role = profileData?.platform_role;
      if (
        !role ||
        !["super_admin", "admin", "verification_agent"].includes(role)
      ) {
        return errorResponse(
          "AUTH_ADMIN_ROLE_REQUIRED",
          "Verification agent or admin role required",
          403,
        );
      }

      if (jwtAal !== "aal2") {
        return errorResponse(
          "AUTH_MFA_REQUIRED",
          "AAL2 MFA is required for administrative verification queue",
          403,
        );
      }

      // Fetch driver list needing review/pending
      const { data: drivers, error: driversError } = await serviceClient
        .from("drivers")
        .select(
          "id, national_id_number, license_number, verification_status, account_status, created_at, updated_at",
        )
        .order("created_at", { ascending: false });

      if (driversError) {
        return errorResponse(
          "DATABASE_ERROR",
          "Failed to retrieve verification queue",
          500,
        );
      }

      return jsonResponse({
        drivers: drivers || [],
      });
    }

    const adminDriverDetailMatch = path.match(
      /^\/admin\/verifications\/drivers\/([^\/]+)$/,
    );
    if (req.method === "GET" && adminDriverDetailMatch) {
      const targetDriverId = adminDriverDetailMatch[1];

      // Validate Admin Profile Role
      const { data: profileData } = await serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .maybeSingle();

      const role = profileData?.platform_role;
      if (
        !role ||
        !["super_admin", "admin", "verification_agent"].includes(role)
      ) {
        return errorResponse(
          "AUTH_ADMIN_ROLE_REQUIRED",
          "Verification agent or admin role required",
          403,
        );
      }

      if (jwtAal !== "aal2") {
        return errorResponse(
          "AUTH_MFA_REQUIRED",
          "AAL2 MFA is required for administrative verification detail",
          403,
        );
      }

      const { data: driverData, error: driverError } = await serviceClient
        .from("drivers")
        .select("*")
        .eq("id", targetDriverId)
        .maybeSingle();

      if (driverError || !driverData) {
        return errorResponse("DRIVER_NOT_FOUND", "Driver not found", 404);
      }

      const { data: vehicles } = await serviceClient
        .from("vehicles")
        .select("*")
        .eq("driver_id", targetDriverId);

      const { data: documents } = await serviceClient
        .from("driver_documents")
        .select(
          "id, driver_id, document_type, storage_path, verification_status, rejection_reason, created_at, updated_at",
        )
        .eq("driver_id", targetDriverId)
        .order("created_at", { ascending: false });

      return jsonResponse({
        driver: driverData,
        vehicles: vehicles || [],
        documents: documents || [],
      });
    }

    // -------------------------------------------------------------
    // Route 9: Admin Signed Read URL for Driver Document (Section 26)
    // -------------------------------------------------------------
    const adminDocReadMatch = path.match(
      /^\/admin\/driver-documents\/([^\/]+)\/read-url$/,
    );
    if (req.method === "GET" && adminDocReadMatch) {
      const documentId = adminDocReadMatch[1];

      // Validate Admin Profile Role
      const { data: profileData } = await serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .maybeSingle();

      const role = profileData?.platform_role;
      if (
        !role ||
        !["super_admin", "admin", "verification_agent"].includes(role)
      ) {
        return errorResponse(
          "AUTH_ADMIN_ROLE_REQUIRED",
          "Verification agent or admin role required",
          403,
        );
      }

      if (jwtAal !== "aal2") {
        return errorResponse(
          "AUTH_MFA_REQUIRED",
          "AAL2 MFA is required to access document signed URLs",
          403,
        );
      }

      const { data: docData, error: docError } = await serviceClient
        .from("driver_documents")
        .select("storage_path")
        .eq("id", documentId)
        .maybeSingle();

      if (docError || !docData) {
        return errorResponse("DOCUMENT_NOT_FOUND", "Document not found", 404);
      }

      // Generate signed read URL with TTL <= 15 minutes (900s)
      const { data: signedData, error: signedError } =
        await serviceClient.storage
          .from("driver-documents")
          .createSignedUrl(docData.storage_path, 900);

      if (signedError || !signedData?.signedUrl) {
        return errorResponse(
          "SIGNED_URL_FAILED",
          "Could not generate signed download URL",
          500,
        );
      }

      let readUrl = signedData.signedUrl;
      readUrl = readUrl
        .replace(/http:\/\/kong:8000/g, "http://127.0.0.1:54321")
        .replace(/http:\/\/localhost:8000/g, "http://127.0.0.1:54321");
      if (readUrl.startsWith("/")) {
        readUrl = `http://127.0.0.1:54321${readUrl}`;
      }

      return jsonResponse({
        document_id: documentId,
        read_url: readUrl,
        expires_at: new Date(Date.now() + 900 * 1000).toISOString(),
      });
    }

    // -------------------------------------------------------------
    // Route 10: Admin Approve / Reject Driver (Section 11, 27)
    // -------------------------------------------------------------
    const adminApproveMatch = path.match(
      /^\/admin\/drivers\/([^\/]+)\/approve$/,
    );
    const adminRejectMatch = path.match(/^\/admin\/drivers\/([^\/]+)\/reject$/);

    if (req.method === "POST" && (adminApproveMatch || adminRejectMatch)) {
      const driverId = adminApproveMatch
        ? adminApproveMatch[1]
        : adminRejectMatch![1];
      const decision = adminApproveMatch ? "APPROVE" : "REJECT";
      const rejectionReason =
        body.rejection_reason || body.rejectionReason || body.reason || null;

      // Validate Admin Profile Role
      const { data: profileData } = await serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .maybeSingle();

      const role = profileData?.platform_role;
      if (
        !role ||
        !["super_admin", "admin", "verification_agent"].includes(role)
      ) {
        return errorResponse(
          "AUTH_ADMIN_ROLE_REQUIRED",
          "Verification agent or admin role required",
          403,
        );
      }

      if (jwtAal !== "aal2") {
        return errorResponse(
          "AUTH_MFA_REQUIRED",
          "AAL2 MFA is required for administrative verification",
          403,
        );
      }

      if (
        decision === "REJECT" &&
        (!rejectionReason || rejectionReason.length < 3)
      ) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "Rejection reason is required and must be at least 3 characters",
          400,
        );
      }

      return await runIdempotentOp(
        `admin_verify:${driverId}`,
        "admin_verify_driver",
        {
          driver_id: driverId,
          decision,
          rejection_reason: rejectionReason,
          actor_aal: jwtAal,
        },
      );
    }

    return errorResponse(
      "NOT_FOUND",
      `Endpoint ${req.method} ${path} not found`,
      404,
    );
  } catch (err: any) {
    return errorResponse(
      "INTERNAL_SERVER_ERROR",
      "An unexpected server error occurred",
      500,
    );
  }
});

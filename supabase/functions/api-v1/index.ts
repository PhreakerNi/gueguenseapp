import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

// Allowed CORS origins & standard headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(
  body: Record<string, any>,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: any,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

// Deterministic JSON stringifier for fingerprinting
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

async function sha256Hex(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const rawPath = url.pathname
    .replace(/^\/functions\/v1/, "")
    .replace(/^\/api-v1/, "");
  const path = rawPath.replace(/\/+$/, "") || "/";

  // 1. Healthcheck Endpoint (Section 14)
  if (path === "/health" || path === "/") {
    return jsonResponse({
      status: "ok",
      version: "1.3.0-phase3",
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Environment Variables Check (Fail-Closed, Section 14)
  const supabaseUrl =
    Deno.env.get("SUPABASE_URL") || Deno.env.get("API_URL") || "";
  const supabaseServiceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY") ||
    "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return errorResponse(
      "SERVER_CONFIGURATION_ERROR",
      "Server configuration missing required environment variables",
      500,
    );
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // 3. Authentication & JWT Extraction
  const authHeader =
    req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse(
      "AUTH_REQUIRED",
      "Authorization Bearer token required",
      401,
    );
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userError } =
    await serviceClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return errorResponse(
      "AUTH_INVALID_TOKEN",
      "Invalid or expired JWT token",
      401,
    );
  }

  const user = userData.user;
  const userId = user.id;

  // 4. Session AAL Extraction from Current JWT Token Only (Section 2, 3)
  let jwtAal: "aal1" | "aal2" = "aal1";
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4 !== 0) {
        base64 += "=";
      }
      const payloadJson = atob(base64);
      const payload = JSON.parse(payloadJson);
      if (payload && payload.aal === "aal2") {
        jwtAal = "aal2";
      }
    }
  } catch {
    jwtAal = "aal1";
  }

  // 5. Read Body
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
    // Helper: Execute Idempotent Mutative Operation (Section 15, 16)
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
          p_actor_user_id: userId,
          p_scope: scope,
          p_key: idempotencyKey,
          p_request_fingerprint: fingerprint,
          p_operation_fn: operation,
          p_operation_params: operationArgs,
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
        let errMsg = error.message.replace(/^[^:]+:\s*/, "");

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
          errMsg = "Upload authorization not found or unverified";
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
        } else if (error.message.includes("INVALID_FILE_SIZE")) {
          errCode = "INVALID_FILE_SIZE";
          errMsg = "Uploaded file size does not match authorization";
        } else if (error.message.includes("INVALID_MIME_TYPE")) {
          errCode = "INVALID_MIME_TYPE";
          errMsg = "Uploaded file MIME type does not match authorization";
        } else if (error.message.includes("INVALID_STATE")) {
          errCode = "INVALID_STATE";
          errMsg = "Operation invalid for current entity state";
        } else if (error.message.includes("VEHICLE_MISSING")) {
          errCode = "VEHICLE_MISSING";
          errMsg = "Driver must have at least one registered vehicle";
        } else if (error.message.includes("PRICING_UNAVAILABLE")) {
          errCode = "PRICING_UNAVAILABLE";
          errMsg =
            "Pricing version or routing service is currently unavailable";
        } else if (error.message.includes("QUOTE_NOT_FOUND")) {
          errCode = "QUOTE_NOT_FOUND";
          errMsg = "Delivery quote not found";
        } else if (error.message.includes("QUOTE_INVALID_STATE")) {
          errCode = "QUOTE_INVALID_STATE";
          errMsg = "Quote is not in a valid state for this operation";
        } else if (error.message.includes("VALIDATION_ERROR")) {
          errCode = "VALIDATION_ERROR";
          errMsg = error.message.replace(/^[^:]+:\s*/, "");
        } else if (error.message.includes("INVALID_LOCATIONS")) {
          errCode = "INVALID_LOCATIONS";
          errMsg = "Specified business location does not exist";
        }

        let statusCode = 400;
        if (
          errCode === "AUTH_FORBIDDEN" ||
          errCode === "AUTH_ADMIN_ROLE_REQUIRED" ||
          errCode === "AUTH_MFA_REQUIRED" ||
          errCode === "BUSINESS_INACTIVE" ||
          errCode === "ACCOUNT_RESTRICTED" ||
          errCode === "INVALID_LOCATION_SCOPE"
        ) {
          statusCode = 403;
        } else if (
          errCode === "BUSINESS_NOT_FOUND" ||
          errCode === "DRIVER_NOT_FOUND" ||
          errCode === "DOCUMENT_NOT_FOUND" ||
          errCode === "QUOTE_NOT_FOUND"
        ) {
          statusCode = 404;
        } else if (errCode === "IDEMPOTENCY_FINGERPRINT_MISMATCH") {
          statusCode = 422;
        } else if (errCode === "PRICING_UNAVAILABLE") {
          statusCode = 503;
        }

        return errorResponse(errCode, errMsg, statusCode);
      }

      const isCached = data?.cached === true;
      const status = data?.status || 200;
      const resBody = data?.body || {};

      return jsonResponse(
        resBody,
        status,
        isCached ? { "X-Cache": "HIT" } : {},
      );
    }

    // -------------------------------------------------------------
    // Helper: Platform Role from public.profiles ONLY (Section 4)
    // -------------------------------------------------------------
    async function getProfileRole(targetUserId: string): Promise<string> {
      const { data: rpcRole, error: rpcErr } = await serviceClient.rpc(
        "get_user_platform_role",
        { p_user_id: targetUserId },
      );

      if (!rpcErr && typeof rpcRole === "string" && rpcRole) {
        return rpcRole;
      }

      const { data: profile, error: profileErr } = await serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", targetUserId)
        .maybeSingle();

      if (profileErr) {
        console.error(
          `[getProfileRole Error for ${targetUserId}]:`,
          JSON.stringify(profileErr),
        );
      }
      return profile?.platform_role || "none";
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
        tax_id: taxId,
        brand_name: brandName,
      });
    }

    // -------------------------------------------------------------
    // Route 2: POST /businesses/:id/locations (Section 17)
    // -------------------------------------------------------------
    const locMatch = path.match(/^\/businesses\/([^\/]+)\/locations$/);
    if (req.method === "POST" && locMatch) {
      const businessId = locMatch[1];
      const name = body.name || body.location_name || body.locationName;
      const addressLine1 =
        body.address_line_1 ||
        body.addressLine1 ||
        body.address_text ||
        body.addressText;
      const latitude = body.latitude;
      const longitude = body.longitude;
      const phone = body.phone || null;
      const pickupInstructions =
        body.pickup_instructions ||
        body.pickupInstructions ||
        body.instructions ||
        null;

      if (
        !name ||
        !addressLine1 ||
        latitude === undefined ||
        longitude === undefined
      ) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "name, address_line_1, latitude, and longitude are required",
          400,
        );
      }

      return await runIdempotentOp(
        `business_location:${businessId}`,
        "create_business_location",
        {
          business_id: businessId,
          name,
          address_line_1: addressLine1,
          latitude,
          longitude,
          phone,
          pickup_instructions: pickupInstructions,
        },
      );
    }

    // -------------------------------------------------------------
    // Route 3: POST /businesses/:id/members (Section 18)
    // -------------------------------------------------------------
    const memberMatch = path.match(/^\/businesses\/([^\/]+)\/members$/);
    if (req.method === "POST" && memberMatch) {
      const businessId = memberMatch[1];
      const targetUserId =
        body.target_user_id || body.targetUserId || body.user_id || body.userId;
      const role = body.role;
      const authorizedLocationIds =
        body.authorized_location_ids ||
        body.authorizedLocationIds ||
        body.location_ids ||
        body.locationIds ||
        null;

      if (!targetUserId || !role) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "target_user_id and role are required",
          400,
        );
      }

      return await runIdempotentOp(
        `business_member:${businessId}`,
        "create_business_member",
        {
          business_id: businessId,
          target_user_id: targetUserId,
          role,
          authorized_location_ids: authorizedLocationIds,
        },
      );
    }

    // -------------------------------------------------------------
    // Route 4: POST /driver/onboarding or /drivers (Section 19)
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/driver/onboarding" || path === "/drivers")
    ) {
      const nationalIdNumber = body.national_id_number || body.nationalIdNumber;
      const licenseNumber = body.license_number || body.licenseNumber;

      if (!nationalIdNumber || !licenseNumber) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "national_id_number and license_number are required",
          400,
        );
      }

      return await runIdempotentOp("driver_profile", "create_driver_profile", {
        national_id_number: nationalIdNumber,
        license_number: licenseNumber,
      });
    }

    // -------------------------------------------------------------
    // Route 5: POST /driver/vehicles (Section 20)
    // -------------------------------------------------------------
    if (req.method === "POST" && path === "/driver/vehicles") {
      const make = body.make;
      const model = body.model;
      const year = body.year;
      const color = body.color;
      const licensePlate = body.license_plate || body.licensePlate;

      if (!make || !model || !year || !color || !licensePlate) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "make, model, year, color, and license_plate are required",
          400,
        );
      }

      return await runIdempotentOp("driver_vehicle", "create_driver_vehicle", {
        make,
        model,
        year,
        color,
        license_plate: licensePlate,
      });
    }

    // -------------------------------------------------------------
    // Route 6: Driver Document Upload Authorization (Section 21, 17)
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      path === "/driver/documents/upload-authorization"
    ) {
      const documentType = (body.document_type || body.documentType || "")
        .toUpperCase()
        .trim();
      const mimeType = body.mime_type || body.mimeType;
      const sizeBytes = body.size_bytes || body.sizeBytes;

      if (!documentType || !mimeType || !sizeBytes) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "document_type, mime_type, and size_bytes are required",
          400,
        );
      }

      const { data: authData, error: authError } = await serviceClient.rpc(
        "authorize_driver_document_upload",
        {
          p_actor_id: userId,
          p_document_type: documentType,
          p_mime_type: mimeType,
          p_file_size: sizeBytes,
        },
      );

      if (authError) {
        if (authError.message.includes("AUTH_FORBIDDEN")) {
          return errorResponse(
            "AUTH_FORBIDDEN",
            "Action forbidden for current user",
            403,
          );
        }
        if (authError.message.includes("INVALID_MIME_TYPE")) {
          return errorResponse(
            "INVALID_MIME_TYPE",
            "Only application/pdf, image/jpeg, and image/png are supported",
            400,
          );
        }
        if (authError.message.includes("FILE_TOO_LARGE")) {
          return errorResponse(
            "FILE_TOO_LARGE",
            "File exceeds maximum allowed size",
            400,
          );
        }
        return errorResponse(
          "UPLOAD_AUTHORIZATION_FAILED",
          authError.message,
          400,
        );
      }

      // Generate real signed upload URL (Supabase provider TTL = 2h)
      const storagePath = authData.storage_path;
      const { data: uploadUrlData, error: uploadUrlError } =
        await serviceClient.storage
          .from("driver-documents")
          .createSignedUploadUrl(storagePath);

      if (uploadUrlError || !uploadUrlData?.signedUrl) {
        return errorResponse(
          "STORAGE_ERROR",
          "Failed to generate signed upload URL",
          500,
        );
      }

      let signedUploadUrl = uploadUrlData.signedUrl;
      if (
        signedUploadUrl.includes("://kong:") ||
        signedUploadUrl.includes("://kong/")
      ) {
        const publicBase = supabaseUrl.replace(/\/+$/, "");
        signedUploadUrl = signedUploadUrl.replace(
          /^https?:\/\/[^\/]+/,
          publicBase,
        );
      }

      return jsonResponse({
        upload_id: authData.upload_id,
        storage_path: authData.storage_path,
        upload_url: signedUploadUrl,
        expires_at: authData.expires_at,
      });
    }

    // -------------------------------------------------------------
    // Route 7: Driver Document Commit (Section 22, 8, 9)
    // -------------------------------------------------------------
    if (req.method === "POST" && path === "/driver/documents") {
      const uploadId = body.upload_id || body.uploadId;
      const documentType = body.document_type || body.documentType;

      if (!uploadId || !documentType) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "upload_id and document_type are required",
          400,
        );
      }

      // Check upload authorization in private schema
      const { data: authRecord } = await serviceClient
        .schema("private")
        .from("driver_document_upload_authorizations")
        .select("*")
        .eq("upload_id", uploadId)
        .maybeSingle();

      if (authRecord && authRecord.driver_id !== userId) {
        return errorResponse(
          "AUTH_FORBIDDEN",
          "Upload authorization belongs to another driver",
          403,
        );
      }

      return await runIdempotentOp(
        "commit_driver_document",
        "commit_driver_document",
        {
          upload_id: uploadId,
          document_type: documentType,
        },
      );
    }

    // -------------------------------------------------------------
    // Route 8: Admin Driver Verification Queue (Section 2, 4, 6)
    // -------------------------------------------------------------
    if (req.method === "GET" && path === "/admin/verifications/drivers") {
      const role = await getProfileRole(userId);
      if (!["super_admin", "admin", "verification_agent"].includes(role)) {
        return errorResponse(
          "AUTH_ADMIN_ROLE_REQUIRED",
          "Verification agent or admin role required",
          403,
        );
      }

      // Strict AAL2 check (Section 2)
      if (jwtAal !== "aal2") {
        return errorResponse(
          "AUTH_MFA_REQUIRED",
          "AAL2 MFA is required for administrative verification",
          403,
        );
      }

      const { data: rpcDrivers, error: rpcDriversErr } =
        await serviceClient.rpc("get_admin_driver_verification_queue");

      if (!rpcDriversErr && Array.isArray(rpcDrivers)) {
        return jsonResponse({
          drivers: rpcDrivers,
          count: rpcDrivers.length,
        });
      }

      const { data: drivers, error: driversError } = await serviceClient
        .from("drivers")
        .select("id, verification_status, account_status, created_at")
        .in("verification_status", ["PENDING", "UNDER_REVIEW"])
        .order("created_at", { ascending: false });

      if (driversError) {
        return errorResponse(
          "DATABASE_ERROR",
          "Database operation failed",
          500,
        );
      }

      return jsonResponse({
        drivers: drivers || [],
        count: drivers?.length || 0,
      });
    }

    // -------------------------------------------------------------
    // Route 9: Admin Driver Verification Detail (Section 2, 4, 5, 6)
    // -------------------------------------------------------------
    const driverDetailMatch = path.match(
      /^\/admin\/verifications\/drivers\/([^\/]+)$/,
    );
    if (req.method === "GET" && driverDetailMatch) {
      const targetDriverId = driverDetailMatch[1];

      const role = await getProfileRole(userId);
      if (!["super_admin", "admin", "verification_agent"].includes(role)) {
        return errorResponse(
          "AUTH_ADMIN_ROLE_REQUIRED",
          "Verification agent or admin role required",
          403,
        );
      }

      // Strict AAL2 check (Section 2)
      if (jwtAal !== "aal2") {
        return errorResponse(
          "AUTH_MFA_REQUIRED",
          "AAL2 MFA is required for administrative verification",
          403,
        );
      }

      const { data: rpcDetail, error: rpcDetailErr } = await serviceClient.rpc(
        "get_admin_driver_verification_detail",
        { p_driver_id: targetDriverId },
      );

      if (!rpcDetailErr && rpcDetail) {
        return jsonResponse(rpcDetail);
      }
      if (!rpcDetailErr && rpcDetail === null) {
        return errorResponse(
          "DRIVER_NOT_FOUND",
          "Driver profile not found",
          404,
        );
      }

      const { data: driver, error: driverErr } = await serviceClient
        .from("drivers")
        .select("*")
        .eq("id", targetDriverId)
        .maybeSingle();

      if (driverErr || !driver) {
        return errorResponse(
          "DRIVER_NOT_FOUND",
          "Driver profile not found",
          404,
        );
      }

      const { data: vehicles } = await serviceClient
        .from("vehicles")
        .select("*")
        .eq("driver_id", targetDriverId);

      const { data: documents } = await serviceClient
        .from("driver_documents")
        .select("*")
        .eq("driver_id", targetDriverId)
        .order("created_at", { ascending: false });

      return jsonResponse({
        driver,
        vehicle: vehicles?.[0] || null,
        vehicles: vehicles || [],
        documents: documents || [],
      });
    }

    // -------------------------------------------------------------
    // Route 10: Admin Signed Read URL for Driver Document (Section 2, 4, 7)
    // -------------------------------------------------------------
    const readUrlMatch = path.match(
      /^\/admin\/driver-documents\/([^\/]+)\/read-url$/,
    );
    if (req.method === "GET" && readUrlMatch) {
      const docId = readUrlMatch[1];

      const role = await getProfileRole(userId);
      if (!["super_admin", "admin", "verification_agent"].includes(role)) {
        return errorResponse(
          "AUTH_ADMIN_ROLE_REQUIRED",
          "Verification agent or admin role required",
          403,
        );
      }

      // Strict AAL2 check (Section 2)
      if (jwtAal !== "aal2") {
        return errorResponse(
          "AUTH_MFA_REQUIRED",
          "AAL2 MFA is required for administrative verification",
          403,
        );
      }

      let storagePath: string | null = null;
      const { data: rpcDoc, error: rpcDocErr } = await serviceClient.rpc(
        "get_driver_document_storage_path",
        { p_document_id: docId },
      );

      if (!rpcDocErr && rpcDoc?.storage_path) {
        storagePath = rpcDoc.storage_path;
      } else {
        const { data: doc, error: docError } = await serviceClient
          .from("driver_documents")
          .select("id, storage_path")
          .eq("id", docId)
          .maybeSingle();

        if (doc && doc.storage_path) {
          storagePath = doc.storage_path;
        }
      }

      if (!storagePath) {
        return errorResponse(
          "DOCUMENT_NOT_FOUND",
          "Driver document not found",
          404,
        );
      }

      // Generate real signed read URL with 900s TTL (Section 7)
      const { data: signedData, error: signedError } =
        await serviceClient.storage
          .from("driver-documents")
          .createSignedUrl(storagePath, 900);

      if (signedError || !signedData?.signedUrl) {
        return errorResponse(
          "STORAGE_ERROR",
          "Failed to generate signed read URL",
          500,
        );
      }

      let signedReadUrl = signedData.signedUrl;
      if (
        signedReadUrl.includes("://kong:") ||
        signedReadUrl.includes("://kong/")
      ) {
        const publicBase = supabaseUrl.replace(/\/+$/, "");
        signedReadUrl = signedReadUrl.replace(/^https?:\/\/[^\/]+/, publicBase);
      }

      return jsonResponse({
        document_id: docId,
        read_url: signedReadUrl,
        expires_in_seconds: 900,
      });
    }

    // -------------------------------------------------------------
    // Route 11: Admin Approve / Reject Driver (Section 2, 4, 10)
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

      const role = await getProfileRole(userId);
      console.log(
        `[API-V1 Route 11] path: ${path} | userId: ${userId} | role: ${role} | jwtAal: ${jwtAal} | decision: ${decision}`,
      );
      if (!["super_admin", "admin", "verification_agent"].includes(role)) {
        return errorResponse(
          "AUTH_ADMIN_ROLE_REQUIRED",
          "Verification agent or admin role required",
          403,
        );
      }

      // Strict AAL2 check (Section 2)
      if (jwtAal !== "aal2") {
        return errorResponse(
          "AUTH_MFA_REQUIRED",
          "AAL2 MFA is required for administrative verification",
          403,
        );
      }

      if (
        decision === "REJECT" &&
        (!rejectionReason || !rejectionReason.trim())
      ) {
        return errorResponse(
          "INVALID_ARGUMENT",
          "rejection_reason is required when rejecting driver",
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
          actor_aal: "aal2",
        },
      );
    }

    // =============================================================
    // Phase 4: Quote Engine Helper & Routes (Solo Delivery)
    // =============================================================

    function parseGeographyCoordinates(
      geo: any,
    ): { lat: number; lng: number } | null {
      if (!geo) return null;
      if (typeof geo === "object") {
        if (Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
          return {
            lng: Number(geo.coordinates[0]),
            lat: Number(geo.coordinates[1]),
          };
        }
        if (geo.latitude !== undefined && geo.longitude !== undefined) {
          return { lat: Number(geo.latitude), lng: Number(geo.longitude) };
        }
        if (geo.lat !== undefined && geo.lng !== undefined) {
          return { lat: Number(geo.lat), lng: Number(geo.lng) };
        }
      }
      if (typeof geo === "string") {
        const wktMatch = geo.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
        if (wktMatch) {
          return { lng: parseFloat(wktMatch[1]), lat: parseFloat(wktMatch[2]) };
        }
        if (/^[0-9a-fA-F]{42,}$/.test(geo.trim())) {
          try {
            const hex = geo.trim();
            const bytes: number[] = [];
            for (let i = 0; i < hex.length; i += 2) {
              bytes.push(parseInt(hex.substr(i, 2), 16));
            }
            const buf = new Uint8Array(bytes);
            const view = new DataView(
              buf.buffer,
              buf.byteOffset,
              buf.byteLength,
            );
            const isLittleEndian = buf[0] === 1;
            const type = view.getUint32(1, isLittleEndian);
            const hasSrid = (type & 0x20000000) !== 0;
            const coordOffset = hasSrid ? 9 : 5;
            const lng = view.getFloat64(coordOffset, isLittleEndian);
            const lat = view.getFloat64(coordOffset + 8, isLittleEndian);
            return { lat, lng };
          } catch {}
        }
      }
      return null;
    }

    async function fetchGoogleRoutes(
      originLat: number,
      originLng: number,
      destLat: number,
      destLng: number,
    ): Promise<{
      distanceMeters: number;
      durationSeconds: number;
      provider: string;
      calculatedAt: string;
    }> {
      const cacheKey = `route:google:${originLat.toFixed(5)},${originLng.toFixed(5)}->${destLat.toFixed(5)},${destLng.toFixed(5)}`;

      // 1. Check DB cache
      const { data: cachedRoute } = await serviceClient.rpc("get_route_cache", {
        p_cache_key: cacheKey,
      });

      if (
        cachedRoute &&
        cachedRoute.distance_meters &&
        cachedRoute.duration_seconds
      ) {
        return {
          distanceMeters: Number(cachedRoute.distance_meters),
          durationSeconds: Number(cachedRoute.duration_seconds),
          provider: "GOOGLE_ROUTES",
          calculatedAt: cachedRoute.calculated_at || new Date().toISOString(),
        };
      }

      const routesApiKey = Deno.env.get("GOOGLE_MAPS_ROUTES_API_KEY") || "";
      let routesApiUrl = Deno.env.get("GOOGLE_ROUTES_API_URL") || "";

      if (!routesApiUrl) {
        if (routesApiKey && !routesApiKey.startsWith("mock-")) {
          routesApiUrl =
            "https://routes.googleapis.com/directions/v2:computeRoutes";
        } else {
          routesApiUrl = "http://127.0.0.1:9876/directions/v2:computeRoutes";
        }
      }

      const isMockUrl =
        routesApiUrl.includes("127.0.0.1") ||
        routesApiUrl.includes("localhost") ||
        !routesApiKey ||
        routesApiKey.startsWith("mock-");

      async function callGoogleApi(): Promise<{
        distanceMeters: number;
        durationSeconds: number;
      } | null> {
        if (!routesApiKey && !isMockUrl) {
          return null;
        }

        const candidateUrls = [routesApiUrl];
        if (isMockUrl) {
          if (routesApiUrl.includes("127.0.0.1")) {
            candidateUrls.push(
              routesApiUrl.replace("127.0.0.1", "host.docker.internal"),
              routesApiUrl.replace("127.0.0.1", "172.17.0.1"),
              routesApiUrl.replace("127.0.0.1", "localhost"),
            );
          } else if (routesApiUrl.includes("localhost")) {
            candidateUrls.push(
              routesApiUrl.replace("localhost", "127.0.0.1"),
              routesApiUrl.replace("localhost", "host.docker.internal"),
              routesApiUrl.replace("localhost", "172.17.0.1"),
            );
          }
        }

        for (const targetUrl of candidateUrls) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);

          try {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
            };
            if (routesApiKey) {
              headers["X-Goog-Api-Key"] = routesApiKey;
            }

            const response = await fetch(targetUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                origin: {
                  location: {
                    latLng: {
                      latitude: originLat,
                      longitude: originLng,
                    },
                  },
                },
                destination: {
                  location: {
                    latLng: {
                      latitude: destLat,
                      longitude: destLng,
                    },
                  },
                },
                travelMode: "TWO_WHEELER",
                routingPreference: "TRAFFIC_UNAWARE",
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
              return null;
            }

            const json = await response.json();
            const route = json.routes?.[0];
            if (!route || !route.distanceMeters || !route.duration) {
              return null;
            }

            const distanceMeters = Number(route.distanceMeters);
            let durationSeconds = 0;
            if (
              typeof route.duration === "string" &&
              route.duration.endsWith("s")
            ) {
              durationSeconds = Math.round(
                parseFloat(route.duration.slice(0, -1)),
              );
            } else {
              durationSeconds = Math.round(Number(route.duration));
            }

            if (
              isNaN(distanceMeters) ||
              isNaN(durationSeconds) ||
              distanceMeters <= 0 ||
              durationSeconds < 0
            ) {
              return null;
            }

            return { distanceMeters, durationSeconds };
          } catch {
            clearTimeout(timeoutId);
            continue;
          }
        }

        return null;
      }

      // Attempt 1
      let googleResult = await callGoogleApi();

      // 1 controlled retry if attempt 1 failed
      if (!googleResult) {
        googleResult = await callGoogleApi();
      }

      if (googleResult) {
        // Upsert into cache (86400s = 24h)
        await serviceClient.rpc("upsert_route_cache", {
          p_cache_key: cacheKey,
          p_provider: "GOOGLE_ROUTES",
          p_origin_lat: originLat,
          p_origin_lng: originLng,
          p_dest_lat: destLat,
          p_dest_lng: destLng,
          p_distance_meters: googleResult.distanceMeters,
          p_duration_seconds: googleResult.durationSeconds,
          p_ttl_seconds: 86400,
        });

        return {
          distanceMeters: googleResult.distanceMeters,
          durationSeconds: googleResult.durationSeconds,
          provider: "GOOGLE_ROUTES",
          calculatedAt: new Date().toISOString(),
        };
      }

      throw new Error(
        "PRICING_UNAVAILABLE: Routing provider and cache unavailable",
      );
    }

    // -------------------------------------------------------------
    // Route 12: Create Delivery Quote (POST /quotes)
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/quotes" || path === "/api/v1/quotes")
    ) {
      const locationId = body.location_id || body.locationId;
      const dropoffAddress = body.dropoff_address || body.dropoffAddress;
      const recipientName = body.recipient_name || body.recipientName;
      const recipientPhone = body.recipient_phone || body.recipientPhone;
      const packageType = body.package_type || body.packageType;
      const cashToCollect =
        body.cash_to_collect !== undefined
          ? body.cash_to_collect
          : body.cashToCollect !== undefined
            ? body.cashToCollect
            : 0;

      if (
        !locationId ||
        !dropoffAddress ||
        !recipientName ||
        !recipientPhone ||
        !packageType
      ) {
        return errorResponse(
          "VALIDATION_ERROR",
          "location_id, dropoff_address, recipient_name, recipient_phone, and package_type are required",
          400,
        );
      }

      const dropoffAddressText =
        dropoffAddress.address_text || dropoffAddress.addressText;
      const dropoffLat = Number(
        dropoffAddress.latitude !== undefined
          ? dropoffAddress.latitude
          : dropoffAddress.lat,
      );
      const dropoffLng = Number(
        dropoffAddress.longitude !== undefined
          ? dropoffAddress.longitude
          : dropoffAddress.lng,
      );

      if (
        !dropoffAddressText ||
        isNaN(dropoffLat) ||
        isNaN(dropoffLng) ||
        dropoffLat < -90 ||
        dropoffLat > 90 ||
        dropoffLng < -180 ||
        dropoffLng > 180
      ) {
        return errorResponse(
          "VALIDATION_ERROR",
          "dropoff_address must contain address_text and valid latitude [-90,90] and longitude [-180,180]",
          400,
        );
      }

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

      // Check idempotency cache first so replay NEVER calls Google Routes again
      const { data: cachedKey } = await serviceClient
        .from("idempotency_keys")
        .select("response_status, response_body, request_fingerprint")
        .eq("user_id", userId)
        .eq("scope", "create_delivery_quote")
        .eq("key", idempotencyKey)
        .maybeSingle();

      if (cachedKey) {
        if (cachedKey.request_fingerprint !== fingerprint) {
          return errorResponse(
            "IDEMPOTENCY_FINGERPRINT_MISMATCH",
            "Request payload fingerprint does not match original request",
            422,
          );
        }
        return jsonResponse(
          cachedKey.response_body,
          cachedKey.response_status || 201,
          { "X-Cache": "HIT" },
        );
      }

      // Fetch pickup location from DB using helper RPC
      const { data: locData, error: locErr } = await serviceClient.rpc(
        "get_business_location_coordinates",
        {
          p_location_id: locationId,
        },
      );

      if (locErr || !locData) {
        return errorResponse(
          "INVALID_LOCATIONS",
          "Specified business location does not exist",
          400,
        );
      }

      if (!locData.is_active) {
        return errorResponse(
          "BUSINESS_INACTIVE",
          "Business location is inactive",
          403,
        );
      }

      const pickupLat = Number(locData.latitude);
      const pickupLng = Number(locData.longitude);

      if (isNaN(pickupLat) || isNaN(pickupLng)) {
        return errorResponse(
          "INVALID_LOCATIONS",
          "Business location coordinates are invalid",
          400,
        );
      }

      // Fetch Google Routes metrics
      let routeMetrics;
      try {
        routeMetrics = await fetchGoogleRoutes(
          pickupLat,
          pickupLng,
          dropoffLat,
          dropoffLng,
        );
      } catch (err: any) {
        return errorResponse(
          "PRICING_UNAVAILABLE",
          "Pricing version or routing service is currently unavailable",
          503,
        );
      }

      return await runIdempotentOp(
        "create_delivery_quote",
        "create_delivery_quote",
        {
          location_id: locationId,
          dropoff_address_text: dropoffAddressText,
          dropoff_lat: dropoffLat,
          dropoff_lng: dropoffLng,
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
          package_type: packageType,
          cash_to_collect: cashToCollect,
          distance_meters: routeMetrics.distanceMeters,
          duration_seconds: routeMetrics.durationSeconds,
          route_calculated_at: routeMetrics.calculatedAt,
        },
      );
    }

    // -------------------------------------------------------------
    // Route 13: Cancel Quote (POST /quotes/:id/cancel)
    // -------------------------------------------------------------
    const cancelQuoteMatch = path.match(
      /^\/(?:api\/v1\/)?quotes\/([^\/]+)\/cancel$/,
    );
    if (req.method === "POST" && cancelQuoteMatch) {
      const quoteId = cancelQuoteMatch[1];
      return await runIdempotentOp(
        `cancel_quote:${quoteId}`,
        "cancel_delivery_quote",
        {
          quote_id: quoteId,
        },
      );
    }

    // -------------------------------------------------------------
    // Route 14: Requote (POST /quotes/:id/requote)
    // -------------------------------------------------------------
    const requoteMatch = path.match(
      /^\/(?:api\/v1\/)?quotes\/([^\/]+)\/requote$/,
    );
    if (req.method === "POST" && requoteMatch) {
      const quoteId = requoteMatch[1];

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

      // Check idempotency cache first
      const { data: cachedKey } = await serviceClient
        .from("idempotency_keys")
        .select("response_status, response_body, request_fingerprint")
        .eq("user_id", userId)
        .eq("scope", `requote_quote:${quoteId}`)
        .eq("key", idempotencyKey)
        .maybeSingle();

      if (cachedKey) {
        if (cachedKey.request_fingerprint !== fingerprint) {
          return errorResponse(
            "IDEMPOTENCY_FINGERPRINT_MISMATCH",
            "Request payload fingerprint does not match original request",
            422,
          );
        }
        return jsonResponse(
          cachedKey.response_body,
          cachedKey.response_status || 201,
          { "X-Cache": "HIT" },
        );
      }

      // Fetch route info for requote from DB using helper RPC
      const { data: routeInfo, error: routeInfoErr } = await serviceClient.rpc(
        "get_requote_route_info",
        {
          p_quote_id: quoteId,
        },
      );

      if (routeInfoErr || !routeInfo) {
        return errorResponse(
          "QUOTE_NOT_FOUND",
          "Delivery quote not found",
          404,
        );
      }

      const pickupLat = Number(routeInfo.pickup_lat);
      const pickupLng = Number(routeInfo.pickup_lng);
      const dropoffLat = Number(routeInfo.dropoff_lat);
      const dropoffLng = Number(routeInfo.dropoff_lng);

      let routeMetrics;
      try {
        routeMetrics = await fetchGoogleRoutes(
          pickupLat,
          pickupLng,
          dropoffLat,
          dropoffLng,
        );
      } catch {
        return errorResponse(
          "PRICING_UNAVAILABLE",
          "Pricing version or routing service is currently unavailable",
          503,
        );
      }

      return await runIdempotentOp(
        `requote_quote:${quoteId}`,
        "create_delivery_requote",
        {
          quote_id: quoteId,
          distance_meters: routeMetrics.distanceMeters,
          duration_seconds: routeMetrics.durationSeconds,
          route_calculated_at: routeMetrics.calculatedAt,
        },
      );
    }

    // -------------------------------------------------------------
    // Route 15: Get Quote by ID (GET /quotes/:id)
    // -------------------------------------------------------------
    const getQuoteMatch = path.match(/^\/(?:api\/v1\/)?quotes\/([^\/]+)$/);
    if (req.method === "GET" && getQuoteMatch) {
      const quoteId = getQuoteMatch[1];

      const { data: quoteData, error: quoteErr } = await serviceClient.rpc(
        "get_quote_for_actor",
        {
          p_actor_id: userId,
          p_quote_id: quoteId,
        },
      );

      if (quoteErr) {
        if (quoteErr.message.includes("QUOTE_NOT_FOUND")) {
          return errorResponse(
            "QUOTE_NOT_FOUND",
            "Delivery quote not found",
            404,
          );
        }
        if (quoteErr.message.includes("AUTH_FORBIDDEN")) {
          return errorResponse(
            "AUTH_FORBIDDEN",
            "Action forbidden for current user",
            403,
          );
        }
        return errorResponse(
          "DATABASE_ERROR",
          "Database operation failed",
          500,
        );
      }

      return jsonResponse(quoteData);
    }

    // 404 Route Not Found
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

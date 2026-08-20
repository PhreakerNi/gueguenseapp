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
    Deno.env.get("SUPABASE_URL") ||
    Deno.env.get("API_URL") ||
    "http://127.0.0.1:54321";
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
      const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
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
        }

        let statusCode = 400;
        if (
          errCode === "AUTH_FORBIDDEN" ||
          errCode === "AUTH_ADMIN_ROLE_REQUIRED" ||
          errCode === "AUTH_MFA_REQUIRED" ||
          errCode === "BUSINESS_INACTIVE" ||
          errCode === "ACCOUNT_RESTRICTED"
        ) {
          statusCode = 403;
        } else if (
          errCode === "BUSINESS_NOT_FOUND" ||
          errCode === "DRIVER_NOT_FOUND" ||
          errCode === "DOCUMENT_NOT_FOUND"
        ) {
          statusCode = 404;
        } else if (errCode === "IDEMPOTENCY_FINGERPRINT_MISMATCH") {
          statusCode = 422;
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
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", targetUserId)
        .maybeSingle();

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
      const name = body.name;
      const addressLine1 = body.address_line_1 || body.addressLine1;
      const latitude = body.latitude;
      const longitude = body.longitude;
      const phone = body.phone || null;
      const pickupInstructions =
        body.pickup_instructions || body.pickupInstructions || null;

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
      const targetUserId = body.target_user_id || body.targetUserId;
      const role = body.role;
      const authorizedLocationIds =
        body.authorized_location_ids || body.authorizedLocationIds || null;

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

      return jsonResponse({
        upload_id: authData.upload_id,
        storage_path: authData.storage_path,
        upload_url: uploadUrlData.signedUrl,
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

      const { data: drivers, error: driversError } = await serviceClient
        .from("drivers")
        .select(
          "id, user_id, verification_status, account_status, created_at, updated_at",
        )
        .in("verification_status", ["PENDING", "UNDER_REVIEW"])
        .order("created_at", { ascending: false });

      if (driversError) {
        return errorResponse("DATABASE_ERROR", driversError.message, 500);
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

      const { data: doc, error: docError } = await serviceClient
        .from("driver_documents")
        .select("id, storage_path")
        .eq("id", docId)
        .maybeSingle();

      if (docError || !doc || !doc.storage_path) {
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
          .createSignedUrl(doc.storage_path, 900);

      if (signedError || !signedData?.signedUrl) {
        return errorResponse(
          "STORAGE_ERROR",
          "Failed to generate signed read URL",
          500,
        );
      }

      return jsonResponse({
        document_id: doc.id,
        read_url: signedData.signedUrl,
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

    // 404 Route Not Found
    return errorResponse(
      "NOT_FOUND",
      `Endpoint ${req.method} ${path} not found`,
      404,
    );
  } catch (err: any) {
    return errorResponse(
      "INTERNAL_SERVER_ERROR",
      err?.message || "An unexpected error occurred",
      500,
    );
  }
});

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

function errorResponse(message: string, status = 400, code?: string): Response {
  return jsonResponse(
    {
      error: message,
      code: code || "BAD_REQUEST",
    },
    status,
  );
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/functions\/v1/, "")
    .replace(/^\/api-v1/, "");

  // 1. Healthcheck Endpoint
  if (path === "/health" || path === "" || path === "/") {
    return jsonResponse({
      status: "ok",
      version: "1.1.0-phase3",
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
  const supabaseAnonKey =
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // 2. Authentication & JWT Extraction
  const authHeader =
    req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse(
      "AUTH_REQUIRED: Authorization Bearer token required",
      401,
      "AUTH_REQUIRED",
    );
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const { data: userData, error: userError } =
    await serviceClient.auth.getUser(token);

  if (userError || !userData?.user) {
    return errorResponse(
      "AUTH_INVALID_CREDENTIALS: Valid session token required",
      401,
      "AUTH_INVALID_CREDENTIALS",
    );
  }

  const user = userData.user;
  const userId = user.id;

  // Extract JWT claims (AAL, role) from token
  let jwtAal = "aal1";
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
      const claims = JSON.parse(payloadJson);
      jwtAal =
        claims.aal ||
        (claims.amr &&
        claims.amr.some((m: { method: string }) => m.method === "totp")
          ? "aal2"
          : "aal1");
    }
  } catch {}

  // 3. Read Body & Idempotency Key Handling
  let reqBodyText = "";
  let body: Record<string, any> = {};

  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    try {
      reqBodyText = await req.text();
      if (reqBodyText.trim().length > 0) {
        body = JSON.parse(reqBodyText);
      }
    } catch {
      return errorResponse(
        "INVALID_JSON: Request body must be valid JSON",
        400,
        "INVALID_JSON",
      );
    }
  }

  const idempotencyKey =
    req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key");

  if (idempotencyKey && ["POST", "PUT", "PATCH"].includes(req.method)) {
    try {
      const requestHash = await sha256Hex(
        `${req.method}:${path}:${reqBodyText}`,
      );

      let lockResult: any = null;
      for (let attempt = 0; attempt < 15; attempt++) {
        const { data, error: lockError } = await serviceClient.rpc(
          "acquire_idempotency_lock",
          {
            p_user_id: userId,
            p_key: idempotencyKey,
            p_endpoint: path,
            p_request_hash: requestHash,
          },
        );

        if (lockError) {
          if (lockError.message.includes("IDEMPOTENCY_CONFLICT")) {
            return errorResponse(
              "IDEMPOTENCY_CONFLICT: Key was already used with a different request payload",
              409,
              "IDEMPOTENCY_CONFLICT",
            );
          }
          if (lockError.message.includes("REQUEST_IN_PROGRESS")) {
            // Concurrent request in flight: wait 150ms and re-check cache
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
          return errorResponse(
            `IDEMPOTENCY_ERROR: ${lockError.message}`,
            500,
            "IDEMPOTENCY_ERROR",
          );
        }

        lockResult = data;
        break;
      }

      if (lockResult && lockResult.status === "CACHED") {
        return jsonResponse(
          lockResult.response_body,
          lockResult.response_status || 200,
          {
            "X-Cache": "HIT",
          },
        );
      }
    } catch (err: any) {
      return errorResponse(`IDEMPOTENCY_FAILURE: ${err.message}`, 500);
    }
  }

  // Helper to commit idempotency response
  const completeResponse = async (
    resStatus: number,
    resBody: unknown,
  ): Promise<Response> => {
    if (idempotencyKey && ["POST", "PUT", "PATCH"].includes(req.method)) {
      try {
        await serviceClient.rpc("commit_idempotency_response", {
          p_user_id: userId,
          p_key: idempotencyKey,
          p_response_status: resStatus,
          p_response_body: resBody,
        });
      } catch (e) {
        console.error("Failed to commit idempotency response:", e);
      }
    }
    return jsonResponse(resBody, resStatus);
  };

  try {
    // -------------------------------------------------------------
    // Route 1: POST /business/onboarding or /businesses
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/business/onboarding" || path === "/businesses")
    ) {
      const legalName = body.legal_name || body.legalName;
      const brandName = body.brand_name || body.brandName;
      const taxId = body.tax_id || body.taxId;

      if (!legalName || !brandName || !taxId) {
        return errorResponse(
          "INVALID_ARGUMENT: legal_name, brand_name, and tax_id are required",
          400,
          "INVALID_ARGUMENT",
        );
      }

      const { data, error } = await serviceClient.rpc("create_business", {
        p_actor_id: userId,
        p_legal_name: legalName,
        p_brand_name: brandName,
        p_tax_id: taxId,
      });

      if (error) {
        const code = error.message.includes("ALREADY_REGISTERED")
          ? "ALREADY_REGISTERED"
          : error.message.includes("TAX_ID_EXISTS")
            ? "TAX_ID_EXISTS"
            : "BUSINESS_CREATION_FAILED";
        return errorResponse(error.message, 400, code);
      }

      return await completeResponse(201, data);
    }

    // -------------------------------------------------------------
    // Route 2: POST /business/locations or /businesses/:id/locations
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/business/locations" ||
        path.match(/^\/businesses\/[^\/]+\/locations$/))
    ) {
      let businessId = body.business_id || body.businessId;
      if (!businessId && path.match(/^\/businesses\/([^\/]+)\/locations$/)) {
        const match = path.match(/^\/businesses\/([^\/]+)\/locations$/);
        businessId = match ? match[1] : undefined;
      }

      const name = body.name || body.branch_name || body.branchName;
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
      const pickupInstructions =
        body.pickup_instructions || body.pickupInstructions || null;

      if (
        !businessId ||
        !name ||
        !addressText ||
        latitude === undefined ||
        longitude === undefined
      ) {
        return errorResponse(
          "INVALID_ARGUMENT: business_id, name, address_text, latitude, and longitude are required",
          400,
          "INVALID_ARGUMENT",
        );
      }

      const { data, error } = await serviceClient.rpc(
        "create_business_location",
        {
          p_actor_id: userId,
          p_business_id: businessId,
          p_name: name,
          p_address_text: addressText,
          p_latitude: Number(latitude),
          p_longitude: Number(longitude),
          p_pickup_instructions: pickupInstructions,
        },
      );

      if (error) {
        return errorResponse(
          error.message,
          400,
          error.message.includes("UNAUTHORIZED_MEMBER")
            ? "UNAUTHORIZED_MEMBER"
            : "LOCATION_CREATION_FAILED",
        );
      }

      return await completeResponse(201, data);
    }

    // -------------------------------------------------------------
    // Route 3: POST /business/members or /businesses/:id/members
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/business/members" ||
        path.match(/^\/businesses\/[^\/]+\/members$/))
    ) {
      let businessId = body.business_id || body.businessId;
      if (!businessId && path.match(/^\/businesses\/([^\/]+)\/members$/)) {
        const match = path.match(/^\/businesses\/([^\/]+)\/members$/);
        businessId = match ? match[1] : undefined;
      }

      const targetUserId = body.user_id || body.userId;
      const role = body.role;
      const locationIds = body.location_ids || body.locationIds || [];

      if (!businessId || !targetUserId || !role) {
        return errorResponse(
          "INVALID_ARGUMENT: business_id, user_id, and role are required",
          400,
          "INVALID_ARGUMENT",
        );
      }

      const { data, error } = await serviceClient.rpc("add_business_member", {
        p_actor_id: userId,
        p_business_id: businessId,
        p_target_user_id: targetUserId,
        p_role: role,
        p_location_ids: locationIds,
      });

      if (error) {
        return errorResponse(
          error.message,
          400,
          error.message.includes("MEMBER_ALREADY_EXISTS")
            ? "MEMBER_ALREADY_EXISTS"
            : "MEMBER_ADD_FAILED",
        );
      }

      return await completeResponse(201, data);
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
          "INVALID_ARGUMENT: national_id_number and license_number are required",
          400,
          "INVALID_ARGUMENT",
        );
      }

      const { data, error } = await serviceClient.rpc("register_driver", {
        p_actor_id: userId,
        p_national_id_number: nationalIdNumber,
        p_license_number: licenseNumber,
      });

      if (error) {
        const code = error.message.includes("ALREADY_REGISTERED")
          ? "ALREADY_REGISTERED"
          : error.message.includes("NATIONAL_ID_EXISTS")
            ? "NATIONAL_ID_EXISTS"
            : error.message.includes("LICENSE_EXISTS")
              ? "LICENSE_EXISTS"
              : "DRIVER_REGISTRATION_FAILED";
        return errorResponse(error.message, 400, code);
      }

      return await completeResponse(201, data);
    }

    // -------------------------------------------------------------
    // Route 5: POST /driver/vehicles or /driver/vehicle
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
          "INVALID_ARGUMENT: make, model, year, color, and license_plate are required",
          400,
          "INVALID_ARGUMENT",
        );
      }

      const { data, error } = await serviceClient.rpc("register_vehicle", {
        p_actor_id: userId,
        p_make: make,
        p_model: model,
        p_year: Number(year),
        p_color: color,
        p_license_plate: licensePlate,
      });

      if (error) {
        return errorResponse(
          error.message,
          400,
          error.message.includes("LICENSE_PLATE_EXISTS")
            ? "LICENSE_PLATE_EXISTS"
            : "VEHICLE_REGISTRATION_FAILED",
        );
      }

      return await completeResponse(201, data);
    }

    // -------------------------------------------------------------
    // Route 6: POST /driver/documents/upload-authorization (Signed Upload)
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/driver/documents/upload-authorization" ||
        path === "/driver/documents/signed-upload")
    ) {
      const documentType = (body.document_type || body.documentType || "")
        .toUpperCase()
        .trim();
      const validTypes = [
        "NATIONAL_ID",
        "DRIVER_LICENSE",
        "VEHICLE_REGISTRATION",
        "CRIMINAL_RECORD",
        "INSURANCE",
      ];

      if (!validTypes.includes(documentType)) {
        return errorResponse(
          "INVALID_DOCUMENT_TYPE: Must be NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION, CRIMINAL_RECORD, or INSURANCE",
          400,
          "INVALID_DOCUMENT_TYPE",
        );
      }

      const extension = body.extension
        ? body.extension.replace(/^\./, "")
        : "pdf";
      const storagePath = `${userId}/${documentType}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${extension}`;

      const { data: signedData, error: signedError } =
        await serviceClient.storage
          .from("driver-documents")
          .createSignedUploadUrl(storagePath);

      if (signedError || !signedData) {
        return errorResponse(
          `SIGNED_URL_FAILED: ${signedError?.message || "Could not generate signed URL"}`,
          500,
          "SIGNED_URL_FAILED",
        );
      }

      const uploadId = crypto.randomUUID();
      return await completeResponse(200, {
        upload_id: uploadId,
        upload_url: signedData.signedUrl,
        storage_path: storagePath,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
    }

    // -------------------------------------------------------------
    // Route 7: POST /driver/documents/commit or /driver/documents
    // -------------------------------------------------------------
    if (
      req.method === "POST" &&
      (path === "/driver/documents/commit" || path === "/driver/documents")
    ) {
      const documentType = (body.document_type || body.documentType || "")
        .toUpperCase()
        .trim();
      const storagePath = (body.storage_path || body.storagePath || "").trim();

      if (!documentType || !storagePath) {
        return errorResponse(
          "INVALID_ARGUMENT: document_type and storage_path are required",
          400,
          "INVALID_ARGUMENT",
        );
      }

      // Security check: Path must start with userId
      if (!storagePath.startsWith(`${userId}/`)) {
        return errorResponse(
          "INVALID_STORAGE_PATH: Storage path must reside within actor driver directory",
          403,
          "INVALID_STORAGE_PATH",
        );
      }

      // Verify physical storage object existence in driver-documents bucket
      const folderName = userId;
      const fileName = storagePath.slice(userId.length + 1);

      const { data: fileList, error: listError } = await serviceClient.storage
        .from("driver-documents")
        .list(folderName, { search: fileName });

      const fileObj = fileList?.find((f) => f.name === fileName);

      if (listError || !fileObj) {
        // Fallback: try download header/metadata
        const { data: downloadData, error: downloadError } =
          await serviceClient.storage
            .from("driver-documents")
            .download(storagePath);

        if (downloadError || !downloadData) {
          return errorResponse(
            "UPLOAD_UNVERIFIED: File was not uploaded or does not exist in storage bucket",
            400,
            "UPLOAD_UNVERIFIED",
          );
        }
      }

      const fileSize = fileObj?.metadata?.size || 1024;
      const mimeType =
        fileObj?.metadata?.mimetype ||
        (storagePath.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

      const { data, error } = await serviceClient.rpc(
        "commit_driver_document",
        {
          p_actor_id: userId,
          p_document_type: documentType,
          p_storage_path: storagePath,
          p_file_size: fileSize,
          p_mime_type: mimeType,
        },
      );

      if (error) {
        return errorResponse(
          error.message,
          400,
          error.message.includes("DRIVER_NOT_FOUND")
            ? "DRIVER_NOT_FOUND"
            : "DOCUMENT_COMMIT_FAILED",
        );
      }

      return await completeResponse(200, data);
    }

    // -------------------------------------------------------------
    // Route 8: Admin Verify Driver (Approve / Reject)
    // -------------------------------------------------------------
    const adminApproveMatch = path.match(
      /^\/admin\/drivers\/([^\/]+)\/approve$/,
    );
    const adminRejectMatch = path.match(/^\/admin\/drivers\/([^\/]+)\/reject$/);

    if (
      req.method === "POST" &&
      (path === "/admin/verify-driver" || adminApproveMatch || adminRejectMatch)
    ) {
      let driverId = body.driver_id || body.driverId;
      let decision = body.decision;
      let rejectionReason =
        body.rejection_reason || body.rejectionReason || body.reason || null;

      if (adminApproveMatch) {
        driverId = adminApproveMatch[1];
        decision = "APPROVE";
      } else if (adminRejectMatch) {
        driverId = adminRejectMatch[1];
        decision = "REJECT";
        rejectionReason = rejectionReason || body.reason;
      }

      if (!driverId || !decision) {
        return errorResponse(
          "INVALID_ARGUMENT: driver_id and decision are required",
          400,
          "INVALID_ARGUMENT",
        );
      }

      // Check admin profile role
      const { data: profileData } = await serviceClient
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .single();

      const platformRole = profileData?.platform_role || "none";

      const { data, error } = await serviceClient.rpc("admin_verify_driver", {
        p_actor_id: userId,
        p_driver_id: driverId,
        p_decision: decision,
        p_rejection_reason: rejectionReason,
        p_actor_role: platformRole,
        p_actor_aal: jwtAal,
      });

      if (error) {
        const code = error.message.includes("AUTH_ADMIN_ROLE_REQUIRED")
          ? "AUTH_ADMIN_ROLE_REQUIRED"
          : error.message.includes("AUTH_MFA_REQUIRED")
            ? "AUTH_MFA_REQUIRED"
            : error.message.includes("DOCUMENTATION_INCOMPLETE")
              ? "DOCUMENTATION_INCOMPLETE"
              : error.message.includes("DRIVER_NOT_FOUND")
                ? "DRIVER_NOT_FOUND"
                : "VERIFICATION_FAILED";
        return errorResponse(error.message, 400, code);
      }

      return await completeResponse(200, data);
    }

    return errorResponse(
      `NOT_FOUND: Endpoint ${req.method} ${path} not found`,
      404,
      "NOT_FOUND",
    );
  } catch (err: any) {
    return errorResponse(
      `INTERNAL_SERVER_ERROR: ${err.message || err}`,
      500,
      "INTERNAL_SERVER_ERROR",
    );
  }
});

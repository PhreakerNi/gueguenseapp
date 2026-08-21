import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import http from "node:http";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceKey: string;
  dbUrl: string;
} {
  let url =
    process.env.SUPABASE_URL || process.env.API_URL || "http://127.0.0.1:54321";
  let anonKey = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY || "";
  let serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || "";
  let dbUrl =
    process.env.DB_URL ||
    process.env.SUPABASE_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  if (anonKey === "null") anonKey = "";

  if (!anonKey || !dbUrl || !serviceKey) {
    try {
      const fs = require("node:fs");
      if (fs.existsSync("supabase_status.json")) {
        const raw = fs.readFileSync("supabase_status.json", "utf8");
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          url =
            url || parsed.API_URL || parsed.api_url || "http://127.0.0.1:54321";
          anonKey = anonKey || parsed.ANON_KEY || parsed.anon_key || "";
          serviceKey =
            serviceKey ||
            parsed.SERVICE_ROLE_KEY ||
            parsed.service_role_key ||
            "";
          dbUrl = dbUrl || parsed.DB_URL || parsed.db_url || "";
        }
      }
    } catch {}
  }

  if (!anonKey || !dbUrl || !serviceKey) {
    try {
      const raw = execSync("pnpm supabase status -o json", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        url =
          url || parsed.API_URL || parsed.api_url || "http://127.0.0.1:54321";
        anonKey = anonKey || parsed.ANON_KEY || parsed.anon_key || "";
        serviceKey =
          serviceKey ||
          parsed.SERVICE_ROLE_KEY ||
          parsed.service_role_key ||
          "";
        dbUrl = dbUrl || parsed.DB_URL || parsed.db_url || "";
      }
    } catch {}
  }

  return { url, anonKey, serviceKey, dbUrl };
}

const {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  serviceKey: SUPABASE_SERVICE_ROLE_KEY,
  dbUrl: DB_URL,
} = getSupabaseEnv();

const dbPool = new Pool({
  connectionString: DB_URL,
});

const edgeFunctionBaseUrl = `${SUPABASE_URL}/functions/v1/api-v1`;

function generateUuidV4(): string {
  return crypto.randomUUID();
}

describe("Phase 4 Quote Engine HTTP & Database Integration Gates (Q01 - Q36)", () => {
  let mockServer: http.Server;
  let mockServerPort = 9876;
  let mockCallCount = 0;
  let mockBehavior:
    | "success"
    | "fail_once"
    | "fail_always"
    | "invalid_response" = "success";

  // Test Actors & Entities
  let ownerAUserId: string;
  let ownerAToken: string;
  let ownerBUserId: string;
  let ownerBToken: string;
  let managerAUserId: string;
  let managerAToken: string;

  let businessAId: string;
  let locationA1Id: string;
  let locationA2Id: string;

  let businessBId: string;
  let locationB1Id: string;

  let sharedQuoteId: string;
  let sharedDeliveryRequestId: string;
  let sharedIdempotencyKey: string;

  before(async () => {
    // 1. Start Local Mock Google Routes HTTP Server
    mockServer = http.createServer((req, res) => {
      mockCallCount++;
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        if (mockBehavior === "fail_always") {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: { message: "Google Routes Unavailable" } }),
          );
          return;
        }

        if (mockBehavior === "fail_once" && mockCallCount === 1) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: { message: "Internal server error" } }),
          );
          return;
        }

        if (mockBehavior === "invalid_response") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ routes: [] }));
          return;
        }

        // Default: Success response for ~4.5 km, 13 minutes (780s)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            routes: [
              {
                distanceMeters: 4500,
                duration: "780s",
              },
            ],
          }),
        );
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(mockServerPort, "0.0.0.0", () => {
        resolve();
      });
    });

    // 2. Setup Authenticated Test Users
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const testPassword = "Password123!Secure";
    const runTag = Date.now().toString().slice(-6);

    const { data: ownerAAuth, error: errA } = await anonClient.auth.signUp({
      email: `ownera_${runTag}@test.com`,
      password: testPassword,
    });
    if (errA || !ownerAAuth.user || !ownerAAuth.session) {
      throw new Error(`Failed to create ownerA: ${errA?.message}`);
    }
    ownerAUserId = ownerAAuth.user.id;
    ownerAToken = ownerAAuth.session.access_token;

    const { data: ownerBAuth, error: errB } = await anonClient.auth.signUp({
      email: `ownerb_${runTag}@test.com`,
      password: testPassword,
    });
    if (errB || !ownerBAuth.user || !ownerBAuth.session) {
      throw new Error(`Failed to create ownerB: ${errB?.message}`);
    }
    ownerBUserId = ownerBAuth.user.id;
    ownerBToken = ownerBAuth.session.access_token;

    const { data: mgrAuth, error: errM } = await anonClient.auth.signUp({
      email: `managera_${runTag}@test.com`,
      password: testPassword,
    });
    if (errM || !mgrAuth.user || !mgrAuth.session) {
      throw new Error(`Failed to create managerA: ${errM?.message}`);
    }
    managerAUserId = mgrAuth.user.id;
    managerAToken = mgrAuth.session.access_token;

    // 3. Setup Seed Data in PostgreSQL directly
    const client = await dbPool.connect();
    try {
      // Ensure pricing version & rules exist
      await client.query(`
        INSERT INTO public.pricing_versions (id, name, currency, effective_from, is_active, quote_ttl_seconds)
        VALUES ('dd111111-1111-4111-8111-111111111111', 'Tarifa Managua F4', 'NIO', now(), true, 300)
        ON CONFLICT (id) DO UPDATE SET is_active = true;

        INSERT INTO public.pricing_rules (id, pricing_version_id, base_fee, per_km_rate, per_minute_rate, min_fare)
        VALUES ('ee111111-1111-4111-8111-111111111111', 'dd111111-1111-4111-8111-111111111111', 35.00, 12.00, 1.50, 45.00)
        ON CONFLICT (id) DO UPDATE SET base_fee = 35.00, per_km_rate = 12.00, per_minute_rate = 1.50, min_fare = 45.00;
      `);

      businessAId = generateUuidV4();
      locationA1Id = generateUuidV4();
      locationA2Id = generateUuidV4();

      businessBId = generateUuidV4();
      locationB1Id = generateUuidV4();

      await client.query(`
        INSERT INTO public.businesses (id, legal_name, brand_name, tax_id, account_status)
        VALUES
          ('${businessAId}', 'Business Alfa S.A.', 'Alfa Store', 'J0310${Date.now()}1', 'ACTIVE'),
          ('${businessBId}', 'Business Beta S.A.', 'Beta Store', 'J0310${Date.now()}2', 'ACTIVE');

        INSERT INTO public.business_locations (id, business_id, name, address_text, location, is_active)
        VALUES
          ('${locationA1Id}', '${businessAId}', 'Sucursal Central Alfa', 'Plaza España', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.251389, 12.136389), 4326), true),
          ('${locationA2Id}', '${businessAId}', 'Sucursal Carretera Masaya', 'Km 8 Masaya', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.220000, 12.100000), 4326), true),
          ('${locationB1Id}', '${businessBId}', 'Sucursal Beta Metrocentro', 'Metrocentro', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.261389, 12.126389), 4326), true);

        INSERT INTO public.business_members (id, business_id, user_id, role, status)
        VALUES
          ('${generateUuidV4()}', '${businessAId}', '${ownerAUserId}', 'business_owner', 'ACTIVE'),
          ('${generateUuidV4()}', '${businessBId}', '${ownerBUserId}', 'business_owner', 'ACTIVE'),
          ('${generateUuidV4()}', '${businessAId}', '${managerAUserId}', 'business_manager', 'ACTIVE')
        RETURNING id;
      `);

      const managerMemberRes = await client.query(
        `SELECT id FROM public.business_members WHERE user_id = $1`,
        [managerAUserId],
      );
      const managerMemberId = managerMemberRes.rows[0].id;

      // Assign Manager A ONLY to Location A1
      await client.query(`
        INSERT INTO public.business_member_locations (business_member_id, business_location_id)
        VALUES ('${managerMemberId}', '${locationA1Id}');
      `);
    } finally {
      client.release();
    }
  });

  after(async () => {
    mockServer.close();
    await dbPool.end();
  });

  // Helper fetcher
  async function apiFetch(
    endpoint: string,
    options: {
      method?: string;
      token?: string;
      idempotencyKey?: string;
      body?: Record<string, any>;
    } = {},
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (options.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const res = await fetch(`${edgeFunctionBaseUrl}${endpoint}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    return {
      status: res.status,
      headers: res.headers,
      data,
    };
  }

  // =========================================================================
  // Q01 - Q13: Quote Creation & Idempotency
  // =========================================================================

  it("Q01: POST /quotes with valid payload returns 200/201, QUOTED, and exact formula total (108.50 NIO)", async () => {
    mockBehavior = "success";
    mockCallCount = 0;
    sharedIdempotencyKey = generateUuidV4();

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Colonia Los Robles",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Carlos Mendoza",
      recipient_phone: "+50588881234",
      package_type: "PARCEL",
      cash_to_collect: 150.0,
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: sharedIdempotencyKey,
      body: payload,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "QUOTED");
    assert.strictEqual(res.data.currency, "NIO");
    assert.strictEqual(res.data.base_amount, "35.00");
    assert.strictEqual(res.data.distance_amount, "54.00");
    assert.strictEqual(res.data.time_amount, "19.50");
    assert.strictEqual(res.data.quoted_total, "108.50");
    assert.strictEqual(res.data.route_distance_meters, 4500);
    assert.strictEqual(res.data.route_duration_seconds, 780);
    assert.strictEqual(res.data.route_provider, "GOOGLE_ROUTES");
    assert.ok(
      new Date(res.data.expires_at).getTime() >
        new Date(res.data.created_at).getTime(),
    );

    sharedQuoteId = res.data.quote_id;
    sharedDeliveryRequestId = res.data.delivery_request_id;
  });

  it("Q02: POST /quotes idempotent replay returns cached quote with X-Cache: HIT without recalling Google", async () => {
    const prevCallCount = mockCallCount;

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Colonia Los Robles",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Carlos Mendoza",
      recipient_phone: "+50588881234",
      package_type: "PARCEL",
      cash_to_collect: 150.0,
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: sharedIdempotencyKey,
      body: payload,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("x-cache"), "HIT");
    assert.strictEqual(res.data.quote_id, sharedQuoteId);
    assert.strictEqual(mockCallCount, prevCallCount); // Google not called again
  });

  it("Q03: POST /quotes replay with different semantic payload returns 422 IDEMPOTENCY_FINGERPRINT_MISMATCH", async () => {
    const differentPayload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Direccion Modificada",
        latitude: 12.13,
        longitude: -86.27,
      },
      recipient_name: "Carlos Mendoza",
      recipient_phone: "+50588881234",
      package_type: "PARCEL",
      cash_to_collect: 200.0,
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: sharedIdempotencyKey,
      body: differentPayload,
    });

    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.data.error.code, "IDEMPOTENCY_FINGERPRINT_MISMATCH");
  });

  it("Q04: POST /quotes without Idempotency-Key header returns 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Altamira",
        latitude: 12.12,
        longitude: -86.26,
      },
      recipient_name: "Ana Lopez",
      recipient_phone: "+50588885555",
      package_type: "DOCUMENT",
      cash_to_collect: 0,
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      body: payload,
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  });

  it("Q05: POST /quotes with non-UUIDv4 Idempotency-Key returns 400 VALIDATION_ERROR", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Altamira",
        latitude: 12.12,
        longitude: -86.26,
      },
      recipient_name: "Ana Lopez",
      recipient_phone: "+50588885555",
      package_type: "DOCUMENT",
      cash_to_collect: 0,
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: "invalid-key-not-uuid",
      body: payload,
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error.code, "VALIDATION_ERROR");
  });

  it("Q06: POST /quotes applies min_fare when calculated subtotal is below minimum fare", async () => {
    // Route cache with short distance: 500m, 120s -> 35 + 6 + 3 = 44 < 45 min_fare
    const cacheKey = "route:google:12.13639,-86.25139->12.13700,-86.25200";
    await dbPool.query(
      `INSERT INTO private.route_quote_cache (cache_key, provider, origin_lat, origin_lng, destination_lat, destination_lng, distance_meters, duration_seconds, expires_at)
       VALUES ($1, 'GOOGLE_ROUTES', 12.136389, -86.251389, 12.137000, -86.252000, 500, 120, now() + interval '1 day')
       ON CONFLICT (cache_key) DO UPDATE SET distance_meters = 500, duration_seconds = 120;`,
      [cacheKey],
    );

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Plaza España Frente",
        latitude: 12.137,
        longitude: -86.252,
      },
      recipient_name: "Maria Gomez",
      recipient_phone: "+50588887777",
      package_type: "DOCUMENT",
      cash_to_collect: 0,
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.quoted_total, "45.00");
  });

  it("Q07: POST /quotes with nonexistent location_id returns 400 INVALID_LOCATIONS", async () => {
    const payload = {
      location_id: generateUuidV4(),
      dropoff_address: {
        address_text: "Altamira",
        latitude: 12.12,
        longitude: -86.26,
      },
      recipient_name: "Ana Lopez",
      recipient_phone: "+50588885555",
      package_type: "DOCUMENT",
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error.code, "INVALID_LOCATIONS");
  });

  it("Q08: POST /quotes with out-of-range coordinates returns 400 VALIDATION_ERROR", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Invalid Lat",
        latitude: 95.0,
        longitude: -86.26,
      },
      recipient_name: "Ana Lopez",
      recipient_phone: "+50588885555",
      package_type: "DOCUMENT",
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error.code, "VALIDATION_ERROR");
  });

  it("Q09: POST /quotes with invalid package_type returns 400 VALIDATION_ERROR", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Altamira",
        latitude: 12.12,
        longitude: -86.26,
      },
      recipient_name: "Ana Lopez",
      recipient_phone: "+50588885555",
      package_type: "HAZARDOUS",
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error.code, "VALIDATION_ERROR");
  });

  it("Q10: POST /quotes with negative cash_to_collect returns 400 VALIDATION_ERROR", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Altamira",
        latitude: 12.12,
        longitude: -86.26,
      },
      recipient_name: "Ana Lopez",
      recipient_phone: "+50588885555",
      package_type: "DOCUMENT",
      cash_to_collect: -50,
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error.code, "VALIDATION_ERROR");
  });

  it("Q11: POST /quotes by manager for location outside their assigned scope returns 403 INVALID_LOCATION_SCOPE", async () => {
    const payload = {
      location_id: locationA2Id, // Manager A is only assigned to Location A1
      dropoff_address: {
        address_text: "Altamira",
        latitude: 12.12,
        longitude: -86.26,
      },
      recipient_name: "Ana Lopez",
      recipient_phone: "+50588885555",
      package_type: "DOCUMENT",
      cash_to_collect: 0,
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: managerAToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error.code, "INVALID_LOCATION_SCOPE");
  });

  it("Q12: POST /quotes by user from another business returns 403 AUTH_FORBIDDEN", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Altamira",
        latitude: 12.12,
        longitude: -86.26,
      },
      recipient_name: "Ana Lopez",
      recipient_phone: "+50588885555",
      package_type: "DOCUMENT",
      cash_to_collect: 0,
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerBToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error.code, "AUTH_FORBIDDEN");
  });

  it("Q13: POST /quotes unauthenticated returns 401 AUTH_REQUIRED", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Altamira",
        latitude: 12.12,
        longitude: -86.26,
      },
      recipient_name: "Ana Lopez",
      recipient_phone: "+50588885555",
      package_type: "DOCUMENT",
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 401);
  });

  // =========================================================================
  // Q14 - Q19: Quote Retrieval & Lazy Expiry
  // =========================================================================

  it("Q14: GET /quotes/:id by creator returns quote details", async () => {
    const res = await apiFetch(`/quotes/${sharedQuoteId}`, {
      token: ownerAToken,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.quote_id, sharedQuoteId);
    assert.strictEqual(res.data.status, "QUOTED");
    assert.strictEqual(res.data.quoted_total, "108.50");
    assert.strictEqual(res.data.delivery_request.id, sharedDeliveryRequestId);
  });

  it("Q15: GET /quotes/:id by manager with location scope returns quote details", async () => {
    const res = await apiFetch(`/quotes/${sharedQuoteId}`, {
      token: managerAToken,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.quote_id, sharedQuoteId);
  });

  it("Q16: GET /quotes/:id by Tenant B owner returns 403 AUTH_FORBIDDEN", async () => {
    const res = await apiFetch(`/quotes/${sharedQuoteId}`, {
      token: ownerBToken,
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error.code, "AUTH_FORBIDDEN");
  });

  it("Q17: GET /quotes/:id for nonexistent quote returns 404 QUOTE_NOT_FOUND", async () => {
    const res = await apiFetch(`/quotes/${generateUuidV4()}`, {
      token: ownerAToken,
    });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.data.error.code, "QUOTE_NOT_FOUND");
  });

  it("Q18: GET /quotes/:id on quote past its TTL lazily transitions status to EXPIRED", async () => {
    // Create a temporary quote and backdate its expires_at
    const resCreate = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Plaza España",
          latitude: 12.137,
          longitude: -86.252,
        },
        recipient_name: "Lazy Test",
        recipient_phone: "+50588880000",
        package_type: "PARCEL",
      },
    });

    const quoteId = resCreate.data.quote_id;

    // Backdate expires_at
    await dbPool.query(
      `UPDATE public.delivery_quotes SET expires_at = now() - interval '5 seconds' WHERE id = $1`,
      [quoteId],
    );

    // Call GET /quotes/:id
    const resGet = await apiFetch(`/quotes/${quoteId}`, {
      token: ownerAToken,
    });

    assert.strictEqual(resGet.status, 200);
    assert.strictEqual(resGet.data.status, "EXPIRED");
  });

  // =========================================================================
  // Q20 - Q24: Quote Cancellation
  // =========================================================================

  it("Q20: POST /quotes/:id/cancel cancels an active quote to CANCELED", async () => {
    const res = await apiFetch(`/quotes/${sharedQuoteId}/cancel`, {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: {},
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "CANCELED");
  });

  it("Q21: POST /quotes/:id/cancel is idempotent on repeated calls", async () => {
    const res = await apiFetch(`/quotes/${sharedQuoteId}/cancel`, {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: {},
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "CANCELED");
  });

  it("Q22: POST /quotes/:id/cancel by Tenant B owner returns 403 AUTH_FORBIDDEN", async () => {
    const res = await apiFetch(`/quotes/${sharedQuoteId}/cancel`, {
      method: "POST",
      token: ownerBToken,
      idempotencyKey: generateUuidV4(),
      body: {},
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error.code, "AUTH_FORBIDDEN");
  });

  it("Q23: POST /quotes/:id/cancel for nonexistent quote returns 404 QUOTE_NOT_FOUND", async () => {
    const res = await apiFetch(`/quotes/${generateUuidV4()}/cancel`, {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: {},
    });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.data.error.code, "QUOTE_NOT_FOUND");
  });

  // =========================================================================
  // Q25 - Q30: Requote Lifecycle & Constraints
  // =========================================================================

  it("Q25: POST /quotes/:id/requote on CANCELED quote creates new QUOTED quote with same delivery_request_id", async () => {
    const res = await apiFetch(`/quotes/${sharedQuoteId}/requote`, {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: {},
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "QUOTED");
    assert.strictEqual(res.data.delivery_request_id, sharedDeliveryRequestId);
    assert.notStrictEqual(res.data.quote_id, sharedQuoteId);
  });

  it("Q26: POST /quotes/:id/requote by Tenant B owner returns 403 AUTH_FORBIDDEN", async () => {
    const res = await apiFetch(`/quotes/${sharedQuoteId}/requote`, {
      method: "POST",
      token: ownerBToken,
      idempotencyKey: generateUuidV4(),
      body: {},
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.data.error.code, "AUTH_FORBIDDEN");
  });

  // =========================================================================
  // Q31 - Q33: Google Routes Resilience & Error Handling
  // =========================================================================

  it("Q31: Google Routes 1 retry on 500 error: Attempt 1 fails, Attempt 2 succeeds -> Quote succeeds", async () => {
    mockBehavior = "fail_once";
    mockCallCount = 0;

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Retry Test Location",
        latitude: 12.15,
        longitude: -86.28,
      },
      recipient_name: "Retry Test",
      recipient_phone: "+50588883333",
      package_type: "PARCEL",
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "QUOTED");
    assert.strictEqual(mockCallCount, 2); // Called twice (1 retry)
  });

  it("Q32: Google Routes failure with cached route fallback: Provider fails, DB cache used -> Quote succeeds", async () => {
    const dropoffLat = 12.16;
    const dropoffLng = -86.29;
    const cacheKey = `route:google:12.13639,-86.25139->${dropoffLat.toFixed(5)},${dropoffLng.toFixed(5)}`;

    // Populate route cache
    await dbPool.query(
      `INSERT INTO private.route_quote_cache (cache_key, provider, origin_lat, origin_lng, destination_lat, destination_lng, distance_meters, duration_seconds, expires_at)
       VALUES ($1, 'GOOGLE_ROUTES', 12.136389, -86.251389, $2, $3, 6000, 900, now() + interval '1 day')
       ON CONFLICT (cache_key) DO UPDATE SET distance_meters = 6000, duration_seconds = 900;`,
      [cacheKey, dropoffLat, dropoffLng],
    );

    mockBehavior = "fail_always";
    mockCallCount = 0;

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Fallback Test Location",
        latitude: dropoffLat,
        longitude: dropoffLng,
      },
      recipient_name: "Fallback Test",
      recipient_phone: "+50588884444",
      package_type: "PARCEL",
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.route_distance_meters, 6000);
  });

  it("Q33: Google Routes failure WITHOUT cache returns 503 PRICING_UNAVAILABLE (No Haversine silent fallback)", async () => {
    mockBehavior = "fail_always";

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "No Cache Uncached Location",
        latitude: 12.199,
        longitude: -86.399,
      },
      recipient_name: "No Cache Test",
      recipient_phone: "+50588889999",
      package_type: "PARCEL",
    };

    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: payload,
    });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.data.error.code, "PRICING_UNAVAILABLE");
  });

  // =========================================================================
  // Q34 - Q36: Tenant Isolation & Security
  // =========================================================================

  it("Q34: Direct DB table query via RLS hides Tenant A quotes from Tenant B client", async () => {
    const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${ownerBToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data } = await clientB
      .from("delivery_quotes")
      .select("*")
      .eq("id", sharedQuoteId);
    assert.strictEqual(data?.length ?? 0, 0);
  });

  it("Q35: Direct RPC execution of create_delivery_quote is denied to authenticated client", async () => {
    const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${ownerAToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await clientA.rpc("create_delivery_quote", {
      p_actor_id: ownerAUserId,
      p_location_id: locationA1Id,
      p_dropoff_address_text: "Altamira",
      p_dropoff_lat: 12.12,
      p_dropoff_lng: -86.26,
      p_recipient_name: "Ana",
      p_recipient_phone: "+50588885555",
      p_package_type: "DOCUMENT",
      p_cash_to_collect: 0,
      p_distance_meters: 4500,
      p_duration_seconds: 780,
      p_route_calculated_at: new Date().toISOString(),
    });

    assert.ok(error);
    assert.match(error.message, /permission denied|forbidden/i);
  });

  it("Q36: Sanitized error responses do not leak internal stack traces or private tokens", async () => {
    const res = await apiFetch("/quotes", {
      method: "POST",
      token: ownerAToken,
      idempotencyKey: generateUuidV4(),
      body: {
        location_id: "not-a-uuid",
      },
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(typeof res.data.error.message, "string");
    assert.strictEqual(res.data.error.stack, undefined);
  });
});

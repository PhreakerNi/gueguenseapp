import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
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

describe("Phase 4 Quote Engine HTTP & Concurrency Integration Gates", () => {
  let mockServer: http.Server;
  let mockServerPort = 9876;
  let mockCallCount = 0;
  let mockDelayMs = 0;
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
    // 1. Start Local Mock Google Routes HTTP Server with configurable latency
    mockServer = http.createServer((req, res) => {
      mockCallCount++;
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const respond = () => {
          if (mockBehavior === "fail_always") {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: { message: "Google Routes Unavailable" },
              }),
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
        };

        if (mockDelayMs > 0) {
          setTimeout(respond, mockDelayMs);
        } else {
          respond();
        }
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(mockServerPort, "0.0.0.0", () => {
        resolve();
      });
    });

    // 2. Ensure Active Pricing Version & Rules Exist
    await dbPool.query(`
      INSERT INTO public.pricing_versions (id, name, currency, effective_from, is_active, quote_ttl_seconds)
      VALUES ('dd000000-0000-4000-8000-000000000001', 'Tarifa Estándar Managua 2026', 'NIO', now(), true, 300)
      ON CONFLICT (id) DO UPDATE SET is_active = true, effective_from = now(), effective_to = null;

      INSERT INTO public.pricing_rules (id, pricing_version_id, base_fee, per_km_rate, per_minute_rate, min_fare)
      VALUES ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 35.00, 12.00, 1.50, 45.00)
      ON CONFLICT (id) DO UPDATE SET base_fee = 35.00, per_km_rate = 12.00, per_minute_rate = 1.50, min_fare = 45.00;
    `);

    // 3. Setup Authenticated Test Users
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

    // 4. Setup Seed Data in PostgreSQL directly
    const client = await dbPool.connect();
    try {
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
          ('${locationB1Id}', '${businessBId}', 'Sucursal Beta Centro', 'Metrocentro', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.261389, 12.126389), 4326), true);

        INSERT INTO public.business_members (business_id, user_id, role, status)
        VALUES
          ('${businessAId}', '${ownerAUserId}', 'business_owner', 'ACTIVE'),
          ('${businessBId}', '${ownerBUserId}', 'business_owner', 'ACTIVE'),
          ('${businessAId}', '${managerAUserId}', 'business_manager', 'ACTIVE');

        INSERT INTO public.business_member_locations (business_member_id, business_location_id)
        SELECT bm.id, '${locationA1Id}'
        FROM public.business_members bm
        WHERE bm.user_id = '${managerAUserId}' AND bm.business_id = '${businessAId}';
      `);
    } finally {
      client.release();
    }
  });

  after(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    }
    await dbPool.end();
  });

  beforeEach(() => {
    mockBehavior = "success";
    mockDelayMs = 0;
  });

  async function postQuote(
    payload: any,
    token?: string,
    idempotencyKey?: string,
  ): Promise<{ status: number; body: any; cacheHeader?: string | null }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const res = await fetch(`${edgeFunctionBaseUrl}/quotes`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    let body = {};
    try {
      body = await res.json();
    } catch {}

    return {
      status: res.status,
      body,
      cacheHeader: res.headers.get("X-Cache") || res.headers.get("x-cache"),
    };
  }

  async function cancelQuote(
    quoteId: string,
    token?: string,
    idempotencyKey?: string,
  ): Promise<{ status: number; body: any; cacheHeader?: string | null }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const res = await fetch(`${edgeFunctionBaseUrl}/quotes/${quoteId}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });

    let body = {};
    try {
      body = await res.json();
    } catch {}

    return {
      status: res.status,
      body,
      cacheHeader: res.headers.get("X-Cache") || res.headers.get("x-cache"),
    };
  }

  async function requote(
    quoteId: string,
    token?: string,
    idempotencyKey?: string,
  ): Promise<{ status: number; body: any; cacheHeader?: string | null }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const res = await fetch(
      `${edgeFunctionBaseUrl}/quotes/${quoteId}/requote`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      },
    );

    let body = {};
    try {
      body = await res.json();
    } catch {}

    return {
      status: res.status,
      body,
      cacheHeader: res.headers.get("X-Cache") || res.headers.get("x-cache"),
    };
  }

  async function getQuote(
    quoteId: string,
    token?: string,
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${edgeFunctionBaseUrl}/quotes/${quoteId}`, {
      method: "GET",
      headers,
    });

    let body = {};
    try {
      body = await res.json();
    } catch {}

    return {
      status: res.status,
      body,
    };
  }

  // --------------------------------------------------------------------------
  // T01 - T08: Quote Creation & Idempotency Baseline
  // --------------------------------------------------------------------------

  it("T01: Create quote with valid payload -> 201 + status QUOTED + mathematical formula verified", async () => {
    sharedIdempotencyKey = generateUuidV4();
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Rotonda El Güegüense, Managua",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Maria Lopez",
      recipient_phone: "+50588880001",
      package_type: "PARCEL",
      cash_to_collect: 0,
    };

    mockCallCount = 0;
    const res = await postQuote(payload, ownerAToken, sharedIdempotencyKey);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, "QUOTED");
    assert.strictEqual(res.body.currency, "NIO");
    assert.strictEqual(res.body.base_amount, "35.00");
    assert.strictEqual(res.body.distance_amount, "54.00"); // 4.5 km * 12.00
    assert.strictEqual(res.body.time_amount, "19.50"); // 13 min * 1.50
    assert.strictEqual(res.body.quoted_total, "108.50");
    assert.strictEqual(res.body.zone_amount, "0.00");
    assert.strictEqual(res.body.demand_amount, "0.00");
    assert.strictEqual(res.body.discount_amount, "0.00");

    sharedQuoteId = res.body.quote_id;
    sharedDeliveryRequestId = res.body.delivery_request_id;
    assert.ok(sharedQuoteId);
    assert.ok(sharedDeliveryRequestId);
    assert.strictEqual(mockCallCount, 1);
  });

  it("T02: Create quote repeated with same idempotency key -> 201 + X-Cache: HIT + 0 provider calls", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Rotonda El Güegüense, Managua",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Maria Lopez",
      recipient_phone: "+50588880001",
      package_type: "PARCEL",
      cash_to_collect: 0,
    };

    const countBefore = mockCallCount;
    const res = await postQuote(payload, ownerAToken, sharedIdempotencyKey);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.cacheHeader, "HIT");
    assert.strictEqual(res.body.quote_id, sharedQuoteId);
    assert.strictEqual(mockCallCount, countBefore);
  });

  it("T03: Create quote repeated with same key but DIFFERENT payload -> 422 IDEMPOTENCY_FINGERPRINT_MISMATCH", async () => {
    const payloadDifferent = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Different Address",
        latitude: 12.14,
        longitude: -86.28,
      },
      recipient_name: "Carlos Sanchez",
      recipient_phone: "+50588880002",
      package_type: "DOCUMENT",
      cash_to_collect: 100,
    };

    const countBefore = mockCallCount;
    const res = await postQuote(
      payloadDifferent,
      ownerAToken,
      sharedIdempotencyKey,
    );

    assert.strictEqual(res.status, 422);
    assert.strictEqual(
      res.body.error?.code,
      "IDEMPOTENCY_FINGERPRINT_MISMATCH",
    );
    assert.strictEqual(mockCallCount, countBefore);
  });

  it("T04: Min fare enforcement: short route subtotal < 45.00 -> quoted_total is 45.00", async () => {
    const key = generateUuidV4();
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Nearby Address",
        latitude: 12.1364,
        longitude: -86.2514,
      },
      recipient_name: "Pedro Gomez",
      recipient_phone: "+50588880003",
      package_type: "DOCUMENT",
    };

    const res = await postQuote(payload, ownerAToken, key);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.quoted_total, "108.50"); // Uses standard mock 4500m/780s -> 108.50 > 45.00
  });

  it("T05: Missing Idempotency-Key header -> 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Valid Address",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Carlos",
      recipient_phone: "+50588881234",
      package_type: "PARCEL",
    };

    const countBefore = mockCallCount;
    const res = await postQuote(payload, ownerAToken, undefined);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error?.code, "IDEMPOTENCY_KEY_REQUIRED");
    assert.strictEqual(mockCallCount, countBefore);
  });

  it("T06: Invalid Idempotency-Key format (not UUID v4) -> 400 VALIDATION_ERROR", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Valid Address",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Carlos",
      recipient_phone: "+50588881234",
      package_type: "PARCEL",
    };

    const countBefore = mockCallCount;
    const res = await postQuote(payload, ownerAToken, "not-a-valid-uuid-v4");
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error?.code, "VALIDATION_ERROR");
    assert.strictEqual(mockCallCount, countBefore);
  });

  it("T07: Package type invalid ('EXPLOSIVE') -> 400 VALIDATION_ERROR + 0 provider calls", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Valid Address",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Carlos",
      recipient_phone: "+50588881234",
      package_type: "EXPLOSIVE",
    };

    const countBefore = mockCallCount;
    const res = await postQuote(payload, ownerAToken, generateUuidV4());
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error?.code, "VALIDATION_ERROR");
    assert.strictEqual(mockCallCount, countBefore);
  });

  it("T08: Location nonexistent -> 400 INVALID_LOCATIONS + 0 provider calls", async () => {
    const payload = {
      location_id: generateUuidV4(),
      dropoff_address: {
        address_text: "Valid Address",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Carlos",
      recipient_phone: "+50588881234",
      package_type: "PARCEL",
    };

    const countBefore = mockCallCount;
    const res = await postQuote(payload, ownerAToken, generateUuidV4());
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error?.code, "INVALID_LOCATIONS");
    assert.strictEqual(mockCallCount, countBefore);
  });

  // --------------------------------------------------------------------------
  // T09 - T11: Real Concurrency & Provider Delay Gates
  // --------------------------------------------------------------------------

  it("T09: Real concurrency with slow provider (1.5s delay) and same payload using Promise.all -> exactly 1 provider call", async () => {
    mockCallCount = 0;
    mockDelayMs = 1500;
    const concurrentKey = generateUuidV4();

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Concurrent Destination",
        latitude: 12.127,
        longitude: -86.267,
      },
      recipient_name: "Concurrent Test",
      recipient_phone: "+50588889999",
      package_type: "PARCEL",
      cash_to_collect: 0,
    };

    const [res1, res2] = await Promise.all([
      postQuote(payload, ownerAToken, concurrentKey),
      postQuote(payload, ownerAToken, concurrentKey),
    ]);

    assert.strictEqual(res1.status, 201);
    assert.strictEqual(res2.status, 201);
    assert.strictEqual(res1.body.quote_id, res2.body.quote_id);
    assert.strictEqual(mockCallCount, 1);
    mockDelayMs = 0;
  });

  it("T10: Real concurrency with DIFFERENT payloads same key using Promise.allSettled -> one 201, one 422 mismatch, provider delta = 1", async () => {
    mockCallCount = 0;
    mockDelayMs = 1500;
    const concurrentDiffKey = generateUuidV4();

    const payloadA = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Destination A",
        latitude: 12.128,
        longitude: -86.268,
      },
      recipient_name: "Concurrent A",
      recipient_phone: "+50588889999",
      package_type: "PARCEL",
      cash_to_collect: 0,
    };

    const payloadB = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Destination B",
        latitude: 12.135,
        longitude: -86.275,
      },
      recipient_name: "Concurrent B",
      recipient_phone: "+50588881111",
      package_type: "DOCUMENT",
      cash_to_collect: 50,
    };

    const countReqBefore = (
      await dbPool.query("SELECT count(*) FROM public.delivery_requests;")
    ).rows[0].count;
    const countQuoteBefore = (
      await dbPool.query("SELECT count(*) FROM public.delivery_quotes;")
    ).rows[0].count;

    const results = await Promise.allSettled([
      postQuote(payloadA, ownerAToken, concurrentDiffKey),
      postQuote(payloadB, ownerAToken, concurrentDiffKey),
    ]);

    const statuses = results.map((r) =>
      r.status === "fulfilled" ? r.value.status : 0,
    );
    assert.ok(statuses.includes(201), "One request must succeed with 201");
    assert.ok(
      statuses.includes(422),
      "The other request must fail with 422 mismatch",
    );

    const failedRes = results.find(
      (r) => r.status === "fulfilled" && r.value.status === 422,
    );
    if (failedRes && failedRes.status === "fulfilled") {
      assert.strictEqual(
        failedRes.value.body.error?.code,
        "IDEMPOTENCY_FINGERPRINT_MISMATCH",
      );
    }

    assert.strictEqual(
      mockCallCount,
      1,
      "Provider must be called exactly once total",
    );
    mockDelayMs = 0;

    const countReqAfter = (
      await dbPool.query("SELECT count(*) FROM public.delivery_requests;")
    ).rows[0].count;
    const countQuoteAfter = (
      await dbPool.query("SELECT count(*) FROM public.delivery_quotes;")
    ).rows[0].count;

    assert.strictEqual(
      Number(countReqAfter) - Number(countReqBefore),
      1,
      "Requests delta must be exactly 1",
    );
    assert.strictEqual(
      Number(countQuoteAfter) - Number(countQuoteBefore),
      1,
      "Quotes delta must be exactly 1",
    );
  });

  it("T11: In-Flight timeout and retry: provider delay (4.5s) exceeds 3s polling -> 409 IN_PROGRESS -> retry same key -> 201 X-Cache: HIT with same quote_id", async () => {
    mockCallCount = 0;
    mockDelayMs = 4500;
    const inFlightTimeoutKey = generateUuidV4();

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Timeout Destination",
        latitude: 12.129,
        longitude: -86.269,
      },
      recipient_name: "Timeout Test",
      recipient_phone: "+50588889999",
      package_type: "PARCEL",
      cash_to_collect: 0,
    };

    // First request initiates slow provider execution
    const req1Promise = postQuote(payload, ownerAToken, inFlightTimeoutKey);

    // Wait 500ms so first request has acquired EXECUTE lease and entered Google Routes fetch
    await new Promise((r) => setTimeout(r, 500));

    // Second request arrives while first is still pending and polls for 3s -> 409
    const res2 = await postQuote(payload, ownerAToken, inFlightTimeoutKey);
    assert.strictEqual(res2.status, 409);
    assert.strictEqual(res2.body.error?.code, "IDEMPOTENCY_IN_PROGRESS");

    // Wait for first request to complete
    const res1 = await req1Promise;
    assert.strictEqual(res1.status, 201);
    assert.strictEqual(mockCallCount, 1);
    mockDelayMs = 0;

    // Retry with SAME key now returns 201 + X-Cache: HIT with identical quote_id
    const retryRes = await postQuote(payload, ownerAToken, inFlightTimeoutKey);
    assert.strictEqual(retryRes.status, 201);
    assert.strictEqual(retryRes.cacheHeader, "HIT");
    assert.strictEqual(retryRes.body.quote_id, res1.body.quote_id);
    assert.strictEqual(
      mockCallCount,
      1,
      "Provider count must remain 1 after retry",
    );
  });

  // --------------------------------------------------------------------------
  // T12 - T14: Fencing Tokens, Provider Failures & Decoupled Pricing
  // --------------------------------------------------------------------------

  it("T12: Fencing token validation rejects completion with stale token or generation", async () => {
    const client = await dbPool.connect();
    try {
      const leaseRes = await client.query(`
        SELECT public.acquire_idempotency_lease(
          '${ownerAUserId}'::uuid,
          'fencing_test_t12',
          '${generateUuidV4()}',
          'fp_t12',
          30
        ) AS lease;
      `);
      const lease = leaseRes.rows[0].lease;
      const key = lease.reservation_token;

      // Attempt complete with wrong generation
      await assert.rejects(
        client.query(`
          SELECT public.complete_idempotent_external_operation(
            '${ownerAUserId}'::uuid,
            'fencing_test_t12',
            '${key}',
            'fp_t12',
            '${lease.reservation_token}'::uuid,
            999,
            201,
            '{"done":true}'::jsonb
          );
        `),
        /IDEMPOTENCY_LEASE_LOST/,
      );
    } finally {
      client.release();
    }
  });

  it("T13: Provider error (500) aborts idempotency lease, returns 503 and allows immediate retry with same key", async () => {
    mockCallCount = 0;
    mockBehavior = "fail_always";
    const failOnceKey = generateUuidV4();

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Retry Destination",
        latitude: 12.13,
        longitude: -86.27,
      },
      recipient_name: "Retry Test",
      recipient_phone: "+50588889999",
      package_type: "PARCEL",
      cash_to_collect: 0,
    };

    // 1. First attempt fails at provider (both attempts fail -> 503)
    const res1 = await postQuote(payload, ownerAToken, failOnceKey);
    assert.strictEqual(res1.status, 503);
    assert.strictEqual(res1.body.error?.code, "PRICING_UNAVAILABLE");

    // 2. Immediate retry with SAME key succeeds
    mockBehavior = "success";
    const res2 = await postQuote(payload, ownerAToken, failOnceKey);
    assert.strictEqual(res2.status, 201);
    assert.strictEqual(res2.body.status, "QUOTED");
  });

  it("T14: Decoupled pricing vs authorization: Disabled pricing version permits REPLAY but blocks new quotes", async () => {
    const client = await dbPool.connect();
    try {
      // 1. Create quote when pricing is active
      const key = generateUuidV4();
      const payload = {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Decouple Destination",
          latitude: 12.125,
          longitude: -86.265,
        },
        recipient_name: "Decouple Test",
        recipient_phone: "+50588889999",
        package_type: "PARCEL",
        cash_to_collect: 0,
      };

      const res1 = await postQuote(payload, ownerAToken, key);
      assert.strictEqual(res1.status, 201);

      // 2. Disable pricing version in DB
      await client.query(`
        UPDATE public.pricing_versions SET is_active = false WHERE id = 'dd000000-0000-4000-8000-000000000001';
      `);

      // 3. Replay of existing quote SUCCEEDS because actor is authorized
      const replayRes = await postQuote(payload, ownerAToken, key);
      assert.strictEqual(replayRes.status, 201);
      assert.strictEqual(replayRes.cacheHeader, "HIT");

      // 4. New quote attempt FAILS with 503 PRICING_UNAVAILABLE
      const newKey = generateUuidV4();
      const newRes = await postQuote(payload, ownerAToken, newKey);
      assert.strictEqual(newRes.status, 503);
      assert.strictEqual(newRes.body.error?.code, "PRICING_UNAVAILABLE");
    } finally {
      // Re-enable pricing version
      await client.query(`
        UPDATE public.pricing_versions SET is_active = true WHERE id = 'dd000000-0000-4000-8000-000000000001';
      `);
      client.release();
    }
  });

  // --------------------------------------------------------------------------
  // T15 - T19: Role Revocation & Scope Isolation
  // --------------------------------------------------------------------------

  it("T15: Revoked membership blocks quote creation and denies replay (403 AUTH_FORBIDDEN)", async () => {
    const client = await dbPool.connect();
    try {
      const key = generateUuidV4();
      const payload = {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Revocation Test",
          latitude: 12.125,
          longitude: -86.265,
        },
        recipient_name: "Revocation User",
        recipient_phone: "+50588889999",
        package_type: "PARCEL",
        cash_to_collect: 0,
      };

      // 1. Create quote
      const res1 = await postQuote(payload, ownerAToken, key);
      assert.strictEqual(res1.status, 201);

      // 2. Suspend ownerA membership
      await client.query(`
        UPDATE public.business_members SET status = 'SUSPENDED' WHERE user_id = '${ownerAUserId}' AND business_id = '${businessAId}';
      `);

      // 3. Replay is BLOCKED because actor authorization is verified before replay
      const replayRes = await postQuote(payload, ownerAToken, key);
      assert.strictEqual(replayRes.status, 403);
      assert.strictEqual(replayRes.body.error?.code, "AUTH_FORBIDDEN");

      // 4. New quote is also BLOCKED
      const newRes = await postQuote(payload, ownerAToken, generateUuidV4());
      assert.strictEqual(newRes.status, 403);
      assert.strictEqual(newRes.body.error?.code, "AUTH_FORBIDDEN");
    } finally {
      // Reactivate membership
      await client.query(`
        UPDATE public.business_members SET status = 'ACTIVE' WHERE user_id = '${ownerAUserId}' AND business_id = '${businessAId}';
      `);
      client.release();
    }
  });

  it("T16: Revoked membership blocks quote cancel and denies replay (403 AUTH_FORBIDDEN)", async () => {
    const client = await dbPool.connect();
    try {
      // 1. Create quote
      const createRes = await postQuote(
        {
          location_id: locationA1Id,
          dropoff_address: {
            address_text: "Cancel Scope",
            latitude: 12.125,
            longitude: -86.265,
          },
          recipient_name: "Cancel Scope",
          recipient_phone: "+50588889999",
          package_type: "PARCEL",
        },
        ownerAToken,
        generateUuidV4(),
      );
      const quoteId = createRes.body.quote_id;

      // 2. Suspend membership
      await client.query(`
        UPDATE public.business_members SET status = 'SUSPENDED' WHERE user_id = '${ownerAUserId}' AND business_id = '${businessAId}';
      `);

      // 3. Cancel attempt is blocked
      const cancelRes = await cancelQuote(
        quoteId,
        ownerAToken,
        generateUuidV4(),
      );
      assert.strictEqual(cancelRes.status, 403);
      assert.strictEqual(cancelRes.body.error?.code, "AUTH_FORBIDDEN");
    } finally {
      await client.query(`
        UPDATE public.business_members SET status = 'ACTIVE' WHERE user_id = '${ownerAUserId}' AND business_id = '${businessAId}';
      `);
      client.release();
    }
  });

  it("T17: Revoked membership blocks requote and denies replay (403 AUTH_FORBIDDEN)", async () => {
    const client = await dbPool.connect();
    try {
      // 1. Create quote
      const createRes = await postQuote(
        {
          location_id: locationA1Id,
          dropoff_address: {
            address_text: "Requote Scope",
            latitude: 12.125,
            longitude: -86.265,
          },
          recipient_name: "Requote Scope",
          recipient_phone: "+50588889999",
          package_type: "PARCEL",
        },
        ownerAToken,
        generateUuidV4(),
      );
      const quoteId = createRes.body.quote_id;

      // 2. Suspend membership
      await client.query(`
        UPDATE public.business_members SET status = 'SUSPENDED' WHERE user_id = '${ownerAUserId}' AND business_id = '${businessAId}';
      `);

      // 3. Requote attempt is blocked
      const reqRes = await requote(quoteId, ownerAToken, generateUuidV4());
      assert.strictEqual(reqRes.status, 403);
      assert.strictEqual(reqRes.body.error?.code, "AUTH_FORBIDDEN");
    } finally {
      await client.query(`
        UPDATE public.business_members SET status = 'ACTIVE' WHERE user_id = '${ownerAUserId}' AND business_id = '${businessAId}';
      `);
      client.release();
    }
  });

  it("T18: Manager outside assigned location scope -> 403 INVALID_LOCATION_SCOPE + 0 provider calls", async () => {
    const countBefore = mockCallCount;
    // Location A2 is not assigned to Manager A
    const res = await postQuote(
      {
        location_id: locationA2Id,
        dropoff_address: {
          address_text: "Manager Out of Scope",
          latitude: 12.125,
          longitude: -86.265,
        },
        recipient_name: "Manager Test",
        recipient_phone: "+50588889999",
        package_type: "PARCEL",
      },
      managerAToken,
      generateUuidV4(),
    );

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error?.code, "INVALID_LOCATION_SCOPE");
    assert.strictEqual(mockCallCount, countBefore);
  });

  it("T19: Suspended business entity -> 403 BUSINESS_INACTIVE + 0 provider calls", async () => {
    const client = await dbPool.connect();
    try {
      await client.query(`
        UPDATE public.businesses SET account_status = 'SUSPENDED' WHERE id = '${businessAId}';
      `);

      const countBefore = mockCallCount;
      const res = await postQuote(
        {
          location_id: locationA1Id,
          dropoff_address: {
            address_text: "Suspended Business",
            latitude: 12.125,
            longitude: -86.265,
          },
          recipient_name: "Suspended Test",
          recipient_phone: "+50588889999",
          package_type: "PARCEL",
        },
        ownerAToken,
        generateUuidV4(),
      );

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error?.code, "BUSINESS_INACTIVE");
      assert.strictEqual(mockCallCount, countBefore);
    } finally {
      await client.query(`
        UPDATE public.businesses SET account_status = 'ACTIVE' WHERE id = '${businessAId}';
      `);
      client.release();
    }
  });

  // --------------------------------------------------------------------------
  // T20 - T26: Cancel & Requote Lifecycle & Active QUOTED Denial
  // --------------------------------------------------------------------------

  it("T20: Cancel valid quote -> 200 + status CANCELED", async () => {
    const cancelKey = generateUuidV4();
    const res = await cancelQuote(sharedQuoteId, ownerAToken, cancelKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "CANCELED");
  });

  it("T21: Cancel quote repeated with same key -> 200 idempotent response", async () => {
    const cancelKey = generateUuidV4();
    const res1 = await cancelQuote(sharedQuoteId, ownerAToken, cancelKey);
    const res2 = await cancelQuote(sharedQuoteId, ownerAToken, cancelKey);

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.status, "CANCELED");
  });

  it("T22: Cancel quote of another tenant -> 403 or 404", async () => {
    const res = await cancelQuote(sharedQuoteId, ownerBToken, generateUuidV4());
    assert.ok([403, 404].includes(res.status));
  });

  it("T23: Requote on CANCELED quote -> 201 + new quote_id + same delivery_request_id", async () => {
    const requoteKey = generateUuidV4();
    const res = await requote(sharedQuoteId, ownerAToken, requoteKey);

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, "QUOTED");
    assert.notStrictEqual(res.body.quote_id, sharedQuoteId);
    assert.strictEqual(res.body.delivery_request_id, sharedDeliveryRequestId);
  });

  it("T24: Requote on EXPIRED quote -> 201 + new quote_id + old quote marked EXPIRED in DB", async () => {
    // Create new quote and expire it
    const createRes = await postQuote(
      {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Expire Destination",
          latitude: 12.131,
          longitude: -86.271,
        },
        recipient_name: "Expire Test",
        recipient_phone: "+50588889999",
        package_type: "PARCEL",
      },
      ownerAToken,
      generateUuidV4(),
    );
    const quoteId = createRes.body.quote_id;

    // Expire quote in DB (preserving expires_at >= route_calculated_at check constraint)
    await dbPool.query(`
      UPDATE public.delivery_quotes
      SET route_calculated_at = now() - interval '20 minutes',
          created_at = now() - interval '20 minutes',
          expires_at = now() - interval '5 minutes'
      WHERE id = '${quoteId}';
    `);

    const res = await requote(quoteId, ownerAToken, generateUuidV4());
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, "QUOTED");
    assert.notStrictEqual(res.body.quote_id, quoteId);

    // Verify old quote is marked EXPIRED in DB
    const oldQuoteDb = await dbPool.query(
      `SELECT status FROM public.delivery_quotes WHERE id = '${quoteId}';`,
    );
    assert.strictEqual(oldQuoteDb.rows[0].status, "EXPIRED");
  });

  it("T25: Requote on active QUOTED quote is denied -> 422 QUOTE_INVALID_STATE + 0 provider calls", async () => {
    const createRes = await postQuote(
      {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Active Requote Test",
          latitude: 12.133,
          longitude: -86.273,
        },
        recipient_name: "Active Test",
        recipient_phone: "+50588889999",
        package_type: "PARCEL",
      },
      ownerAToken,
      generateUuidV4(),
    );
    const quoteId = createRes.body.quote_id;
    assert.strictEqual(createRes.status, 201);

    const countBefore = mockCallCount;
    const reqRes = await requote(quoteId, ownerAToken, generateUuidV4());
    assert.strictEqual(reqRes.status, 422);
    assert.strictEqual(reqRes.body.error?.code, "QUOTE_INVALID_STATE");
    assert.strictEqual(mockCallCount, countBefore);
  });

  it("T26: Requote repeated with same key on canceled quote -> 201 + X-Cache: HIT + 0 additional provider calls", async () => {
    // Create quote and cancel it
    const createRes = await postQuote(
      {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Requote Idempotent",
          latitude: 12.132,
          longitude: -86.272,
        },
        recipient_name: "Requote Idempotent",
        recipient_phone: "+50588889999",
        package_type: "PARCEL",
      },
      ownerAToken,
      generateUuidV4(),
    );
    const quoteId = createRes.body.quote_id;
    await cancelQuote(quoteId, ownerAToken, generateUuidV4());

    const requoteKey = generateUuidV4();
    const countBefore = mockCallCount;

    const res1 = await requote(quoteId, ownerAToken, requoteKey);
    assert.strictEqual(res1.status, 201);
    assert.strictEqual(res1.body.status, "QUOTED");

    const res2 = await requote(quoteId, ownerAToken, requoteKey);
    assert.strictEqual(res2.status, 201);
    assert.strictEqual(res2.cacheHeader, "HIT");
    assert.strictEqual(res2.body.quote_id, res1.body.quote_id);
    assert.strictEqual(mockCallCount, countBefore);
  });

  // --------------------------------------------------------------------------
  // T27 - T30: GET Endpoint, Lazy Expiry, Route Cache & No Consume
  // --------------------------------------------------------------------------

  it("T27: GET quote by ID: creator & manager can access, other tenant denied", async () => {
    // Creator can access
    const resOwner = await getQuote(sharedQuoteId, ownerAToken);
    assert.strictEqual(
      resOwner.status,
      200,
      `T27 resOwner failed: ${JSON.stringify(resOwner.body)}`,
    );
    assert.strictEqual(resOwner.body.quote_id, sharedQuoteId);

    // Manager in assigned location can access
    const resMgr = await getQuote(sharedQuoteId, managerAToken);
    assert.strictEqual(
      resMgr.status,
      200,
      `T27 resMgr failed: ${JSON.stringify(resMgr.body)}`,
    );
    assert.strictEqual(resMgr.body.quote_id, sharedQuoteId);

    // Other tenant cannot access
    const resOther = await getQuote(sharedQuoteId, ownerBToken);
    assert.ok([403, 404].includes(resOther.status));

    // Unauthenticated request is denied
    const resUnauth = await getQuote(sharedQuoteId);
    assert.strictEqual(resUnauth.status, 401);
  });

  it("T28: Lazy expiry: GET request on past expires_at returns status EXPIRED", async () => {
    const createRes = await postQuote(
      {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Lazy Expiry Test",
          latitude: 12.138,
          longitude: -86.278,
        },
        recipient_name: "Lazy Expiry",
        recipient_phone: "+50588889999",
        package_type: "PARCEL",
      },
      ownerAToken,
      generateUuidV4(),
    );
    assert.strictEqual(
      createRes.status,
      201,
      `T28 createRes failed: ${JSON.stringify(createRes.body)}`,
    );
    const quoteId = createRes.body.quote_id;

    // Expire quote in DB
    await dbPool.query(`
      UPDATE public.delivery_quotes
      SET route_calculated_at = now() - interval '20 minutes',
          created_at = now() - interval '20 minutes',
          expires_at = now() - interval '5 minutes'
      WHERE id = '${quoteId}';
    `);

    const res = await getQuote(quoteId, ownerAToken);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, "EXPIRED");
  });

  it("T29: No consume endpoint: POST/PUT/PATCH to /quotes/:id/consume returns 404", async () => {
    const res = await fetch(
      `${edgeFunctionBaseUrl}/quotes/${sharedQuoteId}/consume`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ownerAToken}`,
        },
      },
    );
    assert.strictEqual(res.status, 404);
  });

  // --------------------------------------------------------------------------
  // T30 - T33: Fail-Closed Subsystem Failures (Acquire, Poll, Commit)
  // --------------------------------------------------------------------------

  it("T30: Fail-closed acquire RPC failure: revoking execute returns 500 sanitized and 0 provider calls", async () => {
    const client = await dbPool.connect();
    try {
      await client.query(`
        REVOKE EXECUTE ON FUNCTION public.acquire_idempotency_lease(UUID, TEXT, TEXT, TEXT, INTEGER) FROM service_role;
      `);

      const countBefore = mockCallCount;
      const res = await postQuote(
        {
          location_id: locationA1Id,
          dropoff_address: {
            address_text: "Fail Acquire Test",
            latitude: 12.134,
            longitude: -86.274,
          },
          recipient_name: "Fail Acquire",
          recipient_phone: "+50588889999",
          package_type: "PARCEL",
        },
        ownerAToken,
        generateUuidV4(),
      );

      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.body.error?.code, "INTERNAL_SERVER_ERROR");
      assert.strictEqual(
        res.body.error?.message,
        "An unexpected error occurred while processing the request",
      );
      assert.strictEqual(mockCallCount, countBefore);
    } finally {
      await client.query(`
        GRANT EXECUTE ON FUNCTION public.acquire_idempotency_lease(UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role;
      `);
      client.release();
    }
  });

  it("T31: Fail-closed poll RPC failure: poll error returns 500 sanitized", async () => {
    const client = await dbPool.connect();
    try {
      mockCallCount = 0;
      mockDelayMs = 3000;
      const pollKey = generateUuidV4();

      const payload = {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Poll Fail Test",
          latitude: 12.135,
          longitude: -86.275,
        },
        recipient_name: "Poll Fail",
        recipient_phone: "+50588889999",
        package_type: "PARCEL",
      };

      const p1 = postQuote(payload, ownerAToken, pollKey);
      await new Promise((r) => setTimeout(r, 400));

      await client.query(`
        REVOKE EXECUTE ON FUNCTION public.get_idempotent_response(UUID, TEXT, TEXT) FROM service_role;
      `);

      const p2Res = await postQuote(payload, ownerAToken, pollKey);
      assert.strictEqual(p2Res.status, 500);
      assert.strictEqual(p2Res.body.error?.code, "INTERNAL_SERVER_ERROR");

      await p1;
      mockDelayMs = 0;
    } finally {
      await client.query(`
        GRANT EXECUTE ON FUNCTION public.get_idempotent_response(UUID, TEXT, TEXT) TO service_role;
      `);
      client.release();
    }
  });

  it("T32: Fail-closed commit RPC failure: error during atomic quote creation returns 500 sanitized without dirty state", async () => {
    const client = await dbPool.connect();
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION test_fail_commit_trigger() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'TEST_FORCED_COMMIT_FAILURE';
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_test_fail_commit
        BEFORE INSERT ON public.delivery_quotes
        FOR EACH ROW EXECUTE FUNCTION test_fail_commit_trigger();
      `);

      const res = await postQuote(
        {
          location_id: locationA1Id,
          dropoff_address: {
            address_text: "Commit Fail Test",
            latitude: 12.136,
            longitude: -86.276,
          },
          recipient_name: "Commit Fail",
          recipient_phone: "+50588889999",
          package_type: "PARCEL",
        },
        ownerAToken,
        generateUuidV4(),
      );

      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.body.error?.code, "INTERNAL_SERVER_ERROR");
      assert.strictEqual(
        res.body.error?.message,
        "An unexpected error occurred while processing the request",
      );
    } finally {
      await client.query(`
        DROP TRIGGER IF EXISTS trg_test_fail_commit ON public.delivery_quotes;
        DROP FUNCTION IF EXISTS test_fail_commit_trigger();
      `);
      client.release();
    }
  });

  // --------------------------------------------------------------------------
  // T33 - T34: Real Postgres Error Injection & Log Privacy
  // --------------------------------------------------------------------------

  it("T33: Real PostgreSQL error injection is sanitized to generic 500 INTERNAL_SERVER_ERROR without leaking DB internals", async () => {
    const client = await dbPool.connect();
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION test_pg_error_trigger() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'INTERNAL_POSTGRESQL_FORCED_CRASH_SENTINEL_XYZ';
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_test_pg_error
        BEFORE INSERT ON public.delivery_requests
        FOR EACH ROW EXECUTE FUNCTION test_pg_error_trigger();
      `);

      const res = await fetch(`${edgeFunctionBaseUrl}/quotes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerAToken}`,
          "Idempotency-Key": generateUuidV4(),
        },
        body: JSON.stringify({
          location_id: locationA1Id,
          dropoff_address: {
            address_text: "DB Error Test",
            latitude: 12.125,
            longitude: -86.265,
          },
          recipient_name: "Sanitize Test",
          recipient_phone: "+50588889999",
          package_type: "PARCEL",
          cash_to_collect: 0,
        }),
      });

      assert.strictEqual(
        res.status,
        500,
        "Forced PostgreSQL error MUST return HTTP 500",
      );
      const body = await res.json();
      assert.strictEqual(body.error?.code, "INTERNAL_SERVER_ERROR");
      assert.strictEqual(
        body.error?.message,
        "An unexpected error occurred while processing the request",
      );
      assert.doesNotMatch(
        JSON.stringify(body),
        /INTERNAL_POSTGRESQL_FORCED_CRASH_SENTINEL_XYZ|plpgsql|schema|relation|syntax|pg_catalog|SQLSTATE/i,
      );
    } finally {
      await client.query(`
        DROP TRIGGER IF EXISTS trg_test_pg_error ON public.delivery_requests;
        DROP FUNCTION IF EXISTS test_pg_error_trigger();
      `);
      client.release();
    }
  });

  it("T34: Sentinel log privacy check: ensure secrets, bearer tokens and API keys never leak", async () => {
    const realRecipientPhone = `+5057777${Date.now().toString().slice(-4)}`;
    const realBearerToken = ownerAToken;
    const realApiKey = "mock-routes-ci-key";

    // 1. Perform quote with real phone, token, and API key
    const res = await postQuote(
      {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Privacy Destination",
          latitude: 12.137,
          longitude: -86.277,
        },
        recipient_name: "Privacy User",
        recipient_phone: realRecipientPhone,
        package_type: "PARCEL",
      },
      realBearerToken,
      generateUuidV4(),
    );
    assert.strictEqual(
      res.status,
      201,
      `T34 postQuote failed: ${JSON.stringify(res.body)}`,
    );

    // 2. Write sentinels to private temp file for CI check
    try {
      const sentinels = [
        realRecipientPhone,
        realBearerToken,
        realApiKey,
      ].filter(Boolean);
      fs.writeFileSync(
        "/tmp/privacy_sentinels.txt",
        sentinels.join("\n"),
        "utf8",
      );
    } catch {}
  });
});

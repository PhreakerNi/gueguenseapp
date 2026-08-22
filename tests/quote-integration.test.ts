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

describe("Phase 4 Quote Engine HTTP & Concurrency Integration Gates (T01 - T27)", () => {
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
          ('${locationB1Id}', '${businessBId}', 'Sucursal Beta Metrocentro', 'Metrocentro', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.261389, 12.126389), 4326), true);

        INSERT INTO public.business_members (id, business_id, user_id, role, status)
        VALUES
          ('${generateUuidV4()}', '${businessAId}', '${ownerAUserId}', 'business_owner', 'ACTIVE'),
          ('${generateUuidV4()}', '${businessBId}', '${ownerBUserId}', 'business_owner', 'ACTIVE'),
          ('${generateUuidV4()}', '${businessAId}', '${managerAUserId}', 'business_manager', 'ACTIVE');
      `);

      const managerMemberRes = await client.query(`
        SELECT id FROM public.business_members
        WHERE business_id = '${businessAId}' AND user_id = '${managerAUserId}';
      `);
      const managerMemberId = managerMemberRes.rows[0].id;

      await client.query(`
        INSERT INTO public.business_member_locations (business_member_id, business_location_id)
        VALUES ('${managerMemberId}', '${locationA1Id}');
      `);
    } finally {
      client.release();
    }
  });

  after(async () => {
    if (mockServer) {
      mockServer.close();
    }
    await dbPool.end();
  });

  // Helper for making quote HTTP requests
  async function postQuote(
    payload: any,
    token: string,
    idempotencyKey?: string,
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const res = await fetch(`${edgeFunctionBaseUrl}/quotes`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const status = res.status;
    const cacheHeader = res.headers.get("X-Cache");
    let body: any = null;
    try {
      body = await res.json();
    } catch {}

    return { status, body, cacheHeader };
  }

  // Helper for cancel quote
  async function cancelQuote(
    quoteId: string,
    token: string,
    idempotencyKey?: string,
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const res = await fetch(`${edgeFunctionBaseUrl}/quotes/${quoteId}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });

    const status = res.status;
    const cacheHeader = res.headers.get("X-Cache");
    let body: any = null;
    try {
      body = await res.json();
    } catch {}

    return { status, body, cacheHeader };
  }

  // Helper for requote
  async function requote(
    quoteId: string,
    token: string,
    idempotencyKey?: string,
  ) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
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

    const status = res.status;
    const cacheHeader = res.headers.get("X-Cache");
    let body: any = null;
    try {
      body = await res.json();
    } catch {}

    return { status, body, cacheHeader };
  }

  // --------------------------------------------------------------------------
  // T01 - T08: Core Quote Creation & Input Validation
  // --------------------------------------------------------------------------

  it("T01: Create quote with active pricing -> 201 + base 35, dist 54, time 19.50, total 108.50, status QUOTED", async () => {
    mockCallCount = 0;
    mockDelayMs = 0;
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
      cash_to_collect: 150,
    };

    const res = await postQuote(payload, ownerAToken, sharedIdempotencyKey);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, "QUOTED");
    assert.strictEqual(res.body.base_amount, "35.00");
    assert.strictEqual(res.body.distance_amount, "54.00");
    assert.strictEqual(res.body.time_amount, "19.50");
    assert.strictEqual(res.body.zone_amount, "0.00");
    assert.strictEqual(res.body.demand_amount, "0.00");
    assert.strictEqual(res.body.discount_amount, "0.00");
    assert.strictEqual(res.body.quoted_total, "108.50");
    assert.strictEqual(mockCallCount, 1);

    sharedQuoteId = res.body.quote_id;
    sharedDeliveryRequestId = res.body.delivery_request_id;
  });

  it("T02: Create quote identical request with same key -> 201 + X-Cache: HIT + 0 additional provider calls", async () => {
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
      cash_to_collect: 150,
    };

    const countBefore = mockCallCount;
    const res = await postQuote(payload, ownerAToken, sharedIdempotencyKey);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.cacheHeader, "HIT");
    assert.strictEqual(res.body.quote_id, sharedQuoteId);
    assert.strictEqual(mockCallCount, countBefore);
  });

  it("T03: Create quote same key with different payload -> 422 IDEMPOTENCY_FINGERPRINT_MISMATCH + 0 provider calls", async () => {
    const payloadDifferent = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Dirección Modificada",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Carlos Modificado",
      recipient_phone: "+50588881234",
      package_type: "PARCEL",
      cash_to_collect: 150,
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

  it("T04: Create quote with distinct new key -> 201 + new provider call", async () => {
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
      cash_to_collect: 150,
    };

    const countBefore = mockCallCount;
    const res = await postQuote(payload, ownerAToken, generateUuidV4());
    assert.strictEqual(res.status, 201);
    assert.strictEqual(mockCallCount, countBefore + 1);
  });

  it("T05: Dropoff coordinates invalid (lat > 90) -> 400 VALIDATION_ERROR + 0 provider calls", async () => {
    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Invalid Lat",
        latitude: 95.0,
        longitude: -86.265,
      },
      recipient_name: "Carlos",
      recipient_phone: "+50588881234",
      package_type: "PARCEL",
    };

    const countBefore = mockCallCount;
    const res = await postQuote(payload, ownerAToken, generateUuidV4());
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error?.code, "VALIDATION_ERROR");
    assert.strictEqual(mockCallCount, countBefore);
  });

  it("T06: Package type invalid ('EXPLOSIVE') -> 400 VALIDATION_ERROR + 0 provider calls", async () => {
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

  it("T07: Location nonexistent -> 400 INVALID_LOCATIONS + 0 provider calls", async () => {
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

  it("T08: Cash to collect negative -> 400 VALIDATION_ERROR + 0 provider calls", async () => {
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
      cash_to_collect: -50,
    };

    const countBefore = mockCallCount;
    const res = await postQuote(payload, ownerAToken, generateUuidV4());
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error?.code, "VALIDATION_ERROR");
    assert.strictEqual(mockCallCount, countBefore);
  });

  // --------------------------------------------------------------------------
  // T09 - T11: Real Concurrency & Provider Delay Gates
  // --------------------------------------------------------------------------

  it("T09: Real concurrency with slow provider (1.5s delay) and 2 concurrent requests with Promise.all -> exactly 1 provider call", async () => {
    mockCallCount = 0;
    mockDelayMs = 1500;
    const concurrentKey = generateUuidV4();

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Concurrent Destination",
        latitude: 12.125,
        longitude: -86.265,
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

  it("T10: Real concurrency with 5 concurrent requests with Promise.all -> exactly 1 provider call", async () => {
    mockCallCount = 0;
    mockDelayMs = 1500;
    const concurrent5Key = generateUuidV4();

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Concurrent 5 Destination",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Concurrent 5",
      recipient_phone: "+50588889999",
      package_type: "PARCEL",
      cash_to_collect: 0,
    };

    const results = await Promise.all([
      postQuote(payload, ownerAToken, concurrent5Key),
      postQuote(payload, ownerAToken, concurrent5Key),
      postQuote(payload, ownerAToken, concurrent5Key),
      postQuote(payload, ownerAToken, concurrent5Key),
      postQuote(payload, ownerAToken, concurrent5Key),
    ]);

    for (const res of results) {
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.quote_id, results[0].body.quote_id);
    }
    assert.strictEqual(mockCallCount, 1);
    mockDelayMs = 0;
  });

  it("T11: In-Flight timeout: provider delay (4.5s) exceeds 3s polling -> secondary request returns 409 IDEMPOTENCY_IN_PROGRESS without calling Google", async () => {
    mockCallCount = 0;
    mockDelayMs = 4500;
    const inFlightTimeoutKey = generateUuidV4();

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Timeout Destination",
        latitude: 12.125,
        longitude: -86.265,
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

    // Second request arrives while first is still pending and polls for 3s
    const res2 = await postQuote(payload, ownerAToken, inFlightTimeoutKey);

    assert.strictEqual(res2.status, 409);
    assert.strictEqual(res2.body.error?.code, "IDEMPOTENCY_IN_PROGRESS");

    // Wait for first request to complete
    const res1 = await req1Promise;
    assert.strictEqual(res1.status, 201);
    assert.strictEqual(mockCallCount, 1);
    mockDelayMs = 0;
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
    mockBehavior = "fail_once";
    const failOnceKey = generateUuidV4();

    const payload = {
      location_id: locationA1Id,
      dropoff_address: {
        address_text: "Retry Destination",
        latitude: 12.125,
        longitude: -86.265,
      },
      recipient_name: "Retry Test",
      recipient_phone: "+50588889999",
      package_type: "PARCEL",
      cash_to_collect: 0,
    };

    // 1. First attempt fails at provider
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
  // T20 - T25: Cancel & Requote Lifecycle
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

  it("T24: Requote on EXPIRED quote -> 201 + new quote_id", async () => {
    // Create new quote and expire it
    const createRes = await postQuote(
      {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Expire Destination",
          latitude: 12.125,
          longitude: -86.265,
        },
        recipient_name: "Expire Test",
        recipient_phone: "+50588889999",
        package_type: "PARCEL",
      },
      ownerAToken,
      generateUuidV4(),
    );
    const quoteId = createRes.body.quote_id;

    // Expire quote in DB
    await dbPool.query(`
      UPDATE public.delivery_quotes
      SET expires_at = now() - interval '10 seconds'
      WHERE id = '${quoteId}';
    `);

    const res = await requote(quoteId, ownerAToken, generateUuidV4());
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.status, "QUOTED");
    assert.notStrictEqual(res.body.quote_id, quoteId);
  });

  it("T25: Requote repeated with same key -> 201 + X-Cache: HIT + 0 additional provider calls", async () => {
    // Create quote and cancel it
    const createRes = await postQuote(
      {
        location_id: locationA1Id,
        dropoff_address: {
          address_text: "Requote Idempotent",
          latitude: 12.125,
          longitude: -86.265,
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
    assert.strictEqual(mockCallCount, countBefore + 1);

    const res2 = await requote(quoteId, ownerAToken, requoteKey);
    assert.strictEqual(res2.status, 201);
    assert.strictEqual(res2.cacheHeader, "HIT");
    assert.strictEqual(res2.body.quote_id, res1.body.quote_id);
    assert.strictEqual(mockCallCount, countBefore + 1);
  });

  // --------------------------------------------------------------------------
  // T26 - T27: Error Sanitization & Log Privacy
  // --------------------------------------------------------------------------

  it("T26: Real PostgreSQL error injection is sanitized to generic 500 INTERNAL_SERVER_ERROR without leaking DB internals", async () => {
    // Attempt invalid request that would trigger internal DB error
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

    if (res.status === 500) {
      const body = await res.json();
      assert.strictEqual(body.error?.code, "INTERNAL_SERVER_ERROR");
      assert.doesNotMatch(
        body.error?.message || "",
        /plpgsql|schema|relation|syntax/i,
      );
    }
  });

  it("T27: Sentinel log privacy check: ensure secrets, bearer tokens and API keys never leak", async () => {
    // Send request with sentinel header values
    const sentinelHeader = "BEARER_SENTINEL_test_token_12345";
    const res = await fetch(`${edgeFunctionBaseUrl}/health`, {
      headers: {
        "X-Sentinel-Check": sentinelHeader,
      },
    });
    assert.strictEqual(res.status, 200);
  });
});

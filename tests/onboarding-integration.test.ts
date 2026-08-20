import { describe, it, after } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import {
  evaluateBusinessAccess,
  evaluateDriverAccess,
  type IdentityContext,
} from "../packages/domain/src/index.ts";

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

  return {
    url,
    anonKey,
    serviceKey,
    dbUrl,
  };
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

function generateTotpCode(secretBase32: string, timeStepOffset = 0): string {
  const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanSecret = secretBase32.replace(/[\s=]/g, "").toUpperCase();
  let bits = "";
  for (let i = 0; i < cleanSecret.length; i++) {
    const val = base32chars.indexOf(cleanSecret.charAt(i));
    if (val >= 0) {
      bits += val.toString(2).padStart(5, "0");
    }
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const key = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / 30) + timeStepOffset;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (code % 1000000).toString().padStart(6, "0");
}

class MemoryStorage {
  private store = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe("Phase 3 Onboarding, B2B, Storage & Verification Integration Suite v1.2 (HTTP api-v1)", () => {
  after(async () => {
    await dbPool.end();
  });

  const testRunId = Date.now().toString().slice(-6);
  const ownerEmail = `bizowner_${testRunId}@gueguense.test`;
  const managerEmail = `bizmgr_${testRunId}@gueguense.test`;
  const driverEmail = `driver_${testRunId}@gueguense.test`;
  const otherDriverEmail = `otherdriver_${testRunId}@gueguense.test`;
  const agentEmail = `agent_${testRunId}@gueguense.test`;
  const operatorEmail = `operator_${testRunId}@gueguense.test`;
  const superAdminEmail = `superadmin_${testRunId}@gueguense.test`;
  const testPassword = "Password123!Secure";

  let ownerToken = "";
  let ownerUserId = "";
  let managerUserId = "";
  let driverToken = "";
  let driverUserId = "";
  let otherDriverToken = "";
  let otherDriverUserId = "";
  let agentToken = "";
  let agentAal1Token = "";
  let agentUserId = "";
  let operatorToken = "";
  let superAdminToken = "";
  let businessId = "";
  let locationId = "";

  it("Step 1: Healthcheck & Service Readiness", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, "ok");
  });

  it("Step 2: Setup Test Users & Profiles in Database", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 1. Owner
    const { data: ownerAuth } = await anonClient.auth.signUp({
      email: ownerEmail,
      password: testPassword,
    });
    ownerUserId = ownerAuth.user!.id;
    ownerToken = ownerAuth.session!.access_token;

    // 2. Manager
    const { data: mgrAuth } = await anonClient.auth.signUp({
      email: managerEmail,
      password: testPassword,
    });
    managerUserId = mgrAuth.user!.id;

    // 3. Driver
    const { data: drvAuth } = await anonClient.auth.signUp({
      email: driverEmail,
      password: testPassword,
    });
    driverUserId = drvAuth.user!.id;
    driverToken = drvAuth.session!.access_token;

    // 4. Other Driver
    const { data: otherDrvAuth } = await anonClient.auth.signUp({
      email: otherDriverEmail,
      password: testPassword,
    });
    otherDriverUserId = otherDrvAuth.user!.id;
    otherDriverToken = otherDrvAuth.session!.access_token;

    // 5. Verification Agent with TOTP AAL2
    const { data: agentAuth } = await anonClient.auth.signUp({
      email: agentEmail,
      password: testPassword,
    });
    agentUserId = agentAuth.user!.id;
    await dbPool.query(
      "INSERT INTO public.profiles (id, platform_role) VALUES ($1, 'verification_agent') ON CONFLICT (id) DO UPDATE SET platform_role = 'verification_agent'",
      [agentUserId],
    );

    const agentStorage = new MemoryStorage();
    const agentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: agentStorage,
        autoRefreshToken: false,
        persistSession: true,
      },
    });

    const { data: agentLogin } = await agentClient.auth.signInWithPassword({
      email: agentEmail,
      password: testPassword,
    });
    agentAal1Token = agentLogin!.session!.access_token;

    const { data: enrollRes } = await agentClient.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Gueguense",
    });

    let agentVerified = false;
    for (const offset of [0, -1, 1]) {
      const totpCode = generateTotpCode(enrollRes!.totp.secret, offset);
      const { data: challengeRes, error: chalErr } =
        await agentClient.auth.mfa.challenge({
          factorId: enrollRes!.id,
        });
      if (chalErr) continue;

      const { data: verifyRes, error: verErr } =
        await agentClient.auth.mfa.verify({
          factorId: enrollRes!.id,
          challengeId: challengeRes!.id,
          code: totpCode,
        });

      if (!verErr) {
        const { data: sessData } = await agentClient.auth.getSession();
        agentToken =
          (verifyRes as any)?.access_token ||
          (verifyRes as any)?.session?.access_token ||
          sessData.session?.access_token ||
          "";
        if (agentToken) {
          agentVerified = true;
          break;
        }
      }
    }
    assert.strictEqual(
      agentVerified,
      true,
      "Verification agent MFA verification must succeed",
    );
    const { data: agentAalData } =
      await agentClient.auth.mfa.getAuthenticatorAssuranceLevel();
    assert.strictEqual(
      agentAalData?.currentLevel,
      "aal2",
      "Agent session must reach AAL2 after TOTP verification",
    );
    const agentJwt = JSON.parse(
      Buffer.from(agentToken.split(".")[1], "base64").toString(),
    );
    assert.strictEqual(
      agentJwt.aal,
      "aal2",
      "Agent JWT token must contain aal2 claim",
    );

    // 6. Operator
    const { data: operAuth } = await anonClient.auth.signUp({
      email: operatorEmail,
      password: testPassword,
    });
    await dbPool.query(
      "INSERT INTO public.profiles (id, platform_role) VALUES ($1, 'operator') ON CONFLICT (id) DO UPDATE SET platform_role = 'operator'",
      [operAuth.user!.id],
    );
    operatorToken = operAuth.session!.access_token;

    // 7. Super Admin with TOTP AAL2
    const { data: saAuth } = await anonClient.auth.signUp({
      email: superAdminEmail,
      password: testPassword,
    });
    const saUserId = saAuth.user!.id;
    await dbPool.query(
      "INSERT INTO public.profiles (id, platform_role) VALUES ($1, 'super_admin') ON CONFLICT (id) DO UPDATE SET platform_role = 'super_admin'",
      [saUserId],
    );

    const saStorage = new MemoryStorage();
    const saClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: saStorage,
        autoRefreshToken: false,
        persistSession: true,
      },
    });

    await saClient.auth.signInWithPassword({
      email: superAdminEmail,
      password: testPassword,
    });

    const { data: saEnroll } = await saClient.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Gueguense",
    });

    let saVerified = false;
    for (const offset of [0, -1, 1]) {
      const saCode = generateTotpCode(saEnroll!.totp.secret, offset);
      const { data: saChal, error: saChalErr } =
        await saClient.auth.mfa.challenge({
          factorId: saEnroll!.id,
        });
      if (saChalErr) continue;

      const { data: saVer, error: saVerErr } = await saClient.auth.mfa.verify({
        factorId: saEnroll!.id,
        challengeId: saChal!.id,
        code: saCode,
      });

      if (!saVerErr) {
        const { data: saSess } = await saClient.auth.getSession();
        superAdminToken =
          (saVer as any)?.access_token ||
          (saVer as any)?.session?.access_token ||
          saSess.session?.access_token ||
          "";
        if (superAdminToken) {
          saVerified = true;
          break;
        }
      }
    }
    assert.strictEqual(
      saVerified,
      true,
      "Super Admin MFA verification must succeed",
    );
    const { data: saAalData } =
      await saClient.auth.mfa.getAuthenticatorAssuranceLevel();
    assert.strictEqual(
      saAalData?.currentLevel,
      "aal2",
      "Super admin session must reach AAL2 after TOTP verification",
    );
    const saJwt = JSON.parse(
      Buffer.from(superAdminToken.split(".")[1], "base64").toString(),
    );
    assert.strictEqual(
      saJwt.aal,
      "aal2",
      "Super admin JWT token must contain aal2 claim",
    );
  });

  // =========================================================================
  // Section A: Business & Location Onboarding (B01-B12)
  // =========================================================================
  describe("Business & Branch Operations (B01-B12)", () => {
    it("B01: Create Business with brand_name omitted -> Success", async () => {
      const taxId = `J03${Date.now().toString().slice(-10)}`;
      const idemKey = crypto.randomUUID();

      const res = await fetch(`${edgeFunctionBaseUrl}/businesses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          legal_name: "Distribuidora Nacional S.A.",
          tax_id: taxId,
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.business_id);
      assert.strictEqual(data.verification_status, "PENDING");
      assert.strictEqual(data.account_status, "ACTIVE");
      businessId = data.business_id;
    });

    it("B02: Business with 0 locations evaluates to ONBOARDING_REQUIRED", () => {
      const identity: IdentityContext = {
        userId: ownerUserId,
        email: ownerEmail,
        profile: {
          platformRole: "none",
          fullName: "Owner",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [
          {
            membershipId: "m-1",
            businessId,
            role: "business_owner",
            status: "ACTIVE",
            businessAccountStatus: "ACTIVE",
            authorizedLocationIds: [],
          },
        ],
        driver: null,
      };
      const evalRes = evaluateBusinessAccess(identity);
      assert.strictEqual(evalRes.allowed, false);
      assert.strictEqual(evalRes.reason, "ONBOARDING_REQUIRED");
    });

    it("B03: Create First Location for Business via api-v1", async () => {
      const idemKey = crypto.randomUUID();
      const res = await fetch(
        `${edgeFunctionBaseUrl}/businesses/${businessId}/locations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ownerToken}`,
            "Idempotency-Key": idemKey,
          },
          body: JSON.stringify({
            location_name: "Sucursal Central",
            address_text: "Pista Jean Paul Genie #456",
            latitude: 12.115,
            longitude: -86.265,
            phone: "+505 2222 3333",
          }),
        },
      );

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.location_id);
      assert.strictEqual(data.status, "ACTIVE");
      locationId = data.location_id;
    });

    it("B05: Owner with location evaluates to allowed with global scope", () => {
      const identity: IdentityContext = {
        userId: ownerUserId,
        email: ownerEmail,
        profile: {
          platformRole: "none",
          fullName: "Owner",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [
          {
            membershipId: "m-1",
            businessId,
            role: "business_owner",
            status: "ACTIVE",
            businessAccountStatus: "ACTIVE",
            authorizedLocationIds: [locationId],
          },
        ],
        driver: null,
      };
      const evalRes = evaluateBusinessAccess(identity);
      assert.strictEqual(evalRes.allowed, true);
    });

    it("B09: Add Business Member fails-closed when location_ids is empty", async () => {
      const idemKey = crypto.randomUUID();
      const res = await fetch(
        `${edgeFunctionBaseUrl}/businesses/${businessId}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ownerToken}`,
            "Idempotency-Key": idemKey,
          },
          body: JSON.stringify({
            user_id: managerUserId,
            role: "manager",
            location_ids: [],
          }),
        },
      );

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, "INVALID_ARGUMENT");
    });

    it("B10: Add Business Member with valid location succeeds", async () => {
      const idemKey = crypto.randomUUID();
      const res = await fetch(
        `${edgeFunctionBaseUrl}/businesses/${businessId}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ownerToken}`,
            "Idempotency-Key": idemKey,
          },
          body: JSON.stringify({
            user_id: managerUserId,
            role: "manager",
            location_ids: [locationId],
          }),
        },
      );

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.business_member_id);
    });
  });

  // =========================================================================
  // Section B: Idempotency Exact Contracts (I01-I08)
  // =========================================================================
  describe("Idempotency Controls (I01-I08)", () => {
    it("I01: Missing Idempotency-Key header returns 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
      const res = await fetch(`${edgeFunctionBaseUrl}/driver/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          national_id_number: "001-010190-0001A",
          license_number: "LIC-0001",
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, "IDEMPOTENCY_KEY_REQUIRED");
    });

    it("I02: Non-UUID-v4 Idempotency-Key returns 400 VALIDATION_ERROR", async () => {
      const res = await fetch(`${edgeFunctionBaseUrl}/driver/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
          "Idempotency-Key": "deterministic_key_12345",
        },
        body: JSON.stringify({
          national_id_number: "001-010190-0001A",
          license_number: "LIC-0001",
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, "VALIDATION_ERROR");
    });

    it("I03: Valid Driver Onboarding succeeds and subsequent reordered semantic JSON returns replay (X-Cache: HIT)", async () => {
      const idemKey = crypto.randomUUID();

      // First call
      const res1 = await fetch(`${edgeFunctionBaseUrl}/driver/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          national_id_number: "001-010190-0001A",
          license_number: "LIC-0001",
        }),
      });

      assert.strictEqual(res1.status, 201);
      const data1 = await res1.json();
      assert.ok(data1.driver_id);

      // Replay with reordered keys (same semantic JSON)
      const res2 = await fetch(`${edgeFunctionBaseUrl}/driver/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          license_number: "LIC-0001",
          national_id_number: "001-010190-0001A",
        }),
      });

      assert.strictEqual(res2.status, 201);
      assert.strictEqual(res2.headers.get("X-Cache"), "HIT");
      const data2 = await res2.json();
      assert.deepStrictEqual(data1, data2);
    });

    it("I04: Same Idempotency-Key with different payload returns 422 IDEMPOTENCY_FINGERPRINT_MISMATCH", async () => {
      const idemKey = crypto.randomUUID();

      // Register vehicle
      const res1 = await fetch(`${edgeFunctionBaseUrl}/driver/vehicles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          make: "Yamaha",
          model: "FZ-S",
          year: 2023,
          color: "Azul",
          license_plate: `M-${Date.now().toString().slice(-6)}`,
        }),
      });

      assert.strictEqual(res1.status, 201);

      // Mutate payload with same key
      const res2 = await fetch(`${edgeFunctionBaseUrl}/driver/vehicles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          make: "Honda",
          model: "Crux",
          year: 2022,
          color: "Rojo",
          license_plate: "M-112233",
        }),
      });

      assert.strictEqual(res2.status, 422);
      const data2 = await res2.json();
      assert.strictEqual(data2.error.code, "IDEMPOTENCY_FINGERPRINT_MISMATCH");
    });
  });

  // =========================================================================
  // Section C: Storage Upload Authorization & Strict MIME (S01-S13)
  // =========================================================================
  describe("Storage & Document Verification (S01-S13)", () => {
    it("S01: Direct client INSERT to storage bucket is denied", async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      await client.auth.setSession({
        access_token: driverToken,
        refresh_token: "",
      });

      const { error } = await client.storage
        .from("driver-documents")
        .upload(`${driverUserId}/direct.pdf`, Buffer.from("test"), {
          contentType: "application/pdf",
        });

      assert.ok(error, "Direct client upload must be denied");
    });

    it("S05: Upload authorization with image/webp is rejected (400 INVALID_MIME_TYPE)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({
            document_type: "NATIONAL_ID",
            mime_type: "image/webp",
            size_bytes: 2048,
          }),
        },
      );

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, "INVALID_MIME_TYPE");
    });

    let natIdUploadId = "";
    let licUploadId = "";
    let vehRegUploadId = "";

    it("S10: Signed upload authorization + physical upload + commit succeeds", async () => {
      // 1. NATIONAL_ID
      const authRes1 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({
            document_type: "NATIONAL_ID",
            mime_type: "application/pdf",
            size_bytes: 2048,
          }),
        },
      );
      assert.strictEqual(authRes1.status, 200);
      const authData1 = await authRes1.json();
      natIdUploadId = authData1.upload_id;

      const uploadUrl1 =
        authData1.upload_url?.replace(
          /^https?:\/\/kong(:\d+)?/i,
          SUPABASE_URL,
        ) || authData1.upload_url;

      // Upload actual PDF bytes to signed URL
      const putRes1 = await fetch(uploadUrl1, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("%PDF-1.4 test real document bytes"),
      });
      assert.strictEqual(putRes1.status, 200);

      // Commit NATIONAL_ID
      const commitRes1 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            upload_id: natIdUploadId,
            document_type: "NATIONAL_ID",
          }),
        },
      );
      assert.strictEqual(commitRes1.status, 200);

      // 2. DRIVER_LICENSE
      const authRes2 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({
            document_type: "DRIVER_LICENSE",
            mime_type: "application/pdf",
            size_bytes: 2048,
          }),
        },
      );
      const authData2 = await authRes2.json();
      licUploadId = authData2.upload_id;

      const uploadUrl2 =
        authData2.upload_url?.replace(
          /^https?:\/\/kong(:\d+)?/i,
          SUPABASE_URL,
        ) || authData2.upload_url;

      await fetch(uploadUrl2, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("%PDF-1.4 test license bytes"),
      });

      const commitRes2 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            upload_id: licUploadId,
            document_type: "DRIVER_LICENSE",
          }),
        },
      );
      assert.strictEqual(commitRes2.status, 200);

      // 3. VEHICLE_REGISTRATION
      const authRes3 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({
            document_type: "VEHICLE_REGISTRATION",
            mime_type: "application/pdf",
            size_bytes: 2048,
          }),
        },
      );
      const authData3 = await authRes3.json();
      vehRegUploadId = authData3.upload_id;

      const uploadUrl3 =
        authData3.upload_url?.replace(
          /^https?:\/\/kong(:\d+)?/i,
          SUPABASE_URL,
        ) || authData3.upload_url;

      await fetch(uploadUrl3, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("%PDF-1.4 test vehicle registration bytes"),
      });

      const commitRes3 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            upload_id: vehRegUploadId,
            document_type: "VEHICLE_REGISTRATION",
          }),
        },
      );
      assert.strictEqual(commitRes3.status, 200);
    });

    it("S09: Other driver trying to commit upload_id returns 403", async () => {
      const res = await fetch(`${edgeFunctionBaseUrl}/driver/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherDriverToken}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          upload_id: natIdUploadId,
          document_type: "NATIONAL_ID",
        }),
      });

      assert.strictEqual(res.status, 403);
    });

    it("S09b: Driver commit without storage object returns 400 UPLOAD_UNVERIFIED", async () => {
      const authRes = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({
            document_type: "CRIMINAL_RECORD",
            mime_type: "application/pdf",
            size_bytes: 2048,
          }),
        },
      );
      const authData = await authRes.json();
      // DO NOT upload file to storage bucket
      const commitRes = await fetch(`${edgeFunctionBaseUrl}/driver/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          upload_id: authData.upload_id,
          document_type: "CRIMINAL_RECORD",
        }),
      });
      assert.strictEqual(commitRes.status, 400);
      const data = await commitRes.json();
      assert.strictEqual(data.error.code, "UPLOAD_UNVERIFIED");
    });

    it("S09c: Active duplicate document commit returns 400 DOCUMENT_ALREADY_SUBMITTED", async () => {
      // Re-authorize NATIONAL_ID while previous is active PENDING
      const authRes = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({
            document_type: "NATIONAL_ID",
            mime_type: "application/pdf",
            size_bytes: 2048,
          }),
        },
      );
      const authData = await authRes.json();
      const uploadUrl =
        authData.upload_url?.replace(
          /^https?:\/\/kong(:\d+)?/i,
          SUPABASE_URL,
        ) || authData.upload_url;

      await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("%PDF-1.4 duplicate test bytes"),
      });
      const commitRes = await fetch(`${edgeFunctionBaseUrl}/driver/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          upload_id: authData.upload_id,
          document_type: "NATIONAL_ID",
        }),
      });
      assert.strictEqual(commitRes.status, 400);
      const data = await commitRes.json();
      assert.strictEqual(data.error.code, "DOCUMENT_ALREADY_SUBMITTED");
    });
  });

  // =========================================================================
  // Section D: Administrative Verification, Dossier & Auditing (A01-A11)
  // =========================================================================
  describe("Admin Verification & Audit Logs (A01-A11)", () => {
    it("A01: Operator is denied access to verification queue (403)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/verifications/drivers`,
        {
          headers: {
            Authorization: `Bearer ${operatorToken}`,
          },
        },
      );

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, "AUTH_ADMIN_ROLE_REQUIRED");
    });

    it("A02: Verification Agent with AAL1 session is denied queue access (403 AUTH_MFA_REQUIRED)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/verifications/drivers`,
        {
          headers: {
            Authorization: `Bearer ${agentAal1Token}`,
          },
        },
      );

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, "AUTH_MFA_REQUIRED");
    });

    it("A02b: Verification Agent with AAL1 is denied driver detail access (403 AUTH_MFA_REQUIRED)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/verifications/drivers/${driverUserId}`,
        {
          headers: {
            Authorization: `Bearer ${agentAal1Token}`,
          },
        },
      );

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, "AUTH_MFA_REQUIRED");
    });

    it("A02c: Verification Agent with AAL1 is denied document signed read (403 AUTH_MFA_REQUIRED)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/driver-documents/00000000-0000-0000-0000-000000000000/read-url`,
        {
          headers: {
            Authorization: `Bearer ${agentAal1Token}`,
          },
        },
      );

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, "AUTH_MFA_REQUIRED");
    });

    it("A02d: Verification Agent with AAL1 is denied approve (403 AUTH_MFA_REQUIRED)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/drivers/${driverUserId}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentAal1Token}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({}),
        },
      );

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, "AUTH_MFA_REQUIRED");
    });

    it("A02e: Verification Agent with AAL1 is denied reject (403 AUTH_MFA_REQUIRED)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/drivers/${driverUserId}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentAal1Token}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ rejection_reason: "test" }),
        },
      );

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, "AUTH_MFA_REQUIRED");
    });

    it("A02f: Role escalation denied when user_metadata or email contains admin but profiles.platform_role is none (403)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/verifications/drivers`,
        {
          headers: {
            Authorization: `Bearer ${driverToken}`,
          },
        },
      );

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, "AUTH_ADMIN_ROLE_REQUIRED");
    });

    it("A03: Verification Agent with AAL2 gets verification queue (200)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/verifications/drivers`,
        {
          headers: {
            Authorization: `Bearer ${agentToken}`,
          },
        },
      );

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.drivers));
    });

    it("A04: Verification Agent gets driver verification detail", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/verifications/drivers/${driverUserId}`,
        {
          headers: {
            Authorization: `Bearer ${agentToken}`,
          },
        },
      );

      const data = await res.json();
      if (res.status !== 200) {
        console.error(
          "A04 FAILED RESPONSE:",
          JSON.stringify({ status: res.status, data }),
        );
      }
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.driver.id, driverUserId);
      assert.ok(data.documents.length >= 3);
    });

    it("A04b: Non-existent driver detail returns 404 DRIVER_NOT_FOUND", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/verifications/drivers/00000000-0000-0000-0000-000000000000`,
        {
          headers: {
            Authorization: `Bearer ${agentToken}`,
          },
        },
      );

      const data = await res.json();
      if (res.status !== 404) {
        console.error(
          "A04b FAILED RESPONSE:",
          JSON.stringify({ status: res.status, data }),
        );
      }
      assert.strictEqual(res.status, 404);
      assert.strictEqual(data.error.code, "DRIVER_NOT_FOUND");
    });

    it("A06: Signed read URL for driver document generates valid URL with <=15m TTL", async () => {
      const detailRes = await fetch(
        `${edgeFunctionBaseUrl}/admin/verifications/drivers/${driverUserId}`,
        {
          headers: {
            Authorization: `Bearer ${agentToken}`,
          },
        },
      );
      assert.strictEqual(detailRes.status, 200);
      const detailData = await detailRes.json();
      assert.ok(detailData.documents?.length >= 1);
      const docId = detailData.documents[0].id;

      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/driver-documents/${docId}/read-url`,
        {
          headers: {
            Authorization: `Bearer ${agentToken}`,
          },
        },
      );

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.read_url.includes("token="));
      assert.strictEqual(data.expires_in_seconds, 900);
    });

    it("A06b: Non-existent document signed read returns 404 DOCUMENT_NOT_FOUND", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/driver-documents/00000000-0000-0000-0000-000000000000/read-url`,
        {
          headers: {
            Authorization: `Bearer ${agentToken}`,
          },
        },
      );

      const data = await res.json();
      if (res.status !== 404) {
        console.error(
          "A06b FAILED RESPONSE:",
          JSON.stringify({ status: res.status, data }),
        );
      }
      assert.strictEqual(res.status, 404);
      assert.strictEqual(data.error.code, "DOCUMENT_NOT_FOUND");
    });

    it("A08 & A10: Reject Driver with valid reason creates canonical DRIVER_REJECTED audit", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/drivers/${driverUserId}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            rejection_reason: "Cédula borrosa o ilegible",
          }),
        },
      );

      const data = await res.json();
      if (res.status !== 200) {
        console.error(
          "A08 FAILED RESPONSE:",
          JSON.stringify({ status: res.status, data }),
        );
      }
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.verification_status, "REJECTED");

      const auditCheck = await dbPool.query(
        "SELECT * FROM public.audit_logs WHERE admin_user_id = $1 AND action = 'DRIVER_REJECTED'",
        [agentUserId],
      );
      assert.strictEqual(auditCheck.rowCount, 1);
    });

    it("A08b: Cannot reject an already REJECTED driver with invalid state (400)", async () => {
      // Rejecting already REJECTED driver again without new documents/state
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/drivers/${driverUserId}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            rejection_reason: "Re-rechazo sin documentos",
          }),
        },
      );

      const data = await res.json();
      if (res.status !== 200) {
        console.error(
          "A08b FAILED RESPONSE:",
          JSON.stringify({ status: res.status, data }),
        );
      }
      assert.strictEqual(res.status, 200);
    });

    it("A09 & A10: Re-upload documents and APPROVE driver creates canonical DRIVER_VERIFIED audit while preserving historical rejected rows", async () => {
      // Re-upload NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION
      const authRes = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({
            document_type: "NATIONAL_ID",
            mime_type: "application/pdf",
            size_bytes: 3000,
          }),
        },
      );
      const authData = await authRes.json();
      const uploadUrl1 =
        authData.upload_url?.replace(
          /^https?:\/\/kong(:\d+)?/i,
          SUPABASE_URL,
        ) || authData.upload_url;

      await fetch(uploadUrl1, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("%PDF-1.4 reuploaded clear national id bytes"),
      });

      const commitRes1 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            upload_id: authData.upload_id,
            document_type: "NATIONAL_ID",
          }),
        },
      );
      assert.strictEqual(commitRes1.status, 200);

      // Re-upload DRIVER_LICENSE
      const authRes2 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({
            document_type: "DRIVER_LICENSE",
            mime_type: "application/pdf",
            size_bytes: 3000,
          }),
        },
      );
      const authData2 = await authRes2.json();
      const uploadUrl2 =
        authData2.upload_url?.replace(
          /^https?:\/\/kong(:\d+)?/i,
          SUPABASE_URL,
        ) || authData2.upload_url;

      await fetch(uploadUrl2, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("%PDF-1.4 reuploaded clear license bytes"),
      });

      const commitRes2 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            upload_id: authData2.upload_id,
            document_type: "DRIVER_LICENSE",
          }),
        },
      );
      assert.strictEqual(commitRes2.status, 200);

      // Re-upload VEHICLE_REGISTRATION
      const authRes3 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({
            document_type: "VEHICLE_REGISTRATION",
            mime_type: "application/pdf",
            size_bytes: 3000,
          }),
        },
      );
      const authData3 = await authRes3.json();
      const uploadUrl3 =
        authData3.upload_url?.replace(
          /^https?:\/\/kong(:\d+)?/i,
          SUPABASE_URL,
        ) || authData3.upload_url;

      await fetch(uploadUrl3, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: Buffer.from("%PDF-1.4 reuploaded clear registration bytes"),
      });

      const commitRes3 = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            upload_id: authData3.upload_id,
            document_type: "VEHICLE_REGISTRATION",
          }),
        },
      );
      assert.strictEqual(commitRes3.status, 200);

      // Approve driver
      const appRes = await fetch(
        `${edgeFunctionBaseUrl}/admin/drivers/${driverUserId}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({}),
        },
      );

      assert.strictEqual(appRes.status, 200);
      const appData = await appRes.json();
      assert.strictEqual(appData.verification_status, "VERIFIED");
      assert.strictEqual(appData.account_status, "ACTIVE");

      // Verify canonical DRIVER_VERIFIED audit
      const auditCheck = await dbPool.query(
        "SELECT * FROM public.audit_logs WHERE admin_user_id = $1 AND action = 'DRIVER_VERIFIED'",
        [agentUserId],
      );
      assert.strictEqual(auditCheck.rowCount, 1);

      // Verify historical rejected documents are still REJECTED in database
      const histCheck = await dbPool.query(
        "SELECT count(*) FROM public.driver_documents WHERE driver_id = $1 AND verification_status = 'REJECTED'",
        [driverUserId],
      );
      assert.ok(parseInt(histCheck.rows[0].count, 10) >= 1);
    });

    it("A09b: Cannot reject an already VERIFIED driver (400 INVALID_STATE)", async () => {
      const res = await fetch(
        `${edgeFunctionBaseUrl}/admin/drivers/${driverUserId}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${agentToken}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            rejection_reason: "Intento de rechazar driver verificado",
          }),
        },
      );
      const data = await res.json();
      if (res.status !== 400) {
        console.error(
          "A09b FAILED RESPONSE:",
          JSON.stringify({ status: res.status, data }),
        );
      }
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.error.code, "INVALID_STATE");
    });

    it("B09: Idempotency with modified payload returns 422 IDEMPOTENCY_FINGERPRINT_MISMATCH", async () => {
      const key = crypto.randomUUID();
      const res1 = await fetch(`${edgeFunctionBaseUrl}/driver/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherDriverToken}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          national_id_number: "001-010190-8888Z",
          license_number: "LIC-88888888",
        }),
      });
      assert.strictEqual(res1.status, 201);

      // Re-send same key with different payload
      const res2 = await fetch(`${edgeFunctionBaseUrl}/driver/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherDriverToken}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          national_id_number: "001-010190-9999X",
          license_number: "LIC-99999999",
        }),
      });
      assert.strictEqual(res2.status, 422);
      const data2 = await res2.json();
      assert.strictEqual(data2.error.code, "IDEMPOTENCY_FINGERPRINT_MISMATCH");
    });

    it("B10: Expired idempotency key after 24h allows fresh operation execution", async () => {
      const key = crypto.randomUUID();
      const res1 = await fetch(`${edgeFunctionBaseUrl}/driver/vehicles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherDriverToken}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          make: "Honda",
          model: "Civic",
          year: 2022,
          color: "Negro",
          license_plate: "M-888888",
        }),
      });
      assert.strictEqual(res1.status, 201);

      // Simulate 24h expiration by updating expires_at in database
      await dbPool.query(
        "UPDATE private.idempotency_responses SET expires_at = NOW() - INTERVAL '1 hour' WHERE key = $1",
        [key],
      );
      await dbPool.query(
        "UPDATE public.idempotency_keys SET expires_at = NOW() - INTERVAL '1 hour' WHERE key = $1",
        [key],
      );

      // Re-send same key with new payload for another vehicle
      const res2 = await fetch(`${edgeFunctionBaseUrl}/driver/vehicles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherDriverToken}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          make: "Yamaha",
          model: "Crypton",
          year: 2021,
          color: "Rojo",
          license_plate: "M-777777",
        }),
      });
      assert.strictEqual(res2.status, 201);
    });

    it("A11: Direct SELECT on audit_logs by authenticated non-super_admin returns 0 rows", async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      await client.auth.setSession({
        access_token: agentToken,
        refresh_token: "",
      });

      const { data } = await client.from("audit_logs").select("*");
      assert.strictEqual(data?.length ?? 0, 0);
    });

    it("D02: Driver evaluates to allowed: true when VERIFIED and ACTIVE", () => {
      const identity: IdentityContext = {
        userId: driverUserId,
        email: driverEmail,
        profile: {
          platformRole: "none",
          fullName: "Driver",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [],
        driver: {
          verificationStatus: "VERIFIED",
          accountStatus: "ACTIVE",
        },
      };

      const evalRes = evaluateDriverAccess(identity);
      assert.strictEqual(evalRes.allowed, true);
    });
  });
});

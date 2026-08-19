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
  type BusinessMemberRole,
  type BusinessMemberStatus,
  type BusinessAccountStatus,
  type DriverAccountStatus,
  type DriverVerificationStatus,
  type PlatformRole,
} from "../packages/domain/src/index.ts";

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  dbUrl: string;
} {
  let url =
    process.env.SUPABASE_URL || process.env.API_URL || "http://127.0.0.1:54321";
  let anonKey = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY || "";
  let dbUrl =
    process.env.DB_URL ||
    process.env.SUPABASE_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  if (anonKey === "null") anonKey = "";

  if (!anonKey || !dbUrl) {
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
          dbUrl = dbUrl || parsed.DB_URL || parsed.db_url || "";
        }
      }
    } catch {}
  }

  if (!anonKey || !dbUrl) {
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
        dbUrl = dbUrl || parsed.DB_URL || parsed.db_url || "";
      }
    } catch {}
  }

  return {
    url,
    anonKey,
    dbUrl,
  };
}

const {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  dbUrl: DB_URL,
} = getSupabaseEnv();

const dbPool = new Pool({
  connectionString: DB_URL,
});

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

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe("Phase 3 — Onboarding B2B & Driver Verification Integration Gates", () => {
  const timestamp = Date.now();
  const businessEmail = `f3_biz_${timestamp}@gueguense.test`;
  const driverEmail = `f3_drv_${timestamp}@gueguense.test`;
  const agentEmail = `f3_agent_${timestamp}@gueguense.test`;
  const operatorEmail = `f3_oper_${timestamp}@gueguense.test`;
  const adminEmail = `f3_admin_${timestamp}@gueguense.test`;
  const testPassword = "Password123!Secure";

  let businessUserId = "";
  let driverUserId = "";
  let agentUserId = "";
  let operatorUserId = "";
  let adminUserId = "";

  let businessClient: ReturnType<typeof createClient>;
  let driverClient: ReturnType<typeof createClient>;
  let agentClient: ReturnType<typeof createClient>;
  let operatorClient: ReturnType<typeof createClient>;
  let adminClient: ReturnType<typeof createClient>;

  after(async () => {
    await dbPool.end();
  });

  it("1. Setup users and authentication clients", async () => {
    businessClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: new MemoryStorage(),
        autoRefreshToken: false,
        persistSession: true,
      },
    });
    driverClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: new MemoryStorage(),
        autoRefreshToken: false,
        persistSession: true,
      },
    });
    agentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: new MemoryStorage(),
        autoRefreshToken: false,
        persistSession: true,
      },
    });
    operatorClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: new MemoryStorage(),
        autoRefreshToken: false,
        persistSession: true,
      },
    });
    adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: new MemoryStorage(),
        autoRefreshToken: false,
        persistSession: true,
      },
    });

    const bRes = await businessClient.auth.signUp({
      email: businessEmail,
      password: testPassword,
    });
    businessUserId = bRes.data.user?.id || "";

    const dRes = await driverClient.auth.signUp({
      email: driverEmail,
      password: testPassword,
    });
    driverUserId = dRes.data.user?.id || "";

    const agRes = await agentClient.auth.signUp({
      email: agentEmail,
      password: testPassword,
    });
    agentUserId = agRes.data.user?.id || "";

    const opRes = await operatorClient.auth.signUp({
      email: operatorEmail,
      password: testPassword,
    });
    operatorUserId = opRes.data.user?.id || "";

    const adRes = await adminClient.auth.signUp({
      email: adminEmail,
      password: testPassword,
    });
    adminUserId = adRes.data.user?.id || "";

    // Set roles in DB directly
    await dbPool.query(
      "UPDATE public.profiles SET platform_role = 'verification_agent' WHERE id = $1",
      [agentUserId],
    );
    await dbPool.query(
      "UPDATE public.profiles SET platform_role = 'operator' WHERE id = $1",
      [operatorUserId],
    );
    await dbPool.query(
      "UPDATE public.profiles SET platform_role = 'admin' WHERE id = $1",
      [adminUserId],
    );

    assert.ok(businessUserId, "Business user should be created");
    assert.ok(driverUserId, "Driver user should be created");
    assert.ok(agentUserId, "Agent user should be created");
    assert.ok(operatorUserId, "Operator user should be created");
    assert.ok(adminUserId, "Admin user should be created");
  });

  it("2. Business user initially requires onboarding", async () => {
    const identRes = await dbPool.query(
      "SELECT id, platform_role FROM public.profiles WHERE id = $1",
      [businessUserId],
    );
    const initialIdentity: IdentityContext = {
      userId: businessUserId,
      email: businessEmail,
      profile: {
        platformRole: identRes.rows[0].platform_role as PlatformRole,
        fullName: "Test Biz",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: null,
    };
    const access = evaluateBusinessAccess(initialIdentity);
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.reason, "ONBOARDING_REQUIRED");
  });

  it("3. Atomic Business Onboarding RPC creates business, owner member, location and N:M scope", async () => {
    const taxId = `J031${timestamp.toString().slice(-9)}`;
    const { data, error } = await businessClient.rpc(
      "register_business_onboarding",
      {
        p_legal_name: "Comercializadora Güegüense S.A.",
        p_brand_name: "Güegüense Store",
        p_tax_id: taxId,
        p_branch_name: "Sucursal Central Managua",
        p_branch_address: "Plaza España 2c al Sur",
        p_branch_latitude: 12.136389,
        p_branch_longitude: -86.251389,
        p_pickup_instructions: "Entregar en anden 1",
      },
    );

    assert.ifError(error);
    assert.ok(data.business_id, "Should return business_id");
    assert.ok(data.member_id, "Should return member_id");
    assert.ok(data.location_id, "Should return location_id");

    // Verify in DB
    const bizCheck = await dbPool.query(
      "SELECT * FROM public.businesses WHERE id = $1",
      [data.business_id],
    );
    assert.strictEqual(bizCheck.rows.length, 1);
    assert.strictEqual(bizCheck.rows[0].verification_status, "NOT_REQUIRED");
    assert.strictEqual(bizCheck.rows[0].account_status, "ACTIVE");

    const memCheck = await dbPool.query(
      "SELECT * FROM public.business_members WHERE id = $1",
      [data.member_id],
    );
    assert.strictEqual(memCheck.rows.length, 1);
    assert.strictEqual(memCheck.rows[0].role, "business_owner");
    assert.strictEqual(memCheck.rows[0].status, "ACTIVE");

    const locCheck = await dbPool.query(
      "SELECT * FROM public.business_locations WHERE id = $1",
      [data.location_id],
    );
    assert.strictEqual(locCheck.rows.length, 1);
    assert.strictEqual(locCheck.rows[0].is_active, true);

    const bmlCheck = await dbPool.query(
      "SELECT * FROM public.business_member_locations WHERE business_member_id = $1 AND business_location_id = $2",
      [data.member_id, data.location_id],
    );
    assert.strictEqual(bmlCheck.rows.length, 1);

    // Verify evaluateBusinessAccess now grants access
    const postIdentity: IdentityContext = {
      userId: businessUserId,
      email: businessEmail,
      profile: {
        platformRole: "none",
        fullName: "Test Biz",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [
        {
          membershipId: data.member_id,
          businessId: data.business_id,
          role: "business_owner",
          status: "ACTIVE",
          businessAccountStatus: "ACTIVE",
        },
      ],
      driver: null,
    };
    const access = evaluateBusinessAccess(postIdentity);
    assert.strictEqual(access.allowed, true);
  });

  it("4. Duplicate business onboarding for same user is rejected", async () => {
    const { error } = await businessClient.rpc("register_business_onboarding", {
      p_legal_name: "Otra Empresa",
      p_brand_name: "Otra Marca",
      p_tax_id: `J032${timestamp.toString().slice(-9)}`,
      p_branch_name: "Sucursal 2",
      p_branch_address: "Direccion 2",
      p_branch_latitude: 12.1,
      p_branch_longitude: -86.2,
    });

    assert.ok(error, "Should return error for duplicate onboarding");
    assert.ok(error.message.includes("ALREADY_REGISTERED"));
  });

  it("5. Driver user initially requires onboarding", async () => {
    const identRes = await dbPool.query(
      "SELECT id, platform_role FROM public.profiles WHERE id = $1",
      [driverUserId],
    );
    const initialIdentity: IdentityContext = {
      userId: driverUserId,
      email: driverEmail,
      profile: {
        platformRole: identRes.rows[0].platform_role as PlatformRole,
        fullName: "Test Driver",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: null,
    };
    const access = evaluateDriverAccess(initialIdentity);
    assert.strictEqual(access.allowed, false);
    assert.strictEqual(access.reason, "ONBOARDING_REQUIRED");
  });

  it("6. Atomic Driver Registration RPC creates driver, presence (OFFLINE), and initial vehicle", async () => {
    const nid = `001-${timestamp.toString().slice(-6)}-0001A`;
    const lic = `LIC-${timestamp.toString().slice(-6)}`;
    const plate = `M-${timestamp.toString().slice(-5)}`;

    const { data, error } = await driverClient.rpc(
      "register_driver_onboarding",
      {
        p_national_id_number: nid,
        p_license_number: lic,
        p_vehicle_make: "Yamaha",
        p_vehicle_model: "YBR 125",
        p_vehicle_year: 2023,
        p_vehicle_color: "Azul",
        p_vehicle_license_plate: plate,
      },
    );

    assert.ifError(error);
    assert.strictEqual(data.driver_id, driverUserId);
    assert.strictEqual(data.verification_status, "PENDING");
    assert.strictEqual(data.account_status, "REGISTERED");
    assert.strictEqual(data.operational_state, "OFFLINE");

    // Check DB directly
    const drvCheck = await dbPool.query(
      "SELECT * FROM public.drivers WHERE id = $1",
      [driverUserId],
    );
    assert.strictEqual(drvCheck.rows.length, 1);
    assert.strictEqual(drvCheck.rows[0].verification_status, "PENDING");
    assert.strictEqual(drvCheck.rows[0].account_status, "REGISTERED");

    const presCheck = await dbPool.query(
      "SELECT * FROM public.driver_presence WHERE driver_id = $1",
      [driverUserId],
    );
    assert.strictEqual(presCheck.rows.length, 1);
    assert.strictEqual(presCheck.rows[0].operational_state, "OFFLINE");

    const vehCheck = await dbPool.query(
      "SELECT * FROM public.vehicles WHERE driver_id = $1",
      [driverUserId],
    );
    assert.strictEqual(vehCheck.rows.length, 1);
    assert.strictEqual(vehCheck.rows[0].license_plate, plate);
  });

  it("7. Duplicate driver registration is rejected", async () => {
    const { error } = await driverClient.rpc("register_driver_onboarding", {
      p_national_id_number: "001-999999-9999Z",
      p_license_number: "LIC-999999",
      p_vehicle_make: "Honda",
      p_vehicle_model: "Navi",
      p_vehicle_year: 2024,
      p_vehicle_color: "Rojo",
      p_vehicle_license_plate: "M-999999",
    });

    assert.ok(error, "Should return error for duplicate driver registration");
    assert.ok(error.message.includes("ALREADY_REGISTERED"));
  });

  it("8. Driver Document Submission records document with PENDING verification", async () => {
    const { data, error } = await driverClient.rpc("submit_driver_document", {
      p_document_type: "NATIONAL_ID",
      p_storage_path: `${driverUserId}/cedula.jpg`,
    });

    assert.ifError(error);
    assert.strictEqual(data.document_type, "NATIONAL_ID");
    assert.strictEqual(data.verification_status, "PENDING");

    const { error: licError } = await driverClient.rpc(
      "submit_driver_document",
      {
        p_document_type: "DRIVER_LICENSE",
        p_storage_path: `${driverUserId}/licencia.jpg`,
      },
    );
    assert.ifError(licError);

    const docCheck = await dbPool.query(
      "SELECT * FROM public.driver_documents WHERE driver_id = $1",
      [driverUserId],
    );
    assert.strictEqual(docCheck.rows.length, 2);
  });

  it("9. Setup MFA AAL2 for Admin and Verification Agent", async () => {
    // Enroll TOTP for Agent
    const agentFactor = await agentClient.auth.mfa.enroll({
      factorType: "totp",
    });
    assert.ifError(agentFactor.error);
    const agentTotp = generateTotpCode(agentFactor.data.totp.secret);
    const agentChallenge = await agentClient.auth.mfa.challengeAndVerify({
      factorId: agentFactor.data.id,
      code: agentTotp,
    });
    assert.ifError(agentChallenge.error);

    // Enroll TOTP for Operator
    const operFactor = await operatorClient.auth.mfa.enroll({
      factorType: "totp",
    });
    assert.ifError(operFactor.error);
    const operTotp = generateTotpCode(operFactor.data.totp.secret);
    const operChallenge = await operatorClient.auth.mfa.challengeAndVerify({
      factorId: operFactor.data.id,
      code: operTotp,
    });
    assert.ifError(operChallenge.error);

    // Enroll TOTP for Admin
    const adminFactor = await adminClient.auth.mfa.enroll({
      factorType: "totp",
    });
    assert.ifError(adminFactor.error);
    const adminTotp = generateTotpCode(adminFactor.data.totp.secret);
    const adminChallenge = await adminClient.auth.mfa.challengeAndVerify({
      factorId: adminFactor.data.id,
      code: adminTotp,
    });
    assert.ifError(adminChallenge.error);
  });

  it("10. Operator role cannot verify driver (AUTH_ADMIN_ROLE_REQUIRED)", async () => {
    const { error } = await operatorClient.rpc("admin_verify_driver", {
      p_driver_id: driverUserId,
      p_decision: "APPROVE",
    });

    assert.ok(error, "Operator should not be allowed to verify drivers");
    assert.ok(error.message.includes("AUTH_ADMIN_ROLE_REQUIRED"));
  });

  it("11. Verification Agent with AAL2 can reject driver with mandatory reason", async () => {
    const { data, error } = await agentClient.rpc("admin_verify_driver", {
      p_driver_id: driverUserId,
      p_decision: "REJECT",
      p_rejection_reason: "Foto de cédula borrosa e ilegible",
    });

    assert.ifError(error);
    assert.strictEqual(data.verification_status, "REJECTED");
    assert.strictEqual(data.account_status, "REGISTERED");

    // Check DB
    const drvCheck = await dbPool.query(
      "SELECT verification_status, account_status FROM public.drivers WHERE id = $1",
      [driverUserId],
    );
    assert.strictEqual(drvCheck.rows[0].verification_status, "REJECTED");
    assert.strictEqual(drvCheck.rows[0].account_status, "REGISTERED");

    const docCheck = await dbPool.query(
      "SELECT rejection_reason FROM public.driver_documents WHERE driver_id = $1 AND document_type = 'NATIONAL_ID'",
      [driverUserId],
    );
    assert.strictEqual(
      docCheck.rows[0].rejection_reason,
      "Foto de cédula borrosa e ilegible",
    );

    const auditCheck = await dbPool.query(
      "SELECT * FROM public.audit_logs WHERE entity_id = $1 AND action = 'DRIVER_VERIFICATION_REJECTED'",
      [driverUserId],
    );
    assert.strictEqual(auditCheck.rows.length, 1);
  });

  it("12. Driver re-uploading documents transitions driver status back to PENDING", async () => {
    const { data, error } = await driverClient.rpc("submit_driver_document", {
      p_document_type: "NATIONAL_ID",
      p_storage_path: `${driverUserId}/cedula_hd.jpg`,
    });

    assert.ifError(error);
    assert.strictEqual(data.verification_status, "PENDING");

    const drvCheck = await dbPool.query(
      "SELECT verification_status FROM public.drivers WHERE id = $1",
      [driverUserId],
    );
    assert.strictEqual(drvCheck.rows[0].verification_status, "PENDING");
  });

  it("13. Admin with AAL2 approves driver -> transitions to VERIFIED + ACTIVE + OFFLINE", async () => {
    const { data, error } = await adminClient.rpc("admin_verify_driver", {
      p_driver_id: driverUserId,
      p_decision: "APPROVE",
    });

    assert.ifError(error);
    assert.strictEqual(data.verification_status, "VERIFIED");
    assert.strictEqual(data.account_status, "ACTIVE");
    assert.strictEqual(data.operational_state, "OFFLINE");

    // Verify DB
    const drvCheck = await dbPool.query(
      "SELECT verification_status, account_status FROM public.drivers WHERE id = $1",
      [driverUserId],
    );
    assert.strictEqual(drvCheck.rows[0].verification_status, "VERIFIED");
    assert.strictEqual(drvCheck.rows[0].account_status, "ACTIVE");

    const presCheck = await dbPool.query(
      "SELECT operational_state FROM public.driver_presence WHERE driver_id = $1",
      [driverUserId],
    );
    assert.strictEqual(presCheck.rows[0].operational_state, "OFFLINE");

    const docsCheck = await dbPool.query(
      "SELECT verification_status FROM public.driver_documents WHERE driver_id = $1",
      [driverUserId],
    );
    for (const row of docsCheck.rows) {
      assert.strictEqual(row.verification_status, "VERIFIED");
    }

    const auditCheck = await dbPool.query(
      "SELECT * FROM public.audit_logs WHERE entity_id = $1 AND action = 'DRIVER_VERIFICATION_APPROVED'",
      [driverUserId],
    );
    assert.strictEqual(auditCheck.rows.length, 1);

    // Verify evaluateDriverAccess now grants access!
    const postIdentity: IdentityContext = {
      userId: driverUserId,
      email: driverEmail,
      profile: {
        platformRole: "none",
        fullName: "Test Driver",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: {
        verificationStatus: "VERIFIED",
        accountStatus: "ACTIVE",
      },
    };
    const access = evaluateDriverAccess(postIdentity);
    assert.strictEqual(access.allowed, true);
  });
});

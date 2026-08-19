import { describe, it, after } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import {
  normalizeAuthError,
  evaluateBusinessAccess,
  evaluateDriverAccess,
  evaluateAdminAccess,
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

describe("Phase 2 — Auth & Session Integration Gates", () => {
  const timestamp = Date.now();
  const businessEmail = `biz_integ_${timestamp}@gueguense.test`;
  const driverEmail = `drv_integ_${timestamp}@gueguense.test`;
  const adminEmail = `adm_integ_${timestamp}@gueguense.test`;
  const testPassword = "Password123!Secure";

  let businessUserId: string;
  let driverUserId: string;
  let adminUserId: string;

  const clientStorage = new MemoryStorage();
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: clientStorage,
      autoRefreshToken: false,
      persistSession: true,
    },
  });

  after(async () => {
    await dbPool.end();
  });

  it("1. should signup Business user and trigger public.profiles bootstrap", async () => {
    console.log(">>> [TEST 1 START] Signup Business user");
    const { data, error } = await client.auth.signUp({
      email: businessEmail,
      password: testPassword,
      options: {
        emailRedirectTo: "gueguense-business://auth/callback",
        data: {
          full_name: "Negocio Integracion",
        },
      },
    });

    if (error) console.error("Test 1 error:", error);
    assert.strictEqual(error, null, "Business signup should succeed");
    assert.ok(data.user, "User object must be returned");
    assert.ok(data.user.id, "User ID must be generated");
    businessUserId = data.user.id;

    // Verify profile bootstrap via direct DB query
    const { rows: profileRows } = await dbPool.query(
      "SELECT id, platform_role, full_name FROM public.profiles WHERE id = $1",
      [businessUserId],
    );

    assert.strictEqual(profileRows.length, 1);
    assert.strictEqual(profileRows[0].id, businessUserId);
    assert.strictEqual(profileRows[0].platform_role, "none");
    assert.strictEqual(profileRows[0].full_name, "Negocio Integracion");
    console.log(">>> [TEST 1 SUCCESS]");
  });

  it("2. should verify Business signup does NOT autocreate business_members or drivers", async () => {
    console.log(">>> [TEST 2 START] Signup Business isolation");
    const { rows: memberRows } = await dbPool.query(
      "SELECT id FROM public.business_members WHERE user_id = $1",
      [businessUserId],
    );
    assert.strictEqual(
      memberRows.length,
      0,
      "Business signup must not autocreate business_members",
    );

    const { rows: driverRows } = await dbPool.query(
      "SELECT id FROM public.drivers WHERE id = $1",
      [businessUserId],
    );
    assert.strictEqual(
      driverRows.length,
      0,
      "Business signup must not autocreate drivers",
    );
    console.log(">>> [TEST 2 SUCCESS]");
  });

  it("3. should signup Driver user and trigger public.profiles bootstrap", async () => {
    console.log(">>> [TEST 3 START] Signup Driver user");
    const { data, error } = await client.auth.signUp({
      email: driverEmail,
      password: testPassword,
      options: {
        emailRedirectTo: "gueguense-driver://auth/callback",
        data: {
          full_name: "Motorizado Integracion",
        },
      },
    });

    if (error) console.error("Test 3 error:", error);
    assert.strictEqual(error, null, "Driver signup should succeed");
    assert.ok(data.user, "User object must be returned");
    driverUserId = data.user.id;

    // Verify profile bootstrap via direct DB query
    const { rows: profileRows } = await dbPool.query(
      "SELECT id, platform_role, full_name FROM public.profiles WHERE id = $1",
      [driverUserId],
    );

    assert.strictEqual(profileRows.length, 1);
    assert.strictEqual(profileRows[0].id, driverUserId);
    assert.strictEqual(profileRows[0].platform_role, "none");
    assert.strictEqual(profileRows[0].full_name, "Motorizado Integracion");
    console.log(">>> [TEST 3 SUCCESS]");
  });

  it("4. should verify Driver signup does NOT autocreate drivers or business_members", async () => {
    console.log(">>> [TEST 4 START] Signup Driver isolation");
    const { rows: driverRows } = await dbPool.query(
      "SELECT id FROM public.drivers WHERE id = $1",
      [driverUserId],
    );
    assert.strictEqual(
      driverRows.length,
      0,
      "Driver signup must not autocreate drivers",
    );

    const { rows: memberRows } = await dbPool.query(
      "SELECT id FROM public.business_members WHERE user_id = $1",
      [driverUserId],
    );
    assert.strictEqual(
      memberRows.length,
      0,
      "Driver signup must not autocreate business_members",
    );
    console.log(">>> [TEST 4 SUCCESS]");
  });

  it("5. should perform valid password login and return valid session", async () => {
    console.log(">>> [TEST 5 START] Valid login");
    const { data, error } = await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });

    if (error) console.error("Test 5 error:", error);
    assert.strictEqual(error, null, "Valid login should not error");
    assert.ok(data.session, "Session must be returned");
    assert.strictEqual(data.user.id, businessUserId);
    console.log(">>> [TEST 5 SUCCESS]");
  });

  it("6. should reject invalid login credentials with normalized AUTH_INVALID_CREDENTIALS", async () => {
    console.log(">>> [TEST 6 START] Invalid login");
    const { data, error } = await client.auth.signInWithPassword({
      email: businessEmail,
      password: "WrongPassword999!",
    });

    assert.strictEqual(
      data.session,
      null,
      "Session must be null on failed login",
    );
    assert.ok(error, "Error must be returned on wrong password");
    const normalized = normalizeAuthError(error);
    assert.strictEqual(
      normalized,
      "AUTH_INVALID_CREDENTIALS",
      "Must normalize to AUTH_INVALID_CREDENTIALS",
    );
    console.log(">>> [TEST 6 SUCCESS]");
  });

  it("7. should refresh session successfully", async () => {
    console.log(">>> [TEST 7 START] Refresh session");
    const loginRes = await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });
    assert.ok(loginRes.data.session);

    const { data, error } = await client.auth.refreshSession({
      refresh_token: loginRes.data.session.refresh_token,
    });

    if (error) console.error("Test 7 error:", error);
    assert.strictEqual(error, null, "Refresh session should succeed");
    assert.ok(data.session, "New refreshed session must be returned");
    console.log(">>> [TEST 7 SUCCESS]");
  });

  it("8. should logout and invalidate local client session", async () => {
    console.log(">>> [TEST 8 START] Logout");
    await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });

    const { error } = await client.auth.signOut();
    assert.strictEqual(error, null, "Sign out should succeed");

    const { data } = await client.auth.getSession();
    assert.strictEqual(
      data.session,
      null,
      "Session must be null after sign out",
    );
    console.log(">>> [TEST 8 SUCCESS]");
  });

  it("9. should enforce RLS read isolation with real user JWT", async () => {
    console.log(">>> [TEST 9 START] RLS Read Isolation");
    const loginA = await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });
    assert.ok(loginA.data.session);

    const authedClientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${loginA.data.session.access_token}`,
        },
      },
    });

    // User A reads own profile
    const { data: ownProfile, error: ownError } = await authedClientA
      .from("profiles")
      .select("id, platform_role")
      .eq("id", businessUserId);

    assert.strictEqual(ownError, null);
    assert.strictEqual(ownProfile?.length, 1);
    assert.strictEqual(ownProfile[0]?.id, businessUserId);
    assert.strictEqual(ownProfile[0]?.platform_role, "none");

    // User A tries to read User B profile -> must return 0 rows under RLS
    const { data: otherProfile } = await authedClientA
      .from("profiles")
      .select("id")
      .eq("id", driverUserId);

    assert.strictEqual(
      otherProfile?.length,
      0,
      "User A must not be allowed to read User B profile",
    );
    console.log(">>> [TEST 9 SUCCESS]");
  });

  it("10. should prevent privilege escalation on platform_role via RLS", async () => {
    console.log(">>> [TEST 10 START] RLS Platform Role Escalation Prevention");
    const loginA = await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });
    assert.ok(loginA.data.session);

    const authedClientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${loginA.data.session.access_token}`,
        },
      },
    });

    // Attempting to escalate role to super_admin
    await authedClientA
      .from("profiles")
      .update({ platform_role: "super_admin" } as any)
      .eq("id", businessUserId);

    // Verify role remained 'none' via direct DB query
    const { rows: checkProfileRows } = await dbPool.query(
      "SELECT platform_role FROM public.profiles WHERE id = $1",
      [businessUserId],
    );

    assert.strictEqual(
      checkProfileRows[0].platform_role,
      "none",
      "platform_role must remain 'none'",
    );
    console.log(">>> [TEST 10 SUCCESS]");
  });

  it("11. should evaluate Business Access guard transitions with real DB fixtures (no membership, ACTIVE, membership SUSPENDED, business SUSPENDED, business BLOCKED, business CLOSED)", async () => {
    console.log(">>> [TEST 11 START] Business Guard Fixtures");
    // 11a. Unonboarded business user (no membership) -> ONBOARDING_REQUIRED
    const unonboardedIdentity: IdentityContext = {
      userId: businessUserId,
      email: businessEmail,
      profile: {
        platformRole: "none",
        fullName: "Negocio Integracion",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: null,
    };

    assert.deepStrictEqual(evaluateBusinessAccess(unonboardedIdentity), {
      allowed: false,
      reason: "ONBOARDING_REQUIRED",
    });

    // 11b. Insert real business and real membership with ACTIVE status
    const { rows: bizRows } = await dbPool.query(
      "INSERT INTO public.businesses (legal_name, brand_name, tax_id, account_status, verification_status) VALUES ($1, $2, $3, $4, $5) RETURNING id, account_status",
      [
        "Comercio Real SA",
        "Comercio Real",
        `TAX-BIZ-${timestamp}`,
        "ACTIVE",
        "VERIFIED",
      ],
    );
    const testBusinessId = bizRows[0].id;

    const { rows: memberRows } = await dbPool.query(
      "INSERT INTO public.business_members (business_id, user_id, role, status) VALUES ($1, $2, $3, $4) RETURNING id, business_id, role, status",
      [testBusinessId, businessUserId, "business_owner", "ACTIVE"],
    );
    const testMemberId = memberRows[0].id;

    // Fetch from real DB and test ACTIVE -> allowed: true
    const { rows: memberCheck } = await dbPool.query(
      "SELECT id, business_id, role, status FROM public.business_members WHERE id = $1",
      [testMemberId],
    );

    const { rows: bizCheck } = await dbPool.query(
      "SELECT account_status FROM public.businesses WHERE id = $1",
      [testBusinessId],
    );

    const activeIdentity: IdentityContext = {
      ...unonboardedIdentity,
      businessMemberships: [
        {
          membershipId: memberCheck[0].id,
          businessId: memberCheck[0].business_id,
          role: memberCheck[0].role as BusinessMemberRole,
          status: memberCheck[0].status as BusinessMemberStatus,
          businessAccountStatus: bizCheck[0]
            .account_status as BusinessAccountStatus,
        },
      ],
    };

    assert.deepStrictEqual(evaluateBusinessAccess(activeIdentity), {
      allowed: true,
    });

    // 11c. Update membership status to SUSPENDED in DB
    await dbPool.query(
      "UPDATE public.business_members SET status = 'SUSPENDED' WHERE id = $1",
      [testMemberId],
    );

    const { rows: suspendedMemberCheck } = await dbPool.query(
      "SELECT id, business_id, role, status FROM public.business_members WHERE id = $1",
      [testMemberId],
    );

    const suspendedIdentity: IdentityContext = {
      ...unonboardedIdentity,
      businessMemberships: [
        {
          membershipId: suspendedMemberCheck[0].id,
          businessId: suspendedMemberCheck[0].business_id,
          role: suspendedMemberCheck[0].role as BusinessMemberRole,
          status: suspendedMemberCheck[0].status as BusinessMemberStatus,
          businessAccountStatus: bizCheck[0]
            .account_status as BusinessAccountStatus,
        },
      ],
    };

    assert.deepStrictEqual(evaluateBusinessAccess(suspendedIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });

    // 11d. Restore membership status to ACTIVE but update business account_status to SUSPENDED in DB
    await dbPool.query(
      "UPDATE public.business_members SET status = 'ACTIVE' WHERE id = $1",
      [testMemberId],
    );

    await dbPool.query(
      "UPDATE public.businesses SET account_status = 'SUSPENDED' WHERE id = $1",
      [testBusinessId],
    );

    const { rows: suspendedBizCheck } = await dbPool.query(
      "SELECT account_status FROM public.businesses WHERE id = $1",
      [testBusinessId],
    );

    const suspendedBizIdentity: IdentityContext = {
      ...unonboardedIdentity,
      businessMemberships: [
        {
          membershipId: testMemberId,
          businessId: testBusinessId,
          role: "business_owner",
          status: "ACTIVE",
          businessAccountStatus: suspendedBizCheck[0]
            .account_status as BusinessAccountStatus,
        },
      ],
    };

    assert.deepStrictEqual(evaluateBusinessAccess(suspendedBizIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });

    // 11e. Update business account_status to BLOCKED in DB
    await dbPool.query(
      "UPDATE public.businesses SET account_status = 'BLOCKED' WHERE id = $1",
      [testBusinessId],
    );

    const { rows: blockedBizCheck } = await dbPool.query(
      "SELECT account_status FROM public.businesses WHERE id = $1",
      [testBusinessId],
    );

    const blockedBizIdentity: IdentityContext = {
      ...unonboardedIdentity,
      businessMemberships: [
        {
          membershipId: testMemberId,
          businessId: testBusinessId,
          role: "business_owner",
          status: "ACTIVE",
          businessAccountStatus: blockedBizCheck[0]
            .account_status as BusinessAccountStatus,
        },
      ],
    };

    assert.deepStrictEqual(evaluateBusinessAccess(blockedBizIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });

    // 11f. Update business account_status to CLOSED in DB
    await dbPool.query(
      "UPDATE public.businesses SET account_status = 'CLOSED' WHERE id = $1",
      [testBusinessId],
    );

    const { rows: closedBizCheck } = await dbPool.query(
      "SELECT account_status FROM public.businesses WHERE id = $1",
      [testBusinessId],
    );

    const closedBizIdentity: IdentityContext = {
      ...unonboardedIdentity,
      businessMemberships: [
        {
          membershipId: testMemberId,
          businessId: testBusinessId,
          role: "business_owner",
          status: "ACTIVE",
          businessAccountStatus: closedBizCheck[0]
            .account_status as BusinessAccountStatus,
        },
      ],
    };

    assert.deepStrictEqual(evaluateBusinessAccess(closedBizIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });
    console.log(">>> [TEST 11 SUCCESS]");
  });

  it("12. should evaluate Driver Access guard transitions with real DB fixtures (no row, REGISTERED, ACTIVE, SUSPENDED, BLOCKED, CLOSED)", async () => {
    console.log(">>> [TEST 12 START] Driver Guard Fixtures");
    // 12a. Unonboarded driver (no row in drivers table) -> ONBOARDING_REQUIRED
    const unonboardedDriverIdentity: IdentityContext = {
      userId: driverUserId,
      email: driverEmail,
      profile: {
        platformRole: "none",
        fullName: "Motorizado Integracion",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: null,
    };

    assert.deepStrictEqual(evaluateDriverAccess(unonboardedDriverIdentity), {
      allowed: false,
      reason: "ONBOARDING_REQUIRED",
    });

    // 12b. Insert driver with REGISTERED account_status in DB -> ONBOARDING_REQUIRED
    await dbPool.query(
      "INSERT INTO public.drivers (id, national_id_number, license_number, verification_status, account_status) VALUES ($1, $2, $3, $4, $5)",
      [
        driverUserId,
        `NID-${timestamp}`,
        `LIC-${timestamp}`,
        "PENDING",
        "REGISTERED",
      ],
    );

    const { rows: registeredDriverRows } = await dbPool.query(
      "SELECT verification_status, account_status FROM public.drivers WHERE id = $1",
      [driverUserId],
    );

    const registeredDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus: registeredDriverRows[0]
          .verification_status as DriverVerificationStatus,
        accountStatus: registeredDriverRows[0]
          .account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(registeredDriverIdentity), {
      allowed: false,
      reason: "ONBOARDING_REQUIRED",
    });

    // 12c. Update driver in DB to VERIFIED & ACTIVE -> allowed: true
    await dbPool.query(
      "UPDATE public.drivers SET verification_status = 'VERIFIED', account_status = 'ACTIVE' WHERE id = $1",
      [driverUserId],
    );

    const { rows: activeDriverRows } = await dbPool.query(
      "SELECT verification_status, account_status FROM public.drivers WHERE id = $1",
      [driverUserId],
    );

    const activeDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus: activeDriverRows[0]
          .verification_status as DriverVerificationStatus,
        accountStatus: activeDriverRows[0]
          .account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(activeDriverIdentity), {
      allowed: true,
    });

    // 12d. Update driver in DB to SUSPENDED -> ACCOUNT_RESTRICTED
    await dbPool.query(
      "UPDATE public.drivers SET account_status = 'SUSPENDED' WHERE id = $1",
      [driverUserId],
    );

    const { rows: suspendedDriverRows } = await dbPool.query(
      "SELECT verification_status, account_status FROM public.drivers WHERE id = $1",
      [driverUserId],
    );

    const suspendedDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus: suspendedDriverRows[0]
          .verification_status as DriverVerificationStatus,
        accountStatus: suspendedDriverRows[0]
          .account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(suspendedDriverIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });

    // 12e. Update driver in DB to BLOCKED -> ACCOUNT_RESTRICTED
    await dbPool.query(
      "UPDATE public.drivers SET account_status = 'BLOCKED' WHERE id = $1",
      [driverUserId],
    );

    const { rows: blockedDriverRows } = await dbPool.query(
      "SELECT verification_status, account_status FROM public.drivers WHERE id = $1",
      [driverUserId],
    );

    const blockedDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus: blockedDriverRows[0]
          .verification_status as DriverVerificationStatus,
        accountStatus: blockedDriverRows[0]
          .account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(blockedDriverIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });

    // 12f. Update driver in DB to CLOSED -> ACCOUNT_RESTRICTED
    await dbPool.query(
      "UPDATE public.drivers SET account_status = 'CLOSED' WHERE id = $1",
      [driverUserId],
    );

    const { rows: closedDriverRows } = await dbPool.query(
      "SELECT verification_status, account_status FROM public.drivers WHERE id = $1",
      [driverUserId],
    );

    const closedDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus: closedDriverRows[0]
          .verification_status as DriverVerificationStatus,
        accountStatus: closedDriverRows[0]
          .account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(closedDriverIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });
    console.log(">>> [TEST 12 SUCCESS]");
  });

  it("13. should evaluate Admin Access guard to ADMIN_ROLE_REQUIRED for platform_role none", () => {
    console.log(">>> [TEST 13 START] Admin Role None Guard");
    const regularIdentity: IdentityContext = {
      userId: businessUserId,
      email: businessEmail,
      profile: {
        platformRole: "none",
        fullName: "User",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: null,
    };

    const evaluation = evaluateAdminAccess(regularIdentity);
    assert.deepStrictEqual(evaluation, {
      allowed: false,
      reason: "ADMIN_ROLE_REQUIRED",
    });
    console.log(">>> [TEST 13 SUCCESS]");
  });

  it("14. should perform real Admin Auth, promote platform_role=admin in DB, verify MFA TOTP and achieve AAL2", async () => {
    console.log(">>> [TEST 14 START] Real Admin Auth & Real MFA TOTP");
    // 14a. Signup Admin user
    const { data: adminSignUp, error: adminSignUpError } =
      await client.auth.signUp({
        email: adminEmail,
        password: testPassword,
        options: {
          data: {
            full_name: "Administrador Real",
          },
        },
      });

    if (adminSignUpError)
      console.error("Test 14a signup error:", adminSignUpError);
    assert.strictEqual(adminSignUpError, null);
    assert.ok(adminSignUp.user);
    adminUserId = adminSignUp.user.id;

    // 14b. Promote profile to platform_role = admin in real DB via dbPool
    await dbPool.query(
      "UPDATE public.profiles SET platform_role = 'admin' WHERE id = $1",
      [adminUserId],
    );

    // 14c. Login as Admin user with dedicated client
    const adminStorage = new MemoryStorage();
    const adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: adminStorage,
        autoRefreshToken: false,
        persistSession: true,
      },
    });

    const { data: adminLogin, error: adminLoginError } =
      await adminClient.auth.signInWithPassword({
        email: adminEmail,
        password: testPassword,
      });

    if (adminLoginError)
      console.error("Test 14c admin login error:", adminLoginError);
    assert.strictEqual(adminLoginError, null);
    assert.ok(adminLogin?.session);

    // 14d. Build Admin IdentityContext from real DB profile
    const { rows: adminProfileRows } = await dbPool.query(
      "SELECT id, platform_role, full_name, phone, avatar_url FROM public.profiles WHERE id = $1",
      [adminUserId],
    );

    assert.strictEqual(adminProfileRows.length, 1);
    assert.strictEqual(adminProfileRows[0].platform_role, "admin");

    const adminIdentity: IdentityContext = {
      userId: adminUserId,
      email: adminEmail,
      profile: {
        platformRole: adminProfileRows[0].platform_role as PlatformRole,
        fullName: adminProfileRows[0].full_name,
        phone: adminProfileRows[0].phone,
        avatarUrl: adminProfileRows[0].avatar_url,
      },
      businessMemberships: [],
      driver: null,
    };

    // Before MFA at AAL1 -> MFA_REQUIRED
    assert.deepStrictEqual(evaluateAdminAccess(adminIdentity, "aal1"), {
      allowed: false,
      reason: "MFA_REQUIRED",
    });

    // 14e. MFA TOTP Enrollment on authenticated admin client
    const { data: enrollData, error: enrollError } =
      await adminClient.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Gueguense",
      });

    if (enrollError) console.error("Test 14e mfa enroll error:", enrollError);
    assert.strictEqual(enrollError, null, "MFA enrollment should succeed");
    assert.ok(enrollData, "Enrollment data must exist");
    assert.ok(enrollData.id, "Factor ID must exist");
    assert.ok(enrollData.totp?.secret, "TOTP secret must exist");

    // 14f. Challenge and verify TOTP code with real secret across standard time window
    let verified = false;
    let lastVerifyError: any = null;

    for (const offset of [0, -1, 1]) {
      const code = generateTotpCode(enrollData.totp.secret, offset);
      const { data: challengeData, error: challengeError } =
        await adminClient.auth.mfa.challenge({
          factorId: enrollData.id,
        });

      if (challengeError) {
        console.error("Test 14f challenge error:", challengeError);
        continue;
      }

      const { data: verifyData, error: verifyError } =
        await adminClient.auth.mfa.verify({
          factorId: enrollData.id,
          challengeId: challengeData.id,
          code,
        });

      if (!verifyError && verifyData) {
        verified = true;
        lastVerifyError = null;
        break;
      } else {
        lastVerifyError = verifyError;
      }
    }

    if (lastVerifyError) {
      console.error("Test 14f last verify error:", lastVerifyError);
    }
    assert.strictEqual(
      verified,
      true,
      `MFA challenge verification should succeed: ${lastVerifyError?.message || ""}`,
    );

    // 14g. Verify Authenticator Assurance Level is AAL2
    const { data: aalData } =
      await adminClient.auth.mfa.getAuthenticatorAssuranceLevel();
    assert.strictEqual(
      aalData?.currentLevel,
      "aal2",
      "Session must reach AAL2 after TOTP verification",
    );

    // 14h. Evaluate Admin guard with AAL2 -> allowed: true
    assert.deepStrictEqual(evaluateAdminAccess(adminIdentity, "aal2"), {
      allowed: true,
    });
    console.log(">>> [TEST 14 SUCCESS]");
  });
});

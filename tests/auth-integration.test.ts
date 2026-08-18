import { describe, it } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
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
  serviceRoleKey: string;
} {
  let url = process.env.SUPABASE_URL || process.env.API_URL;
  let anonKey = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY;
  let serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    try {
      const fs = require("node:fs");
      if (fs.existsSync("supabase_status.json")) {
        const raw = fs.readFileSync("supabase_status.json", "utf8");
        const parsed = JSON.parse(raw);
        url = url || parsed.API_URL || parsed.api_url;
        anonKey = anonKey || parsed.ANON_KEY || parsed.anon_key;
        serviceRoleKey =
          serviceRoleKey ||
          parsed.SERVICE_ROLE_KEY ||
          parsed.service_role_key ||
          parsed.SERVICE_KEY ||
          parsed.service_key;
      }
    } catch {}
  }

  if (!url || !anonKey || !serviceRoleKey) {
    try {
      const raw = execSync("pnpm supabase status -o json", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const firstBrace = raw.indexOf("{");
      const lastBrace = raw.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        const parsed = JSON.parse(raw.substring(firstBrace, lastBrace + 1));
        url = url || parsed.API_URL || parsed.api_url;
        anonKey = anonKey || parsed.ANON_KEY || parsed.anon_key;
        serviceRoleKey =
          serviceRoleKey ||
          parsed.SERVICE_ROLE_KEY ||
          parsed.service_role_key ||
          parsed.SERVICE_KEY ||
          parsed.service_key;
      }
    } catch {}
  }

  assert.ok(url, "SUPABASE_URL must be defined");
  assert.ok(anonKey, "SUPABASE_ANON_KEY must be defined");
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY must be defined");

  return {
    url,
    anonKey,
    serviceRoleKey,
  };
}

const {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
} = getSupabaseEnv();

function generateTotpCode(secretBase32: string): string {
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
  const counter = Math.floor(Date.now() / 1000 / 30);
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

describe("Phase 2 — Auth & Session Integration Gates", () => {
  const timestamp = Date.now();
  const businessEmail = `biz_integ_${timestamp}@gueguense.test`;
  const driverEmail = `drv_integ_${timestamp}@gueguense.test`;
  const adminEmail = `adm_integ_${timestamp}@gueguense.test`;
  const testPassword = "Password123!Secure";

  let businessUserId: string;
  let driverUserId: string;
  let adminUserId: string;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const trustedAdminClient = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  it("1. should signup Business user and trigger public.profiles bootstrap", async () => {
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

    // Verify profile bootstrap
    const { data: profileRow, error: profileErr } = await trustedAdminClient
      .from("profiles")
      .select("id, platform_role, full_name")
      .eq("id", businessUserId)
      .single();

    if (profileErr) console.error("Test 1 profile error:", profileErr);
    assert.strictEqual(profileErr, null);
    assert.strictEqual(profileRow?.id, businessUserId);
    assert.strictEqual(profileRow?.platform_role, "none");
    assert.strictEqual(profileRow?.full_name, "Negocio Integracion");
  });

  it("2. should verify Business signup does NOT autocreate business_members or drivers", async () => {
    const { data: memberRows, error: memberErr } = await trustedAdminClient
      .from("business_members")
      .select("id")
      .eq("user_id", businessUserId);

    assert.strictEqual(memberErr, null);
    assert.strictEqual(
      memberRows?.length,
      0,
      "Business signup must not autocreate business_members",
    );

    const { data: driverRows, error: driverErr } = await trustedAdminClient
      .from("drivers")
      .select("id")
      .eq("id", businessUserId);

    assert.strictEqual(driverErr, null);
    assert.strictEqual(
      driverRows?.length,
      0,
      "Business signup must not autocreate drivers",
    );
  });

  it("3. should signup Driver user and trigger public.profiles bootstrap", async () => {
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

    // Verify profile bootstrap
    const { data: profileRow, error: profileErr } = await trustedAdminClient
      .from("profiles")
      .select("id, platform_role, full_name")
      .eq("id", driverUserId)
      .single();

    if (profileErr) console.error("Test 3 profile error:", profileErr);
    assert.strictEqual(profileErr, null);
    assert.strictEqual(profileRow?.id, driverUserId);
    assert.strictEqual(profileRow?.platform_role, "none");
    assert.strictEqual(profileRow?.full_name, "Motorizado Integracion");
  });

  it("4. should verify Driver signup does NOT autocreate drivers or business_members", async () => {
    const { data: driverRows, error: driverErr } = await trustedAdminClient
      .from("drivers")
      .select("id")
      .eq("id", driverUserId);

    assert.strictEqual(driverErr, null);
    assert.strictEqual(
      driverRows?.length,
      0,
      "Driver signup must not autocreate drivers",
    );

    const { data: memberRows, error: memberErr } = await trustedAdminClient
      .from("business_members")
      .select("id")
      .eq("user_id", driverUserId);

    assert.strictEqual(memberErr, null);
    assert.strictEqual(
      memberRows?.length,
      0,
      "Driver signup must not autocreate business_members",
    );
  });

  it("5. should perform valid password login and return valid session", async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });

    if (error) console.error("Test 5 error:", error);
    assert.strictEqual(error, null, "Valid login should not error");
    assert.ok(data.session, "Session must be returned");
    assert.strictEqual(data.user.id, businessUserId);
  });

  it("6. should reject invalid login credentials with normalized AUTH_INVALID_CREDENTIALS", async () => {
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
  });

  it("7. should refresh session successfully", async () => {
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
  });

  it("8. should logout and invalidate local client session", async () => {
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
  });

  it("9. should enforce RLS read isolation with real user JWT", async () => {
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
  });

  it("10. should prevent privilege escalation on platform_role via RLS", async () => {
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

    // Verify role remained 'none'
    const { data: checkProfile } = await authedClientA
      .from("profiles")
      .select("platform_role")
      .eq("id", businessUserId)
      .single();

    assert.strictEqual(
      checkProfile?.platform_role,
      "none",
      "platform_role must remain 'none'",
    );
  });

  it("11. should evaluate Business Access guard transitions with real DB fixtures (ACTIVE, SUSPENDED, BLOCKED, CLOSED)", async () => {
    // 11a. Unonboarded business user -> ONBOARDING_REQUIRED
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
    const { data: bizRow, error: bizErr } = await trustedAdminClient
      .from("businesses")
      .insert({
        legal_name: "Comercio Real SA",
        brand_name: "Comercio Real",
        tax_id: `TAX-BIZ-${timestamp}`,
        account_status: "ACTIVE",
        verification_status: "VERIFIED",
      })
      .select("id")
      .single();

    if (bizErr) console.error("Test 11b biz insert error:", bizErr);
    assert.strictEqual(bizErr, null);
    assert.ok(bizRow?.id);
    const testBusinessId = bizRow.id;

    const { data: memberRow, error: memberErr } = await trustedAdminClient
      .from("business_members")
      .insert({
        business_id: testBusinessId,
        user_id: businessUserId,
        role: "business_owner",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    if (memberErr) console.error("Test 11b member insert error:", memberErr);
    assert.strictEqual(memberErr, null);
    assert.ok(memberRow?.id);
    const testMemberId = memberRow.id;

    // Fetch from real DB and test ACTIVE -> allowed: true
    const { data: memberCheck } = await trustedAdminClient
      .from("business_members")
      .select("id, business_id, role, status")
      .eq("id", testMemberId)
      .single();

    const { data: bizCheck } = await trustedAdminClient
      .from("businesses")
      .select("account_status")
      .eq("id", testBusinessId)
      .single();

    const activeIdentity: IdentityContext = {
      ...unonboardedIdentity,
      businessMemberships: [
        {
          membershipId: memberCheck!.id,
          businessId: memberCheck!.business_id,
          role: memberCheck!.role as BusinessMemberRole,
          status: memberCheck!.status as BusinessMemberStatus,
          businessAccountStatus: bizCheck!
            .account_status as BusinessAccountStatus,
        },
      ],
    };

    assert.deepStrictEqual(evaluateBusinessAccess(activeIdentity), {
      allowed: true,
    });

    // 11c. Update membership status to SUSPENDED in DB
    await trustedAdminClient
      .from("business_members")
      .update({ status: "SUSPENDED" })
      .eq("id", testMemberId);

    const { data: suspendedMemberCheck } = await trustedAdminClient
      .from("business_members")
      .select("id, business_id, role, status")
      .eq("id", testMemberId)
      .single();

    const suspendedIdentity: IdentityContext = {
      ...unonboardedIdentity,
      businessMemberships: [
        {
          membershipId: suspendedMemberCheck!.id,
          businessId: suspendedMemberCheck!.business_id,
          role: suspendedMemberCheck!.role as BusinessMemberRole,
          status: suspendedMemberCheck!.status as BusinessMemberStatus,
          businessAccountStatus: bizCheck!
            .account_status as BusinessAccountStatus,
        },
      ],
    };

    assert.deepStrictEqual(evaluateBusinessAccess(suspendedIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });

    // 11d. Restore membership status to ACTIVE but update business account_status to BLOCKED in DB
    await trustedAdminClient
      .from("business_members")
      .update({ status: "ACTIVE" })
      .eq("id", testMemberId);

    await trustedAdminClient
      .from("businesses")
      .update({ account_status: "BLOCKED" })
      .eq("id", testBusinessId);

    const { data: blockedBizCheck } = await trustedAdminClient
      .from("businesses")
      .select("account_status")
      .eq("id", testBusinessId)
      .single();

    const blockedBizIdentity: IdentityContext = {
      ...unonboardedIdentity,
      businessMemberships: [
        {
          membershipId: testMemberId,
          businessId: testBusinessId,
          role: "business_owner",
          status: "ACTIVE",
          businessAccountStatus: blockedBizCheck!
            .account_status as BusinessAccountStatus,
        },
      ],
    };

    assert.deepStrictEqual(evaluateBusinessAccess(blockedBizIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });

    // 11e. Update business account_status to CLOSED in DB
    await trustedAdminClient
      .from("businesses")
      .update({ account_status: "CLOSED" })
      .eq("id", testBusinessId);

    const { data: closedBizCheck } = await trustedAdminClient
      .from("businesses")
      .select("account_status")
      .eq("id", testBusinessId)
      .single();

    const closedBizIdentity: IdentityContext = {
      ...unonboardedIdentity,
      businessMemberships: [
        {
          membershipId: testMemberId,
          businessId: testBusinessId,
          role: "business_owner",
          status: "ACTIVE",
          businessAccountStatus: closedBizCheck!
            .account_status as BusinessAccountStatus,
        },
      ],
    };

    assert.deepStrictEqual(evaluateBusinessAccess(closedBizIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });
  });

  it("12. should evaluate Driver Access guard transitions with real DB fixtures (REGISTERED, ACTIVE, SUSPENDED, BLOCKED, CLOSED)", async () => {
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
    const { error: insertDriverErr } = await trustedAdminClient
      .from("drivers")
      .insert({
        id: driverUserId,
        national_id_number: `NID-${timestamp}`,
        license_number: `LIC-${timestamp}`,
        verification_status: "PENDING",
        account_status: "REGISTERED",
      });

    if (insertDriverErr)
      console.error("Test 12b driver insert error:", insertDriverErr);
    assert.strictEqual(insertDriverErr, null);

    const { data: registeredDriverRow } = await trustedAdminClient
      .from("drivers")
      .select("verification_status, account_status")
      .eq("id", driverUserId)
      .single();

    const registeredDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus:
          registeredDriverRow?.verification_status as DriverVerificationStatus,
        accountStatus:
          registeredDriverRow?.account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(registeredDriverIdentity), {
      allowed: false,
      reason: "ONBOARDING_REQUIRED",
    });

    // 12c. Update driver in DB to VERIFIED & ACTIVE -> allowed: true
    await trustedAdminClient
      .from("drivers")
      .update({
        verification_status: "VERIFIED",
        account_status: "ACTIVE",
      })
      .eq("id", driverUserId);

    const { data: activeDriverRow } = await trustedAdminClient
      .from("drivers")
      .select("verification_status, account_status")
      .eq("id", driverUserId)
      .single();

    const activeDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus:
          activeDriverRow?.verification_status as DriverVerificationStatus,
        accountStatus: activeDriverRow?.account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(activeDriverIdentity), {
      allowed: true,
    });

    // 12d. Update driver in DB to SUSPENDED -> ACCOUNT_RESTRICTED
    await trustedAdminClient
      .from("drivers")
      .update({
        account_status: "SUSPENDED",
      })
      .eq("id", driverUserId);

    const { data: suspendedDriverRow } = await trustedAdminClient
      .from("drivers")
      .select("verification_status, account_status")
      .eq("id", driverUserId)
      .single();

    const suspendedDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus:
          suspendedDriverRow?.verification_status as DriverVerificationStatus,
        accountStatus:
          suspendedDriverRow?.account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(suspendedDriverIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });

    // 12e. Update driver in DB to BLOCKED -> ACCOUNT_RESTRICTED
    await trustedAdminClient
      .from("drivers")
      .update({
        account_status: "BLOCKED",
      })
      .eq("id", driverUserId);

    const { data: blockedDriverRow } = await trustedAdminClient
      .from("drivers")
      .select("verification_status, account_status")
      .eq("id", driverUserId)
      .single();

    const blockedDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus:
          blockedDriverRow?.verification_status as DriverVerificationStatus,
        accountStatus: blockedDriverRow?.account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(blockedDriverIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });

    // 12f. Update driver in DB to CLOSED -> ACCOUNT_RESTRICTED
    await trustedAdminClient
      .from("drivers")
      .update({
        account_status: "CLOSED",
      })
      .eq("id", driverUserId);

    const { data: closedDriverRow } = await trustedAdminClient
      .from("drivers")
      .select("verification_status, account_status")
      .eq("id", driverUserId)
      .single();

    const closedDriverIdentity: IdentityContext = {
      ...unonboardedDriverIdentity,
      driver: {
        verificationStatus:
          closedDriverRow?.verification_status as DriverVerificationStatus,
        accountStatus: closedDriverRow?.account_status as DriverAccountStatus,
      },
    };

    assert.deepStrictEqual(evaluateDriverAccess(closedDriverIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });
  });

  it("13. should evaluate Admin Access guard to ADMIN_ROLE_REQUIRED for platform_role none", () => {
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
  });

  it("14. should perform real Admin Auth, promote platform_role=admin in DB, verify MFA TOTP and achieve AAL2", async () => {
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

    // 14b. Promote profile to platform_role = admin in real DB via trustedAdminClient
    const { error: promoteError } = await trustedAdminClient
      .from("profiles")
      .update({ platform_role: "admin" })
      .eq("id", adminUserId);

    if (promoteError) console.error("Test 14b promote error:", promoteError);
    assert.strictEqual(promoteError, null);

    // 14c. Login as Admin user
    const { data: adminLogin, error: adminLoginError } =
      await client.auth.signInWithPassword({
        email: adminEmail,
        password: testPassword,
      });

    if (adminLoginError)
      console.error("Test 14c admin login error:", adminLoginError);
    assert.strictEqual(adminLoginError, null);
    assert.ok(adminLogin?.session?.access_token);

    // 14d. Build Admin IdentityContext from real DB profile
    const { data: adminProfile, error: adminProfileErr } =
      await trustedAdminClient
        .from("profiles")
        .select("id, platform_role, full_name, phone, avatar_url")
        .eq("id", adminUserId)
        .single();

    if (adminProfileErr)
      console.error("Test 14d admin profile error:", adminProfileErr);
    assert.strictEqual(adminProfileErr, null);
    assert.strictEqual(adminProfile?.platform_role, "admin");

    const adminIdentity: IdentityContext = {
      userId: adminUserId,
      email: adminEmail,
      profile: {
        platformRole: adminProfile.platform_role as PlatformRole,
        fullName: adminProfile.full_name,
        phone: adminProfile.phone,
        avatarUrl: adminProfile.avatar_url,
      },
      businessMemberships: [],
      driver: null,
    };

    // Before MFA at AAL1 -> MFA_REQUIRED
    assert.deepStrictEqual(evaluateAdminAccess(adminIdentity, "aal1"), {
      allowed: false,
      reason: "MFA_REQUIRED",
    });

    // 14e. MFA Client with Admin session established via setSession
    const mfaClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { error: setSessionErr } = await mfaClient.auth.setSession({
      access_token: adminLogin.session.access_token,
      refresh_token: adminLogin.session.refresh_token,
    });
    if (setSessionErr)
      console.error("Test 14e setSession error:", setSessionErr);
    assert.strictEqual(
      setSessionErr,
      null,
      "Setting session on mfaClient should succeed",
    );

    const { data: enrollData, error: enrollError } =
      await mfaClient.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Gueguense",
      });

    if (enrollError) console.error("Test 14e mfa enroll error:", enrollError);
    assert.strictEqual(enrollError, null, "MFA enrollment should succeed");
    assert.ok(enrollData, "Enrollment data must exist");
    assert.ok(enrollData.id, "Factor ID must exist");
    assert.ok(enrollData.totp?.secret, "TOTP secret must exist");

    // 14f. Challenge and verify TOTP code with real secret
    const code = generateTotpCode(enrollData.totp.secret);
    const { data: verifyData, error: verifyError } =
      await mfaClient.auth.mfa.challengeAndVerify({
        factorId: enrollData.id,
        code,
      });

    if (verifyError)
      console.error("Test 14f challenge verify error:", verifyError);
    assert.strictEqual(
      verifyError,
      null,
      "MFA challenge verification should succeed",
    );
    assert.ok(verifyData, "Verify data must exist");

    // 14g. Verify Authenticator Assurance Level is AAL2
    const { data: aalData } =
      await mfaClient.auth.mfa.getAuthenticatorAssuranceLevel();
    assert.strictEqual(
      aalData?.currentLevel,
      "aal2",
      "Session must reach AAL2 after TOTP verification",
    );

    // 14h. Evaluate Admin guard with AAL2 -> allowed: true
    assert.deepStrictEqual(evaluateAdminAccess(adminIdentity, "aal2"), {
      allowed: true,
    });
  });
});

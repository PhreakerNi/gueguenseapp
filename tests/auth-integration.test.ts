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
  type DriverAccountStatus,
  type DriverVerificationStatus,
  type PlatformRole,
} from "../packages/domain/src/index.ts";

function createLocalAnonJwt(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "supabase",
      ref: "127.0.0.1",
      role: "anon",
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac(
      "sha256",
      "super-secret-jwt-token-with-at-least-32-characters-long",
    )
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function createLocalServiceRoleJwt(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "supabase",
      ref: "127.0.0.1",
      role: "service_role",
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac(
      "sha256",
      "super-secret-jwt-token-with-at-least-32-characters-long",
    )
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

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
      const raw = execSync("pnpm supabase status -o json", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const firstBrace = raw.indexOf("{");
      if (firstBrace !== -1) {
        const jsonText = raw.substring(firstBrace);
        const parsed = JSON.parse(jsonText);
        url =
          url || parsed.API_URL || parsed.api_url || "http://127.0.0.1:54321";
        anonKey = anonKey || parsed.ANON_KEY || parsed.anon_key;
        serviceRoleKey =
          serviceRoleKey ||
          parsed.SERVICE_ROLE_KEY ||
          parsed.service_role_key ||
          parsed.SERVICE_KEY ||
          parsed.service_key;
      }
    } catch {
      // Fallback
    }
  }

  if (!anonKey) {
    anonKey = createLocalAnonJwt();
  }
  if (!serviceRoleKey) {
    serviceRoleKey = createLocalServiceRoleJwt();
  }

  return {
    url: url || "http://127.0.0.1:54321",
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
  let bits = "";
  for (let i = 0; i < secretBase32.length; i++) {
    const val = base32chars.indexOf(secretBase32.charAt(i).toUpperCase());
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
  const businessEmail = `business_integ_${timestamp}@gueguense.test`;
  const driverEmail = `driver_integ_${timestamp}@gueguense.test`;
  const adminEmail = `admin_integ_${timestamp}@gueguense.test`;
  const testPassword = "Password123!Secure";

  let businessUserId: string;
  let driverUserId: string;
  let adminUserId: string;
  let testBusinessId: string;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const adminClient = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
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

    assert.strictEqual(error, null, "Business signup should succeed");
    assert.ok(data.user, "User object must be returned");
    assert.ok(data.user.id, "User ID must be generated");
    businessUserId = data.user.id;
  });

  it("2. should verify signup does NOT autocreate business_members or drivers", async () => {
    const { data: memberRows, error: memberErr } = await adminClient
      .from("business_members")
      .select("id")
      .eq("user_id", businessUserId);

    assert.strictEqual(memberErr, null);
    assert.strictEqual(
      memberRows?.length,
      0,
      "Signup must not autocreate business_members",
    );

    const { data: driverRows, error: driverErr } = await adminClient
      .from("drivers")
      .select("id")
      .eq("id", businessUserId);

    assert.strictEqual(driverErr, null);
    assert.strictEqual(
      driverRows?.length,
      0,
      "Signup must not autocreate drivers",
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

    assert.strictEqual(error, null, "Driver signup should succeed");
    assert.ok(data.user, "User object must be returned");
    driverUserId = data.user.id;
  });

  it("4. should perform valid password login and return valid session", async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });

    assert.strictEqual(error, null, "Valid login should not error");
    assert.ok(data.session, "Session must be returned");
    assert.strictEqual(data.user.id, businessUserId);
  });

  it("5. should reject invalid login credentials with normalized AUTH_INVALID_CREDENTIALS", async () => {
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

  it("6. should refresh session successfully", async () => {
    const loginRes = await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });
    assert.ok(loginRes.data.session);

    const { data, error } = await client.auth.refreshSession({
      refresh_token: loginRes.data.session.refresh_token,
    });

    assert.strictEqual(error, null, "Refresh session should succeed");
    assert.ok(data.session, "New refreshed session must be returned");
  });

  it("7. should logout and invalidate local client session", async () => {
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

  it("8. should enforce RLS read isolation with real user JWT", async () => {
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

  it("9. should prevent privilege escalation on platform_role via RLS", async () => {
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

  it("10. should evaluate Business Access guard transitions with DB fixtures", async () => {
    // 10a. Unonboarded business user -> ONBOARDING_REQUIRED
    const initialIdentity: IdentityContext = {
      userId: businessUserId,
      email: businessEmail,
      profile: {
        platformRole: "none",
        fullName: "Negocio",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: null,
    };
    assert.deepStrictEqual(evaluateBusinessAccess(initialIdentity), {
      allowed: false,
      reason: "ONBOARDING_REQUIRED",
    });

    // 10b. Create active business & active membership fixture in DB
    const { data: bizData, error: bizErr } = await adminClient
      .from("businesses")
      .insert({
        legal_name: "Comercio Fixture SA",
        brand_name: "Comercio Fixture",
        tax_id: `TAX-${timestamp}`,
        account_status: "ACTIVE",
      })
      .select("id")
      .single();

    assert.strictEqual(
      bizErr,
      null,
      `Business insert should succeed: ${bizErr?.message}`,
    );
    assert.ok(bizData?.id);
    testBusinessId = bizData.id;

    const { data: memberData, error: memberErr } = await adminClient
      .from("business_members")
      .insert({
        business_id: testBusinessId,
        user_id: businessUserId,
        role: "business_owner",
        status: "ACTIVE",
      })
      .select("id")
      .single();

    assert.strictEqual(
      memberErr,
      null,
      `Member insert should succeed: ${memberErr?.message}`,
    );
    assert.ok(memberData?.id);

    // Active membership -> allowed: true
    const activeIdentity: IdentityContext = {
      ...initialIdentity,
      businessMemberships: [
        {
          membershipId: memberData.id,
          businessId: testBusinessId,
          role: "business_owner" as BusinessMemberRole,
          status: "ACTIVE" as BusinessMemberStatus,
          businessAccountStatus: "ACTIVE",
        },
      ],
    };
    assert.deepStrictEqual(evaluateBusinessAccess(activeIdentity), {
      allowed: true,
    });

    // Suspended membership -> ACCOUNT_RESTRICTED
    const suspendedIdentity: IdentityContext = {
      ...initialIdentity,
      businessMemberships: [
        {
          membershipId: memberData.id,
          businessId: testBusinessId,
          role: "business_owner" as BusinessMemberRole,
          status: "SUSPENDED" as BusinessMemberStatus,
          businessAccountStatus: "ACTIVE",
        },
      ],
    };
    assert.deepStrictEqual(evaluateBusinessAccess(suspendedIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });
  });

  it("11. should evaluate Driver Access guard transitions with DB fixtures", async () => {
    // 11a. Unonboarded driver -> ONBOARDING_REQUIRED
    const initialDriverIdentity: IdentityContext = {
      userId: driverUserId,
      email: driverEmail,
      profile: {
        platformRole: "none",
        fullName: "Motorizado",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: null,
    };
    assert.deepStrictEqual(evaluateDriverAccess(initialDriverIdentity), {
      allowed: false,
      reason: "ONBOARDING_REQUIRED",
    });

    // 11b. Insert driver fixture with REGISTERED status -> ONBOARDING_REQUIRED
    const { error: driverInsertError } = await adminClient
      .from("drivers")
      .insert({
        id: driverUserId,
        national_id_number: `ID-${timestamp}`,
        license_number: `LIC-${timestamp}`,
        verification_status: "PENDING",
        account_status: "REGISTERED",
      });

    assert.strictEqual(
      driverInsertError,
      null,
      `Driver insert should succeed: ${driverInsertError?.message}`,
    );

    const registeredDriverIdentity: IdentityContext = {
      ...initialDriverIdentity,
      driver: {
        verificationStatus: "PENDING" as DriverVerificationStatus,
        accountStatus: "REGISTERED" as DriverAccountStatus,
      },
    };
    assert.deepStrictEqual(evaluateDriverAccess(registeredDriverIdentity), {
      allowed: false,
      reason: "ONBOARDING_REQUIRED",
    });

    // 11c. Driver with ACTIVE status -> allowed: true
    const activeDriverIdentity: IdentityContext = {
      ...initialDriverIdentity,
      driver: {
        verificationStatus: "VERIFIED" as DriverVerificationStatus,
        accountStatus: "ACTIVE" as DriverAccountStatus,
      },
    };
    assert.deepStrictEqual(evaluateDriverAccess(activeDriverIdentity), {
      allowed: true,
    });

    // 11d. Driver with SUSPENDED status -> ACCOUNT_RESTRICTED
    const suspendedDriverIdentity: IdentityContext = {
      ...initialDriverIdentity,
      driver: {
        verificationStatus: "VERIFIED" as DriverVerificationStatus,
        accountStatus: "SUSPENDED" as DriverAccountStatus,
      },
    };
    assert.deepStrictEqual(evaluateDriverAccess(suspendedDriverIdentity), {
      allowed: false,
      reason: "ACCOUNT_RESTRICTED",
    });
  });

  it("12. should perform complete Admin Auth flow with platform_role=admin, MFA TOTP and AAL2", async () => {
    // 12a. Signup admin user
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

    assert.strictEqual(adminSignUpError, null);
    assert.ok(adminSignUp.user);
    adminUserId = adminSignUp.user.id;

    // 12b. Promote profile to platform_role = admin in DB
    const { error: promoteError } = await adminClient
      .from("profiles")
      .update({ platform_role: "admin" })
      .eq("id", adminUserId);

    assert.strictEqual(promoteError, null);

    // 12c. Login as Admin with admin auth client instance
    const adminAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: adminLogin, error: adminLoginError } =
      await adminAuthClient.auth.signInWithPassword({
        email: adminEmail,
        password: testPassword,
      });

    assert.strictEqual(adminLoginError, null);
    assert.ok(adminLogin.session);

    if (adminLogin?.session) {
      await adminAuthClient.auth.setSession(adminLogin.session);
    }

    // Evaluate Admin guard at AAL1 -> MFA_REQUIRED
    const adminIdentity: IdentityContext = {
      userId: adminUserId,
      email: adminEmail,
      profile: {
        platformRole: "admin" as PlatformRole,
        fullName: "Administrador Real",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: null,
    };
    assert.deepStrictEqual(evaluateAdminAccess(adminIdentity, "aal1"), {
      allowed: false,
      reason: "MFA_REQUIRED",
    });

    // 12d. Enroll in TOTP MFA factor using the authenticated admin client
    const { data: enrollData, error: enrollError } =
      await adminAuthClient.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Gueguense",
      });

    assert.strictEqual(enrollError, null);
    assert.ok(enrollData?.id);
    assert.ok(enrollData?.totp?.secret);

    // 12e. Challenge and verify TOTP code
    const totpCode = generateTotpCode(enrollData.totp.secret);
    const { data: verifyData, error: verifyError } =
      await adminAuthClient.auth.mfa.challengeAndVerify({
        factorId: enrollData.id,
        code: totpCode,
      });

    assert.strictEqual(verifyError, null);
    assert.ok(verifyData);

    // 12f. Verify Authenticator Assurance Level reaches AAL2
    const { data: aalData } =
      await adminAuthClient.auth.mfa.getAuthenticatorAssuranceLevel();
    assert.strictEqual(
      aalData?.currentLevel,
      "aal2",
      "Admin session must reach AAL2 after TOTP verification",
    );

    // 12g. Evaluate Admin guard with AAL2 -> allowed: true
    assert.deepStrictEqual(evaluateAdminAccess(adminIdentity, "aal2"), {
      allowed: true,
    });
  });
});

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
} from "./packages/domain/src/index.ts";

function getSupabaseEnv(): { url: string; anonKey: string } {
  if (process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_URL) {
    return {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
    };
  }
  if (process.env.ANON_KEY && process.env.API_URL) {
    return {
      url: process.env.API_URL,
      anonKey: process.env.ANON_KEY,
    };
  }
  try {
    const raw = execSync("pnpm supabase status -o json", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(raw);
    return {
      url: parsed.API_URL || "http://127.0.0.1:54321",
      anonKey: parsed.ANON_KEY,
    };
  } catch {
    return {
      url: "http://127.0.0.1:54321",
      anonKey: process.env.SUPABASE_ANON_KEY || "",
    };
  }
}

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getSupabaseEnv();

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
  const testPassword = "Password123!Secure";

  let businessUserId: string;
  let driverUserId: string;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  it("1. should signup Business user and trigger public.profiles bootstrap", async () => {
    const { data, error } = await client.auth.signUp({
      email: businessEmail,
      password: testPassword,
      options: {
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

  it("2. should signup Driver user and trigger public.profiles bootstrap", async () => {
    const { data, error } = await client.auth.signUp({
      email: driverEmail,
      password: testPassword,
      options: {
        data: {
          full_name: "Motorizado Integracion",
        },
      },
    });

    assert.strictEqual(error, null, "Driver signup should succeed");
    assert.ok(data.user, "User object must be returned");
    driverUserId = data.user.id;
  });

  it("3. should perform valid password login and return valid session", async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });

    assert.strictEqual(error, null, "Valid login should not error");
    assert.ok(data.session, "Session must be returned");
    assert.strictEqual(data.user.id, businessUserId);
  });

  it("4. should reject invalid login credentials with normalized AUTH_INVALID_CREDENTIALS", async () => {
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

  it("5. should refresh session successfully", async () => {
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

  it("6. should logout and invalidate local client session", async () => {
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

  it("7. should enforce RLS read isolation with real user JWT", async () => {
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

  it("8. should prevent privilege escalation on platform_role via RLS", async () => {
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

  it("9. should evaluate Business Access guard to ONBOARDING_REQUIRED for new user", () => {
    const newBusinessIdentity: IdentityContext = {
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

    const evaluation = evaluateBusinessAccess(newBusinessIdentity);
    assert.deepStrictEqual(evaluation, {
      allowed: false,
      reason: "ONBOARDING_REQUIRED",
    });
  });

  it("10. should evaluate Driver Access guard to ONBOARDING_REQUIRED for new user", () => {
    const newDriverIdentity: IdentityContext = {
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

    const evaluation = evaluateDriverAccess(newDriverIdentity);
    assert.deepStrictEqual(evaluation, {
      allowed: false,
      reason: "ONBOARDING_REQUIRED",
    });
  });

  it("11. should evaluate Admin Access guard to ADMIN_ROLE_REQUIRED for platform_role none", () => {
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

  it("12. should enroll in TOTP MFA factor", async () => {
    const login = await client.auth.signInWithPassword({
      email: businessEmail,
      password: testPassword,
    });
    assert.ok(login.data.session);

    const mfaClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${login.data.session.access_token}`,
        },
      },
    });

    const { data: enrollData, error: enrollError } =
      await mfaClient.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Gueguense",
      });

    assert.strictEqual(enrollError, null, "MFA enrollment should succeed");
    assert.ok(enrollData, "Enrollment data must exist");
    assert.ok(enrollData.id, "Factor ID must exist");
    assert.ok(enrollData.totp.secret, "TOTP secret must exist");
    assert.ok(enrollData.totp.qr_code, "TOTP QR code must exist");

    // 13. Verify TOTP Challenge with real generated code
    const code = generateTotpCode(enrollData.totp.secret);
    const { data: verifyData, error: verifyError } =
      await mfaClient.auth.mfa.challengeAndVerify({
        factorId: enrollData.id,
        code,
      });

    assert.strictEqual(
      verifyError,
      null,
      "MFA challenge verification should succeed",
    );
    assert.ok(verifyData, "Verify data must exist");

    // 14. Verify Authenticator Assurance Level is AAL2
    const { data: aalData } =
      await mfaClient.auth.mfa.getAuthenticatorAssuranceLevel();
    assert.strictEqual(
      aalData?.currentLevel,
      "aal2",
      "Session must reach AAL2 after TOTP verification",
    );
  });

  it("15. should evaluate Admin Access guard to allowed when admin role and AAL2", () => {
    const adminIdentity: IdentityContext = {
      userId: "admin-uuid",
      email: "admin@gueguense.com",
      profile: {
        platformRole: "admin",
        fullName: "Admin User",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [],
      driver: null,
    };

    assert.deepStrictEqual(evaluateAdminAccess(adminIdentity, "aal2"), {
      allowed: true,
    });
  });
});

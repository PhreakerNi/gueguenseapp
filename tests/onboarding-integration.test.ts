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

describe("Phase 3 Onboarding, B2B, Storage & Verification Integration Suite (HTTP api-v1)", () => {
  after(async () => {
    await dbPool.end();
  });

  const testRunId = Date.now().toString().slice(-6);
  const ownerEmail = `bizowner_${testRunId}@gueguense.test`;
  const managerEmail = `bizmgr_${testRunId}@gueguense.test`;
  const driverEmail = `driver_${testRunId}@gueguense.test`;
  const incompleteDriverEmail = `incomplete_${testRunId}@gueguense.test`;
  const agentEmail = `agent_${testRunId}@gueguense.test`;
  const operatorEmail = `operator_${testRunId}@gueguense.test`;
  const adminEmail = `admin_${testRunId}@gueguense.test`;
  const testPassword = "Password123!Secure";

  let ownerToken = "";
  let ownerUserId = "";
  let managerUserId = "";
  let driverToken = "";
  let driverUserId = "";
  let incompleteDriverToken = "";
  let incompleteDriverUserId = "";
  let agentToken = "";
  let agentAal2Token = "";
  let operatorToken = "";
  let operatorAal2Token = "";
  let createdBusinessId = "";
  let createdBranchId = "";

  const uniqueTaxId = `J${testRunId}${Math.floor(Math.random() * 8999 + 1000)}`;
  const uniqueNationalId = `001-${testRunId}-0001A`;
  const uniqueLicense = `LIC-${testRunId}`;
  const uniquePlate = `M-${testRunId}`;

  it("Step 0: Healthcheck on api-v1 Edge Function returns 200 OK", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, "ok");
  });

  it("Step 1: Setup synthetic users & sessions for B2B, Driver and Admin roles", async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 1. Owner
    const { data: ownerAuth } = await supabase.auth.signUp({
      email: ownerEmail,
      password: testPassword,
      options: { data: { full_name: "Business Owner" } },
    });
    ownerUserId = ownerAuth.user!.id;
    ownerToken = ownerAuth.session!.access_token;

    // 2. Manager
    const { data: mgrAuth } = await supabase.auth.signUp({
      email: managerEmail,
      password: testPassword,
      options: { data: { full_name: "Business Manager" } },
    });
    managerUserId = mgrAuth.user!.id;

    // 3. Driver
    const { data: drvAuth } = await supabase.auth.signUp({
      email: driverEmail,
      password: testPassword,
      options: { data: { full_name: "Test Driver" } },
    });
    driverUserId = drvAuth.user!.id;
    driverToken = drvAuth.session!.access_token;

    // 4. Incomplete Driver
    const { data: incDrvAuth } = await supabase.auth.signUp({
      email: incompleteDriverEmail,
      password: testPassword,
      options: { data: { full_name: "Incomplete Driver" } },
    });
    incompleteDriverUserId = incDrvAuth.user!.id;
    incompleteDriverToken = incDrvAuth.session!.access_token;

    // 5. Verification Agent
    const { data: agentAuth } = await supabase.auth.signUp({
      email: agentEmail,
      password: testPassword,
      options: { data: { full_name: "Verification Agent" } },
    });
    const agentUserId = agentAuth.user!.id;
    agentToken = agentAuth.session!.access_token;

    // 6. Operator
    const { data: operAuth } = await supabase.auth.signUp({
      email: operatorEmail,
      password: testPassword,
      options: { data: { full_name: "Operator User" } },
    });
    const operatorUserId = operAuth.user!.id;
    operatorToken = operAuth.session!.access_token;

    // 7. Admin
    const { data: adminAuth } = await supabase.auth.signUp({
      email: adminEmail,
      password: testPassword,
      options: { data: { full_name: "Admin User" } },
    });

    // Assign roles via direct DB pool
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
      [adminAuth.user!.id],
    );

    // Enroll & Verify MFA TOTP for Agent to generate valid AAL2 session
    const agentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await agentClient.auth.setSession({
      access_token: agentToken,
      refresh_token: agentAuth.session!.refresh_token,
    });
    const { data: enrollData } = await agentClient.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Gueguense",
    });
    const totpCode = generateTotpCode(enrollData!.totp.secret);
    const { data: verifyData } = await agentClient.auth.mfa.challengeAndVerify({
      factorId: enrollData!.id,
      code: totpCode,
    });
    agentAal2Token = verifyData!.access_token;

    // Enroll & Verify MFA TOTP for Operator
    const operClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await operClient.auth.setSession({
      access_token: operatorToken,
      refresh_token: operAuth.session!.refresh_token,
    });
    const { data: operEnroll } = await operClient.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Gueguense",
    });
    const operTotp = generateTotpCode(operEnroll!.totp.secret);
    const { data: operVerify } = await operClient.auth.mfa.challengeAndVerify({
      factorId: operEnroll!.id,
      code: operTotp,
    });
    operatorAal2Token = operVerify!.access_token;

    assert.ok(ownerToken && driverToken && agentAal2Token && operatorAal2Token);
  });

  it("Step 2: Business Onboarding via HTTP api-v1 creates Business with PENDING verification", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/business/onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
        "Idempotency-Key": `biz_${ownerUserId}_${uniqueTaxId}`,
      },
      body: JSON.stringify({
        legal_name: "Distribuidora Central S.A.",
        brand_name: "Pulperia Central",
        tax_id: uniqueTaxId,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.business_id);
    assert.strictEqual(data.verification_status, "PENDING");
    assert.strictEqual(data.account_status, "ACTIVE");

    createdBusinessId = data.business_id;

    // Verify DB state
    const dbRes = await dbPool.query(
      "SELECT verification_status, account_status FROM public.businesses WHERE id = $1",
      [createdBusinessId],
    );
    assert.strictEqual(dbRes.rows[0].verification_status, "PENDING");
    assert.strictEqual(dbRes.rows[0].account_status, "ACTIVE");
  });

  it("Step 3: Separate Branch Location Creation via HTTP api-v1", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/business/locations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
        "Idempotency-Key": `loc_${ownerUserId}_${createdBusinessId}_1`,
      },
      body: JSON.stringify({
        business_id: createdBusinessId,
        name: "Sucursal Central",
        address_text: "Calle Principal #123, Managua",
        latitude: 12.136389,
        longitude: -86.251389,
        pickup_instructions: "Tocar timbre",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.location_id);
    createdBranchId = data.location_id;

    // Verify N:M link in DB
    const linkRes = await dbPool.query(
      `SELECT bml.business_location_id 
       FROM public.business_member_locations bml
       JOIN public.business_members bm ON bm.id = bml.business_member_id
       WHERE bm.user_id = $1 AND bml.business_location_id = $2`,
      [ownerUserId, createdBranchId],
    );
    assert.strictEqual(linkRes.rows.length, 1);
  });

  it("Step 4: Business Member Management via HTTP api-v1 with branch scoping (N:M)", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/business/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
        "Idempotency-Key": `member_${createdBusinessId}_${managerUserId}`,
      },
      body: JSON.stringify({
        business_id: createdBusinessId,
        user_id: managerUserId,
        role: "business_manager",
        location_ids: [createdBranchId],
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.member_id);

    // Verify manager has scoped access to createdBranchId
    const managerIdentity: IdentityContext = {
      userId: managerUserId,
      email: managerEmail,
      profile: {
        platformRole: "none",
        fullName: "Manager",
        phone: null,
        avatarUrl: null,
      },
      businessMemberships: [
        {
          membershipId: data.member_id,
          businessId: createdBusinessId,
          role: "business_manager",
          status: "ACTIVE",
          businessAccountStatus: "ACTIVE",
          authorizedLocationIds: [createdBranchId],
        },
      ],
      driver: null,
    };

    assert.strictEqual(
      evaluateBusinessAccess(managerIdentity, createdBranchId).allowed,
      true,
    );
    assert.strictEqual(
      evaluateBusinessAccess(managerIdentity, "unauthorized-branch-id").allowed,
      false,
    );
  });

  it("Step 5: Driver Personal Onboarding via HTTP api-v1 (Separated from vehicle)", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/driver/onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverToken}`,
        "Idempotency-Key": `drv_${driverUserId}_${uniqueNationalId}`,
      },
      body: JSON.stringify({
        national_id_number: uniqueNationalId,
        license_number: uniqueLicense,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.driver_id, driverUserId);
    assert.strictEqual(data.verification_status, "PENDING");
    assert.strictEqual(data.account_status, "REGISTERED");
    assert.strictEqual(data.operational_state, "OFFLINE");

    // Verify evaluateDriverAccess denies operational access while PENDING
    const driverIdentity: IdentityContext = {
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
        verificationStatus: "PENDING",
        accountStatus: "REGISTERED",
      },
    };
    assert.strictEqual(evaluateDriverAccess(driverIdentity).allowed, false);
  });

  it("Step 6: Driver Vehicle Registration via HTTP api-v1", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/driver/vehicles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverToken}`,
        "Idempotency-Key": `veh_${driverUserId}_${uniquePlate}`,
      },
      body: JSON.stringify({
        make: "Yamaha",
        model: "FZ-S",
        year: 2023,
        color: "Azul",
        license_plate: uniquePlate,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.vehicle_id);
    assert.strictEqual(data.license_plate, uniquePlate);
  });

  it("Step 7: Signed Upload Authorization via HTTP api-v1 generates valid storage URL", async () => {
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
          extension: "pdf",
        }),
      },
    );

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.upload_url);
    assert.ok(data.storage_path.startsWith(`${driverUserId}/`));
    assert.ok(data.storage_path.includes("NATIONAL_ID"));
  });

  it("Step 8: Upload documents to signed URLs and commit via HTTP api-v1", async () => {
    const docTypes = ["NATIONAL_ID", "DRIVER_LICENSE", "VEHICLE_REGISTRATION"];

    for (const docType of docTypes) {
      // 1. Authorize
      const authRes = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
          },
          body: JSON.stringify({ document_type: docType }),
        },
      );
      const authData = await authRes.json();

      // 2. Upload file content to signed URL
      const fileContent = Buffer.from(
        `%PDF-1.4 Mock binary content for ${docType}`,
      );
      const uploadRes = await fetch(authData.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: fileContent,
      });
      assert.strictEqual(uploadRes.status, 200);

      // 3. Commit document
      const commitRes = await fetch(
        `${edgeFunctionBaseUrl}/driver/documents/commit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${driverToken}`,
            "Idempotency-Key": `commit_${driverUserId}_${docType}`,
          },
          body: JSON.stringify({
            document_type: docType,
            storage_path: authData.storage_path,
          }),
        },
      );
      assert.strictEqual(commitRes.status, 200);
      const commitData = await commitRes.json();
      assert.strictEqual(commitData.verification_status, "PENDING");
    }

    // Verify 3 active documents in DB
    const docsRes = await dbPool.query(
      "SELECT count(*) FROM public.driver_documents WHERE driver_id = $1 AND verification_status = 'PENDING'",
      [driverUserId],
    );
    assert.strictEqual(parseInt(docsRes.rows[0].count, 10), 3);
  });

  it("Step 9: Direct Storage Bypass attempt without matching actor folder is rejected", async () => {
    // Attempt to commit with wrong actor path prefix
    const commitRes = await fetch(
      `${edgeFunctionBaseUrl}/driver/documents/commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          document_type: "NATIONAL_ID",
          storage_path: `other-user-uuid/malicious.pdf`,
        }),
      },
    );
    assert.strictEqual(commitRes.status, 403);
    const errData = await commitRes.json();
    assert.ok(errData.error.includes("INVALID_STORAGE_PATH"));
  });

  it("Step 10: Operator cannot verify drivers (Role check enforcement)", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/admin/verify-driver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${operatorAal2Token}`,
      },
      body: JSON.stringify({
        driver_id: driverUserId,
        decision: "APPROVE",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("AUTH_ADMIN_ROLE_REQUIRED"));
  });

  it("Step 11: Verification Agent with AAL1 (non-MFA) is rejected with AUTH_MFA_REQUIRED", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/admin/verify-driver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentToken}`, // Non-MFA token
      },
      body: JSON.stringify({
        driver_id: driverUserId,
        decision: "APPROVE",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("AUTH_MFA_REQUIRED"));
  });

  it("Step 12: Verification Agent rejects driver (Rejection flow + Canonical DRIVER_REJECTED audit)", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/admin/verify-driver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentAal2Token}`,
      },
      body: JSON.stringify({
        driver_id: driverUserId,
        decision: "REJECT",
        rejection_reason: "Cédula borrosa y vencida",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.verification_status, "REJECTED");
    assert.strictEqual(data.account_status, "REGISTERED");

    // Verify canonical audit log
    const auditRes = await dbPool.query(
      "SELECT action, reason FROM public.audit_logs WHERE entity_id = $1 AND action = 'DRIVER_REJECTED'",
      [driverUserId],
    );
    assert.strictEqual(auditRes.rows.length, 1);
    assert.strictEqual(auditRes.rows[0].reason, "Cédula borrosa y vencida");
  });

  it("Step 13: Driver re-upload after rejection automatically transitions driver back to PENDING", async () => {
    // 1. Authorize re-upload
    const authRes = await fetch(
      `${edgeFunctionBaseUrl}/driver/documents/upload-authorization`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({ document_type: "NATIONAL_ID" }),
      },
    );
    const authData = await authRes.json();

    // 2. Upload file
    await fetch(authData.upload_url, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.from("%PDF-1.4 Clean high-resolution national ID"),
    });

    // 3. Commit
    const commitRes = await fetch(
      `${edgeFunctionBaseUrl}/driver/documents/commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
        },
        body: JSON.stringify({
          document_type: "NATIONAL_ID",
          storage_path: authData.storage_path,
        }),
      },
    );
    assert.strictEqual(commitRes.status, 200);

    // Verify driver status is PENDING again in DB
    const drvRes = await dbPool.query(
      "SELECT verification_status, account_status FROM public.drivers WHERE id = $1",
      [driverUserId],
    );
    assert.strictEqual(drvRes.rows[0].verification_status, "PENDING");
    assert.strictEqual(drvRes.rows[0].account_status, "REGISTERED");
  });

  it("Step 14: Admin Approval with all 3 documents + vehicle succeeds (DRIVER_VERIFIED audit)", async () => {
    const res = await fetch(`${edgeFunctionBaseUrl}/admin/verify-driver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentAal2Token}`,
      },
      body: JSON.stringify({
        driver_id: driverUserId,
        decision: "APPROVE",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.verification_status, "VERIFIED");
    assert.strictEqual(data.account_status, "ACTIVE");
    assert.strictEqual(data.operational_state, "OFFLINE");

    // Verify canonical audit log
    const auditRes = await dbPool.query(
      "SELECT action FROM public.audit_logs WHERE entity_id = $1 AND action = 'DRIVER_VERIFIED'",
      [driverUserId],
    );
    assert.strictEqual(auditRes.rows.length, 1);

    // Verify evaluateDriverAccess now grants access
    const verifiedDriverIdentity: IdentityContext = {
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
    assert.strictEqual(
      evaluateDriverAccess(verifiedDriverIdentity).allowed,
      true,
    );
  });

  it("Step 15: Admin Approval attempt without all 3 required documents is rejected (DOCUMENTATION_INCOMPLETE)", async () => {
    // Register incomplete driver (personal profile only, no vehicle/docs)
    await fetch(`${edgeFunctionBaseUrl}/driver/onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${incompleteDriverToken}`,
      },
      body: JSON.stringify({
        national_id_number: `001-${testRunId}-9999Z`,
        license_number: `LIC-${testRunId}-9999`,
      }),
    });

    const res = await fetch(`${edgeFunctionBaseUrl}/admin/verify-driver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentAal2Token}`,
      },
      body: JSON.stringify({
        driver_id: incompleteDriverUserId,
        decision: "APPROVE",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("DOCUMENTATION_INCOMPLETE"));
  });

  it("Step 16: Concurrent duplicate requests with same Idempotency-Key are race-safe", async () => {
    const concurrentKey = `concurrent_${driverUserId}_${Date.now()}`;
    const targetPlate = `M-${testRunId}-CONC`;

    // Fire 5 concurrent requests with identical Idempotency-Key
    const requests = Array.from({ length: 5 }).map(() =>
      fetch(`${edgeFunctionBaseUrl}/driver/vehicles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${driverToken}`,
          "Idempotency-Key": concurrentKey,
        },
        body: JSON.stringify({
          make: "Suzuki",
          model: "Gixxer",
          year: 2023,
          color: "Negro",
          license_plate: targetPlate,
        }),
      }),
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);

    // All should return 201 or 200 (either created or served from idempotency cache)
    assert.ok(statuses.every((s) => s === 201 || s === 200));

    // Verify exactly ONE vehicle with this plate was inserted in the database
    const dbCount = await dbPool.query(
      "SELECT count(*) FROM public.vehicles WHERE license_plate = $1",
      [targetPlate],
    );
    assert.strictEqual(parseInt(dbCount.rows[0].count, 10), 1);
  });
});

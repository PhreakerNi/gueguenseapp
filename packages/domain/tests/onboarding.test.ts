import { describe, it } from "node:test";
import assert from "node:assert";
import {
  canVerifyDrivers,
  isDriverApproved,
  isDriverPendingVerification,
  isDriverRejected,
  evaluateBusinessAccess,
  evaluateDriverAccess,
  type IdentityContext,
} from "../src/guards";
import {
  businessCreationSchema,
  businessLocationSchema,
  businessMemberSchema,
  businessOnboardingSchema,
  driverOnboardingSchema,
  vehicleRegistrationSchema,
  driverDocumentSubmitSchema,
  adminVerifyDriverSchema,
} from "@gueguense/schemas";

describe("@gueguense/domain - Phase 3 Onboarding & Verification Guards", () => {
  describe("canVerifyDrivers Guard", () => {
    it("should allow verification when role is super_admin and AAL is aal2", () => {
      const res = canVerifyDrivers("super_admin", "aal2");
      assert.strictEqual(res.allowed, true);
    });

    it("should allow verification when role is admin and AAL is aal2", () => {
      const res = canVerifyDrivers("admin", "aal2");
      assert.strictEqual(res.allowed, true);
    });

    it("should allow verification when role is verification_agent and AAL is aal2", () => {
      const res = canVerifyDrivers("verification_agent", "aal2");
      assert.strictEqual(res.allowed, true);
    });

    it("should reject verification when role is operator even with aal2", () => {
      const res = canVerifyDrivers("operator", "aal2");
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.reason, "AUTH_ADMIN_ROLE_REQUIRED");
    });

    it("should reject verification when role is none even with aal2", () => {
      const res = canVerifyDrivers("none", "aal2");
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.reason, "AUTH_ADMIN_ROLE_REQUIRED");
    });

    it("should reject verification when role is verification_agent but AAL is aal1", () => {
      const res = canVerifyDrivers("verification_agent", "aal1");
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.reason, "AUTH_MFA_REQUIRED");
    });

    it("should reject verification when AAL is undefined", () => {
      const res = canVerifyDrivers("admin", undefined);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.reason, "AUTH_MFA_REQUIRED");
    });
  });

  describe("evaluateBusinessAccess Scoped Location Guard", () => {
    it("should require onboarding when identity has no business memberships", () => {
      const identity: IdentityContext = {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "owner@test.com",
        profile: {
          platformRole: "none",
          fullName: "Owner",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [],
        driver: null,
      };
      const res = evaluateBusinessAccess(identity);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.reason, "ONBOARDING_REQUIRED");
    });

    it("should grant universal branch access to business_owner", () => {
      const identity: IdentityContext = {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "owner@test.com",
        profile: {
          platformRole: "none",
          fullName: "Owner",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [
          {
            membershipId: "m-1",
            businessId: "b-1",
            role: "business_owner",
            status: "ACTIVE",
            businessAccountStatus: "ACTIVE",
            authorizedLocationIds: ["loc-1", "loc-2"],
          },
        ],
        driver: null,
      };
      const res = evaluateBusinessAccess(identity);
      assert.strictEqual(res.allowed, true);
      assert.deepStrictEqual(res.authorizedLocationIds, ["loc-1", "loc-2"]);
    });

    it("should grant access to manager for assigned location and restrict unassigned location", () => {
      const identity: IdentityContext = {
        userId: "22222222-2222-4222-8222-222222222222",
        email: "manager@test.com",
        profile: {
          platformRole: "none",
          fullName: "Manager",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [
          {
            membershipId: "m-2",
            businessId: "b-1",
            role: "business_manager",
            status: "ACTIVE",
            businessAccountStatus: "ACTIVE",
            authorizedLocationIds: ["loc-1"],
          },
        ],
        driver: null,
      };
      // Allowed on authorized loc-1
      const res1 = evaluateBusinessAccess(identity, "loc-1");
      assert.strictEqual(res1.allowed, true);

      // Restricted on unauthorized loc-2
      const res2 = evaluateBusinessAccess(identity, "loc-2");
      assert.strictEqual(res2.allowed, false);
      assert.strictEqual(res2.reason, "ACCOUNT_RESTRICTED");
    });
  });

  describe("evaluateDriverAccess Strict Verification Guard", () => {
    it("should require onboarding when driver status is PENDING or REGISTERED", () => {
      const identity: IdentityContext = {
        userId: "33333333-3333-4333-8333-333333333333",
        email: "driver@test.com",
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
      const res = evaluateDriverAccess(identity);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.reason, "ONBOARDING_REQUIRED");
    });

    it("should allow driver access ONLY when VERIFIED and ACTIVE", () => {
      const identity: IdentityContext = {
        userId: "33333333-3333-4333-8333-333333333333",
        email: "driver@test.com",
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
      const res = evaluateDriverAccess(identity);
      assert.strictEqual(res.allowed, true);
    });

    it("should restrict access when driver account is SUSPENDED or BLOCKED", () => {
      const identity: IdentityContext = {
        userId: "33333333-3333-4333-8333-333333333333",
        email: "driver@test.com",
        profile: {
          platformRole: "none",
          fullName: "Driver",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [],
        driver: {
          verificationStatus: "VERIFIED",
          accountStatus: "SUSPENDED",
        },
      };
      const res = evaluateDriverAccess(identity);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.reason, "ACCOUNT_RESTRICTED");
    });
  });

  describe("Driver Status Helpers", () => {
    it("should identify approved driver when VERIFIED and ACTIVE", () => {
      assert.strictEqual(isDriverApproved("VERIFIED", "ACTIVE"), true);
      assert.strictEqual(isDriverApproved("VERIFIED", "REGISTERED"), false);
      assert.strictEqual(isDriverApproved("PENDING", "ACTIVE"), false);
    });

    it("should identify pending driver when PENDING or UNDER_REVIEW", () => {
      assert.strictEqual(isDriverPendingVerification("PENDING"), true);
      assert.strictEqual(isDriverPendingVerification("UNDER_REVIEW"), true);
      assert.strictEqual(isDriverPendingVerification("VERIFIED"), false);
      assert.strictEqual(isDriverPendingVerification("REJECTED"), false);
    });

    it("should identify rejected driver when REJECTED", () => {
      assert.strictEqual(isDriverRejected("REJECTED"), true);
      assert.strictEqual(isDriverRejected("PENDING"), false);
      assert.strictEqual(isDriverRejected("VERIFIED"), false);
    });
  });

  describe("Phase 3 Zod Schemas Validation", () => {
    it("should validate valid business creation input", () => {
      const valid = {
        legalName: "Empresa S.A.",
        brandName: "Mi Tienda",
        taxId: "J0310000000001",
      };
      const parsed = businessCreationSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
    });

    it("should validate legacy composite business onboarding input", () => {
      const valid = {
        legalName: "Empresa S.A.",
        brandName: "Mi Tienda",
        taxId: "J0310000000001",
        branchName: "Sucursal Central",
        branchAddress: "Calle Principal #123",
        branchLatitude: 12.136389,
        branchLongitude: -86.251389,
      };
      const parsed = businessOnboardingSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
    });

    it("should validate valid business location input", () => {
      const valid = {
        businessId: "11111111-1111-4111-8111-111111111111",
        name: "Sucursal Central",
        addressText: "Calle Principal #123",
        latitude: 12.136389,
        longitude: -86.251389,
      };
      const parsed = businessLocationSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
    });

    it("should validate valid business member input", () => {
      const valid = {
        businessId: "11111111-1111-4111-8111-111111111111",
        userId: "22222222-2222-4222-8222-222222222222",
        role: "business_manager" as const,
        locationIds: ["33333333-3333-4333-8333-333333333333"],
      };
      const parsed = businessMemberSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
    });

    it("should validate valid driver personal onboarding input", () => {
      const valid = {
        nationalIdNumber: "001-010190-0001A",
        licenseNumber: "LIC-123456",
      };
      const parsed = driverOnboardingSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
    });

    it("should validate vehicle registration input", () => {
      const valid = {
        make: "Yamaha",
        model: "FZ-S",
        year: 2023,
        color: "Azul",
        licensePlate: "M-998877",
      };
      const parsed = vehicleRegistrationSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
    });

    it("should validate driver document submit input", () => {
      const valid = {
        documentType: "NATIONAL_ID" as const,
        storagePath: "1111/national_id.jpg",
      };
      const parsed = driverDocumentSubmitSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
    });

    it("should require rejectionReason when admin rejects a driver", () => {
      const validReject = {
        driverId: "11111111-1111-4111-8111-111111111111",
        decision: "REJECT" as const,
        rejectionReason: "Foto ilegible",
      };
      assert.strictEqual(
        adminVerifyDriverSchema.safeParse(validReject).success,
        true,
      );

      const invalidReject = {
        driverId: "11111111-1111-4111-8111-111111111111",
        decision: "REJECT" as const,
      };
      assert.strictEqual(
        adminVerifyDriverSchema.safeParse(invalidReject).success,
        false,
      );
    });
  });
});

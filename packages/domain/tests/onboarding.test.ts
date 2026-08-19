import { describe, it } from "node:test";
import assert from "node:assert";
import {
  canVerifyDrivers,
  isDriverApproved,
  isDriverPendingVerification,
  isDriverRejected,
} from "../src/guards";
import {
  businessOnboardingSchema,
  driverOnboardingSchema,
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
    it("should validate valid business onboarding input", () => {
      const valid = {
        legalName: "Empresa S.A.",
        brandName: "Mi Tienda",
        taxId: "J0310000000001",
        branchName: "Sucursal Central",
        branchAddress: "Calle Central #456",
        branchLatitude: 12.136389,
        branchLongitude: -86.251389,
        pickupInstructions: "Tocar timbre",
      };
      const parsed = businessOnboardingSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
    });

    it("should reject invalid business onboarding with out-of-range coordinates", () => {
      const invalid = {
        legalName: "Empresa S.A.",
        brandName: "Mi Tienda",
        taxId: "J0310000000001",
        branchName: "Sucursal Central",
        branchAddress: "Calle Central #456",
        branchLatitude: 95.0, // invalid
        branchLongitude: -86.251389,
      };
      const parsed = businessOnboardingSchema.safeParse(invalid);
      assert.strictEqual(parsed.success, false);
    });

    it("should validate valid driver onboarding input", () => {
      const valid = {
        nationalIdNumber: "001-010190-0001A",
        licenseNumber: "LIC-123456",
        vehicleMake: "Honda",
        vehicleModel: "Cruiser",
        vehicleYear: 2022,
        vehicleColor: "Negro",
        vehicleLicensePlate: "M-123456",
      };
      const parsed = driverOnboardingSchema.safeParse(valid);
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

      const validApprove = {
        driverId: "11111111-1111-4111-8111-111111111111",
        decision: "APPROVE" as const,
      };
      assert.strictEqual(
        adminVerifyDriverSchema.safeParse(validApprove).success,
        true,
      );
    });
  });
});

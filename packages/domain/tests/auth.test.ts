import { describe, it } from "node:test";
import assert from "node:assert";
import {
  AUTH_ERROR_CODES,
  evaluateBusinessAccess,
  evaluateDriverAccess,
  evaluateAdminAccess,
  type IdentityContext,
} from "../src/index.js";

describe("@gueguense/domain - Auth & Identity Guards", () => {
  it("should have all 12 normalized AUTH_ERROR_CODES without duplicates", () => {
    const unique = new Set(AUTH_ERROR_CODES);
    assert.strictEqual(unique.size, 12);
    assert.strictEqual(AUTH_ERROR_CODES.length, 12);
    assert.strictEqual(
      AUTH_ERROR_CODES.includes("AUTH_INVALID_CREDENTIALS"),
      true,
    );
    assert.strictEqual(
      AUTH_ERROR_CODES.includes("AUTH_ADMIN_ROLE_REQUIRED"),
      true,
    );
    assert.strictEqual(AUTH_ERROR_CODES.includes("AUTH_MFA_REQUIRED"), true);
    assert.strictEqual(
      AUTH_ERROR_CODES.includes("AUTH_ONBOARDING_REQUIRED"),
      true,
    );
    assert.strictEqual(
      AUTH_ERROR_CODES.includes("AUTH_ACCOUNT_RESTRICTED"),
      true,
    );
  });

  describe("evaluateBusinessAccess", () => {
    it("should require onboarding when identity is null or memberships empty", () => {
      assert.deepStrictEqual(evaluateBusinessAccess(null), {
        allowed: false,
        reason: "ONBOARDING_REQUIRED",
      });

      const emptyIdentity: IdentityContext = {
        userId: "u-1",
        email: "test@business.com",
        profile: {
          platformRole: "none",
          fullName: "Test",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [],
        driver: null,
      };
      assert.deepStrictEqual(evaluateBusinessAccess(emptyIdentity), {
        allowed: false,
        reason: "ONBOARDING_REQUIRED",
      });
    });

    it("should grant access when user has an active membership and active business", () => {
      const activeIdentity: IdentityContext = {
        userId: "u-1",
        email: "test@business.com",
        profile: {
          platformRole: "none",
          fullName: "Test",
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
          },
        ],
        driver: null,
      };
      assert.deepStrictEqual(evaluateBusinessAccess(activeIdentity), {
        allowed: true,
      });
    });

    it("should restrict access when membership or business is suspended", () => {
      const suspendedMembershipIdentity: IdentityContext = {
        userId: "u-1",
        email: "test@business.com",
        profile: {
          platformRole: "none",
          fullName: "Test",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [
          {
            membershipId: "m-1",
            businessId: "b-1",
            role: "business_owner",
            status: "SUSPENDED",
            businessAccountStatus: "ACTIVE",
          },
        ],
        driver: null,
      };
      assert.deepStrictEqual(
        evaluateBusinessAccess(suspendedMembershipIdentity),
        {
          allowed: false,
          reason: "ACCOUNT_RESTRICTED",
        },
      );

      const suspendedBusinessIdentity: IdentityContext = {
        userId: "u-1",
        email: "test@business.com",
        profile: {
          platformRole: "none",
          fullName: "Test",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [
          {
            membershipId: "m-1",
            businessId: "b-1",
            role: "business_owner",
            status: "ACTIVE",
            businessAccountStatus: "SUSPENDED",
          },
        ],
        driver: null,
      };
      assert.deepStrictEqual(
        evaluateBusinessAccess(suspendedBusinessIdentity),
        {
          allowed: false,
          reason: "ACCOUNT_RESTRICTED",
        },
      );
    });
  });

  describe("evaluateDriverAccess", () => {
    it("should require onboarding when identity is null, driver is null, or registered", () => {
      assert.deepStrictEqual(evaluateDriverAccess(null), {
        allowed: false,
        reason: "ONBOARDING_REQUIRED",
      });

      const noDriverIdentity: IdentityContext = {
        userId: "u-2",
        email: "driver@test.com",
        profile: {
          platformRole: "none",
          fullName: "Driver",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [],
        driver: null,
      };
      assert.deepStrictEqual(evaluateDriverAccess(noDriverIdentity), {
        allowed: false,
        reason: "ONBOARDING_REQUIRED",
      });

      const registeredIdentity: IdentityContext = {
        userId: "u-2",
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
      assert.deepStrictEqual(evaluateDriverAccess(registeredIdentity), {
        allowed: false,
        reason: "ONBOARDING_REQUIRED",
      });
    });

    it("should grant access when driver is ACTIVE", () => {
      const activeDriverIdentity: IdentityContext = {
        userId: "u-2",
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
      assert.deepStrictEqual(evaluateDriverAccess(activeDriverIdentity), {
        allowed: true,
      });
    });

    it("should restrict access when driver is SUSPENDED, BLOCKED, or CLOSED", () => {
      const suspendedDriverIdentity: IdentityContext = {
        userId: "u-2",
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
      assert.deepStrictEqual(evaluateDriverAccess(suspendedDriverIdentity), {
        allowed: false,
        reason: "ACCOUNT_RESTRICTED",
      });
    });
  });

  describe("evaluateAdminAccess", () => {
    it("should reject access when identity is null or platform_role is none", () => {
      assert.deepStrictEqual(evaluateAdminAccess(null), {
        allowed: false,
        reason: "ADMIN_ROLE_REQUIRED",
      });

      const noneRoleIdentity: IdentityContext = {
        userId: "u-3",
        email: "user@test.com",
        profile: {
          platformRole: "none",
          fullName: "User",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [],
        driver: null,
      };
      assert.deepStrictEqual(evaluateAdminAccess(noneRoleIdentity), {
        allowed: false,
        reason: "ADMIN_ROLE_REQUIRED",
      });
    });

    it("should require MFA when platform role is permitted but AAL level is aal1", () => {
      const adminIdentity: IdentityContext = {
        userId: "u-3",
        email: "admin@test.com",
        profile: {
          platformRole: "admin",
          fullName: "Admin",
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
    });

    it("should grant access when platform role is permitted and AAL level is aal2", () => {
      const superAdminIdentity: IdentityContext = {
        userId: "u-3",
        email: "superadmin@test.com",
        profile: {
          platformRole: "super_admin",
          fullName: "Super Admin",
          phone: null,
          avatarUrl: null,
        },
        businessMemberships: [],
        driver: null,
      };
      assert.deepStrictEqual(evaluateAdminAccess(superAdminIdentity, "aal2"), {
        allowed: true,
      });
    });
  });
});

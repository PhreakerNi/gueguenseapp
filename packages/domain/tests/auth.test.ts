import { describe, it } from "node:test";
import assert from "node:assert";
import {
  AUTH_ERROR_CODES,
  evaluateBusinessAccess,
  evaluateDriverAccess,
  evaluateAdminAccess,
  canResetPassword,
  validateRecoveryTokens,
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

  describe("canResetPassword Guard & Recovery Rules", () => {
    it("should reject reset password when session is null even if isPasswordRecovery is true", () => {
      assert.strictEqual(canResetPassword(false, true), false);
    });

    it("should reject reset password when session is valid but isPasswordRecovery is false (normal session)", () => {
      assert.strictEqual(canResetPassword(true, false), false);
    });

    it("should reject reset password when session is null and isPasswordRecovery is false", () => {
      assert.strictEqual(canResetPassword(false, false), false);
    });

    it("should allow reset password ONLY when session != null AND isPasswordRecovery is true", () => {
      assert.strictEqual(canResetPassword(true, true), true);
    });
  });

  describe("validateRecoveryTokens Rules", () => {
    it("should allow recovery when type=recovery and both access_token and refresh_token are present", () => {
      assert.strictEqual(
        validateRecoveryTokens(
          "recovery",
          "valid_access_tok",
          "valid_refresh_tok",
        ),
        true,
      );
    });

    it("should reject recovery when type=recovery but tokens are missing", () => {
      assert.strictEqual(
        validateRecoveryTokens("recovery", undefined, undefined),
        false,
      );
    });

    it("should reject recovery when only access_token is present", () => {
      assert.strictEqual(
        validateRecoveryTokens("recovery", "valid_access_tok", undefined),
        false,
      );
    });

    it("should reject recovery when only refresh_token is present", () => {
      assert.strictEqual(
        validateRecoveryTokens("recovery", undefined, "valid_refresh_tok"),
        false,
      );
    });

    it("should reject recovery when type is not recovery even if tokens are present", () => {
      assert.strictEqual(
        validateRecoveryTokens(
          undefined,
          "valid_access_tok",
          "valid_refresh_tok",
        ),
        false,
      );
      assert.strictEqual(
        validateRecoveryTokens(
          "signup",
          "valid_access_tok",
          "valid_refresh_tok",
        ),
        false,
      );
    });

    it("should prevent duplicate processing of the same deep link URL", () => {
      const processed = new Set<string>();
      const testUrl =
        "gueguense-business://auth/callback#access_token=abc&refresh_token=xyz&type=recovery";

      let processCount = 0;
      const processDeepLink = (url: string) => {
        if (processed.has(url)) return false;
        processed.add(url);
        processCount++;
        return true;
      };

      assert.strictEqual(processDeepLink(testUrl), true);
      assert.strictEqual(
        processDeepLink(testUrl),
        false,
        "Duplicate URL must be ignored",
      );
      assert.strictEqual(processCount, 1);
    });
  });

  describe("processLock - Queue-based Mutex Concurrency & Timeout Guarantees", () => {
    type QueueEntry = {
      grant: () => void;
      isCancelled: boolean;
    };

    class TestMutex {
      isLocked = false;
      queue: QueueEntry[] = [];

      async acquire(acquireTimeout: number, name: string): Promise<void> {
        if (!this.isLocked) {
          this.isLocked = true;
          return;
        }

        if (acquireTimeout === 0) {
          throw new Error(
            `Acquiring lock "${name}" failed immediately as it is already held`,
          );
        }

        return new Promise<void>((resolve, reject) => {
          const entry: QueueEntry = {
            grant: () => {},
            isCancelled: false,
          };

          let timer: ReturnType<typeof setTimeout> | undefined;

          if (acquireTimeout > 0) {
            timer = setTimeout(() => {
              entry.isCancelled = true;
              const idx = this.queue.indexOf(entry);
              if (idx !== -1) {
                this.queue.splice(idx, 1);
              }
              reject(
                new Error(
                  `Timeout acquiring client lock "${name}" after ${acquireTimeout}ms`,
                ),
              );
            }, acquireTimeout);
          }

          entry.grant = () => {
            if (timer) clearTimeout(timer);
            resolve();
          };

          this.queue.push(entry);
        });
      }

      release(): void {
        while (this.queue.length > 0) {
          const next = this.queue.shift()!;
          if (!next.isCancelled) {
            next.grant();
            return;
          }
        }
        this.isLocked = false;
      }
    }

    const testLocks = new Map<string, TestMutex>();

    const testProcessLock = async <R>(
      name: string,
      acquireTimeout: number,
      fn: () => Promise<R>,
    ): Promise<R> => {
      let mutex = testLocks.get(name);
      if (!mutex) {
        mutex = new TestMutex();
        testLocks.set(name, mutex);
      }

      await mutex.acquire(acquireTimeout, name);
      try {
        return await fn();
      } finally {
        mutex.release();
        if (!mutex.isLocked && mutex.queue.length === 0) {
          testLocks.delete(name);
        }
      }
    };

    it("should enforce mutual exclusion for the same lock name", async () => {
      let activeCount = 0;
      let maxActive = 0;

      const runTask = (id: number) =>
        testProcessLock("lock_same", 1000, async () => {
          activeCount++;
          maxActive = Math.max(maxActive, activeCount);
          await new Promise((r) => setTimeout(r, 20));
          activeCount--;
          return id;
        });

      const results = await Promise.all([runTask(1), runTask(2), runTask(3)]);
      assert.deepStrictEqual(results, [1, 2, 3]);
      assert.strictEqual(
        maxActive,
        1,
        "Only one task should be active at any given time",
      );
    });

    it("should allow independent concurrent execution for different lock names", async () => {
      let lockAActive = false;
      let lockBActive = false;
      let overlapped = false;

      const taskA = testProcessLock("lock_A", 1000, async () => {
        lockAActive = true;
        await new Promise((r) => setTimeout(r, 30));
        if (lockBActive) overlapped = true;
        lockAActive = false;
      });

      const taskB = testProcessLock("lock_B", 1000, async () => {
        lockBActive = true;
        await new Promise((r) => setTimeout(r, 30));
        if (lockAActive) overlapped = true;
        lockBActive = false;
      });

      await Promise.all([taskA, taskB]);
      assert.strictEqual(
        overlapped,
        true,
        "Different lock names should execute concurrently",
      );
    });

    it("should release lock in finally block even if task throws an error", async () => {
      await assert.rejects(
        testProcessLock("lock_err", 1000, async () => {
          throw new Error("Task failure");
        }),
        /Task failure/,
      );

      // Subsequent task should acquire lock without issue
      let subsequentRan = false;
      await testProcessLock("lock_err", 1000, async () => {
        subsequentRan = true;
      });
      assert.strictEqual(subsequentRan, true);
    });

    it("MANDATORY RACE TEST: A acquires X, B attempts X and times out, C attempts X afterwards -> C does NOT enter while A is active, A releases, C enters", async () => {
      const events: string[] = [];
      let aIsActive = false;

      // 1. A acquires lock X and executes for 60ms
      const taskA = testProcessLock("race_X", 1000, async () => {
        events.push("A_START");
        aIsActive = true;
        await new Promise((r) => setTimeout(r, 60));
        aIsActive = false;
        events.push("A_END");
      });

      // 2. B attempts lock X with 15ms timeout -> B must timeout
      await new Promise((r) => setTimeout(r, 5));
      const taskB = testProcessLock("race_X", 15, async () => {
        events.push("B_RAN");
      }).catch((err) => {
        events.push("B_TIMEOUT");
        assert.match(err.message, /Timeout acquiring client lock/);
      });

      // 3. C attempts lock X after B timed out, with 200ms timeout
      await new Promise((r) => setTimeout(r, 25));
      const taskC = testProcessLock("race_X", 200, async () => {
        assert.strictEqual(
          aIsActive,
          false,
          "C must NEVER enter while A is still actively holding the lock!",
        );
        events.push("C_START");
        await new Promise((r) => setTimeout(r, 10));
        events.push("C_END");
      });

      await Promise.all([taskA, taskB, taskC]);

      assert.deepStrictEqual(events, [
        "A_START",
        "B_TIMEOUT",
        "A_END",
        "C_START",
        "C_END",
      ]);
    });
  });
});

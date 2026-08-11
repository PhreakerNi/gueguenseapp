import { describe, it } from "node:test";
import assert from "node:assert";
import {
  DELIVERY_STATUSES,
  OTP_ALLOWED_STATES,
  TERMINAL_DELIVERY_STATUSES,
  EVENT_TYPES,
  PROOF_TYPES,
  isTerminalDeliveryStatus,
  isOtpAllowedState,
} from "../src/index.js";

describe("@gueguense/domain", () => {
  it("should have no duplicate values in DELIVERY_STATUSES", () => {
    const unique = new Set(DELIVERY_STATUSES);
    assert.strictEqual(unique.size, DELIVERY_STATUSES.length);
  });

  it("should have no duplicate values in EVENT_TYPES", () => {
    const unique = new Set(EVENT_TYPES);
    assert.strictEqual(unique.size, EVENT_TYPES.length);
  });

  it("should have no duplicate values in PROOF_TYPES", () => {
    const unique = new Set(PROOF_TYPES);
    assert.strictEqual(unique.size, PROOF_TYPES.length);
  });

  it("should verify terminal delivery statuses are a subset of DELIVERY_STATUSES", () => {
    TERMINAL_DELIVERY_STATUSES.forEach((status: string) => {
      const isPresent = (DELIVERY_STATUSES as readonly string[]).includes(
        status,
      );
      assert.strictEqual(isPresent, true);
    });
  });

  it("should verify OTP_ALLOWED_STATES are a subset of DELIVERY_STATUSES", () => {
    OTP_ALLOWED_STATES.forEach((status: string) => {
      const isPresent = (DELIVERY_STATUSES as readonly string[]).includes(
        status,
      );
      assert.strictEqual(isPresent, true);
    });
  });

  it("should correctly identify terminal delivery statuses", () => {
    assert.strictEqual(isTerminalDeliveryStatus("DELIVERED"), true);
    assert.strictEqual(isTerminalDeliveryStatus("RETURNED"), true);
    assert.strictEqual(isTerminalDeliveryStatus("CANCELED"), true);
    assert.strictEqual(isTerminalDeliveryStatus("FAILED"), true);
    assert.strictEqual(isTerminalDeliveryStatus("TO_DROPOFF"), false);
    assert.strictEqual(isTerminalDeliveryStatus("RETURN_REQUIRED"), false);
  });

  it("should correctly identify OTP allowed states", () => {
    assert.strictEqual(isOtpAllowedState("PICKED_UP"), true);
    assert.strictEqual(isOtpAllowedState("TO_DROPOFF"), true);
    assert.strictEqual(isOtpAllowedState("ARRIVED_DROPOFF"), true);
    assert.strictEqual(isOtpAllowedState("ARRIVED_PICKUP"), false);
    assert.strictEqual(isOtpAllowedState("DELIVERED"), false);
  });
});

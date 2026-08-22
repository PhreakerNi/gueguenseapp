import { describe, it } from "node:test";
import assert from "node:assert";
import {
  canCreateDeliveryFromQuote,
  canCancelDelivery,
  isDeliveryInTransit,
  isDeliveryTerminal,
} from "../src/guards";

describe("Phase 5 Delivery Engine Domain Logic", () => {
  describe("canCreateDeliveryFromQuote", () => {
    const futureDate = new Date(Date.now() + 300 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 300 * 1000).toISOString();

    it("allows delivery creation for valid active QUOTED quote", () => {
      const res = canCreateDeliveryFromQuote("QUOTED", futureDate);
      assert.strictEqual(res.allowed, true);
    });

    it("denies delivery creation for expired quote with QUOTE_EXPIRED", () => {
      const res = canCreateDeliveryFromQuote("QUOTED", pastDate);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.errorCode, "QUOTE_EXPIRED");
    });

    it("denies delivery creation for CANCELED quote with QUOTE_INVALID_STATE", () => {
      const res = canCreateDeliveryFromQuote("CANCELED", futureDate);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.errorCode, "QUOTE_INVALID_STATE");
    });

    it("denies delivery creation for CONSUMED quote with QUOTE_ALREADY_CONSUMED", () => {
      const res = canCreateDeliveryFromQuote("CONSUMED", futureDate);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.errorCode, "QUOTE_ALREADY_CONSUMED");
    });

    it("denies delivery creation for DRAFT quote with QUOTE_INVALID_STATE", () => {
      const res = canCreateDeliveryFromQuote("DRAFT", futureDate);
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.errorCode, "QUOTE_INVALID_STATE");
    });
  });

  describe("canCancelDelivery", () => {
    it("allows cancellation from SEARCHING_DRIVER status", () => {
      const res = canCancelDelivery("SEARCHING_DRIVER");
      assert.strictEqual(res.allowed, true);
    });

    it("denies cancellation for already CANCELED delivery", () => {
      const res = canCancelDelivery("CANCELED");
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.errorCode, "INVALID_DELIVERY_STATE");
    });

    it("denies cancellation for in-transit statuses with CANNOT_CANCEL_IN_TRANSIT", () => {
      const inTransitStatuses = [
        "DRIVER_ASSIGNED",
        "TO_PICKUP",
        "ARRIVED_PICKUP",
        "PICKED_UP",
        "TO_DROPOFF",
        "ARRIVED_DROPOFF",
      ];
      for (const status of inTransitStatuses) {
        const res = canCancelDelivery(status);
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.errorCode, "CANNOT_CANCEL_IN_TRANSIT");
      }
    });

    it("denies cancellation for DELIVERED status with INVALID_DELIVERY_STATE", () => {
      const res = canCancelDelivery("DELIVERED");
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.errorCode, "INVALID_DELIVERY_STATE");
    });
  });

  describe("isDeliveryInTransit & isDeliveryTerminal", () => {
    it("correctly identifies in-transit statuses", () => {
      assert.strictEqual(isDeliveryInTransit("TO_PICKUP"), true);
      assert.strictEqual(isDeliveryInTransit("PICKED_UP"), true);
      assert.strictEqual(isDeliveryInTransit("SEARCHING_DRIVER"), false);
      assert.strictEqual(isDeliveryInTransit("DELIVERED"), false);
    });

    it("correctly identifies terminal statuses", () => {
      assert.strictEqual(isDeliveryTerminal("DELIVERED"), true);
      assert.strictEqual(isDeliveryTerminal("CANCELED"), true);
      assert.strictEqual(isDeliveryTerminal("RETURNED"), true);
      assert.strictEqual(isDeliveryTerminal("FAILED"), true);
      assert.strictEqual(isDeliveryTerminal("SEARCHING_DRIVER"), false);
      assert.strictEqual(isDeliveryTerminal("PICKED_UP"), false);
    });
  });
});

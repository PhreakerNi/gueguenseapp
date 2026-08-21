import { describe, it } from "node:test";
import assert from "node:assert";
import {
  calculateQuotePrice,
  parseRouteDurationSeconds,
  generateRouteCacheKey,
  isQuoteExpired,
  canCancelQuote,
  canRequote,
} from "../src";

describe("Phase 4 Quote Engine Domain Logic", () => {
  const defaultPricingRule = {
    baseFee: "35.00",
    perKmRate: "12.00",
    perMinuteRate: "1.50",
    minFare: "45.00",
  };

  describe("calculateQuotePrice", () => {
    it("calculates exact fare above minFare with rounding to 2 decimal places", () => {
      // 4.5 km -> 4.5 * 12 = 54.00
      // 13 mins (780s) -> 13 * 1.5 = 19.50
      // baseFee = 35.00
      // subtotal = 35 + 54 + 19.50 = 108.50 > minFare (45)
      const res = calculateQuotePrice(defaultPricingRule, 4500, 780);

      assert.strictEqual(res.baseAmount, "35.00");
      assert.strictEqual(res.distanceAmount, "54.00");
      assert.strictEqual(res.timeAmount, "19.50");
      assert.strictEqual(res.zoneAmount, "0.00");
      assert.strictEqual(res.demandAmount, "0.00");
      assert.strictEqual(res.discountAmount, "0.00");
      assert.strictEqual(res.quotedTotal, "108.50");
    });

    it("applies minFare when subtotal is lower than minFare", () => {
      // 0.5 km (500m) -> 0.5 * 12 = 6.00
      // 2 mins (120s) -> 2 * 1.5 = 3.00
      // baseFee = 35.00
      // subtotal = 35 + 6 + 3 = 44.00 < minFare (45.00)
      const res = calculateQuotePrice(defaultPricingRule, 500, 120);

      assert.strictEqual(res.baseAmount, "35.00");
      assert.strictEqual(res.distanceAmount, "6.00");
      assert.strictEqual(res.timeAmount, "3.00");
      assert.strictEqual(res.quotedTotal, "45.00");
    });

    it("throws error for zero or negative distance", () => {
      assert.throws(
        () => calculateQuotePrice(defaultPricingRule, 0, 100),
        /route_distance_meters must be greater than 0/,
      );
      assert.throws(
        () => calculateQuotePrice(defaultPricingRule, -500, 100),
        /route_distance_meters must be greater than 0/,
      );
    });

    it("throws error for negative duration", () => {
      assert.throws(
        () => calculateQuotePrice(defaultPricingRule, 1000, -10),
        /route_duration_seconds must be non-negative/,
      );
    });

    it("throws error for invalid pricing rule numbers", () => {
      assert.throws(
        () =>
          calculateQuotePrice(
            { ...defaultPricingRule, baseFee: "invalid" },
            1000,
            100,
          ),
        /Invalid pricing rule numeric values/,
      );
    });
  });

  describe("parseRouteDurationSeconds", () => {
    it("parses Google Routes seconds suffix string e.g. '780s'", () => {
      assert.strictEqual(parseRouteDurationSeconds("780s"), 780);
      assert.strictEqual(parseRouteDurationSeconds("125.4s"), 125);
    });

    it("parses integer and numeric string seconds", () => {
      assert.strictEqual(parseRouteDurationSeconds(300), 300);
      assert.strictEqual(parseRouteDurationSeconds("450"), 450);
    });

    it("throws error on malformed duration", () => {
      assert.throws(
        () => parseRouteDurationSeconds("invalid"),
        /Invalid duration string/,
      );
      assert.throws(
        () => parseRouteDurationSeconds("-10s"),
        /Invalid duration string/,
      );
    });
  });

  describe("generateRouteCacheKey", () => {
    it("normalizes coordinates to 5 decimal places", () => {
      const key1 = generateRouteCacheKey(
        12.136389,
        -86.251389,
        12.145678,
        -86.267891,
      );
      const key2 = generateRouteCacheKey(
        12.1363891,
        -86.2513892,
        12.1456784,
        -86.2678913,
      );
      assert.strictEqual(key1, key2);
      assert.strictEqual(
        key1,
        "route:google:12.13639,-86.25139->12.14568,-86.26789",
      );
    });
  });

  describe("isQuoteExpired", () => {
    it("correctly identifies active vs expired quotes", () => {
      const now = new Date("2026-08-21T12:00:00Z");
      const futureExpiry = "2026-08-21T12:05:00Z";
      const pastExpiry = "2026-08-21T11:59:59Z";

      assert.strictEqual(isQuoteExpired(futureExpiry, now), false);
      assert.strictEqual(isQuoteExpired(pastExpiry, now), true);
    });
  });

  describe("canCancelQuote and canRequote", () => {
    it("canCancelQuote only allows QUOTED status", () => {
      assert.strictEqual(canCancelQuote("QUOTED"), true);
      assert.strictEqual(canCancelQuote("DRAFT"), false);
      assert.strictEqual(canCancelQuote("EXPIRED"), false);
      assert.strictEqual(canCancelQuote("CANCELED"), false);
      assert.strictEqual(canCancelQuote("CONSUMED"), false);
    });

    it("canRequote allows EXPIRED and CANCELED status", () => {
      assert.strictEqual(canRequote("EXPIRED"), true);
      assert.strictEqual(canRequote("CANCELED"), true);
      assert.strictEqual(canRequote("QUOTED"), false);
      assert.strictEqual(canRequote("DRAFT"), false);
      assert.strictEqual(canRequote("CONSUMED"), false);
    });
  });
});

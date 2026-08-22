import { describe, it } from "node:test";
import assert from "node:assert";
import {
  IdempotentIntentManager,
  generateCryptoUuid,
} from "../src/idempotency";

describe("Mobile Idempotent Intent Manager Unit Tests (K1 - K8)", () => {
  it("K1: Create quote same payload network retry produces the exact same key", () => {
    const manager = new IdempotentIntentManager();
    const payload = {
      location_id: "loc-123",
      recipient_name: "Carlos",
      dropoff: { lat: 12.13, lng: -86.25 },
    };

    const key1 = manager.getOrCreateKey("quote:create", payload);
    const key2 = manager.getOrCreateKey("quote:create", payload);

    assert.strictEqual(key1, key2);
    assert.match(
      key1,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("K2: Create quote with reordered object keys produces the exact same key", () => {
    const manager = new IdempotentIntentManager();
    const payload1 = {
      b_field: "valueB",
      a_field: "valueA",
      nested: { z: 1, y: 2 },
    };
    const payload2 = {
      a_field: "valueA",
      b_field: "valueB",
      nested: { y: 2, z: 1 },
    };

    const key1 = manager.getOrCreateKey("quote:create", payload1);
    const key2 = manager.getOrCreateKey("quote:create", payload2);

    assert.strictEqual(key1, key2);
  });

  it("K3: Create quote with changed payload generates a brand new key", () => {
    const manager = new IdempotentIntentManager();
    const payload1 = {
      location_id: "loc-123",
      recipient_name: "Carlos",
      dropoff: { lat: 12.13, lng: -86.25 },
    };
    const payload2 = {
      location_id: "loc-123",
      recipient_name: "Carlos Changed",
      dropoff: { lat: 12.13, lng: -86.25 },
    };

    const key1 = manager.getOrCreateKey("quote:create", payload1);
    const key2 = manager.getOrCreateKey("quote:create", payload2);

    assert.notStrictEqual(key1, key2);
  });

  it("K4: Create quote success clears state so next distinct intent gets a new key", () => {
    const manager = new IdempotentIntentManager();
    const payload = {
      location_id: "loc-123",
      recipient_name: "Carlos",
    };

    const key1 = manager.getOrCreateKey("quote:create", payload);
    manager.clear("quote:create");
    const key2 = manager.getOrCreateKey("quote:create", payload);

    assert.notStrictEqual(key1, key2);
  });

  it("K5: Cancel quote network retry reuses the same key", () => {
    const manager = new IdempotentIntentManager();
    const payload = { quote_id: "quote-999" };

    const key1 = manager.getOrCreateKey("quote:cancel", payload);
    const key2 = manager.getOrCreateKey("quote:cancel", payload);

    assert.strictEqual(key1, key2);
  });

  it("K6: Cancel quote success clears key for next operation", () => {
    const manager = new IdempotentIntentManager();
    const payload = { quote_id: "quote-999" };

    const key1 = manager.getOrCreateKey("quote:cancel", payload);
    manager.clear("quote:cancel");
    const key2 = manager.getOrCreateKey("quote:cancel", payload);

    assert.notStrictEqual(key1, key2);
  });

  it("K7: Requote network retry reuses the same key", () => {
    const manager = new IdempotentIntentManager();
    const payload = { quote_id: "quote-999" };

    const key1 = manager.getOrCreateKey("quote:requote", payload);
    const key2 = manager.getOrCreateKey("quote:requote", payload);

    assert.strictEqual(key1, key2);
  });

  it("K8: Requote success clears key for next operation", () => {
    const manager = new IdempotentIntentManager();
    const payload = { quote_id: "quote-999" };

    const key1 = manager.getOrCreateKey("quote:requote", payload);
    manager.clear("quote:requote");
    const key2 = manager.getOrCreateKey("quote:requote", payload);

    assert.notStrictEqual(key1, key2);
  });

  it("Crypto UUID generates cryptographically valid v4 UUIDs without Math.random", () => {
    const uuid1 = generateCryptoUuid();
    const uuid2 = generateCryptoUuid();

    assert.notStrictEqual(uuid1, uuid2);
    assert.match(
      uuid1,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.match(
      uuid2,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

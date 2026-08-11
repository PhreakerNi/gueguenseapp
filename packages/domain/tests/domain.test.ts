import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DELIVERY_STATUSES,
  isTerminalDeliveryStatus,
  isOtpAllowedState,
} from '../src/index.ts';

describe('@gueguense/domain', () => {
  it('should have no duplicate values in DELIVERY_STATUSES', () => {
    const unique = new Set(DELIVERY_STATUSES);
    assert.strictEqual(unique.size, DELIVERY_STATUSES.length);
  });

  it('should correctly identify terminal delivery statuses', () => {
    assert.strictEqual(isTerminalDeliveryStatus('DELIVERED'), true);
    assert.strictEqual(isTerminalDeliveryStatus('RETURNED'), true);
    assert.strictEqual(isTerminalDeliveryStatus('CANCELED'), true);
    assert.strictEqual(isTerminalDeliveryStatus('FAILED'), true);
    assert.strictEqual(isTerminalDeliveryStatus('TO_DROPOFF'), false);
    assert.strictEqual(isTerminalDeliveryStatus('RETURN_REQUIRED'), false);
  });

  it('should correctly identify OTP allowed states', () => {
    assert.strictEqual(isOtpAllowedState('PICKED_UP'), true);
    assert.strictEqual(isOtpAllowedState('TO_DROPOFF'), true);
    assert.strictEqual(isOtpAllowedState('ARRIVED_DROPOFF'), true);
    assert.strictEqual(isOtpAllowedState('ARRIVED_PICKUP'), false);
    assert.strictEqual(isOtpAllowedState('DELIVERED'), false);
  });
});

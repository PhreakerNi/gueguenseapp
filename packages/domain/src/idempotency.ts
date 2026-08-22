/**
 * Deterministic JSON stringifier for canonical fingerprinting
 */
export function sortKeysRecursively(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursively);
  }
  const record = obj as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortKeysRecursively(record[key]);
  }
  return sorted;
}

/**
 * Computes canonical payload string representation
 */
export function computeCanonicalPayloadString(payload: unknown): string {
  return JSON.stringify(sortKeysRecursively(payload) ?? {});
}

/**
 * Cryptographically secure UUID v4 generator
 * Compatible with Node.js, Web Crypto, React Native / Expo Crypto
 */
export function generateCryptoUuid(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    const byte6 = bytes[6] ?? 0;
    const byte8 = bytes[8] ?? 0;
    bytes[6] = (byte6 & 0x0f) | 0x40;
    bytes[8] = (byte8 & 0x3f) | 0x80;
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error(
    "Cryptographically secure random number generator is unavailable in this environment",
  );
}

/**
 * Idempotent Intent Manager
 * Tracks action + semantic payload across network retries.
 * Reuses the same key if the semantic intent is identical, generates a new key if the payload changes,
 * and clears the key upon successful completion.
 */
export class IdempotentIntentManager {
  private currentAction: string | null = null;
  private currentPayloadCanonical: string | null = null;
  private currentKey: string | null = null;

  /**
   * Retrieves active key or creates a new key if action or semantic payload changed.
   */
  public getOrCreateKey(action: string, payload: unknown): string {
    const canonical = computeCanonicalPayloadString(payload);
    if (
      this.currentKey &&
      this.currentAction === action &&
      this.currentPayloadCanonical === canonical
    ) {
      return this.currentKey;
    }

    const newKey = generateCryptoUuid();
    this.currentAction = action;
    this.currentPayloadCanonical = canonical;
    this.currentKey = newKey;
    return newKey;
  }

  /**
   * Clears stored key upon successful execution or user reset.
   */
  public clear(action?: string): void {
    if (!action || this.currentAction === action) {
      this.currentAction = null;
      this.currentPayloadCanonical = null;
      this.currentKey = null;
    }
  }

  /**
   * Checks if an active key exists for a given action and payload
   */
  public peekKey(): string | null {
    return this.currentKey;
  }
}

import { randomBytes } from "crypto";

/** Generate a short unique ID (12 hex chars = 6 bytes = 48 bits of entropy). */
export function generateId(): string {
  return randomBytes(6).toString("hex");
}

/** Generate a timestamped ID for sortable uniqueness: `{timestamp_ms}-{random}`. */
export function generateTimestampedId(): string {
  return `${Date.now()}-${generateId()}`;
}

/** Generate a deterministic ID from a string using SHA-256 (first 12 hex chars). */
export async function deterministicId(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

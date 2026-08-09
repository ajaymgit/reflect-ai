import crypto from "node:crypto";
import { env } from "../config/env.js";

// Field-level encryption at rest for sensitive user content (journal text,
// health metrics) using AES-256-GCM. This protects that data if the
// database itself is ever read directly -- a backup/dump leak, a
// misconfigured DB access control, a compromised DB host -- separately from
// (not instead of) normal application-layer access controls.
//
// Format stored in the DB: "v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>"
// The "v1:" prefix exists so a future algorithm/key change can be
// distinguished from old data. Values that DON'T start with a recognized
// version prefix are treated as legacy plaintext (see decryptField) rather
// than rejected -- this lets the app keep working on data written before
// this feature existed without a hard migration being required first (a
// migration script is provided separately to bring it fully up to date).

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV is the recommended/standard size for GCM

function getKey() {
  return Buffer.from(env.ENCRYPTION_KEY, "base64");
}

export function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === "") return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptField(stored) {
  if (stored === null || stored === undefined || stored === "") return stored;
  if (!stored.startsWith("v1:")) {
    // Legacy plaintext written before encryption existed, or already-decoded
    // data being passed through twice -- return unchanged rather than throw,
    // so old rows remain readable until migrated (see
    // scripts/migrate-encrypt-existing-data.js).
    return stored;
  }
  const parts = stored.split(":");
  if (parts.length !== 4) return stored;
  const [, ivB64, authTagB64, ciphertextB64] = parts;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (err) {
    // A wrong/rotated ENCRYPTION_KEY or corrupted data would land here.
    // Failing loudly (rather than silently returning garbage/ciphertext) is
    // deliberate -- surfacing this as an error is safer than displaying
    // corrupted or undecryptable content as if it were real.
    throw new Error("Failed to decrypt stored field -- ENCRYPTION_KEY may be wrong or the data is corrupted.");
  }
}

// Helpers for fields that are logically arrays (tags, themes) but stored as
// a single encrypted blob -- JSON-serialize the whole array, then encrypt
// the resulting string as one unit, rather than encrypting each element
// individually (simpler, and avoids per-element Mongoose array-getter
// quirks).
export function encryptArrayField(arr) {
  if (arr === null || arr === undefined) return arr;
  return encryptField(JSON.stringify(arr));
}

export function decryptArrayField(stored) {
  if (stored === null || stored === undefined || stored === "") return [];
  const json = decryptField(stored);
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

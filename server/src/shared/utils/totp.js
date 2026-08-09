import crypto from "node:crypto";

// A from-scratch RFC 4226 (HOTP) / RFC 6238 (TOTP) implementation using only
// Node's built-in crypto module -- no otplib/speakeasy dependency. This
// sandbox's npm registry access returned a hard 403 when adding a package
// for the previous risk (Resend), so rather than assume the user's own
// machine can install packages either, 2FA is implemented with zero new
// dependencies. The algorithm is short and fully specified by the RFCs, so
// there's nothing "home-grown" about the crypto itself -- just no wrapper
// library around it.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// A fresh, random 160-bit (20 byte) shared secret -- the standard size used
// by Google Authenticator, Authy, 1Password, etc.
export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBase32, counter, { digits = 6 } = {}) {
  const key = base32Decode(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  // Counter is a 64-bit big-endian integer. Node's bigint support makes this
  // exact even though JS numbers alone can't safely hold a full 64-bit value.
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binaryCode % 10 ** digits).padStart(digits, "0");
}

// step: the time-slice size in seconds (30s is the near-universal default
// every authenticator app assumes). window: how many steps of clock drift
// either direction to tolerate -- 1 means the previous/current/next 30s
// window all validate, giving ~30-60s of slack for phone/server clock skew.
export function verifyTotp(secretBase32, token, { step = 30, digits = 6, window = 1, timestamp = Date.now() } = {}) {
  if (!secretBase32 || !token || !/^\d{6,8}$/.test(String(token).trim())) return false;
  const cleanToken = String(token).trim();
  const counter = Math.floor(timestamp / 1000 / step);

  for (let errorWindow = -window; errorWindow <= window; errorWindow += 1) {
    const candidate = hotp(secretBase32, counter + errorWindow, { digits });
    // Constant-time comparison so a timing side-channel can't leak how many
    // leading digits of a guess were correct.
    if (
      candidate.length === cleanToken.length &&
      crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(cleanToken))
    ) {
      return true;
    }
  }
  return false;
}

export function buildOtpauthUri({ secretBase32, accountName, issuer = "ReflectAI" }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// One-time backup/recovery codes, issued when 2FA is first enabled, so
// losing the authenticator device doesn't lock someone out of their
// account. Human-friendly format (e.g. "7f3a-9c1e"), generated with
// crypto.randomBytes for unpredictability.
export function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export function hashBackupCode(code) {
  return crypto.createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

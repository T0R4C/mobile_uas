const MIN_ITERATIONS = 150000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function ensureIterations(iterations) {
  const value = Number(iterations) || MIN_ITERATIONS;
  return Math.max(value, MIN_ITERATIONS);
}

export async function deriveKey(masterPassword, saltB64, iterations = MIN_ITERATIONS) {
  const salt = saltB64 ? fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const normalizedIterations = ensureIterations(iterations);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: normalizedIterations,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return {
    key,
    saltB64: toBase64(salt),
    iterations: normalizedIterations,
  };
}

export async function encryptText(key, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plain)
  );
  const cipherBytes = new Uint8Array(cipherBuffer);
  return `${toBase64(iv)}.${toBase64(cipherBytes)}`;
}

export async function decryptText(key, packed) {
  if (!packed) {
    return "";
  }
  const [ivB64, cipherB64] = packed.split(".");
  if (!ivB64 || !cipherB64) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = fromBase64(ivB64);
  const cipherBytes = fromBase64(cipherB64);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherBytes
  );
  return decoder.decode(plainBuffer);
}

export function uuid() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function genPassword(length = 16) {
  const size = Math.max(Number(length) || 16, 12);
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let result = "";
  for (let i = 0; i < size; i += 1) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

import type { CredentialSecret } from "@delft/types";

// All Credentials Manager crypto lives here: PBKDF2 key derivation, AES-GCM encrypt/decrypt of a
// credential's {username, password, notes} payload, and a password generator. The derived key is
// never persisted (see vault/VaultKeyContext.tsx) and the server only ever stores/returns
// ciphertext — this module is the entire client-side trust boundary.

// Current OWASP-recommended minimum for PBKDF2-HMAC-SHA256 (2023 guidance). Deliberately not
// configurable — bumping it later would strand existing ciphertext derived at the old count
// unless a re-encrypt migration is also written, so this is a one-way door.
const PBKDF2_ITERATIONS = 310_000;
const AES_KEY_LENGTH = 256;
const IV_BYTES = 12; // standard AES-GCM nonce size

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

export function generateSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

// Non-extractable: the raw key bytes can never leave the CryptoKey handle, even via a bug that
// tries to serialize it (e.g. accidentally logging it, or a future localStorage caching mistake).
export async function deriveVaultKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(saltB64) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(
  key: CryptoKey,
  secret: CredentialSecret,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(secret));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv) };
}

// Throws (AES-GCM's built-in auth tag fails to verify) if `key` was derived from the wrong
// passphrase, or the ciphertext/iv is corrupted — that failure IS the passphrase check, since
// there's no server-side way to verify a passphrase the server never sees.
export async function decryptSecret(
  key: CryptoKey,
  ciphertextB64: string,
  ivB64: string,
): Promise<CredentialSecret> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) as BufferSource },
    key,
    fromBase64(ciphertextB64) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as CredentialSecret;
}

export interface GeneratePasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
}

const CHARSETS = {
  uppercase: "ABCDEFGHJKLMNPQRSTUVWXYZ", // no I/O — easily confused with 1/0
  lowercase: "abcdefghijkmnpqrstuvwxyz",
  digits: "23456789",
  symbols: "!@#$%^&*-_=+?",
};

export function generatePassword(options: GeneratePasswordOptions): string {
  const alphabet = (["uppercase", "lowercase", "digits", "symbols"] as const)
    .filter((key) => options[key])
    .map((key) => CHARSETS[key])
    .join("");
  if (!alphabet) throw new Error("Select at least one character set.");

  const randomValues = crypto.getRandomValues(new Uint32Array(options.length));
  return Array.from(randomValues, (value) => alphabet.charAt(value % alphabet.length)).join("");
}

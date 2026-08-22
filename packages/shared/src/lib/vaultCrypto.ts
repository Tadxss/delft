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
export async function deriveVaultKey(
  passphrase: string,
  saltB64: string,
): Promise<CryptoKey> {
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
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
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

// A fixed marker, not a secret — its plaintext content never matters, only whether decrypting it
// with a given key succeeds. Lets a passphrase be verified (workspaces.vault_verifier/_iv) even
// when the vault has zero credentials yet to test-decrypt against instead.
const VERIFIER_PLAINTEXT = "delft-vault-verifier";

export async function encryptVerifier(
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(VERIFIER_PLAINTEXT);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv) };
}

// Throws (same AES-GCM auth-tag failure as decryptSecret) if `key` doesn't match the key the
// verifier was encrypted with. The decrypted plaintext itself is discarded on success — a
// successful decrypt is sufficient proof the passphrase is correct.
export async function verifyVaultKey(
  key: CryptoKey,
  ciphertextB64: string,
  ivB64: string,
): Promise<void> {
  await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) as BufferSource },
    key,
    fromBase64(ciphertextB64) as BufferSource,
  );
}

// Wrapped-master-key primitives: instead of the passphrase-derived key directly encrypting every
// credential, a random Vault Master Key (VMK) does that, and the VMK itself is wrapped (AES-GCM
// encrypted) under two independent factors — the passphrase-derived key, and a recovery key.
// Either factor alone can unwrap the VMK, which is what makes a "forgot passphrase" flow possible
// without losing data: there's now a shared secret (the VMK) two different unlock paths can both
// reach, where before the passphrase-derived key WAS the only key, with nothing else able to open
// what it encrypted.

// `extractable: true` is deliberate and narrow — the only reason this file ever creates an
// extractable key. The raw bytes need to be exportable exactly once, to wrap them under Kp/Kr
// below; they're never logged or handed to anything but wrapVaultMasterKey. Every *working* key
// this file hands back to a caller (this function's own generated key never is one) stays
// non-extractable, same as deriveVaultKey/unwrapVaultMasterKey.
export async function generateVaultMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
}

// Encrypts the VMK's raw bytes under a wrapping key (either a passphrase-derived Kp or a
// recovery-key-derived Kr) — reuses the same AES-GCM primitive as encryptSecret rather than
// WebCrypto's separate wrapKey/unwrapKey APIs, so this file has one crypto primitive family, not
// two.
export async function wrapVaultMasterKey(
  vmk: CryptoKey,
  wrappingKey: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const raw = await crypto.subtle.exportKey("raw", vmk);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    raw,
  );
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv) };
}

// Throws (AES-GCM auth-tag failure) if `wrappingKey` doesn't match the key the VMK was wrapped
// with — this failure IS the "wrong passphrase"/"wrong recovery key" check going forward,
// replacing verifyVaultKey for any vault that has a wrapped key.
//
// `extractable` defaults to false, restoring the invariant that the key actually held in
// VaultKeyContext for the rest of a normal unlock session can never have its raw bytes read back
// out. ForgotPassphrasePanel.tsx is the one caller that passes `true`: it recovers the VMK via the
// recovery key specifically in order to immediately re-wrap it (wrapVaultMasterKey, which needs
// exportKey) under a freshly chosen passphrase — a non-extractable key would make that re-wrap
// throw. That session's in-memory key stays extractable for the rest of that unlock; the next
// normal passphrase unlock goes through the default (non-extractable) path again.
export async function unwrapVaultMasterKey(
  ciphertextB64: string,
  ivB64: string,
  wrappingKey: CryptoKey,
  extractable = false,
): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) as BufferSource },
    wrappingKey,
    fromBase64(ciphertextB64) as BufferSource,
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", extractable, [
    "encrypt",
    "decrypt",
  ]);
}

// Crockford's Base32 alphabet — no I/L/O/U, avoids confusion with 1/0 and reduces accidental
// profanity, the same reasoning generatePassword's CHARSETS already applies to its own alphabets.
const RECOVERY_KEY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
// 32 bytes so the decoded key material is exactly a valid AES-256 raw key length (16/24/32 are the
// only lengths WebCrypto's AES-GCM importKey accepts) — no separate "is this a usable key length"
// step needed anywhere this gets consumed.
const RECOVERY_KEY_BYTES = 32;
const RECOVERY_KEY_GROUP_SIZE = 5;

// Real base32 bit-packing (5 bits per character, spanning byte boundaries) — NOT "one character
// per byte", which would only ever encode 5 of each byte's 8 bits and silently truncate/corrupt
// the key. Mirrors toBase64/fromBase64's role for base64 elsewhere in this file.
function bytesToBase32(bytes: Uint8Array): string {
  let bitBuffer = 0;
  let bitCount = 0;
  let output = "";
  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      output += RECOVERY_KEY_ALPHABET[(bitBuffer >>> bitCount) & 0x1f];
    }
  }
  if (bitCount > 0) {
    output += RECOVERY_KEY_ALPHABET[(bitBuffer << (5 - bitCount)) & 0x1f];
  }
  return output;
}

function base32ToBytes(str: string): Uint8Array {
  let bitBuffer = 0;
  let bitCount = 0;
  const bytes: number[] = [];
  for (const char of str) {
    const value = RECOVERY_KEY_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bitBuffer = (bitBuffer << 5) | value;
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bitBuffer >>> bitCount) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// A high-entropy, one-time-shown recovery key, formatted for a human to transcribe/store — e.g.
// `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XX`. Unlike a passphrase, this is
// already random, so it's used directly as key material via deriveRecoveryKeyMaterial below
// rather than run through PBKDF2 — iterated slow-hashing only defends against guessing a
// low-entropy human secret, and would just need yet another salt column for no benefit here.
export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_KEY_BYTES));
  const encoded = bytesToBase32(bytes);
  const groups: string[] = [];
  for (let i = 0; i < encoded.length; i += RECOVERY_KEY_GROUP_SIZE) {
    groups.push(encoded.slice(i, i + RECOVERY_KEY_GROUP_SIZE));
  }
  return groups.join("-");
}

// Normalizes user-entered recovery key text (strips whitespace/dashes, uppercases, decodes) and
// imports the recovered 32 bytes directly as an AES-GCM key — no PBKDF2/salt, see
// generateRecoveryKey's comment above. Any input deterministically produces *some* key (the
// trailing partial-byte padding bits base32 encoding leaves are simply dropped by base32ToBytes,
// same on encode and decode, so a correctly-typed key round-trips exactly); a mismatched recovery
// key is caught the same way a wrong passphrase is, by unwrapVaultMasterKey's decrypt failing its
// auth-tag check, not by anything in this function.
export async function deriveRecoveryKeyMaterial(
  recoveryKeyString: string,
): Promise<CryptoKey> {
  const normalized = recoveryKeyString.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const bytes = base32ToBytes(normalized);
  return crypto.subtle.importKey(
    "raw",
    bytes as BufferSource,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
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
  return Array.from(randomValues, (value) =>
    alphabet.charAt(value % alphabet.length),
  ).join("");
}

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function str2ab(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

function ab2str(ab: ArrayBuffer): string {
  return new TextDecoder().decode(ab);
}

function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function salt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

async function deriveKey(password: string, s: ArrayBuffer, extractable = false): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', str2ab(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(s), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, str2ab(plaintext));
  const out = new Uint8Array(IV_BYTES + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), IV_BYTES);
  return b64encode(out.buffer);
}

export async function decrypt(key: CryptoKey, payload: string): Promise<string> {
  const raw = b64decode(payload);
  const iv = raw.slice(0, IV_BYTES);
  const ct = raw.slice(IV_BYTES);
  return ab2str(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
}

const VERIFY_TEXT = 'opnjrnl-v1';

export async function setupEncryption(password: string): Promise<{
  encryptionSalt: string;
  verifyToken: string;
}> {
  const encryptionSalt = salt();
  const key = await deriveKey(password, encryptionSalt.buffer as ArrayBuffer);
  const verifyToken = await encrypt(key, VERIFY_TEXT);
  return { encryptionSalt: b64encode(encryptionSalt.buffer as ArrayBuffer), verifyToken };
}

export async function tryUnlock(
  password: string,
  encryptionSaltB64: string,
  verifyToken: string,
): Promise<CryptoKey | null> {
  try {
    const saltBytes = b64decode(encryptionSaltB64);
    const key = await deriveKey(password, saltBytes.buffer as ArrayBuffer);
    const result = await decrypt(key, verifyToken);
    return result === VERIFY_TEXT ? key : null;
  } catch {
    return null;
  }
}

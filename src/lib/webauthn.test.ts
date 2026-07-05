import { describe, it, expect } from 'vitest';

function bufferToBase64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(base64url: string) {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output.buffer;
}

describe('WebAuthn buffer utilities', () => {
  it('round-trips a simple byte array', () => {
    const original = new Uint8Array([0x00, 0x01, 0x02, 0x7F, 0x80, 0xFF]);
    const encoded = bufferToBase64url(original.buffer);
    const decoded = new Uint8Array(base64urlToBuffer(encoded));
    expect(Array.from(decoded)).toEqual([0x00, 0x01, 0x02, 0x7F, 0x80, 0xFF]);
  });

  it('round-trips a 32-byte challenge', () => {
    const original = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      original[i] = i;
    }
    const encoded = bufferToBase64url(original.buffer);
    const decoded = new Uint8Array(base64urlToBuffer(encoded));
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('round-trips random data', () => {
    const original = new Uint8Array(64);
    crypto.getRandomValues(original);
    const encoded = bufferToBase64url(original.buffer);
    const decoded = new Uint8Array(base64urlToBuffer(encoded));
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('produces URL-safe base64 (no + / or =)', () => {
    const data = new Uint8Array([251, 252, 253, 254, 255]);
    const encoded = bufferToBase64url(data.buffer);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('handles empty buffer', () => {
    const original = new Uint8Array([]);
    const encoded = bufferToBase64url(original.buffer);
    expect(encoded).toBe('');
    const decoded = new Uint8Array(base64urlToBuffer(encoded));
    expect(decoded.length).toBe(0);
  });

  it('handles base64url strings without padding', () => {
    const result = base64urlToBuffer('AAECf4D_');
    const bytes = new Uint8Array(result);
    expect(Array.from(bytes)).toEqual([0x00, 0x01, 0x02, 0x7F, 0x80, 0xFF]);
  });
});

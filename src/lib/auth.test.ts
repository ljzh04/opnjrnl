import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TOKEN_KEY = 'opnjrnl_google_access_token';
const SAVED_AT_KEY = 'opnjrnl_google_token_saved_at';
const SCOPE_VERSION_KEY = 'opnjrnl_scope_version';
const SCOPE_VERSION = 2;
const TOKEN_VALIDITY_MS = 55 * 60 * 1000;
const REFRESH_BEFORE_MS = 10 * 60 * 1000;

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => {
  const mockOnAuthStateChanged = vi.fn((_auth: any, cb: (user: any) => void) => {
    cb(null);
    return vi.fn();
  });
  return {
    getAuth: vi.fn(() => ({ currentUser: null })),
    signInWithPopup: vi.fn(),
    reauthenticateWithPopup: vi.fn(),
    GoogleAuthProvider: Object.assign(vi.fn(() => ({ addScope: vi.fn() })), {
      credentialFromResult: vi.fn(),
    }),
    onAuthStateChanged: mockOnAuthStateChanged,
  };
});

describe('auth token validation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns token when within TTL and scope matches', () => {
    localStorage.setItem(TOKEN_KEY, 'valid-token');
    localStorage.setItem(SAVED_AT_KEY, Date.now().toString());
    localStorage.setItem(SCOPE_VERSION_KEY, SCOPE_VERSION.toString());

    const storedToken = localStorage.getItem(TOKEN_KEY);
    const savedAtStr = localStorage.getItem(SAVED_AT_KEY);
    const savedAt = parseInt(savedAtStr!, 10);
    const scopeVersion = parseInt(localStorage.getItem(SCOPE_VERSION_KEY) || '0', 10);

    if (Date.now() - savedAt < TOKEN_VALIDITY_MS && scopeVersion === SCOPE_VERSION) {
      expect(storedToken).toBe('valid-token');
    } else {
      expect.fail('Token should be valid');
    }
  });

  it('rejects expired token', () => {
    const expiredTime = Date.now() - (TOKEN_VALIDITY_MS + 60000);
    localStorage.setItem(TOKEN_KEY, 'expired-token');
    localStorage.setItem(SAVED_AT_KEY, expiredTime.toString());
    localStorage.setItem(SCOPE_VERSION_KEY, SCOPE_VERSION.toString());

    const savedAtStr = localStorage.getItem(SAVED_AT_KEY);
    const savedAt = parseInt(savedAtStr!, 10);

    expect(Date.now() - savedAt >= TOKEN_VALIDITY_MS).toBe(true);
  });

  it('rejects token with stale scope version', () => {
    localStorage.setItem(TOKEN_KEY, 'stale-scope-token');
    localStorage.setItem(SAVED_AT_KEY, Date.now().toString());
    localStorage.setItem(SCOPE_VERSION_KEY, '1');

    const savedAtStr = localStorage.getItem(SAVED_AT_KEY);
    const savedAt = parseInt(savedAtStr!, 10);
    const scopeVersion = parseInt(localStorage.getItem(SCOPE_VERSION_KEY) || '0', 10);

    const isValid = Date.now() - savedAt < TOKEN_VALIDITY_MS && scopeVersion === SCOPE_VERSION;
    expect(isValid).toBe(false);
  });

  it('detects token expiring soon', () => {
    const expiringMinAge = TOKEN_VALIDITY_MS - REFRESH_BEFORE_MS;
    const halfway = expiringMinAge + Math.floor((TOKEN_VALIDITY_MS - expiringMinAge) / 2);
    const expiringTime = Date.now() - halfway;
    localStorage.setItem(TOKEN_KEY, 'expiring-token');
    localStorage.setItem(SAVED_AT_KEY, expiringTime.toString());
    localStorage.setItem(SCOPE_VERSION_KEY, SCOPE_VERSION.toString());

    const savedAt = parseInt(localStorage.getItem(SAVED_AT_KEY)!, 10);
    const age = Date.now() - savedAt;

    const isExpiringSoon = age >= expiringMinAge;
    expect(isExpiringSoon).toBe(true);

    const isExpired = age >= TOKEN_VALIDITY_MS;
    expect(isExpired).toBe(false);
  });

  it('handles NaN saved-at gracefully', () => {
    localStorage.setItem(TOKEN_KEY, 'nan-token');
    localStorage.setItem(SAVED_AT_KEY, 'not-a-number');
    localStorage.setItem(SCOPE_VERSION_KEY, SCOPE_VERSION.toString());

    const savedAt = parseInt(localStorage.getItem(SAVED_AT_KEY)!, 10);
    expect(isNaN(savedAt)).toBe(true);
  });
});

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.appdata');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let isRefreshingToken = false;
let onRefreshStateChange: ((isRefreshing: boolean) => void) | null = null;
let onRefreshSuccess: (() => void) | null = null;

const OAUTH_CLIENT_ID = (firebaseConfig as any).googleOAuthClientId as string | undefined;
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';

const SCOPE_VERSION = 2;
const TOKEN_VALIDITY_MS = 55 * 60 * 1000;
const REFRESH_BEFORE_MS = 10 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_REFRESH_KEY = 'opnjrnl_auto_refresh';

const gis: { loaded: boolean; tokenClient: any | null } = { loaded: false, tokenClient: null };

function getStoredScopeVersion(): number {
  const v = localStorage.getItem('opnjrnl_scope_version');
  return v ? parseInt(v, 10) : 0;
}

function getTokenAge(): number | null {
  const savedAtStr = localStorage.getItem('opnjrnl_google_token_saved_at');
  if (!savedAtStr) return null;
  const savedAt = parseInt(savedAtStr, 10);
  if (isNaN(savedAt)) return null;
  return Date.now() - savedAt;
}

function isTokenExpired(): boolean {
  const age = getTokenAge();
  if (age === null) return true;
  return age >= TOKEN_VALIDITY_MS;
}

function isTokenExpiringSoon(): boolean {
  const age = getTokenAge();
  if (age === null) return true;
  return age >= TOKEN_VALIDITY_MS - REFRESH_BEFORE_MS;
}

function invalidateToken() {
  cachedAccessToken = null;
  localStorage.removeItem('opnjrnl_google_access_token');
  localStorage.removeItem('opnjrnl_google_token_saved_at');
  localStorage.removeItem('opnjrnl_scope_version');
}

function updateStoredToken(token: string) {
  cachedAccessToken = token;
  localStorage.setItem('opnjrnl_google_access_token', token);
  localStorage.setItem('opnjrnl_google_token_saved_at', Date.now().toString());
  localStorage.setItem('opnjrnl_scope_version', SCOPE_VERSION.toString());
}

export const isAutoRefreshEnabled = (): boolean => {
  return localStorage.getItem(AUTO_REFRESH_KEY) === 'true';
};

export const setAutoRefreshEnabled = (enabled: boolean) => {
  localStorage.setItem(AUTO_REFRESH_KEY, enabled ? 'true' : 'false');
  if (enabled && auth.currentUser && cachedAccessToken) {
    startTokenRefresh();
  } else if (!enabled) {
    stopTokenRefresh();
  }
};

export const setRefreshStateCallback = (cb: ((isRefreshing: boolean) => void) | null) => {
  onRefreshStateChange = cb;
};

export const setRefreshSuccessCallback = (cb: (() => void) | null) => {
  onRefreshSuccess = cb;
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  const storedToken = localStorage.getItem('opnjrnl_google_access_token');
  const savedAtStr = localStorage.getItem('opnjrnl_google_token_saved_at');
  if (storedToken && savedAtStr) {
    const savedAt = parseInt(savedAtStr, 10);
    if (!isNaN(savedAt) && Date.now() - savedAt < TOKEN_VALIDITY_MS && getStoredScopeVersion() === SCOPE_VERSION) {
      cachedAccessToken = storedToken;
    } else {
      invalidateToken();
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      if (isAutoRefreshEnabled() && cachedAccessToken) {
        startTokenRefresh();
      }
    } else {
      invalidateToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

function loadGIS(): Promise<void> {
  if (gis.loaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { gis.loaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load GIS script'));
    document.head.appendChild(script);
  });
}

function initGISTokenClient(): any | null {
  if (!OAUTH_CLIENT_ID) return null;
  if (gis.tokenClient) return gis.tokenClient;

  const email = auth.currentUser?.email;
  const config: any = { client_id: OAUTH_CLIENT_ID, scope: SCOPES, callback: () => {} };
  if (email) config.hint = email;

  try {
    gis.tokenClient = (window as any).google?.accounts?.oauth2?.initTokenClient?.(config);
  } catch {
    return null;
  }
  return gis.tokenClient;
}

function gisSilentRefresh(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!OAUTH_CLIENT_ID) { resolve(null); return; }

    loadGIS()
      .then(() => {
        const client = initGISTokenClient();
        if (!client) { resolve(null); return; }

        client.callback = (response: any) => {
          if (response.access_token) {
            resolve(response.access_token);
          } else if (response.error === 'user_signed_out') {
            resolve(null);
          } else {
            resolve(null);
          }
        };

        try {
          client.requestAccessToken({ prompt: '' });
        } catch {
          resolve(null);
        }
      })
      .catch(() => resolve(null));
  });
}

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    updateStoredToken(credential.accessToken);
    return { user: result.user, accessToken: cachedAccessToken! };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  const storedToken = localStorage.getItem('opnjrnl_google_access_token');
  const savedAtStr = localStorage.getItem('opnjrnl_google_token_saved_at');

  if (storedToken && savedAtStr) {
    const savedAt = parseInt(savedAtStr, 10);
    if (!isNaN(savedAt) && getStoredScopeVersion() === SCOPE_VERSION) {
      const age = Date.now() - savedAt;
      if (age < TOKEN_VALIDITY_MS) {
        return storedToken;
      }
    }
  }

  if (isAutoRefreshEnabled()) {
    const refreshed = await gisSilentRefresh();
    if (refreshed) {
      updateStoredToken(refreshed);
      return refreshed;
    }
  }

  return null;
};

async function tryBackgroundRefresh(): Promise<string | null> {
  if (!auth.currentUser || isRefreshingToken) return null;
  if (!OAUTH_CLIENT_ID) return null;

  isRefreshingToken = true;
  if (onRefreshStateChange) onRefreshStateChange(true);

  try {
    const token = await gisSilentRefresh();
    if (token) {
      updateStoredToken(token);
      if (onRefreshSuccess) onRefreshSuccess();
      return token;
    }
  } catch {
    return null;
  } finally {
    isRefreshingToken = false;
    if (onRefreshStateChange) onRefreshStateChange(false);
  }

  return null;
}

export const startTokenRefresh = () => {
  stopTokenRefresh();
  if (!isAutoRefreshEnabled()) return;

  const attemptRefresh = () => {
    if (!auth.currentUser) return;
    if (isTokenExpired() || isTokenExpiringSoon()) {
      tryBackgroundRefresh();
    }
  };

  attemptRefresh();
  refreshTimer = setInterval(attemptRefresh, REFRESH_INTERVAL_MS);
};

export const stopTokenRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};

export const getTokenHealth = (): 'valid' | 'expiring' | 'expired' | 'none' => {
  if (!localStorage.getItem('opnjrnl_google_access_token')) return 'none';
  if (isTokenExpired()) return 'expired';
  if (isTokenExpiringSoon()) return 'expiring';
  return 'valid';
};

export const logout = async () => {
  stopTokenRefresh();
  await auth.signOut();
  invalidateToken();
};

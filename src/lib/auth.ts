import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.appdata');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  const storedToken = localStorage.getItem('opnjrnl_google_access_token');
  const savedAtStr = localStorage.getItem('opnjrnl_google_token_saved_at');
  if (storedToken && savedAtStr) {
    const savedAt = parseInt(savedAtStr, 10);
    // Is the token less than 50 minutes old? (Google OAuth tokens expire in 60 minutes)
    if (Date.now() - savedAt < 50 * 60 * 1000) {
      cachedAccessToken = storedToken;
    } else {
      cachedAccessToken = null;
      localStorage.removeItem('opnjrnl_google_access_token');
      localStorage.removeItem('opnjrnl_google_token_saved_at');
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      localStorage.removeItem('opnjrnl_google_access_token');
      localStorage.removeItem('opnjrnl_google_token_saved_at');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem('opnjrnl_google_access_token', cachedAccessToken);
    localStorage.setItem('opnjrnl_google_token_saved_at', Date.now().toString());
    return { user: result.user, accessToken: cachedAccessToken };
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
    if (Date.now() - savedAt < 50 * 60 * 1000) {
      return storedToken;
    }
  }
  return null;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem('opnjrnl_google_access_token');
  localStorage.removeItem('opnjrnl_google_token_saved_at');
};

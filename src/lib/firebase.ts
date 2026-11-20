import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onIdTokenChanged,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAAwr-8JDL6sZ3YIManSvKga63ZLYU89Rs',
  authDomain: 'lrockchat.firebaseapp.com',
  projectId: 'lrockchat',
  storageBucket: 'lrockchat.firebasestorage.app',
  messagingSenderId: '828863882096',
  appId: '1:828863882096:web:9a4a2bdc0e6e4a77b625b5',
  measurementId: 'G-TZ339WTLBB',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize analytics safely only in browser contexts where supported
if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch(() => {
      // Analytics is optional and may be blocked in sandboxed frames
    });
}

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onIdTokenChanged,
  type User,
};

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Please choose a password with at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please check your credentials and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in Firebase Authentication for this project yet.';
    case 'auth/network-request-failed':
      return 'Network error while reaching Firebase Authentication. Please check your connection.';
    default:
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return 'Authentication failed. Please try again.';
  }
}

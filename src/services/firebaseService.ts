import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

let app: FirebaseApp | null = null;

export const getFirebaseAuth = () => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase is not configured. Add your VITE_FIREBASE_* values in .env and restart the dev server.');
  }

  app ||= initializeApp(firebaseConfig);
  const auth = getAuth(app);
  void setPersistence(auth, browserLocalPersistence);
  return auth;
};

export const authService = {
  onChange(callback: (user: FirebaseUser | null) => void) {
    if (!isFirebaseConfigured) {
      callback(null);
      return () => undefined;
    }
    return onAuthStateChanged(getFirebaseAuth(), callback);
  },

  async signIn(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    return credential.user;
  },

  async createAccount(name: string, email: string, password: string) {
    const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    if (name.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() });
    }
    return credential.user;
  },

  async signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    const credential = await signInWithPopup(getFirebaseAuth(), provider);
    return credential.user;
  },

  async logout() {
    if (isFirebaseConfigured) await signOut(getFirebaseAuth());
  },
};

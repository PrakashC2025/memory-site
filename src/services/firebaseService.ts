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
    throw new Error('Firebase is not configured for this deployment. Add VITE_FIREBASE_* values in the hosting environment and redeploy.');
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
    // Ask for Drive access as part of the same Google sign-in. The returned
    // OAuth access token can be used by Memoriya without a second Drive button.
    provider.addScope('https://www.googleapis.com/auth/drive.readonly');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    const credential = await signInWithPopup(getFirebaseAuth(), provider);
    const googleCredential = GoogleAuthProvider.credentialFromResult(credential);
    return {
      user: credential.user,
      driveAccessToken: googleCredential?.accessToken,
    };
  },

  async logout() {
    if (isFirebaseConfigured) await signOut(getFirebaseAuth());
  },
};

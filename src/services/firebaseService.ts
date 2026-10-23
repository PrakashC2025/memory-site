import type { FirebaseApp } from 'firebase/app';
import type { User as FirebaseUser } from 'firebase/auth';

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
type FirebaseModules = typeof import('firebase/app') & typeof import('firebase/auth');
let firebaseModulesPromise: Promise<FirebaseModules> | null = null;

function loadFirebaseModules(): Promise<FirebaseModules> {
  firebaseModulesPromise ||= Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]).then(([appModule, authModule]) => ({ ...appModule, ...authModule }) as FirebaseModules);
  return firebaseModulesPromise;
}

export const getFirebaseAuth = async () => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase is not configured for this deployment. Add VITE_FIREBASE_* values in the hosting environment and redeploy.');
  }

  const { initializeApp, getAuth, setPersistence, browserLocalPersistence } = await loadFirebaseModules();
  app ||= initializeApp(firebaseConfig);
  const auth = getAuth(app);
  void setPersistence(auth, browserLocalPersistence);
  return auth;
};

export const authService = {
  async onChange(callback: (user: FirebaseUser | null) => void) {
    if (!isFirebaseConfigured) {
      callback(null);
      return () => undefined;
    }
    const [{ onAuthStateChanged }, auth] = await Promise.all([loadFirebaseModules(), getFirebaseAuth()]);
    return onAuthStateChanged(auth, callback);
  },

  async signIn(email: string, password: string) {
    const [{ signInWithEmailAndPassword }, auth] = await Promise.all([loadFirebaseModules(), getFirebaseAuth()]);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  },

  async createAccount(name: string, email: string, password: string) {
    const [{ createUserWithEmailAndPassword, updateProfile }, auth] = await Promise.all([loadFirebaseModules(), getFirebaseAuth()]);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (name.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() });
    }
    return credential.user;
  },

  async signInWithGoogle() {
    const [{ GoogleAuthProvider, signInWithPopup }, auth] = await Promise.all([loadFirebaseModules(), getFirebaseAuth()]);
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    // Ask for Drive access as part of the same Google sign-in. The returned
    // OAuth access token can be used by Memoriya without a second Drive button.
    provider.addScope('https://www.googleapis.com/auth/drive.readonly');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    const credential = await signInWithPopup(auth, provider);
    const googleCredential = GoogleAuthProvider.credentialFromResult(credential);
    return {
      user: credential.user,
      driveAccessToken: googleCredential?.accessToken,
    };
  },

  async logout() {
    if (isFirebaseConfigured) {
      const [{ signOut }, auth] = await Promise.all([loadFirebaseModules(), getFirebaseAuth()]);
      await signOut(auth);
    }
  },
};

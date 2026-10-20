import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '../data/memories';
import { authService, isFirebaseConfigured } from '../services/firebaseService';
import { clearDriveSession, saveDriveAccessToken } from '../services/driveLibrary';
import { googleDriveService } from '../services/googleDriveService';

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

interface UserContextType {
  user: User | null;
  setUser: (u: User | null) => void;
  authLoading: boolean;
  authError: string;
  firebaseReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  createAccount: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isMusicOn: boolean;
  setMusicOn: (v: boolean) => void;
  currentTrack: number;
  setCurrentTrack: (n: number) => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  authLoading: true,
  authError: '',
  firebaseReady: false,
  signIn: async () => {},
  createAccount: async () => {},
  signInWithGoogle: async () => {},
  logout: async () => {},
  isMusicOn: false,
  setMusicOn: () => {},
  currentTrack: 0,
  setCurrentTrack: () => {},
});

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => isFirebaseConfigured ? null : {
    name: 'Memoriya Guest',
    email: 'guest@memoriya.local',
    driveConnected: false,
    accessLevel: 'owner',
    memorySpaceId: 'local-demo',
  });
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);
  const [authError, setAuthError] = useState('');
  const [isMusicOn, setMusicOn] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const idleTimerRef = useRef<number | null>(null);

  const mapFirebaseUser = useCallback((firebaseUser: import('firebase/auth').User): User => ({
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Memoriya User',
    email: firebaseUser.email || '',
    avatar: firebaseUser.photoURL || undefined,
    driveConnected: false,
    accessLevel: 'owner',
    memorySpaceId: firebaseUser.uid,
    authProvider: firebaseUser.providerData.some(provider => provider.providerId === 'google.com') ? 'google' : 'password',
  }), []);

  const logout = useCallback(async () => {
    setAuthError('');
    try {
      await authService.logout();
    } finally {
      clearDriveSession();
      setUser(null);
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (!user) return;
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      void logout();
    }, IDLE_TIMEOUT_MS);
  }, [logout, user]);

  useEffect(() => {
    let unsubscribe: () => void = () => {};
    try {
      if (!isFirebaseConfigured) {
        setAuthLoading(false);
        return unsubscribe;
      }
      unsubscribe = authService.onChange(firebaseUser => {
        const nextUser = firebaseUser ? mapFirebaseUser(firebaseUser) : null;
        setUser(nextUser);
        setAuthLoading(false);
        if (!nextUser) {
          clearDriveSession();
          return;
        }
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Firebase authentication failed to initialize.');
      setAuthLoading(false);
    }

    const fallback = window.setTimeout(() => {
      setAuthLoading(false);
    }, 3500);

    return () => {
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, [mapFirebaseUser]);

  useEffect(() => {
    if (!user) {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      return undefined;
    }

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'visibilitychange'];
    events.forEach(event => window.addEventListener(event, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      events.forEach(event => window.removeEventListener(event, resetIdleTimer));
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer, user]);

  const runAuth = async (task: () => Promise<import('firebase/auth').User>) => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const firebaseUser = await task();
      setUser(mapFirebaseUser(firebaseUser));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.');
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const signIn = (email: string, password: string) => runAuth(() => authService.signIn(email, password));
  const createAccount = (name: string, email: string, password: string) => runAuth(() => authService.createAccount(name, email, password));
  const signInWithGoogle = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const result = await authService.signInWithGoogle();
      if (user?.email && result.user.email && user.email !== result.user.email) clearDriveSession();
      setUser(mapFirebaseUser(result.user));
      googleDriveService.setLoginHint(result.user.email || undefined);
      if (result.driveAccessToken) saveDriveAccessToken(result.driveAccessToken);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Google authentication failed.');
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <UserContext.Provider
      value={{
        user,
        setUser,
        authLoading,
        authError,
        firebaseReady: isFirebaseConfigured,
        signIn,
        createAccount,
        signInWithGoogle,
        logout,
        isMusicOn,
        setMusicOn,
        currentTrack,
        setCurrentTrack,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);

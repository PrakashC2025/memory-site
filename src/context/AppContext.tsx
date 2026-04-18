// ─────────────────────────────────────────────
//  Memoriam — Global App Context
// ─────────────────────────────────────────────

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { User, MemorySpace, MediaFile, ThemeId, ViewMode } from '../types';
import { DEMO_MEMORY_SPACE, DEMO_USER } from '../data/demoMemories';
import { THEMES } from '../data/themes';

interface LightboxState {
  isOpen: boolean;
  mediaId: string | null;
  mediaList: string[];
}

interface AppState {
  // Auth
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Memory data
  memorySpace: MemorySpace | null;
  allMedia: MediaFile[];

  // UI state
  activeTheme: ThemeId;
  viewMode: ViewMode;
  lightbox: LightboxState;
  selectedYear: number | null;
  selectedEventId: string | null;
  searchQuery: string;
  isMusicEnabled: boolean;
  animationIntensity: 'subtle' | 'medium' | 'full';
  isDriveConnected: boolean;

  // Actions
  login: (email: string) => void;
  logout: () => void;
  connectDrive: () => void;
  setTheme: (theme: ThemeId) => void;
  setViewMode: (mode: ViewMode) => void;
  openLightbox: (mediaId: string, mediaList?: string[]) => void;
  closeLightbox: () => void;
  nextLightboxMedia: () => void;
  prevLightboxMedia: () => void;
  setSelectedYear: (year: number | null) => void;
  setSelectedEvent: (eventId: string | null) => void;
  toggleFavorite: (mediaId: string) => void;
  togglePin: (mediaId: string) => void;
  setSearchQuery: (q: string) => void;
  toggleMusic: () => void;
  setAnimationIntensity: (v: 'subtle' | 'medium' | 'full') => void;
  getMediaById: (id: string) => MediaFile | undefined;
  getFilteredMedia: () => MediaFile[];
}

const AppContext = createContext<AppState | null>(null);

// Allowed emails – in production, check against backend
const ALLOWED_EMAILS = ['demo@memoriam.app', 'test@memoriam.app', 'friend@example.com'];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [memorySpace, setMemorySpace] = useState<MemorySpace | null>(null);
  const [allMedia, setAllMedia] = useState<MediaFile[]>([]);
  const [activeTheme, setActiveTheme] = useState<ThemeId>('warm-nostalgia');
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [lightbox, setLightbox] = useState<LightboxState>({ isOpen: false, mediaId: null, mediaList: [] });
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMusicEnabled, setIsMusicEnabled] = useState(false);
  const [animationIntensity, setAnimationIntensity] = useState<'subtle' | 'medium' | 'full'>('full');
  const [isDriveConnected, setIsDriveConnected] = useState(false);

  // Apply theme to document
  useEffect(() => {
    const theme = THEMES[activeTheme];
    document.documentElement.setAttribute('data-theme', activeTheme);
    // Inject CSS variables
    const root = document.documentElement;
    root.style.setProperty('--color-primary', theme.colors.primary);
    root.style.setProperty('--color-secondary', theme.colors.secondary);
    root.style.setProperty('--color-accent', theme.colors.accent);
    root.style.setProperty('--color-bg', theme.colors.bg);
    root.style.setProperty('--color-text', theme.colors.text);
    root.style.setProperty('--color-glow', theme.colors.glow);
    root.style.setProperty('--color-border', theme.colors.border);
    document.body.style.background = theme.colors.bg;
    document.body.style.color = theme.colors.text;
  }, [activeTheme]);

  const login = useCallback((email: string) => {
    setIsLoading(true);
    setTimeout(() => {
      if (ALLOWED_EMAILS.includes(email.toLowerCase())) {
        const user = { ...DEMO_USER, email };
        setCurrentUser(user);
        setMemorySpace(DEMO_MEMORY_SPACE);
        setAllMedia(DEMO_MEMORY_SPACE.allMedia);
        setActiveTheme(user.preferences.theme);
        setViewMode(user.preferences.viewMode);
        setIsDriveConnected(user.driveConnected);
      } else {
        // In production, show access denied
        alert('Access denied. Your email is not authorized.');
      }
      setIsLoading(false);
    }, 1800); // Simulate auth
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
    setMemorySpace(null);
    setAllMedia([]);
    setIsDriveConnected(false);
    setLightbox({ isOpen: false, mediaId: null, mediaList: [] });
  }, []);

  const connectDrive = useCallback(() => {
    setIsLoading(true);
    // REAL INTEGRATION: Open Google OAuth popup here
    // window.open(`https://accounts.google.com/o/oauth2/auth?...`, '_blank')
    setTimeout(() => {
      setIsDriveConnected(true);
      setIsLoading(false);
    }, 2000);
  }, []);

  const setTheme = useCallback((theme: ThemeId) => {
    setActiveTheme(theme);
    if (currentUser) {
      setCurrentUser(prev => prev ? {
        ...prev, preferences: { ...prev.preferences, theme }
      } : null);
    }
  }, [currentUser]);

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const openLightbox = useCallback((mediaId: string, mediaList?: string[]) => {
    setLightbox({ isOpen: true, mediaId, mediaList: mediaList || [mediaId] });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox({ isOpen: false, mediaId: null, mediaList: [] });
  }, []);

  const nextLightboxMedia = useCallback(() => {
    setLightbox(prev => {
      if (!prev.mediaId || prev.mediaList.length === 0) return prev;
      const idx = prev.mediaList.indexOf(prev.mediaId);
      const nextIdx = (idx + 1) % prev.mediaList.length;
      return { ...prev, mediaId: prev.mediaList[nextIdx] };
    });
  }, []);

  const prevLightboxMedia = useCallback(() => {
    setLightbox(prev => {
      if (!prev.mediaId || prev.mediaList.length === 0) return prev;
      const idx = prev.mediaList.indexOf(prev.mediaId);
      const prevIdx = (idx - 1 + prev.mediaList.length) % prev.mediaList.length;
      return { ...prev, mediaId: prev.mediaList[prevIdx] };
    });
  }, []);

  const toggleFavorite = useCallback((mediaId: string) => {
    setAllMedia(prev => prev.map(m => m.id === mediaId ? { ...m, isFavorite: !m.isFavorite } : m));
  }, []);

  const togglePin = useCallback((mediaId: string) => {
    setAllMedia(prev => prev.map(m => m.id === mediaId ? { ...m, isPinned: !m.isPinned } : m));
  }, []);

  const toggleMusic = useCallback(() => {
    setIsMusicEnabled(prev => !prev);
  }, []);

  const getMediaById = useCallback((id: string) => {
    return allMedia.find(m => m.id === id);
  }, [allMedia]);

  const getFilteredMedia = useCallback(() => {
    if (!searchQuery) return allMedia;
    const q = searchQuery.toLowerCase();
    return allMedia.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q)) ||
      m.customCaption?.toLowerCase().includes(q) ||
      m.mood?.toLowerCase().includes(q)
    );
  }, [allMedia, searchQuery]);

  const value: AppState = {
    currentUser, isAuthenticated: !!currentUser, isLoading,
    memorySpace, allMedia,
    activeTheme, viewMode: viewMode,
    lightbox, selectedYear, selectedEventId,
    searchQuery, isMusicEnabled, animationIntensity, isDriveConnected,
    login, logout, connectDrive,
    setTheme, setViewMode: handleSetViewMode,
    openLightbox, closeLightbox, nextLightboxMedia, prevLightboxMedia,
    setSelectedYear, setSelectedEvent: setSelectedEventId,
    toggleFavorite, togglePin,
    setSearchQuery, toggleMusic,
    setAnimationIntensity,
    getMediaById, getFilteredMedia,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppState => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

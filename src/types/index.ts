// ─────────────────────────────────────────────
//  Memoriam — Core Type Definitions
// ─────────────────────────────────────────────

export type MediaType = 'photo' | 'video' | 'audio';

export type MemoryMood =
  | 'joy'
  | 'nostalgia'
  | 'friendship'
  | 'family'
  | 'travel'
  | 'celebration'
  | 'farewell'
  | 'love'
  | 'adventure'
  | 'growth';

export type ThemeId =
  | 'warm-nostalgia'
  | 'dreamy-sky'
  | 'golden-evening'
  | 'moonlight'
  | 'blossom'
  | 'vintage'
  | 'minimal';

export type ViewMode = 'tree' | 'timeline' | 'story' | 'collage' | 'journey';

export interface MediaFile {
  id: string;
  name: string;
  type: MediaType;
  url: string;          // Google Drive / local URL
  thumbnailUrl: string;
  dateTaken: Date;
  dateCreated: Date;
  width?: number;
  height?: number;
  durationSeconds?: number;  // for video
  location?: GeoLocation;
  tags: string[];
  mood?: MemoryMood;
  isFavorite: boolean;
  isPinned: boolean;
  customCaption?: string;
  driveFileId?: string;       // real Drive integration
  driveWebContentLink?: string;
}

export interface GeoLocation {
  lat: number;
  lng: number;
  label?: string;  // "Paris, France"
}

export interface MemoryEvent {
  id: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  mood: MemoryMood;
  mediaIds: string[];
  isAutoDetected: boolean;
  tags: string[];
  coverMediaId?: string;
}

export interface MemoryMonth {
  year: number;
  month: number;          // 1–12
  label: string;          // "August 2022"
  mediaIds: string[];
  events: MemoryEvent[];
  highlightMediaId?: string;
}

export interface MemoryYear {
  year: number;
  label: string;
  months: MemoryMonth[];
  mediaCount: number;
  topMoods: MemoryMood[];
  coverMediaId?: string;
  chapterTitle?: string;  // "First Year of College"
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  isAllowed: boolean;
  driveConnected: boolean;
  driveAccessToken?: string;
  selectedFolders: string[];
  sharedSpaceIds: string[];
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: ThemeId;
  viewMode: ViewMode;
  animationIntensity: 'subtle' | 'medium' | 'full';
  musicEnabled: boolean;
  autoplayStory: boolean;
  language: string;
}

export interface MemorySpace {
  id: string;
  title: string;
  description?: string;
  ownerId: string;
  allowedEmails: string[];
  isPrivate: boolean;
  years: MemoryYear[];
  allMedia: MediaFile[];
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  coverMediaId?: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  emoji: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    bg: string;
    bgSecondary: string;
    text: string;
    textMuted: string;
    glow: string;
    border: string;
  };
  particleColor: string;
  treeStyle: 'golden' | 'cloud' | 'constellation' | 'blossom' | 'scrapbook' | 'minimal';
  backgroundClass: string;
  cardClass: string;
}

export interface StorySlide {
  mediaId: string;
  caption?: string;
  duration: number;  // ms
  transitionType: 'fade' | 'zoom' | 'slide' | 'blur' | 'dissolve';
}

export interface MemoryStats {
  totalPhotos: number;
  totalVideos: number;
  totalYears: number;
  totalEvents: number;
  mostActiveMonth: string;
  mostActiveYear: number;
  favoritesCount: number;
  earliestDate: Date;
  latestDate: Date;
}

export interface DriveFolder {
  id: string;
  name: string;
  mediaCount: number;
  isSelected: boolean;
}

// Google OAuth response shapes (simplified)
export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string;  // unique user id
}

export interface DriveApiFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  thumbnailLink?: string;
  webContentLink?: string;
  imageMediaMetadata?: {
    time?: string;
    location?: { latitude: number; longitude: number };
    width?: number;
    height?: number;
  };
  videoMediaMetadata?: {
    durationMillis?: string;
    width?: number;
    height?: number;
  };
}

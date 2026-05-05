import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarDays,
  Check,
  Cloud,
  Download,
  Grid3X3,
  Heart,
  Image,
  Images,
  MapPin,
  MessageCircle,
  Moon,
  Play,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Smile,
  Sparkles,
  Star,
  Sun,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import type { Memory } from '../data/memories';
import { DRIVE_SESSION_KEY } from '../services/driveLibrary';
import { googleDriveService, type DriveConnectionState, type DriveMediaFile } from '../services/googleDriveService';

type ViewMode = 'timeline' | 'places' | 'albums' | 'chat';
type ThemeMode = 'dark' | 'light';
type RealtimeState = 'connecting' | 'connected' | 'not-configured' | 'error';
type GalleryLayout = 'masonry' | 'collage' | 'mosaic' | 'compact';
type AlbumLayout = 'showcase' | 'filmstrip' | 'polaroid';

interface AlbumPreview {
  id: string;
  title: string;
  subtitle: string;
  memories: Memory[];
  tone: string;
}

interface ChatMessage {
  id: string;
  author: string;
  body: string;
  time: string;
  media?: Memory;
  reactions: string[];
  mine?: boolean;
}

const formatDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });
const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const CHAT_STORAGE_KEY = 'memoriya-chat-v2';
const DRIVE_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

interface DriveSessionSnapshot {
  accessToken: string;
  nextPageToken: string;
  importCount: number;
  memories: Memory[];
  savedAt: number;
}

const safeDate = (value?: string) => {
  const parsed = new Date(value || '');
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const readDriveSession = (): DriveSessionSnapshot | null => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return null;
    const snapshot = JSON.parse(stored) as DriveSessionSnapshot;
    if (!snapshot.accessToken || Date.now() - snapshot.savedAt > 55 * 60 * 1000) {
      window.sessionStorage.removeItem(DRIVE_SESSION_KEY);
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
};

const readStoredMessages = () => {
  try {
    window.localStorage.removeItem('memoriya-chat');
    const stored = window.localStorage.getItem(CHAT_STORAGE_KEY);
    return stored ? JSON.parse(stored) as ChatMessage[] : [];
  } catch {
    return [];
  }
};

const groupBy = <T,>(items: T[], getKey: (item: T) => string) =>
  items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    acc[key] = [...(acc[key] || []), item];
    return acc;
  }, {});

const buildAlbums = (memories: Memory[]): AlbumPreview[] => {
  const photos = memories.filter(memory => memory.type === 'photo');
  const videos = memories.filter(memory => memory.type === 'video');
  const photoFirst = (items: Memory[]) => [
    ...items.filter(memory => memory.type === 'photo'),
    ...items.filter(memory => memory.type === 'video'),
  ];
  const byEvent = Object.entries(groupBy(memories, memory => memory.event || 'Google Drive Import'))
    .filter(([, items]) => items.length > 1)
    .slice(0, 5)
    .map(([title, items], index) => ({
      id: `event-${title}`,
      title,
      subtitle: `${items.length} media items grouped from Drive metadata`,
      memories: photoFirst(items),
      tone: ['#6ee7f9', '#f9a8d4', '#fde68a', '#86efac', '#c4b5fd'][index % 5],
    }));

  const favorites = memories.filter(memory => memory.isFavorite);
  const latestPhotos = [...photos].sort((a, b) => safeDate(b.date).getTime() - safeDate(a.date).getTime()).slice(0, 12);
  const latestVideos = [...videos].sort((a, b) => safeDate(b.date).getTime() - safeDate(a.date).getTime()).slice(0, 12);
  const latestAll = photoFirst([...memories].sort((a, b) => safeDate(b.date).getTime() - safeDate(a.date).getTime())).slice(0, 16);

  return [
    { id: 'photos', title: 'Drive Photos', subtitle: `${photos.length} photo memories from your account`, memories: latestPhotos, tone: '#6ee7f9' },
    { id: 'videos', title: 'Drive Videos', subtitle: `${videos.length} videos with playable previews`, memories: latestVideos, tone: '#c4b5fd' },
    { id: 'recent', title: 'Recent Highlights', subtitle: 'Photo-first highlights from latest imports', memories: latestAll, tone: '#86efac' },
    { id: 'favorites', title: 'Starred', subtitle: `${favorites.length} favorite photos and videos`, memories: photoFirst(favorites), tone: '#fde68a' },
    ...byEvent,
  ].filter(album => album.memories.length > 0);
};

const Memoriya: React.FC = () => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ViewMode>('timeline');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [visibleCount, setVisibleCount] = useState(14);
  const [selected, setSelected] = useState<Memory | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(readStoredMessages);
  const [draft, setDraft] = useState('');
  const [galleryMemories, setGalleryMemories] = useState<Memory[]>(() => readDriveSession()?.memories || []);
  const [galleryLayout, setGalleryLayout] = useState<GalleryLayout>('masonry');
  const [albumLayout, setAlbumLayout] = useState<AlbumLayout>('showcase');
  const [importCount, setImportCount] = useState(() => readDriveSession()?.importCount || 0);
  const [driveAccessToken, setDriveAccessToken] = useState(() => readDriveSession()?.accessToken || '');
  const [driveNextPageToken, setDriveNextPageToken] = useState(() => readDriveSession()?.nextPageToken || '');
  const [loadingMoreDrive, setLoadingMoreDrive] = useState(false);
  const [driveState, setDriveState] = useState<DriveConnectionState>(() => {
    const snapshot = readDriveSession();
    return snapshot
      ? {
          connected: true,
          loading: false,
          folders: [{ id: 'drive-root', name: 'Google Drive Photos', mediaCount: snapshot.memories.length, selected: true }],
          accessToken: snapshot.accessToken,
          mode: 'google',
          message: `Restored ${snapshot.memories.length} Drive media items from this browser session.`,
        }
      : { connected: false, loading: false, folders: [] };
  });
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('not-configured');
  const [starred, setStarred] = useState(() => new Set<string>());
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const driveIdleTimerRef = useRef<number | null>(null);

  const filteredMemories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return galleryMemories;
    return galleryMemories.filter(memory =>
      [memory.title, memory.caption, memory.date, memory.location, memory.event, ...(memory.tags || [])]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle))
    );
  }, [galleryMemories, query]);

  const visibleMemories = filteredMemories.slice(0, visibleCount);
  const timelineGroups = useMemo(
    () => Object.entries(groupBy(visibleMemories, memory => monthLabel.format(safeDate(memory.date)))),
    [visibleMemories]
  );
  const placeGroups = useMemo(
    () => Object.entries(groupBy(filteredMemories, memory => memory.location || 'No GPS metadata')),
    [filteredMemories]
  );
  const albums = useMemo(() => buildAlbums(filteredMemories), [filteredMemories]);
  const favoriteCount = starred.size;

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_MEMORIYA_WS_URL || (window.location.hostname === 'localhost' ? 'ws://localhost:8787' : '');
    channelRef.current = new BroadcastChannel('memoriya-live-room');
    channelRef.current.onmessage = event => {
      const message = event.data as ChatMessage;
      setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]);
    };

    if (wsUrl) {
      setRealtimeState('connecting');
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      socket.onopen = () => setRealtimeState('connected');
      socket.onerror = () => setRealtimeState('error');
      socket.onclose = () => setRealtimeState(current => current === 'connected' ? 'error' : current);
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data) as ChatMessage;
          setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]);
        } catch {
          setRealtimeState('error');
        }
      };
    }

    return () => {
      channelRef.current?.close();
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (!driveAccessToken) {
      window.sessionStorage.removeItem(DRIVE_SESSION_KEY);
      return;
    }

    const snapshot: DriveSessionSnapshot = {
      accessToken: driveAccessToken,
      nextPageToken: driveNextPageToken,
      importCount,
      memories: galleryMemories,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify(snapshot));
  }, [driveAccessToken, driveNextPageToken, galleryMemories, importCount]);

  const disconnectDrive = () => {
    setGalleryMemories([]);
    setDriveAccessToken('');
    setDriveNextPageToken('');
    setImportCount(0);
    setSelected(null);
    setVisibleCount(14);
    setDriveState({
      connected: false,
      loading: false,
      folders: [],
      message: 'Google Drive disconnected.',
    });
    window.sessionStorage.removeItem(DRIVE_SESSION_KEY);
    if (driveIdleTimerRef.current) window.clearTimeout(driveIdleTimerRef.current);
  };

  const resetDriveIdleTimer = () => {
    if (!driveAccessToken) return;
    if (driveIdleTimerRef.current) window.clearTimeout(driveIdleTimerRef.current);
    driveIdleTimerRef.current = window.setTimeout(disconnectDrive, DRIVE_IDLE_TIMEOUT_MS);
  };

  useEffect(() => {
    if (!driveAccessToken) return undefined;

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'visibilitychange'];
    events.forEach(event => window.addEventListener(event, resetDriveIdleTimer, { passive: true }));
    resetDriveIdleTimer();

    return () => {
      events.forEach(event => window.removeEventListener(event, resetDriveIdleTimer));
      if (driveIdleTimerRef.current) window.clearTimeout(driveIdleTimerRef.current);
    };
  }, [driveAccessToken]);

  useEffect(() => {
    setVisibleCount(14);
  }, [query]);

  const appendDriveBatch = (files: DriveMediaFile[], accessToken: string) => {
    const importedBatch = files.filter(file => file.thumbnailUrl).map(file => googleDriveService.toMemory(file, accessToken));
    setGalleryMemories(current => {
      const ids = new Set(current.map(memory => memory.id));
      return [...current, ...importedBatch.filter(memory => !ids.has(memory.id))];
    });
    return importedBatch.length;
  };

  const loadDrivePage = async (accessToken = driveAccessToken, pageToken = driveNextPageToken) => {
    if (!accessToken || loadingMoreDrive) return;
    setLoadingMoreDrive(true);
    setDriveState(current => ({ ...current, loading: true, message: `Loading next Drive photos... ${importCount} loaded` }));
    try {
      const page = await googleDriveService.listMediaPage(accessToken, pageToken);
      const added = appendDriveBatch(page.files, accessToken);
      setDriveNextPageToken(page.nextPageToken || '');
      setImportCount(count => count + added);
      setDriveState(current => ({
        ...current,
        connected: true,
        loading: false,
        folders: current.folders.length ? [{ ...current.folders[0], mediaCount: importCount + added }] : current.folders,
        message: page.nextPageToken
          ? `Loaded ${importCount + added} Drive media items. Scroll to load more.`
          : `Loaded all visible Drive media (${importCount + added} items).`,
      }));
    } catch (error) {
      setDriveState(current => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Drive page load failed.',
      }));
    } finally {
      setLoadingMoreDrive(false);
    }
  };

  useEffect(() => {
    const node = loaderRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount(count => Math.min(count + 10, filteredMemories.length));
        if (driveNextPageToken && filteredMemories.length - visibleCount < 18) {
          void loadDrivePage();
        }
      }
    }, { rootMargin: '540px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [driveNextPageToken, filteredMemories.length, visibleCount]);

  const connectDrive = async () => {
    setDriveState(current => ({ ...current, loading: true, error: undefined, message: undefined }));
    setImportCount(0);
    try {
      const next = await googleDriveService.connect();
      const accessToken = next.accessToken || '';
      setDriveAccessToken(accessToken);
      setGalleryMemories([]);
      setVisibleCount(14);
      const page = await googleDriveService.listMediaPage(accessToken);
      const importedCount = appendDriveBatch(page.files, accessToken);
      setImportCount(importedCount);
      setDriveNextPageToken(page.nextPageToken || '');
      setDriveState({
        ...next,
        loading: false,
        folders: [{ ...next.folders[0], mediaCount: importedCount }],
        message: importedCount > 0
          ? `Loaded first ${importedCount} Drive media items. Scroll to load more.`
          : 'Google Drive connected, but no image or video files were found.',
      });
    } catch (error) {
      setDriveState(current => ({
        ...current,
        connected: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Drive connection failed.',
      }));
    }
  };

  const sendMessage = () => {
    const body = draft.trim();
    if (!body) return;
    const message: ChatMessage = {
      id: `m${Date.now()}`,
      author: 'You',
      body,
      time: new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
      reactions: [],
      media: selected || undefined,
      mine: true,
    };
    setMessages(current => [...current, message]);
    channelRef.current?.postMessage({ ...message, mine: false, author: 'Guest' });
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ ...message, mine: false }));
    }
    setDraft('');
  };

  const toggleStar = (id: string) => {
    setStarred(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={`memoriya-page memoriya-${theme}`}>
      <section className="memoriya-hero">
        <div className="memoriya-hero-copy">
          <span className="memoriya-kicker"><Sparkles size={15} /> Memoriya</span>
          <h1>Photos, albums, and conversations in one fast memory space.</h1>
          <p>Connect your real Google Drive, import your media, and share albums through a realtime messaging room.</p>
        </div>

        <div className="memoriya-hero-actions">
          {driveState.connected ? (
            <button className="memoriya-danger" onClick={disconnectDrive}>
              <Cloud size={16} /> Disconnect Drive
            </button>
          ) : (
            <button className="memoriya-primary" onClick={connectDrive} disabled={driveState.loading}>
              <Cloud size={16} /> {driveState.loading ? 'Connecting...' : 'Connect Drive'}
            </button>
          )}
          <button className="memoriya-icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle light mode">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </section>

      {(driveState.message || driveState.error) && (
        <div className={`memoriya-status ${driveState.error ? 'is-error' : ''}`}>
          <Cloud size={16} />
          <span>{driveState.error || driveState.message}</span>
        </div>
      )}

      <section className="memoriya-command">
        <label className="memoriya-searchbar">
          <Search size={18} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search imported Drive photos by date, filename, tag, event, or place" />
        </label>
        <div className="memoriya-tabs">
          {[
            { id: 'timeline', label: 'Timeline', Icon: CalendarDays },
            { id: 'places', label: 'Places', Icon: MapPin },
            { id: 'albums', label: 'Albums', Icon: Images },
            { id: 'chat', label: 'Chat', Icon: MessageCircle },
          ].map(item => (
            <button key={item.id} className={mode === item.id ? 'is-active' : ''} onClick={() => setMode(item.id as ViewMode)}>
              <item.Icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="memoriya-stats">
        {[
          { label: 'Photos indexed', value: galleryMemories.length, Icon: Image },
          { label: 'Drive OAuth', value: driveState.connected ? 'Google' : 'Required', Icon: ShieldCheck },
          { label: 'Chat presence', value: realtimeState === 'connected' ? 'Live' : 'Setup', Icon: Wifi },
          { label: driveState.loading ? 'Drive scanned' : 'Favorites', value: driveState.loading ? importCount : favoriteCount, Icon: Star },
        ].map(stat => (
          <div key={stat.label} className="memoriya-stat">
            <stat.Icon size={18} />
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </section>

      <main className="memoriya-shell">
        <aside className="memoriya-sidebar">
          <div className="memoriya-panel">
            <h2><Zap size={16} /> Smart albums</h2>
            {albums.length === 0 && <p className="memoriya-typing">Albums appear after Drive photos are imported.</p>}
            {albums.slice(0, 4).map(album => (
              <button key={album.id} className="memoriya-album-row" onClick={() => setMode('albums')}>
                <span style={{ background: album.tone }} />
                <div>
                  <strong>{album.title}</strong>
                  <small>{album.memories.length} items</small>
                </div>
              </button>
            ))}
          </div>

          <div className="memoriya-panel">
            <h2><Users size={16} /> Sharing room</h2>
            <div className="memoriya-presence">
              {['You', 'Live', 'Drive'].map((person, index) => (
                <span key={person} className={index === 0 ? 'is-you' : ''}>{person[0]}</span>
              ))}
            </div>
            <p className="memoriya-typing">
              {realtimeState === 'connected'
                ? 'Realtime server connected.'
                : 'Add VITE_MEMORIYA_WS_URL for multi-device realtime chat.'}
            </p>
          </div>
        </aside>

        <section className="memoriya-content">
          {mode === 'timeline' && (
            <div className="memoriya-timeline">
              {galleryMemories.length === 0 && (
                <EmptyState
                  title="No photos imported yet"
                  body="Connect Google Drive with a real OAuth client ID to scan and show your images. Memoriya will not show sample photos."
                  action={connectDrive}
                  loading={driveState.loading}
                />
              )}
              {timelineGroups.map(([label, memories]) => (
                <section key={label} className="memoriya-month">
                  <div className="memoriya-month-head">
                    <div>
                      <h2>{label}</h2>
                      <p>{memories.length} items grouped by capture date</p>
                    </div>
                    <div className="memoriya-layout-switcher">
                      {(['masonry', 'collage', 'mosaic', 'compact'] as GalleryLayout[]).map(layout => (
                        <button key={layout} className={galleryLayout === layout ? 'is-active' : ''} onClick={() => setGalleryLayout(layout)}>
                          <Grid3X3 size={15} /> {layout}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={`memoriya-gallery memoriya-gallery-${galleryLayout}`}>
                    {memories.map((memory, index) => (
                      <PhotoTile
                        key={memory.id}
                        memory={memory}
                        index={index}
                        starred={starred.has(memory.id)}
                        onOpen={setSelected}
                        onStar={toggleStar}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {galleryMemories.length > 0 && (
                <div ref={loaderRef} className="memoriya-loader">
                  {visibleCount < filteredMemories.length || driveNextPageToken
                    ? (loadingMoreDrive ? 'Loading next Drive photos...' : 'Scroll for more photos')
                    : 'End of timeline'}
                </div>
              )}
            </div>
          )}

          {mode === 'places' && (
            <div className="memoriya-place-grid">
              {placeGroups.length === 0 && (
                <EmptyState
                  title="No locations yet"
                  body="Photos with GPS metadata will be grouped here after a real Drive import."
                  action={connectDrive}
                  loading={driveState.loading}
                />
              )}
              {placeGroups.map(([place, memories]) => (
                <button key={place} className="memoriya-place-card" onClick={() => setSelected(memories[0])}>
                  <DriveImage memory={memories[0]} className="" />
                  <div>
                    <MapPin size={18} />
                    <h2>{place}</h2>
                    <p>{memories.length} photos with location metadata</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {mode === 'albums' && (
            <div className="memoriya-album-stage">
              {albums.length > 0 && (
                <div className="memoriya-album-toolbar">
                  {(['showcase', 'filmstrip', 'polaroid'] as AlbumLayout[]).map(layout => (
                    <button key={layout} className={albumLayout === layout ? 'is-active' : ''} onClick={() => setAlbumLayout(layout)}>
                      <Images size={15} /> {layout}
                    </button>
                  ))}
                </div>
              )}
              <div className={`memoriya-album-grid memoriya-album-${albumLayout}`}>
              {albums.length === 0 && (
                <EmptyState
                  title="No smart albums yet"
                  body="Albums are generated from your imported Drive dates, events, filenames, and metadata."
                  action={connectDrive}
                  loading={driveState.loading}
                />
              )}
              {albums.map(album => (
                <motion.button
                  key={album.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '160px' }}
                  whileHover={{ y: -6, scale: 1.01 }}
                  className="memoriya-album-card"
                  onClick={() => setSelected(album.memories[0])}
                >
                  <div className="memoriya-collage">
                    {album.memories.slice(0, 4).map(memory => <DriveImage key={memory.id} memory={memory} className="" />)}
                  </div>
                  <h2>{album.title}</h2>
                  <p>{album.subtitle}</p>
                  <span><Play size={14} /> Preview animation</span>
                </motion.button>
              ))}
              </div>
            </div>
          )}

          {mode === 'chat' && (
            <div className="memoriya-chat">
              <div className="memoriya-chat-head">
                <div>
                  <h2>Shared Memories</h2>
                  <p>{realtimeState === 'connected' ? 'Connected to realtime server' : 'Configure VITE_MEMORIYA_WS_URL for real multi-user chat'}</p>
                </div>
                <span><Check size={14} /> {realtimeState}</span>
              </div>

              <div className="memoriya-chat-stream">
                {messages.length === 0 && (
                  <div className="memoriya-chat-empty">
                    <MessageCircle size={24} />
                    <strong>No messages yet</strong>
                    <span>Messages will sync through your WebSocket server when configured.</span>
                  </div>
                )}
                {messages.map(message => (
                  <article key={message.id} className={`memoriya-message ${message.mine ? 'is-mine' : ''}`}>
                    <div className="memoriya-message-bubble">
                      <strong>{message.author} <span>{message.time}</span></strong>
                      <p>{message.body}</p>
                      {message.media && <DriveImage memory={message.media} className="" />}
                      <div className="memoriya-reactions">
                        {message.reactions.map(reaction => <span key={reaction}>{reaction}</span>)}
                        <button><Smile size={13} /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="memoriya-composer">
                <button aria-label="Attach selected photo"><Image size={18} /></button>
                <input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => event.key === 'Enter' && sendMessage()} placeholder="Message or share the selected photo" />
                <button onClick={sendMessage} aria-label="Send message"><Send size={18} /></button>
              </div>
            </div>
          )}
        </section>
      </main>

      {selected && (
        <div className="memoriya-lightbox" onClick={() => setSelected(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} onClick={event => event.stopPropagation()}>
            <DriveImage memory={selected} className="" preferFull />
            <aside>
              <h2>{selected.title}</h2>
              <p>{selected.caption}</p>
              <span>{formatDate.format(safeDate(selected.date))}{selected.location ? ` - ${selected.location}` : ''}</span>
              <div className="memoriya-lightbox-actions">
                <button onClick={() => toggleStar(selected.id)}><Heart size={16} /> {starred.has(selected.id) ? 'Starred' : 'Favorite'}</button>
                <button><Share2 size={16} /> Share</button>
                <button><Download size={16} /> Download</button>
              </div>
            </aside>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC<{
  title: string;
  body: string;
  loading: boolean;
  action: () => void;
}> = ({ title, body, loading, action }) => (
  <div className="memoriya-empty">
    <Cloud size={28} />
    <h2>{title}</h2>
    <p>{body}</p>
    <button className="memoriya-primary" onClick={action} disabled={loading}>
      <Cloud size={16} /> {loading ? 'Connecting...' : 'Connect Google Drive'}
    </button>
  </div>
);

const PhotoTile: React.FC<{
  memory: Memory;
  index: number;
  starred: boolean;
  onOpen: (memory: Memory) => void;
  onStar: (id: string) => void;
}> = ({ memory, index, starred, onOpen, onStar }) => (
  <motion.article
    initial={{ opacity: 0, y: 22, scale: 0.98 }}
    whileInView={{ opacity: 1, y: 0, scale: 1 }}
    viewport={{ once: true, margin: '160px' }}
    transition={{ duration: 0.35, delay: Math.min(index * 0.018, 0.18) }}
    className={`memoriya-tile memoriya-span-${(index % 5) + 1}`}
  >
    <button onClick={() => onOpen(memory)} className="memoriya-photo-button">
      <DriveImage memory={memory} className="" />
      <span className="memoriya-photo-meta">
        <strong>{memory.title}</strong>
        <small>{memory.location || memory.event}</small>
      </span>
    </button>
    <button className={`memoriya-star ${starred ? 'is-starred' : ''}`} onClick={() => onStar(memory.id)} aria-label="Toggle favorite">
      <Star size={15} />
    </button>
  </motion.article>
);

const DriveImage: React.FC<{ memory: Memory; className: string; preferFull?: boolean }> = ({ memory, className, preferFull }) => {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '420px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || src || failed) return undefined;

    const controller = new AbortController();
    const fetchBlob = async (url: string, useAuth: boolean) => {
      const response = await fetch(url, {
        headers: useAuth && memory.authToken ? { Authorization: `Bearer ${memory.authToken}` } : undefined,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Image failed ${response.status}`);
      return response.blob();
    };

    const load = async () => {
      const mediaUrl = memory.driveFileId
        ? `https://www.googleapis.com/drive/v3/files/${memory.driveFileId}?alt=media`
        : '';
      const thumbnailUrl = memory.thumbnail;

      const candidates = [
        ...(memory.type === 'photo' || preferFull ? [{ url: mediaUrl, auth: true }] : []),
        { url: thumbnailUrl, auth: true },
        { url: thumbnailUrl, auth: false },
      ].filter(candidate => candidate.url);

      try {
        if (!memory.authToken && thumbnailUrl) {
          setSrc(thumbnailUrl);
          setLoading(false);
          return;
        }

        let lastError: unknown = null;
        for (const candidate of candidates) {
          try {
            const blob = await fetchBlob(candidate.url, candidate.auth);
            setSrc(URL.createObjectURL(blob));
            setLoading(false);
            return;
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError;
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
          setLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [failed, memory.authToken, memory.driveFileId, memory.thumbnail, preferFull, src, visible]);

  useEffect(() => () => {
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
  }, [src]);

  if (memory.type === 'video' && !preferFull) {
    return <VideoPoster memory={memory} className={className} />;
  }

  if (memory.type === 'video' && visible && memory.driveFileId && memory.authToken && !failed) {
    const videoUrl = `https://www.googleapis.com/drive/v3/files/${memory.driveFileId}?alt=media&access_token=${encodeURIComponent(memory.authToken)}`;
    return (
      <video
        ref={nodeRef as React.RefObject<HTMLVideoElement>}
        src={videoUrl}
        className={className}
        controls
        muted
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
      />
    );
  }

  if (failed) {
    return (
      <div ref={nodeRef} className={`memoriya-image-fallback ${className}`}>
        {memory.type === 'video' ? <Play size={24} /> : <Image size={22} />}
        <span>{memory.title}</span>
        <small>{memory.type === 'video' ? 'Video preview unavailable' : 'Tap to retry after reconnecting Drive'}</small>
      </div>
    );
  }

  return src ? (
    <img
      ref={nodeRef}
      src={src}
      alt={memory.title}
      className={className}
      loading="lazy"
      decoding="async"
    />
  ) : (
    <div ref={nodeRef} className={`memoriya-image-loading ${className}`}>
      <span />
      <small>{loading ? 'Loading preview...' : memory.title}</small>
    </div>
  );
};

const VideoPoster: React.FC<{ memory: Memory; className: string }> = ({ memory, className }) => {
  const [visible, setVisible] = useState(false);
  const [posterSrc, setPosterSrc] = useState('');
  const [directIndex, setDirectIndex] = useState(0);
  const [useVideoStream, setUseVideoStream] = useState(false);
  const [failed, setFailed] = useState(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const directCandidates = [
    memory.driveFileId ? `https://drive.google.com/thumbnail?id=${memory.driveFileId}&sz=w1200` : '',
    memory.driveFileId ? `https://lh3.googleusercontent.com/d/${memory.driveFileId}=w1200` : '',
    memory.thumbnail,
  ].filter(Boolean);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '420px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || posterSrc || useVideoStream || failed) return undefined;
    const controller = new AbortController();

    const loadPoster = async () => {
      if (memory.thumbnail && memory.authToken) {
        try {
          const response = await fetch(memory.thumbnail, {
            headers: { Authorization: `Bearer ${memory.authToken}` },
            signal: controller.signal,
          });
          if (response.ok) {
            const blob = await response.blob();
            setPosterSrc(URL.createObjectURL(blob));
            return;
          }
        } catch {
          // Fall through to direct poster URLs.
        }
      }

      if (directCandidates.length > 0) {
        setPosterSrc(directCandidates[0]);
      } else {
        setUseVideoStream(true);
      }
    };

    void loadPoster();
    return () => controller.abort();
  }, [directCandidates, failed, memory.authToken, memory.thumbnail, posterSrc, useVideoStream, visible]);

  useEffect(() => () => {
    if (posterSrc.startsWith('blob:')) URL.revokeObjectURL(posterSrc);
  }, [posterSrc]);

  const tryNextPoster = () => {
    const nextIndex = directIndex + 1;
    if (nextIndex < directCandidates.length) {
      setDirectIndex(nextIndex);
      setPosterSrc(directCandidates[nextIndex]);
      return;
    }
    setUseVideoStream(true);
  };

  if (useVideoStream && memory.driveFileId && memory.authToken && !failed) {
    const videoUrl = `https://www.googleapis.com/drive/v3/files/${memory.driveFileId}?alt=media&access_token=${encodeURIComponent(memory.authToken)}`;
    return (
      <div ref={nodeRef} className={`memoriya-video-poster ${className}`}>
        <video
          src={videoUrl}
          className="memoriya-video-inline"
          controls
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={event => {
            event.currentTarget.currentTime = Math.min(0.1, event.currentTarget.duration || 0);
          }}
          onError={() => setFailed(true)}
        />
        <span className="memoriya-video-play"><Play size={24} /></span>
      </div>
    );
  }

  if (posterSrc && !failed) {
    return (
      <div ref={nodeRef} className={`memoriya-video-poster ${className}`}>
        <img
          src={posterSrc}
          alt={memory.title}
          loading="lazy"
          decoding="async"
          onError={tryNextPoster}
        />
        <span className="memoriya-video-play"><Play size={24} /></span>
      </div>
    );
  }

  return (
    <div ref={nodeRef} className={`memoriya-image-loading ${className}`}>
      <span />
      <small>{failed ? 'Video opens when selected' : 'Loading video preview...'}</small>
    </div>
  );
};

export default Memoriya;

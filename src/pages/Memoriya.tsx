import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CalendarHeart,
  Camera,
  ChevronRight,
  Cloud,
  Film,
  FolderOpen,
  WandSparkles,
  Globe2,
  Images,
  Loader2,
  Lock,
  MapPin,
  MessageCircleHeart,
  Play,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import DriveMediaPreview from '../components/DriveMediaPreview';
import DriveCameraCapture from '../components/DriveCameraCapture';
import MemoryLightbox from '../components/MemoryLightbox';
import MemoryReel from '../components/MemoryReel';
import type { Memory } from '../data/memories';
import { DRIVE_SESSION_KEY, upgradeDriveImageUrls } from '../services/driveLibrary';
import { googleDriveService, type DriveConnectionState, type DriveMediaFile } from '../services/googleDriveService';
import { autoEventLabel, buildDirectorPlan, type DirectorPlan } from '../services/directorPlan';

type Stage = 'reels' | 'director' | 'map' | 'albums' | 'story';
type GalleryStyle = 'polaroid' | 'scrapbook';

interface DriveSessionSnapshot {
  accessToken: string;
  nextPageToken: string;
  importCount: number;
  memories: Memory[];
  savedAt: number;
}

interface LocalDirectoryEntry {
  kind: 'file' | 'directory';
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterableIterator<LocalDirectoryEntry>;
}

interface LocalDirectoryHandle extends LocalDirectoryEntry {
  kind: 'directory';
  requestPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

const reactions = ['Love', 'Happy', 'Magic', 'Family'];
const reactionGlyphs: Record<string, string> = {
  Love: 'Love',
  Happy: 'Joy',
  Magic: 'Wow',
  Family: 'Warm',
};

const stageTabs: { id: Stage; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'reels', label: 'Reels', Icon: Film },
  { id: 'director', label: 'Director', Icon: WandSparkles },
  { id: 'map', label: 'Places', Icon: Globe2 },
  { id: 'albums', label: 'Albums', Icon: Images },
  { id: 'story', label: 'Timeline', Icon: CalendarHeart },
];

const formatMonth = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const formatDay = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const formatTime = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });

const readDriveSession = (): DriveSessionSnapshot | null => {
  try {
    const stored = window.sessionStorage.getItem(DRIVE_SESSION_KEY);
    if (!stored) return null;
    const snapshot = JSON.parse(stored) as DriveSessionSnapshot;
    if (!snapshot.accessToken || Date.now() - snapshot.savedAt > 55 * 60 * 1000) {
      window.sessionStorage.removeItem(DRIVE_SESSION_KEY);
      return null;
    }
    return {
      ...snapshot,
      memories: (snapshot.memories || []).map(upgradeDriveImageUrls),
    };
  } catch {
    return null;
  }
};

const Memoriya: React.FC = () => {
  const reducedMotion = useReducedMotion();
  const lightweight = useLightweightMode();
  const restored = useMemo(readDriveSession, []);
  const [stage, setStage] = useState<Stage>('reels');
  const [query, setQuery] = useState('');
  const [galleryStyle, setGalleryStyle] = useState<GalleryStyle>('polaroid');
  const [memories, setMemories] = useState<Memory[]>(() => restored?.memories || []);
  const [selected, setSelected] = useState<Memory | null>(() => restored?.memories?.[0] || null);
  const [viewerMemory, setViewerMemory] = useState<Memory | null>(null);
<<<<<<< HEAD
  const [reelConfig, setReelConfig] = useState<{ memories: Memory[]; title: { line: string; big: string }; live: boolean } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
=======
  const [reelConfig, setReelConfig] = useState<{ memories: Memory[]; title: { line: string; big: string } } | null>(null);
>>>>>>> 16af08391491e209b54807755e2c7b27d3942767
  const [activeReaction, setActiveReaction] = useState('Love');
  const [accessToken, setAccessToken] = useState(restored?.accessToken || '');
  const [nextPageToken, setNextPageToken] = useState(restored?.nextPageToken || '');
  const [importCount, setImportCount] = useState(restored?.importCount || 0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(restored?.memories?.length ? `Restored ${restored.memories.length} Drive memories from this browser session.` : '');
  const [error, setError] = useState('');
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const localObjectUrlsRef = useRef<string[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const folderHandleRef = useRef<LocalDirectoryHandle | null>(null);
  const folderPollRef = useRef<number | null>(null);
  const folderScanBusyRef = useRef(false);
  const localFileIdsRef = useRef(new Set<string>());

  useEffect(() => {
    return () => {
      localObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      localObjectUrlsRef.current = [];
      if (folderPollRef.current) window.clearInterval(folderPollRef.current);
      folderPollRef.current = null;
    };
  }, []);

  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '');
    folderInputRef.current?.setAttribute('directory', '');
  }, []);

  const filteredMemories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = [...memories].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (!needle) return sorted;
    return sorted.filter(memory =>
      [memory.title, memory.caption, memory.location, memory.event, memory.type, memory.date, ...(memory.tags || [])]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle))
    );
  }, [memories, query]);

  const bestMemories = filteredMemories.slice(0, 8);
  const locations = useMemo(() => Object.entries(groupBy(filteredMemories, memory => memory.location || 'No location metadata')), [filteredMemories]);
  const albums = useMemo(() => buildAlbums(filteredMemories), [filteredMemories]);
  const timeline = useMemo(() => Object.entries(groupBy(filteredMemories, memory => formatMonth.format(new Date(memory.date)))), [filteredMemories]);
  const onThisDay = useMemo(() => {
    const today = new Date();
    return filteredMemories.find(memory => {
      const date = new Date(memory.date);
      return date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    }) || filteredMemories[0] || null;
  }, [filteredMemories]);
  const directorPlan = useMemo<DirectorPlan>(() => buildDirectorPlan(filteredMemories), [filteredMemories]);

  useEffect(() => {
    if (!accessToken) return;
    const snapshot: DriveSessionSnapshot = {
      accessToken,
      nextPageToken,
      importCount,
      memories,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify(snapshot));
  }, [accessToken, importCount, memories, nextPageToken]);

  useEffect(() => {
    if (!selected && filteredMemories[0]) setSelected(filteredMemories[0]);
  }, [filteredMemories, selected]);

  useEffect(() => {
    if (!reelConfig?.live) return;
    setReelConfig(current => current?.live ? { ...current, memories: filteredMemories } : current);
  }, [filteredMemories]);

  const appendDriveFiles = (files: DriveMediaFile[], token: string) => {
    const imported = files
      .filter(file => file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/') || file.thumbnailUrl || file.webContentLink)
      .map(file => enrichDriveMemory(googleDriveService.toMemory(file, token), file));
    setMemories(current => {
      const ids = new Set(current.map(memory => memory.id));
      const next = [...current, ...imported.filter(memory => !ids.has(memory.id))]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (!selected && next[0]) setSelected(next[0]);
      return next;
    });
    return imported.length;
  };

  const loadDrivePage = async (token = accessToken, pageToken = nextPageToken) => {
    if (!token || loading) return;
    setLoading(true);
    setError('');
    setMessage(pageToken ? 'Loading more memories from Drive...' : 'Reading your photos and videos from Google Drive...');
    try {
      const page = await googleDriveService.listMediaPage(token, pageToken);
      const added = appendDriveFiles(page.files, token);
      setNextPageToken(page.nextPageToken || '');
      setImportCount(count => count + added);
      setMessage(page.nextPageToken
        ? `Imported ${importCount + added} memories. Scroll to load more.`
        : `Imported ${importCount + added} memories. Everything shown now is from your Drive.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Drive memories.');
    } finally {
      setLoading(false);
    }
  };

  const connectDrive = async () => {
    setLoading(true);
    setError('');
    setMessage('Opening secure Google Drive connection...');
    try {
      const state: DriveConnectionState = await googleDriveService.connect();
      const token = state.accessToken || '';
      if (!token) throw new Error('Google Drive authorization was cancelled.');
      setAccessToken(token);
      // Refresh the token stored on existing Drive memories so they keep working,
      // instead of clearing and re-downloading everything on every reconnect.
      setMemories(current => current.map(memory =>
        memory.driveFileId ? { ...memory, authToken: token } : memory
      ));
      const page = await googleDriveService.listMediaPage(token);
      const added = appendDriveFiles(page.files, token);
      setNextPageToken(page.nextPageToken || '');
      setImportCount(count => count + added);
      setMessage(added
        ? `Drive ready — ${memories.length + added} memories in view. Scroll to load more.`
        : 'Drive connected, but no photos or videos were found.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google Drive connection failed.';
      const wasCancelled = /cancel|closed/i.test(message);
      setError(wasCancelled ? '' : message);
      setMessage(wasCancelled
        ? 'Google Drive connection cancelled.'
        : `${message} If Google blocked the popup with an “unauthorized domain” or “access blocked” error, add this exact origin to Google Cloud Console → Credentials → OAuth Client ID → Authorized JavaScript origins: ${window.location.origin}`);
    } finally {
      setLoading(false);
    }
  };

  const localInputRef = useRef<HTMLInputElement>(null);

  const importLocalFiles = (files: FileList | File[] | null) => {
    const mediaFiles = Array.from(files || [])
      .filter(file => isSupportedLocalMedia(file))
      .filter(file => {
        const id = localFileId(file);
        if (localFileIdsRef.current.has(id)) return false;
        localFileIdsRef.current.add(id);
        return true;
      });
    if (!mediaFiles.length) return;

    const now = new Date();
    const imported = mediaFiles.map(file => {
      const url = URL.createObjectURL(file);
      localObjectUrlsRef.current.push(url);
      const isVideo = file.type.startsWith('video/');
      const date = new Date(file.lastModified || now.getTime());
      return {
        id: localFileId(file),
        title: file.name.replace(/\.[^.]+$/, ''),
        caption: 'Local media on this device',
        date: date.toISOString(),
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        type: isVideo ? 'video' : 'photo',
        url,
        thumbnail: isVideo ? '' : url,
        mimeType: file.type,
        tags: ['local', isVideo ? 'video' : 'photo'],
        event: autoEventLabel(file.name, date, mediaFiles.length),
      } satisfies Memory;
    });

    setMemories(current => {
      const ids = new Set(current.map(memory => memory.id));
      const next = [...imported.filter(memory => !ids.has(memory.id)), ...current]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (!selected && next[0]) setSelected(next[0]);
      return next;
    });
    setMessage(imported.length === 1
      ? `Added 1 local memory from this device.`
      : `Added ${imported.length} local memories from this device.`);
  };

  const scanLocalFolder = async (handle: LocalDirectoryHandle) => {
    if (folderScanBusyRef.current) return;
    folderScanBusyRef.current = true;
    try {
      if (handle.requestPermission) {
        const permission = await handle.requestPermission({ mode: 'read' });
        if (permission !== 'granted') return;
      }
      const files: File[] = [];
      const walk = async (directory: LocalDirectoryHandle): Promise<void> => {
        if (!directory.values) return;
        for await (const entry of directory.values()) {
          if (entry.kind === 'file' && entry.getFile) {
            const file = await entry.getFile();
            if (isSupportedLocalMedia(file)) files.push(file);
          } else if (entry.kind === 'directory') {
            await walk(entry as LocalDirectoryHandle);
          }
        }
      };
      await walk(handle);
      importLocalFiles(files);
    } catch {
      setMessage('The local folder could not be read. Choose it again to reconnect.');
    } finally {
      folderScanBusyRef.current = false;
    }
  };

  const connectLocalFolder = async () => {
    const picker = (window as Window & {
      showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<LocalDirectoryHandle>;
    }).showDirectoryPicker;
    if (!picker) {
      folderInputRef.current?.click();
      return;
    }
    try {
      const handle = await picker({ mode: 'read' });
      folderHandleRef.current = handle;
      await scanLocalFolder(handle);
      if (folderPollRef.current) window.clearInterval(folderPollRef.current);
      folderPollRef.current = window.setInterval(() => {
        if (folderHandleRef.current) void scanLocalFolder(folderHandleRef.current);
      }, 5000);
      setMessage('Local folder linked. New photos are checked every 5 seconds while Memoriya is open.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setError('Could not connect that local folder.');
    }
  };

  const localPicker = (
    <input
      ref={localInputRef}
      type="file"
      accept="image/*,video/*"
      multiple
      className="hidden"
      onChange={event => {
        importLocalFiles(event.currentTarget.files);
        event.currentTarget.value = '';
      }}
    />
  );

  const folderPicker = (
    <input
      ref={folderInputRef}
      type="file"
      multiple
      className="hidden"
      onChange={event => {
        importLocalFiles(event.currentTarget.files);
        event.currentTarget.value = '';
      }}
    />
  );

  const disconnectDrive = () => {
    setAccessToken('');
    setNextPageToken('');
    setImportCount(0);
    setMemories([]);
    setSelected(null);
    setMessage('Drive disconnected. Connect again when you are ready.');
    setError('');
    folderHandleRef.current = null;
    if (folderPollRef.current) window.clearInterval(folderPollRef.current);
    folderPollRef.current = null;
    localFileIdsRef.current.clear();
    setCameraOpen(false);
    window.sessionStorage.removeItem(DRIVE_SESSION_KEY);
  };

  useEffect(() => {
    const node = loaderRef.current;
    if (!node || !nextPageToken || !accessToken) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) void loadDrivePage();
    }, { rootMargin: '520px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [accessToken, nextPageToken, loading]);

  const hasMemories = filteredMemories.length > 0;
  const openMemory = (memory: Memory) => {
    setSelected(memory);
    setViewerMemory(memory);
  };

  const playStory = (items: Memory[], line = 'Memoriya story') => {
    const sequence = items.length ? items : filteredMemories;
    setReelConfig({
      memories: sequence,
      title: { line, big: String(sequence[0]?.year || new Date().getFullYear()) },
<<<<<<< HEAD
      live: items === filteredMemories,
=======
>>>>>>> 16af08391491e209b54807755e2c7b27d3942767
    });
  };

  return (
    <div className="memoriya-experience">
      {localPicker}
      {folderPicker}
      {!lightweight && !reducedMotion && hasMemories && <CinematicIntro />}

      <section className={`memoriya-cinema-hero ${!hasMemories ? 'is-empty' : ''}`}>
        {hasMemories && (
          <div className="memoriya-hero-film">
            {bestMemories.slice(0, 5).map((memory, index) => (
              <HeroImage key={memory.id} memory={memory} index={index} lightweight={lightweight || Boolean(reducedMotion)} />
            ))}
          </div>
        )}

        <motion.div
          className="memoriya-hero-copy"
          initial={lightweight ? false : { opacity: 0, y: 18 }}
          animate={lightweight ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          <span className="memoriya-kicker"><Sparkles size={15} /> Memoriya</span>
          <h1>{hasMemories ? 'Your Drive memories, beautifully organized.' : 'Bring your memories home.'}</h1>
          <p>
            Connect Google Drive once. Memoriya automatically arranges your real photos and videos by date,
            time, type, album, and place so anyone can use it without technical steps.
          </p>
          <div className="memoriya-hero-actions">
            <button className="memoriya-primary" onClick={connectDrive} disabled={loading}>
              {loading ? <Loader2 size={17} className="memoriya-spin-icon" /> : <Cloud size={17} />}
              {accessToken ? 'Sync Drive' : 'Connect Google Drive'}
            </button>
            <button className="memoriya-glass-button" onClick={() => localInputRef.current?.click()}>
              <Images size={17} /> Use Local Media
            </button>
<<<<<<< HEAD
            <button className="memoriya-glass-button" onClick={() => void connectLocalFolder()}>
              <FolderOpen size={17} /> Link local folder
            </button>
            {accessToken && <button className="memoriya-glass-button" onClick={() => setCameraOpen(true)}><Camera size={17} /> Drive camera</button>}
=======
>>>>>>> 16af08391491e209b54807755e2c7b27d3942767
            {hasMemories && <button className="memoriya-glass-button" onClick={() => playStory(filteredMemories)}><Film size={17} /> Play story</button>}
            {accessToken && (
              <button className="memoriya-glass-button" onClick={disconnectDrive}>
                <ShieldCheck size={17} /> Disconnect
              </button>
            )}
          </div>
          {(message || error) && <p className={`memoriya-drive-message ${error ? 'is-error' : ''}`}>{error || message}</p>}
        </motion.div>

        {hasMemories && onThisDay ? (
          <motion.aside
            className="memoriya-now-card"
            initial={lightweight ? false : { opacity: 0, x: 18 }}
            animate={lightweight ? undefined : { opacity: 1, x: 0 }}
            transition={{ delay: 0.08, duration: 0.28 }}
          >
            <span><CalendarHeart size={16} /> On this day</span>
            <OptimizedImage memory={onThisDay} width={520} eager />
            <h2>{onThisDay.title}</h2>
            <p>{onThisDay.caption}</p>
          </motion.aside>
        ) : (
          <OnboardingCard loading={loading} onConnect={connectDrive} onImportLocal={() => localInputRef.current?.click()} />
        )}
      </section>

      <section className="memoriya-dashboard">
        {[
          { label: 'Drive memories', value: memories.length, Icon: Images },
          { label: 'Photos / videos', value: `${countType(memories, 'photo')} / ${countType(memories, 'video')}`, Icon: Camera },
          { label: 'Albums created', value: albums.length, Icon: Lock },
          { label: 'Cloud status', value: accessToken ? 'Connected' : 'Ready', Icon: Cloud },
        ].map(item => (
          <motion.article key={item.label} whileHover={lightweight ? undefined : { y: -3 }} className="memoriya-stat">
            <item.Icon size={18} />
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </motion.article>
        ))}
      </section>

      {hasMemories && (
        <section className="memoriya-simple-toolbar">
          <label>
            <Search size={17} />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by file name, date, type, place..." />
          </label>
        </section>
      )}

      {hasMemories && (
        <nav className="memoriya-stage-tabs" aria-label="Memoriya features">
          {stageTabs.map(item => (
            <button key={item.id} className={stage === item.id ? 'is-active' : ''} onClick={() => setStage(item.id)}>
              <item.Icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      <main className="memoriya-stage">
        {!hasMemories && <EmptyDriveState loading={loading} onConnect={connectDrive} onImportLocal={() => localInputRef.current?.click()} />}

        {hasMemories && stage === 'reels' && selected && (
          <ReelsStage
            memories={bestMemories}
            selected={selected}
            setSelected={setSelected}
            openMemory={openMemory}
            onPlayStory={() => playStory(filteredMemories)}
            activeReaction={activeReaction}
            setActiveReaction={setActiveReaction}
            lightweight={lightweight || Boolean(reducedMotion)}
          />
        )}

        {hasMemories && stage === 'director' && (
          <DirectorStage plan={directorPlan} onPlay={() => playStory(directorPlan.sequence, directorPlan.title)} onOpenMemory={openMemory} />
        )}

        {hasMemories && stage === 'map' && (
          <MapStage locations={locations} openMemory={openMemory} />
        )}

        {hasMemories && stage === 'albums' && (
          <AlbumsStage albums={albums} galleryStyle={galleryStyle} setGalleryStyle={setGalleryStyle} openMemory={openMemory} onPlayStory={playStory} lightweight={lightweight || Boolean(reducedMotion)} />
        )}

        {hasMemories && stage === 'story' && (
          <StoryStage timeline={timeline} openMemory={openMemory} />
        )}

        {hasMemories && (
          <div ref={loaderRef} className="memoriya-loader">
            {nextPageToken ? (loading ? 'Loading more Drive memories...' : 'Scroll for more Drive memories') : 'All loaded memories are from your Drive'}
          </div>
        )}
      </main>

      {hasMemories && (
        <nav className="memoriya-mobile-dock" aria-label="Mobile Memoriya actions">
          {stageTabs.map(item => (
            <button key={item.id} className={stage === item.id ? 'is-active' : ''} onClick={() => setStage(item.id)} aria-label={item.label}>
              <item.Icon size={18} />
            </button>
          ))}
          <button onClick={connectDrive} aria-label="Sync Drive">
            <Cloud size={18} />
          </button>
        </nav>
      )}

      <MemoryLightbox memory={viewerMemory} memories={filteredMemories} onClose={() => setViewerMemory(null)} />
<<<<<<< HEAD
      {cameraOpen && accessToken && (
        <DriveCameraCapture
          accessToken={accessToken}
          onUploaded={file => {
            const added = appendDriveFiles([file], accessToken);
            setMessage(added ? 'Photo uploaded to Drive and added to the live story.' : 'Photo uploaded to Drive. Sync again if it is not visible yet.');
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
      {reelConfig && (
        <MemoryReel
          memories={reelConfig.memories}
          title={reelConfig.title}
          driveAccessToken={accessToken}
          hasMore={reelConfig.live && Boolean(accessToken)}
          loadingMore={loading}
          onNeedMore={() => void loadDrivePage()}
          onClose={() => setReelConfig(null)}
        />
      )}
=======
      {reelConfig && <MemoryReel memories={reelConfig.memories} title={reelConfig.title} onClose={() => setReelConfig(null)} />}
>>>>>>> 16af08391491e209b54807755e2c7b27d3942767
    </div>
  );

};

const DirectorStage: React.FC<{ plan: DirectorPlan; onPlay: () => void; onOpenMemory: (memory: Memory) => void }> = ({ plan, onPlay, onOpenMemory }) => (
  <section className="memoriya-director-stage">
    <div className="memoriya-director-hero">
      <div>
        <span className="memoriya-kicker"><WandSparkles size={15} /> Private auto-director</span>
        <h2>{plan.title}</h2>
        <p>{plan.subtitle} Your photos stay on this device while Memoriya uses dates, names, tags, and available locations to find the chapters and choose a natural rhythm. Start playback, then use the Music button to search open-source audio or load your own song.</p>
        <div className="memoriya-director-actions">
          <button className="memoriya-primary" onClick={onPlay} disabled={!plan.sequence.length}><Film size={17} /> Play on this screen</button>
          <span className="memoriya-director-pill"><span /> TV-ready 16:9</span>
          <span className="memoriya-director-pill"><span /> {plan.template} look</span>
        </div>
      </div>
      <div className="memoriya-director-score">
        <strong>{plan.sequence.length}</strong>
        <span>selected frames</span>
        <small>Event-aware cut</small>
      </div>
    </div>

    <div className="memoriya-director-grid">
      <div className="memoriya-director-preview">
        {plan.sequence.slice(0, 6).map((memory, index) => (
          <button key={memory.id} onClick={() => onOpenMemory(memory)} style={{ '--i': index } as React.CSSProperties}>
            <OptimizedImage memory={memory} width={220} />
            <span>{String(index + 1).padStart(2, '0')}</span>
          </button>
        ))}
        {!plan.sequence.length && <div className="memoriya-director-empty"><WandSparkles size={28} /><span>Add a few photos to preview your film.</span></div>}
      </div>
      <div className="memoriya-director-events">
        <div className="memoriya-director-section-head"><span>Cut list</span><small>{plan.clusters.length} chapters</small></div>
        {plan.clusters.slice(0, 6).map((cluster, index) => (
          <button key={cluster.id} onClick={() => onOpenMemory(cluster.cover)}>
            <span className="memoriya-director-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="memoriya-director-event-copy"><strong>{cluster.title}</strong><small>{cluster.memories.length} frames · {cluster.monthRange}</small></span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </div>
  </section>
);

const HeroImage = memo<{ memory: Memory; index: number; lightweight: boolean }>(({ memory, index, lightweight }) => (
  <motion.div
    initial={lightweight ? false : { opacity: 0, y: 24, rotate: index % 2 ? 3 : -3 }}
    animate={lightweight ? undefined : { opacity: 1, y: 0, rotate: index % 2 ? 2 : -2 }}
    transition={{ delay: 0.08 + index * 0.04, duration: 0.28 }}
  >
    <OptimizedImage memory={memory} width={360} eager={index < 2} />
  </motion.div>
));

HeroImage.displayName = 'HeroImage';

const OnboardingCard: React.FC<{ loading: boolean; onConnect: () => void; onImportLocal: () => void }> = ({ loading, onConnect, onImportLocal }) => (
  <aside className="memoriya-now-card memoriya-onboarding-card">
    <span><ShieldCheck size={16} /> Private setup</span>
    <h2>No default photos here</h2>
    <p>Connect Google Drive, or add photos and videos straight from this device. Memoriya shows only your own media across every screen.</p>
    <div className="flex flex-col gap-2">
      <button className="memoriya-primary" onClick={onConnect} disabled={loading}>
        {loading ? <Loader2 size={17} className="memoriya-spin-icon" /> : <Cloud size={17} />}
        Connect Drive
      </button>
      <button className="memoriya-glass-button" onClick={onImportLocal}>
        <Images size={17} /> Use Local Media
      </button>
    </div>
  </aside>
);

const EmptyDriveState: React.FC<{ loading: boolean; onConnect: () => void; onImportLocal: () => void }> = ({ loading, onConnect, onImportLocal }) => (
  <section className="memoriya-empty-drive">
    <Cloud size={34} />
    <h2>Start with your real memories</h2>
    <p>
      There are no demo images in your workspace. Connect Google Drive, or pick photos and videos from this
      device. Memoriya sorts them automatically by date, time, type, albums, and available location metadata.
    </p>
    <button className="memoriya-primary" onClick={onConnect} disabled={loading}>
      {loading ? <Loader2 size={17} className="memoriya-spin-icon" /> : <Cloud size={17} />}
      {loading ? 'Connecting...' : 'Connect Google Drive'}
    </button>
    <button className="memoriya-glass-button" onClick={onImportLocal}>
      <Images size={17} /> Use Local Media
    </button>
  </section>
);

interface ReelsStageProps {
  memories: Memory[];
  selected: Memory;
  setSelected: (memory: Memory) => void;
  openMemory: (memory: Memory) => void;
  onPlayStory: () => void;
  activeReaction: string;
  setActiveReaction: (reaction: string) => void;
  lightweight: boolean;
}

const ReelsStage = memo<ReelsStageProps>(({ memories, selected, setSelected, openMemory, onPlayStory, activeReaction, setActiveReaction }) => (
  <section className="memoriya-reel-stage">
    <article
      className="memoriya-reel-phone"
      onClick={() => openMemory(selected)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openMemory(selected);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${selected.title}`}
    >
      <OptimizedImage memory={selected} width={720} eager />
      <div className="memoriya-reel-overlay">
        <span><Radio size={14} /> Memory reel</span>
        <h2>{selected.title}</h2>
        <p>{selected.caption}</p>
        <div className="memoriya-reactions">
          {reactions.map(reaction => (
            <button
              key={reaction}
              className={activeReaction === reaction ? 'is-active' : ''}
              onClick={event => {
                event.stopPropagation();
                setActiveReaction(reaction);
              }}
              aria-label={`React with ${reaction}`}
            >
              {reactionGlyphs[reaction]}
            </button>
          ))}
        </div>
      </div>
    </article>
    <button type="button" className="memoriya-story-launch" onClick={onPlayStory}><Film size={16} /> Play full camera-wall story</button>
    <div className="memoriya-reel-list">
      {memories.map((memory, index) => (
        <button
          key={memory.id}
          onClick={() => {
            setSelected(memory);
            openMemory(memory);
          }}
          className={selected.id === memory.id ? 'is-active' : ''}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          <OptimizedImage memory={memory} width={180} />
          <div>
            <strong>{memory.title}</strong>
            <small>{memory.type} - {formatDay.format(new Date(memory.date))} at {formatTime.format(new Date(memory.date))}</small>
          </div>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  </section>
));

ReelsStage.displayName = 'ReelsStage';

const MapStage = memo<{
  locations: [string, Memory[]][];
  openMemory: (memory: Memory) => void;
}>(({ locations, openMemory }) => (
  <section className="memoriya-map-stage">
    <div className="memoriya-map">
      {locations.map(([place, items], index) => {
        const point = pointForPlace(place, index);
        return (
          <button key={place} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => openMemory(items[0])}>
            <span>{items.length}</span>
          </button>
        );
      })}
    </div>
    <div className="memoriya-place-list">
      {locations.map(([place, items]) => (
        <button key={place} onClick={() => openMemory(items[0])}>
          <MapPin size={16} />
          <strong>{place}</strong>
          <span>{items.length} memories</span>
        </button>
      ))}
    </div>
  </section>
));

MapStage.displayName = 'MapStage';

const AlbumsStage = memo<{
  albums: [string, Memory[]][];
  galleryStyle: GalleryStyle;
  setGalleryStyle: (style: GalleryStyle) => void;
  openMemory: (memory: Memory) => void;
  onPlayStory: (items: Memory[], line: string) => void;
  lightweight: boolean;
}>(({ albums, galleryStyle, setGalleryStyle, openMemory, onPlayStory, lightweight }) => (
  <section className="memoriya-albums">
    <div className="memoriya-style-switch">
      {(['polaroid', 'scrapbook'] as GalleryStyle[]).map(style => (
        <button key={style} className={galleryStyle === style ? 'is-active' : ''} onClick={() => setGalleryStyle(style)}>
          <Camera size={15} /> {style}
        </button>
      ))}
    </div>
    <div className={`memoriya-album-wall is-${galleryStyle}`}>
      {albums.map(([title, items]) => (
        <motion.article key={title} whileHover={lightweight ? undefined : { y: -5 }}>
          <button type="button" onClick={() => openMemory(items[0])}>
            <OptimizedImage memory={items[0]} width={420} />
            <strong>{title}</strong>
            <span>{items.length} user memories</span>
          </button>
          <button type="button" className="memoriya-album-play" onClick={() => onPlayStory(items, title)}><Film size={14} /> Play story</button>
        </motion.article>
      ))}
    </div>
  </section>
));

AlbumsStage.displayName = 'AlbumsStage';

const StoryStage = memo<{
  timeline: [string, Memory[]][];
  openMemory: (memory: Memory) => void;
}>(({ timeline, openMemory }) => (
  <section className="memoriya-storyline">
    {timeline.map(([month, items]) => (
      <article key={month}>
        <time>{month}</time>
        <div>
          {items.map(memory => (
            <button key={memory.id} onClick={() => openMemory(memory)}>
              <OptimizedImage memory={memory} width={160} />
              <span>
                <strong>{memory.title}</strong>
                <small>{memory.type} - {formatDay.format(new Date(memory.date))} at {formatTime.format(new Date(memory.date))}</small>
              </span>
              <MessageCircleHeart size={17} />
            </button>
          ))}
        </div>
      </article>
    ))}
  </section>
));

StoryStage.displayName = 'StoryStage';

const OptimizedImage = memo<{ memory: Memory; width: number; eager?: boolean }>(({ memory, eager }) => (
  <span className="memoriya-image-wrap is-loaded">
    <DriveMediaPreview memory={memory} eager={eager} />
    {memory.type === 'video' && <span className="memoriya-video-chip"><Play size={13} /> Video</span>}
  </span>
));

OptimizedImage.displayName = 'OptimizedImage';

const enrichDriveMemory = (memory: Memory, file: DriveMediaFile): Memory => {
  const location = file.imageMediaMetadata?.location;
  const date = new Date(memory.date);
  const typeLabel = memory.type === 'video' ? 'Video' : 'Photo';
  return {
    ...memory,
    caption: `${typeLabel} from your Google Drive - captured ${formatDay.format(date)} at ${formatTime.format(date)}.`,
    location: location ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}` : undefined,
    event: albumLabelFor(memory),
    tags: [
      'drive',
      memory.type,
      String(memory.year),
      formatMonth.format(date),
      location ? 'location' : 'no-location',
    ],
  };
};

const albumLabelFor = (memory: Memory) => {
  const date = new Date(memory.date);
  const hour = date.getHours();
  const dayPart = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
  const type = memory.type === 'video' ? 'Videos' : 'Photos';
  return `${formatMonth.format(date)} ${dayPart} ${type}`;
};

const buildAlbums = (memories: Memory[]): [string, Memory[]][] => {
  const byEvent = Object.entries(groupBy(memories, memory => memory.event || albumLabelFor(memory)));
  const byType = Object.entries(groupBy(memories, memory => memory.type === 'video' ? 'All videos' : 'All photos'));
  return [...byEvent, ...byType].filter(([, items]) => items.length > 0).slice(0, 10);
};

const pointForPlace = (place: string, index: number) => {
  if (place === 'No location metadata') {
    return { x: 48 + (index % 3) * 8, y: 46 + (index % 2) * 12 };
  }
  const [latRaw, lngRaw] = place.split(',').map(value => Number(value.trim()));
  if (Number.isFinite(latRaw) && Number.isFinite(lngRaw)) {
    return {
      x: Math.min(88, Math.max(12, ((lngRaw + 180) / 360) * 100)),
      y: Math.min(82, Math.max(14, ((90 - latRaw) / 180) * 100)),
    };
  }
  return { x: 24 + (index * 17) % 58, y: 24 + (index * 13) % 52 };
};

const countType = (memories: Memory[], type: Memory['type']) => memories.filter(memory => memory.type === type).length;

const isSupportedLocalMedia = (file: File) =>
  file.type.startsWith('image/') || file.type.startsWith('video/') || /\.(jpe?g|png|gif|webp|avif|heic|heif|mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name);

const localFileId = (file: File) => `local-${file.name}-${file.lastModified}-${file.size}`;

const useLightweightMode = () => {
  const [lightweight, setLightweight] = useState(false);
  useEffect(() => {
    const check = () => {
      const narrow = window.innerWidth < 760;
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const lowMemory = 'deviceMemory' in navigator && Number(navigator.deviceMemory) <= 4;
      setLightweight(narrow || coarse || lowMemory);
    };
    check();
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);
  return lightweight;
};

const CinematicIntro: React.FC = () => (
  <motion.div
    className="memoriya-intro"
    initial={{ opacity: 1 }}
    animate={{ opacity: 0, pointerEvents: 'none' }}
    transition={{ delay: 0.7, duration: 0.5 }}
  >
    <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.55 }} />
    <motion.strong initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
      Memoriya
    </motion.strong>
  </motion.div>
);

const groupBy = <T,>(items: T[], getKey: (item: T) => string) =>
  items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    acc[key] = [...(acc[key] || []), item];
    return acc;
  }, {});

export default Memoriya;

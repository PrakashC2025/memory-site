import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  KeyRound,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import DriveMediaPreview from './DriveMediaPreview';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import {
  checkGooglePhotosPickerSessionOnce,
  connectGooglePhotosGmail,
  createGooglePhotosCollection,
  createGooglePhotosPickerSession,
  deleteGooglePhotosCollection,
  disconnectGooglePhotos,
  GOOGLE_PHOTOS_UPDATED_EVENT,
  GOOGLE_PHOTOS_WEB_URL,
  getConfiguredGoogleClientId,
  importFilesIntoGooglePhotosCollection,
  importGooglePhotosPickerSession,
  isMobileGooglePhotosDevice,
  readGooglePhotosAccessToken,
  readGooglePhotosCollectionsSummary,
  readGooglePhotosState,
  renameGooglePhotosCollection,
  saveGoogleClientIdOverride,
  setAllGooglePhotosCollectionsSelected,
  setGooglePhotosCollectionSelected,
  waitForGooglePhotosPickerSelection,
  type CollectionTargetOption,
  type GooglePhotosCollectionSummary,
  type GooglePhotosImportProgress,
  type GooglePhotosPickerSession,
} from '../services/googlePhotosService';

export const GooglePhotosIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 18,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2C9.24 2 7 4.24 7 7v5h5V2z" fill="#FBBC04" />
    <path d="M22 12c0-2.76-2.24-5-5-5h-5v5h10z" fill="#EA4335" />
    <path d="M12 22c2.76 0 5-2.24 5-5v-5h-5v10z" fill="#4285F4" />
    <path d="M2 12c0 2.76 2.24 5 5 5h5v-5H2z" fill="#34A853" />
  </svg>
);

interface GooglePhotosModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'link' | 'collections';
}

const PRESET_COLLECTIONS = ['Favorites', 'Family & Friends', 'Travel & Trips', 'Celebrations'];

const GooglePhotosModal: React.FC<GooglePhotosModalProps> = ({
  open,
  onClose,
  initialTab = 'link',
}) => {
  const { config } = useTheme();
  const { user } = useUser();

  const [stateSnapshot, setStateSnapshot] = useState(() => readGooglePhotosState());
  const [collections, setCollections] = useState<GooglePhotosCollectionSummary[]>(() =>
    readGooglePhotosCollectionsSummary(),
  );
  const [activeTab, setActiveTab] = useState<'link' | 'collections'>(initialTab);

  // Target collection selection when importing
  const [targetMode, setTargetMode] = useState<'auto' | 'existing' | 'custom'>('auto');
  const [selectedExistingId, setSelectedExistingId] = useState('');
  const [customCollectionName, setCustomCollectionName] = useState('');

  // Picker & import status
  const [busy, setBusy] = useState(false);
  const [activeSession, setActiveSession] = useState<GooglePhotosPickerSession | null>(null);
  const [progress, setProgress] = useState<GooglePhotosImportProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Collection management inline states
  const [newCollectionDraft, setNewCollectionDraft] = useState('');
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [editingCollectionName, setEditingCollectionName] = useState('');
  const [addingToCollectionId, setAddingToCollectionId] = useState<string | null>(null);

  // Optional OAuth Client ID helper when VITE_GOOGLE_CLIENT_ID is missing
  const [clientIdInput, setClientIdInput] = useState(() => getConfiguredGoogleClientId());
  const [showClientIdSetup, setShowClientIdSetup] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const collectionFileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const popupWindowRef = useRef<Window | null>(null);
  const activeTokenRef = useRef<string>(readGooglePhotosAccessToken());

  const isMobile = useMemo(() => isMobileGooglePhotosDevice(), []);
  const configuredClientId = getConfiguredGoogleClientId();

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setStateSnapshot(readGooglePhotosState());
      setCollections(readGooglePhotosCollectionsSummary());
      setClientIdInput(getConfiguredGoogleClientId());
    }
  }, [initialTab, open]);

  useEffect(() => {
    const sync = () => {
      setStateSnapshot(readGooglePhotosState());
      const summary = readGooglePhotosCollectionsSummary();
      setCollections(summary);
      if (summary.length && !selectedExistingId) {
        setSelectedExistingId(summary[0].id);
      }
    };
    window.addEventListener(GOOGLE_PHOTOS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(GOOGLE_PHOTOS_UPDATED_EVENT, sync);
  }, [selectedExistingId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    return () => {
      sessionAbortRef.current?.abort();
    };
  }, []);

  const visibleCollectionsCount = useMemo(
    () => collections.filter(col => col.selected).length,
    [collections],
  );
  const visibleMemoriesCount = useMemo(
    () => collections.filter(col => col.selected).reduce((sum, col) => sum + col.count, 0),
    [collections],
  );

  const resolveCurrentTarget = (): CollectionTargetOption => {
    if (targetMode === 'existing' && selectedExistingId) {
      return { mode: 'existing', collectionId: selectedExistingId };
    }
    if (targetMode === 'custom' && customCollectionName.trim()) {
      return { mode: 'custom', name: customCollectionName.trim() };
    }
    return { mode: 'auto' };
  };

  const handleSaveClientId = () => {
    saveGoogleClientIdOverride(clientIdInput);
    setShowClientIdSetup(false);
    setErrorMessage('');
    setStatusMessage(
      clientIdInput.trim()
        ? 'Google OAuth Client ID saved in this browser. You can now link with Gmail.'
        : 'Cleared custom Client ID override.',
    );
  };

  const handleConnectGmail = async (selectAccount = false) => {
    setErrorMessage('');
    setBusy(true);
    setStatusMessage('Opening Gmail sign-in for Google Photos...');
    try {
      const loginHint = stateSnapshot.account?.email || user?.email;
      const { accessToken, account } = await connectGooglePhotosGmail({
        loginHint: loginHint?.includes('@') && !loginHint.endsWith('.local') ? loginHint : undefined,
        selectAccount,
      });
      activeTokenRef.current = accessToken;
      setStatusMessage(
        account?.email
          ? `Linked Gmail: ${account.email}. Tap "Open Google Photos to Select" to pick your photos or albums.`
          : 'Gmail linked! Tap "Open Google Photos to Select" to choose your photos.',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not link Gmail.';
      setErrorMessage(msg);
      setStatusMessage('');
      if (!getConfiguredGoogleClientId()) setShowClientIdSetup(true);
    } finally {
      setBusy(false);
    }
  };

  const finishImportingSession = async (
    session: GooglePhotosPickerSession,
    token: string,
    targetOverride?: CollectionTargetOption,
  ) => {
    setBusy(true);
    setActiveSession(null);
    setStatusMessage('Importing your selected Google Photos...');
    try {
      const result = await importGooglePhotosPickerSession(
        session.sessionId,
        token,
        targetOverride || resolveCurrentTarget(),
        nextProgress => setProgress(nextProgress),
      );
      setProgress(null);
      if (result.importedCount > 0) {
        setStatusMessage(
          `Imported ${result.importedCount} ${result.importedCount === 1 ? 'memory' : 'memories'} into ${result.collectionsTouched.join(', ')}. Choose which collections appear on your site below!`,
        );
        setActiveTab('collections');
      } else {
        setStatusMessage('No new photos were selected in Google Photos.');
      }
    } catch (err) {
      setProgress(null);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to import selected Google Photos.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartGooglePhotosPicker = async (targetOverride?: CollectionTargetOption) => {
    setErrorMessage('');
    setProgress(null);

    let token = activeTokenRef.current || readGooglePhotosAccessToken();

    // On desktop when we already have an active token, open the named popup
    // synchronously inside the click gesture so strict popup blockers allow it.
    let preOpenedPopup: Window | null = null;
    if (!isMobile && token) {
      preOpenedPopup = window.open(
        'about:blank',
        'MemoriyaGooglePhotosPicker',
        'width=1040,height=780,menubar=no,toolbar=no,location=no,status=no',
      );
      popupWindowRef.current = preOpenedPopup;
    }

    setBusy(true);
    try {
      if (!token) {
        setStatusMessage('Linking your Gmail account...');
        const loginHint = stateSnapshot.account?.email || user?.email;
        const connected = await connectGooglePhotosGmail({
          loginHint: loginHint?.includes('@') && !loginHint.endsWith('.local') ? loginHint : undefined,
        });
        token = connected.accessToken;
        activeTokenRef.current = token;
      }

      setStatusMessage('Creating secure Google Photos session...');
      const session = await createGooglePhotosPickerSession(token);
      setActiveSession(session);

      if (preOpenedPopup && !preOpenedPopup.closed) {
        preOpenedPopup.location.href = session.autoCloseUri;
      } else if (!isMobile) {
        const opened = window.open(
          session.autoCloseUri,
          'MemoriyaGooglePhotosPicker',
          'width=1040,height=780,menubar=no,toolbar=no,location=no,status=no',
        );
        popupWindowRef.current = opened;
      }

      setStatusMessage(
        isMobile
          ? 'Tap "Open Google Photos App" below, select your photos or album in Google Photos, tap Done, and return here.'
          : 'Select your photos or album in the Google Photos window and click Done.',
      );

      sessionAbortRef.current?.abort();
      const abortController = new AbortController();
      sessionAbortRef.current = abortController;

      const selected = await waitForGooglePhotosPickerSelection(session, token, {
        popupWindow: popupWindowRef.current,
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      if (selected) {
        try {
          popupWindowRef.current?.close();
        } catch {
          // Cross-origin popup may already be closed by /autoclose.
        }
        await finishImportingSession(session, token, targetOverride);
      } else {
        setActiveSession(null);
        setStatusMessage('Google Photos window closed before confirming selection.');
      }
    } catch (err) {
      try {
        preOpenedPopup?.close();
      } catch {
        // Ignore popup close error.
      }
      setActiveSession(null);
      const msg = err instanceof Error ? err.message : 'Google Photos connection failed.';
      setErrorMessage(msg);
      setStatusMessage('');
      if (!getConfiguredGoogleClientId()) setShowClientIdSetup(true);
    } finally {
      setBusy(false);
    }
  };

  const handleManualSessionCheck = async () => {
    if (!activeSession) return;
    const token = activeTokenRef.current || readGooglePhotosAccessToken();
    if (!token) return;
    setErrorMessage('');
    setStatusMessage('Checking your Google Photos selection...');
    try {
      const check = await checkGooglePhotosPickerSessionOnce(activeSession.sessionId, token);
      if (check.mediaItemsSet) {
        sessionAbortRef.current?.abort();
        await finishImportingSession(activeSession, token);
      } else {
        setStatusMessage(
          'Still waiting for Google Photos — make sure you tapped "Done" in Google Photos after selecting your items.',
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not verify Google Photos session.');
    }
  };

  const handleCancelActiveSession = () => {
    sessionAbortRef.current?.abort();
    try {
      popupWindowRef.current?.close();
    } catch {
      // Ignore.
    }
    setActiveSession(null);
    setBusy(false);
    setStatusMessage('Cancelled Google Photos picker session.');
  };

  const handleDevicePhotosPicked = async (
    files: FileList | null,
    targetOverride?: CollectionTargetOption,
  ) => {
    if (!files || !files.length) return;
    setErrorMessage('');
    setBusy(true);
    try {
      const result = await importFilesIntoGooglePhotosCollection(
        files,
        targetOverride || resolveCurrentTarget(),
        nextProgress => setProgress(nextProgress),
      );
      setProgress(null);
      if (result.importedCount > 0) {
        setStatusMessage(
          `Added ${result.importedCount} ${result.importedCount === 1 ? 'memory' : 'memories'} to ${result.collectionsTouched.join(', ')}. Toggle which collections appear on your site below!`,
        );
        setCustomCollectionName('');
        setActiveTab('collections');
      } else {
        setErrorMessage('No supported photo or video files were selected.');
      }
    } catch (err) {
      setProgress(null);
      setErrorMessage(err instanceof Error ? err.message : 'Could not import selected photos.');
    } finally {
      setBusy(false);
      setAddingToCollectionId(null);
    }
  };

  const handleCreateCollection = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCollectionDraft.trim()) return;
    const created = createGooglePhotosCollection(newCollectionDraft.trim(), true);
    setNewCollectionDraft('');
    setSelectedExistingId(created.id);
    setStatusMessage(`Collection "${created.name}" created and enabled on site.`);
  };

  const handleSaveRename = (collectionId: string) => {
    if (editingCollectionName.trim()) {
      renameGooglePhotosCollection(collectionId, editingCollectionName.trim());
    }
    setEditingCollectionId(null);
    setEditingCollectionName('');
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[180] flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-5"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-photos-modal-title"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 14 }}
          transition={{ duration: 0.22 }}
          onClick={event => event.stopPropagation()}
          className="neon-card relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto border p-4 sm:p-6"
          style={{
            background: 'linear-gradient(165deg, rgba(10, 14, 24, 0.98), rgba(5, 8, 15, 0.98))',
            borderColor: `${config.primary}44`,
            boxShadow: `0 26px 80px rgba(0,0,0,0.72), 0 0 40px ${config.glow}`,
          }}
        >
          {/* Hidden inputs for Phone Google Photos App / PC gallery */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={event => {
              void handleDevicePhotosPicked(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
          <input
            ref={collectionFileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={event => {
              const colId = addingToCollectionId;
              void handleDevicePhotosPicked(
                event.currentTarget.files,
                colId ? { mode: 'existing', collectionId: colId } : undefined,
              );
              event.currentTarget.value = '';
            }}
          />

          {/* Top Header */}
          <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06]"
                style={{ boxShadow: '0 8px 24px rgba(66,133,244,0.22)' }}
              >
                <GooglePhotosIcon size={24} />
              </span>
              <div>
                <h2 id="google-photos-modal-title" className="text-lg font-black text-white sm:text-xl">
                  Google Photos &amp; Collections
                </h2>
                <p className="text-xs leading-5 text-white/60">
                  Link your Gmail &amp; Google Photos on phone or PC, then choose which collections appear on your site.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="neon-button flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/75 hover:text-white"
              aria-label="Close Google Photos modal"
            >
              <X size={18} />
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('link')}
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-black transition-all sm:text-sm"
              style={{
                background: activeTab === 'link' ? `${config.primary}26` : 'transparent',
                color: activeTab === 'link' ? config.primary : 'rgba(255,255,255,0.68)',
                border: `1px solid ${activeTab === 'link' ? `${config.primary}55` : 'transparent'}`,
              }}
            >
              <GooglePhotosIcon size={16} />
              <span>1. Link Google Photos</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('collections')}
              className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-black transition-all sm:text-sm"
              style={{
                background: activeTab === 'collections' ? `${config.primary}26` : 'transparent',
                color: activeTab === 'collections' ? config.primary : 'rgba(255,255,255,0.68)',
                border: `1px solid ${activeTab === 'collections' ? `${config.primary}55` : 'transparent'}`,
              }}
            >
              <Sparkles size={15} />
              <span>
                2. Site Collections ({visibleCollectionsCount}/{collections.length})
              </span>
            </button>
          </div>

          {/* Status & Progress Banner */}
          {(statusMessage || errorMessage || progress) && (
            <div
              role={errorMessage ? 'alert' : 'status'}
              className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-5 ${
                errorMessage
                  ? 'border-rose-400/35 bg-rose-500/12 text-rose-100'
                  : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-50'
              }`}
            >
              <p className="font-semibold">{errorMessage || progress?.label || statusMessage}</p>
              {progress && progress.total > 0 && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${Math.min(100, Math.round((progress.completed / progress.total) * 100))}%`,
                      background: `linear-gradient(90deg, ${config.primary}, ${config.secondary})`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Active Mobile / Web Google Photos Picker Session Launch Card */}
          {activeSession && (
            <div
              className="mt-4 rounded-xl border p-4"
              style={{
                borderColor: '#36f1cd66',
                background: 'linear-gradient(135deg, rgba(54,241,205,0.12), rgba(66,133,244,0.12))',
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-black text-white">
                    <Loader2 size={16} className="animate-spin text-emerald-300" />
                    Google Photos Link Ready
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/75">
                    {isMobile
                      ? 'Tap below to launch the Google Photos app (or website) on your phone, select your photos or album, and tap Done.'
                      : 'Select your photos or album in Google Photos and click Done. If the window did not open, click below.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={isMobile ? activeSession.pickerUri : activeSession.autoCloseUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-black text-black"
                    style={{
                      background: 'linear-gradient(135deg, #36f1cd, #8ab4ff)',
                    }}
                  >
                    <ExternalLink size={14} />
                    {isMobile ? 'Open Google Photos App' : 'Open Google Photos'}
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleManualSessionCheck()}
                    className="neon-button px-3 py-2 text-xs font-bold text-white"
                  >
                    I&apos;ve Tapped Done
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelActiveSession}
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: LINK GOOGLE PHOTOS (GMAIL + APP / WEB + PHONE PICKER) */}
          {activeTab === 'link' && (
            <div className="mt-5 space-y-4">
              {/* Step A: Gmail Account */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: config.accent }}>
                      Gmail Account
                    </p>
                    {stateSnapshot.account ? (
                      <div className="mt-1.5 flex items-center gap-2.5">
                        {stateSnapshot.account.picture ? (
                          <img
                            src={stateSnapshot.account.picture}
                            alt=""
                            className="h-8 w-8 rounded-full border border-white/20 object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20 text-xs font-black text-emerald-300">
                            {stateSnapshot.account.email[0]?.toUpperCase() || 'G'}
                          </span>
                        )}
                        <div>
                          <p className="text-sm font-bold text-white">{stateSnapshot.account.email}</p>
                          <p className="text-[11px] text-emerald-300">Connected to Google Photos</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs leading-5 text-white/62">
                        Connect the Gmail account where your phone saves photos to Google Photos.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleConnectGmail(Boolean(stateSnapshot.account))}
                      className="neon-button flex items-center gap-2 px-3.5 py-2 text-xs font-black"
                      style={{ color: '#8ab4ff', borderColor: '#4285f466' }}
                    >
                      <RefreshCw size={13} />
                      {stateSnapshot.account ? 'Switch Gmail' : 'Link Gmail Account'}
                    </button>
                    {stateSnapshot.account && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void disconnectGooglePhotos(false)}
                        className="rounded-lg border border-white/12 px-3 py-2 text-xs font-semibold text-white/65 hover:text-white"
                        title="Unlink Gmail account"
                      >
                        <LogOut size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowClientIdSetup(v => !v)}
                      className="rounded-lg border border-white/12 px-2.5 py-2 text-xs text-white/55 hover:text-white"
                      title="Configure Google Cloud OAuth Client ID"
                      aria-label="Configure Google Cloud OAuth Client ID"
                    >
                      <KeyRound size={13} />
                    </button>
                  </div>
                </div>

                {(showClientIdSetup || !configuredClientId) && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/35 p-3">
                    <p className="text-xs font-bold text-white/85">
                      Google Cloud OAuth Client ID {!configuredClientId && '(needed for direct Gmail OAuth)'}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-white/55">
                      Enable <strong>Google Photos Picker API</strong> in Google Cloud Console and paste your Web OAuth Client ID (or set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code>).
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={clientIdInput}
                        onChange={event => setClientIdInput(event.target.value)}
                        placeholder="123456789-abc.apps.googleusercontent.com"
                        className="w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSaveClientId}
                        className="neon-button shrink-0 px-3.5 py-2 text-xs font-black"
                        style={{ color: config.primary, borderColor: `${config.primary}55` }}
                      >
                        Save ID
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Step B: Choose Collection Destination */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: config.accent }}>
                  Collection for Linked Photos
                </p>
                <p className="mt-1 text-xs text-white/60">
                  Organize linked photos into a collection so you can control which collections appear on your site.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetMode('auto')}
                    className="rounded-lg border px-3 py-1.5 text-xs font-bold transition-all"
                    style={{
                      borderColor: targetMode === 'auto' ? config.primary : 'rgba(255,255,255,0.14)',
                      background: targetMode === 'auto' ? `${config.primary}22` : 'rgba(255,255,255,0.04)',
                      color: targetMode === 'auto' ? config.primary : 'rgba(255,255,255,0.75)',
                    }}
                  >
                    Auto by Month &amp; Year
                  </button>

                  {PRESET_COLLECTIONS.map(preset => {
                    const isSelected = targetMode === 'custom' && customCollectionName === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setTargetMode('custom');
                          setCustomCollectionName(preset);
                        }}
                        className="rounded-lg border px-3 py-1.5 text-xs font-bold transition-all"
                        style={{
                          borderColor: isSelected ? config.primary : 'rgba(255,255,255,0.14)',
                          background: isSelected ? `${config.primary}22` : 'rgba(255,255,255,0.04)',
                          color: isSelected ? config.primary : 'rgba(255,255,255,0.75)',
                        }}
                      >
                        {preset}
                      </button>
                    );
                  })}

                  {collections.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetMode('existing');
                        if (!selectedExistingId && collections[0]) {
                          setSelectedExistingId(collections[0].id);
                        }
                      }}
                      className="rounded-lg border px-3 py-1.5 text-xs font-bold transition-all"
                      style={{
                        borderColor: targetMode === 'existing' ? config.primary : 'rgba(255,255,255,0.14)',
                        background: targetMode === 'existing' ? `${config.primary}22` : 'rgba(255,255,255,0.04)',
                        color: targetMode === 'existing' ? config.primary : 'rgba(255,255,255,0.75)',
                      }}
                    >
                      Existing Collection
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setTargetMode('custom')}
                    className="rounded-lg border px-3 py-1.5 text-xs font-bold transition-all"
                    style={{
                      borderColor:
                        targetMode === 'custom' && !PRESET_COLLECTIONS.includes(customCollectionName)
                          ? config.primary
                          : 'rgba(255,255,255,0.14)',
                      background:
                        targetMode === 'custom' && !PRESET_COLLECTIONS.includes(customCollectionName)
                          ? `${config.primary}22`
                          : 'rgba(255,255,255,0.04)',
                      color:
                        targetMode === 'custom' && !PRESET_COLLECTIONS.includes(customCollectionName)
                          ? config.primary
                          : 'rgba(255,255,255,0.75)',
                    }}
                  >
                    + Custom Name
                  </button>
                </div>

                {targetMode === 'existing' && collections.length > 0 && (
                  <select
                    value={selectedExistingId}
                    onChange={event => setSelectedExistingId(event.target.value)}
                    aria-label="Choose existing collection"
                    className="mt-3 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2.5 text-xs font-semibold text-white outline-none"
                  >
                    {collections.map(col => (
                      <option key={col.id} value={col.id}>
                        {col.name} ({col.count} items)
                      </option>
                    ))}
                  </select>
                )}

                {targetMode === 'custom' && (
                  <input
                    value={customCollectionName}
                    onChange={event => setCustomCollectionName(event.target.value)}
                    placeholder="Enter collection or Google Photos album name (e.g. Goa Trip, Wedding, Kids)..."
                    className="mt-3 w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-xs text-white outline-none placeholder:text-white/40"
                  />
                )}
              </div>

              {/* Step C: Launch Google Photos (App / Website / Phone Gallery) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartGooglePhotosPicker()}
                  className="flex flex-col items-start justify-between gap-3 rounded-xl border p-4 text-left transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  style={{
                    borderColor: `${config.primary}66`,
                    background: `linear-gradient(135deg, ${config.primary}26, rgba(66,133,244,0.22))`,
                    boxShadow: `0 10px 30px rgba(0,0,0,0.32)`,
                  }}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                      {busy ? <Loader2 size={19} className="animate-spin text-white" /> : <GooglePhotosIcon size={20} />}
                    </span>
                    <span className="rounded-full bg-white/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                      Gmail Cloud Link
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">
                      Open Google Photos (App / Web)
                    </p>
                    <p className="mt-1 text-xs leading-5 text-white/68">
                      Opens Google Photos app on phone or photos.google.com on PC using your Gmail so you can pick photos &amp; albums.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-start justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.045] p-4 text-left transition-all hover:border-white/30 hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-60"
                >
                  <div className="flex w-full items-center justify-between">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-lg border"
                      style={{ borderColor: `${config.secondary}55`, color: config.secondary, background: `${config.secondary}16` }}
                    >
                      <Smartphone size={19} />
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white/80">
                      Phone &amp; PC Ready
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">
                      Pick from Phone Google Photos / PC
                    </p>
                    <p className="mt-1 text-xs leading-5 text-white/62">
                      Select photos &amp; videos directly from your phone&apos;s Google Photos picker or PC folders into this collection.
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-2.5 text-xs text-white/60">
                <span>Need to check your albums in Google Photos first?</span>
                <a
                  href={GOOGLE_PHOTOS_WEB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-bold hover:underline"
                  style={{ color: config.primary }}
                >
                  Open Google Photos App / Website <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}

          {/* TAB 2: SELECT WHICH COLLECTIONS APPEAR ON THE SITE */}
          {activeTab === 'collections' && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-white">
                    Choose Which Collections Appear on Your Site
                  </p>
                  <p className="mt-0.5 text-xs text-white/60">
                    {visibleCollectionsCount} of {collections.length}{' '}
                    {collections.length === 1 ? 'collection' : 'collections'} visible ({visibleMemoriesCount}{' '}
                    {visibleMemoriesCount === 1 ? 'memory' : 'memories'} shown across Memoriya, Home, Tree, Timeline &amp; Story Mode).
                  </p>
                </div>
                {collections.length > 0 && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setAllGooglePhotosCollectionsSelected(true)}
                      className="neon-button flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
                      style={{ color: '#36f1cd', borderColor: '#36f1cd55' }}
                    >
                      <Eye size={13} /> Show All
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllGooglePhotosCollectionsSelected(false)}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/70 hover:text-white"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <EyeOff size={13} /> Hide All
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Create a new empty or named collection */}
              <form onSubmit={handleCreateCollection} className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <FolderPlus
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45"
                  />
                  <input
                    value={newCollectionDraft}
                    onChange={event => setNewCollectionDraft(event.target.value)}
                    placeholder="Create a new collection (e.g. Family Album, Goa Trip, Favorites)..."
                    className="w-full rounded-lg border border-white/15 bg-white/[0.05] py-2.5 pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/40"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newCollectionDraft.trim()}
                  className="neon-button flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-black disabled:opacity-45"
                  style={{ color: config.primary, borderColor: `${config.primary}55` }}
                >
                  <Plus size={14} /> Create Collection
                </button>
              </form>

              {collections.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06]">
                    <GooglePhotosIcon size={24} />
                  </div>
                  <p className="text-sm font-black text-white">No Google Photos collections linked yet</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-white/58">
                    Link photos from your Google Photos app or website first, or create a collection above and add photos from your phone or PC.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('link')}
                    className="neon-button mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-xs font-black"
                    style={{ color: config.primary, borderColor: `${config.primary}55` }}
                  >
                    <GooglePhotosIcon size={15} /> Link Google Photos Now
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {collections.map(col => {
                    const isEditing = editingCollectionId === col.id;
                    return (
                      <div
                        key={col.id}
                        className="flex flex-col justify-between overflow-hidden rounded-xl border transition-all"
                        style={{
                          borderColor: col.selected ? '#36f1cd66' : 'rgba(255,255,255,0.12)',
                          background: col.selected
                            ? 'linear-gradient(160deg, rgba(54,241,205,0.09), rgba(255,255,255,0.03))'
                            : 'rgba(255,255,255,0.025)',
                        }}
                      >
                        <div className="flex items-start gap-3 p-3.5">
                          <button
                            type="button"
                            onClick={() => setGooglePhotosCollectionSelected(col.id, !col.selected)}
                            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black/40"
                            aria-label={`Toggle ${col.name} visibility on site`}
                          >
                            {col.coverMemory ? (
                              <DriveMediaPreview
                                memory={col.coverMemory}
                                alt={col.name}
                                className="h-full w-full object-cover"
                                eager
                              />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center">
                                <GooglePhotosIcon size={22} />
                              </span>
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  value={editingCollectionName}
                                  onChange={event => setEditingCollectionName(event.target.value)}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter') handleSaveRename(col.id);
                                    if (event.key === 'Escape') setEditingCollectionId(null);
                                  }}
                                  autoFocus
                                  className="w-full rounded border border-white/25 bg-black/60 px-2 py-1 text-xs font-bold text-white outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(col.id)}
                                  className="rounded bg-emerald-400/20 px-2 py-1 text-[11px] font-bold text-emerald-200"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <h3 className="truncate text-sm font-black text-white">{col.name}</h3>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCollectionId(col.id);
                                    setEditingCollectionName(col.name);
                                  }}
                                  className="shrink-0 text-white/45 hover:text-white"
                                  aria-label={`Rename ${col.name}`}
                                  title="Rename collection"
                                >
                                  <Pencil size={12} />
                                </button>
                              </div>
                            )}

                            <p className="mt-1 text-xs text-white/58">
                              {col.photoCount} {col.photoCount === 1 ? 'photo' : 'photos'}
                              {col.videoCount > 0 ? ` · ${col.videoCount} ${col.videoCount === 1 ? 'video' : 'videos'}` : ''}
                            </p>

                            <button
                              type="button"
                              role="switch"
                              aria-checked={col.selected}
                              onClick={() => setGooglePhotosCollectionSelected(col.id, !col.selected)}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black transition-all"
                              style={{
                                borderColor: col.selected ? '#36f1cd66' : 'rgba(255,255,255,0.16)',
                                background: col.selected ? 'rgba(54,241,205,0.16)' : 'rgba(255,255,255,0.05)',
                                color: col.selected ? '#36f1cd' : 'rgba(255,255,255,0.55)',
                              }}
                            >
                              {col.selected ? <Check size={12} /> : <EyeOff size={12} />}
                              {col.selected ? 'Appears on Site' : 'Hidden from Site'}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-black/25 px-3.5 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleStartGooglePhotosPicker({
                                  mode: 'existing',
                                  collectionId: col.id,
                                })
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-300 hover:underline disabled:opacity-50"
                            >
                              <GooglePhotosIcon size={12} /> + Google Photos
                            </button>
                            <span className="text-white/20">|</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setAddingToCollectionId(col.id);
                                collectionFileInputRef.current?.click();
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-white/75 hover:text-white disabled:opacity-50"
                            >
                              <Upload size={11} /> + Phone / PC
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteGooglePhotosCollection(col.id)}
                            className="text-white/40 hover:text-rose-300"
                            aria-label={`Delete collection ${col.name}`}
                            title="Remove collection"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/52">
              Checked collections appear immediately across Memoriya, Home, Tree, Timeline, Events &amp; Story Mode.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-5 py-2.5 text-xs font-black text-black"
              style={{
                background: `linear-gradient(135deg, ${config.primary}, ${config.secondary})`,
                boxShadow: `0 0 22px ${config.glow}`,
              }}
            >
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

export default GooglePhotosModal;

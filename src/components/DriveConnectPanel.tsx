import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Cloud, FolderOpen, Upload } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { googleDriveService, type DriveConnectionState } from '../services/googleDriveService';
import { readDriveAccessToken, readDriveMemories, saveDriveMemories } from '../services/driveLibrary';

const emptyState: DriveConnectionState = {
  connected: false,
  loading: false,
  folders: [],
};

const DriveConnectPanel: React.FC = () => {
  const { config } = useTheme();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<DriveConnectionState>(() => {
    const memories = readDriveMemories();
    const accessToken = readDriveAccessToken();
    if (!accessToken && !memories.length) return emptyState;
    return {
      connected: true,
      loading: false,
      accessToken: accessToken || memories[0]?.authToken,
      mode: 'google',
      folders: [{ id: 'drive-root', name: 'Google Drive Photos', mediaCount: memories.length, selected: true }],
      message: 'Google Drive session restored from this browser.',
    };
  });

  const handleConnect = async () => {
    setState(current => ({ ...current, loading: true }));
    try {
      const next = await googleDriveService.connect();
      setState(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google Drive connection failed.';
      setState(current => ({
        ...current,
        loading: false,
        error: /cancel|closed/i.test(message) ? undefined : message,
        message: /cancel|closed/i.test(message) ? 'Google Drive connection cancelled.' : undefined,
      }));
    }
  };

  const handleUpload = async (files: FileList | null) => {
    const nextFiles = Array.from(files || []).filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (!nextFiles.length) return;

    const accessToken = state.accessToken || readDriveAccessToken();
    if (!accessToken) {
      setState(current => ({ ...current, error: 'Connect Google Drive before uploading media.' }));
      return;
    }

    setUploading(true);
    setState(current => ({ ...current, error: undefined, message: 'Uploading media to Google Drive...' }));
    try {
      const uploaded = [];
      for (const file of nextFiles) {
        uploaded.push(await googleDriveService.uploadMedia(accessToken, file));
      }
      const currentMemories = readDriveMemories();
      const importedMemories = uploaded.map(file => googleDriveService.toMemory(file, accessToken));
      saveDriveMemories([...currentMemories, ...importedMemories], accessToken);
      setState(current => ({
        ...current,
        connected: true,
        accessToken,
        error: undefined,
        folders: current.folders.map(folder => folder.id === 'drive-root'
          ? { ...folder, mediaCount: folder.mediaCount + uploaded.length }
          : folder),
        message: `${uploaded.length} ${uploaded.length === 1 ? 'memory is' : 'memories are'} now in Google Drive.`,
      }));
    } catch (error) {
      setState(current => ({
        ...current,
        error: error instanceof Error ? error.message : 'Drive upload failed. Please try again.',
      }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="neon-card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border"
          style={{ borderColor: '#4285f455', color: '#8ab4ff', background: 'rgba(66,133,244,0.13)' }}
        >
          <Cloud size={22} />
        </span>
        <div>
          <h2 className="font-black text-white">{state.connected ? 'Google Drive linked' : 'Connect Google Drive'}</h2>
          <p className="mt-1 text-sm leading-6 text-white/58">
            {state.connected
              ? 'Selected folders are ready for metadata extraction and memory grouping.'
              : 'Connect Drive or upload media to generate a private memory world.'}
          </p>
          {(state.message || state.error) && (
            <p className={`mt-3 text-xs leading-5 ${state.error ? 'text-rose-200' : 'text-white/58'}`} role={state.error ? 'alert' : undefined}>
              {state.error || state.message}
            </p>
          )}
          {state.connected && (
            <div className="mt-3 flex flex-wrap gap-2">
              {state.folders.map(folder => (
                <span key={folder.id} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs text-white/64" style={{ borderColor: config.primary + '24' }}>
                  {folder.selected ? <Check size={13} style={{ color: '#36f1cd' }} /> : <FolderOpen size={13} />}
                  {folder.name} ({folder.mediaCount})
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <motion.button
          onClick={handleConnect}
          disabled={state.loading}
          whileHover={{ scale: state.loading ? 1 : 1.02 }}
          whileTap={{ scale: state.loading ? 1 : 0.98 }}
          className="neon-button px-5 py-3 text-sm font-black"
          style={{ color: state.connected ? '#36f1cd' : '#8ab4ff', borderColor: state.connected ? '#36f1cd55' : '#4285f455' }}
        >
          {state.loading ? 'Connecting...' : state.connected ? 'Connected' : 'Connect Drive'}
        </motion.button>
        <button
          className="neon-button flex items-center justify-center gap-2 px-5 py-3 text-sm font-black disabled:cursor-wait disabled:opacity-55"
          style={{ color: config.primary, borderColor: config.primary + '44' }}
          disabled={state.loading || uploading}
          onClick={() => uploadInputRef.current?.click()}
        >
          <Upload size={15} />
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={event => {
            void handleUpload(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
      </div>
    </div>
  );
};

export default DriveConnectPanel;

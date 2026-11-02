import React, { useEffect, useRef, useState } from 'react';
import {
  GooglePhotoMediaItem,
  getAllExtraMediaItems,
  getGooglePhotosAccessToken,
  importLocalOrMobileFiles,
  installUniversalMemoryaHooks,
  listGooglePhotosLibraryItems,
  loadAllStoredBlobItemsFromIDB,
  pickGooglePhotosInteractive,
  requestGooglePhotosLink,
} from './googlePhotosService';

interface GooglePhotosLinkButtonProps {
  clientId?: string;
  onPhotosLoaded?: (photos: GooglePhotoMediaItem[]) => void;
  className?: string;
}

export const GooglePhotosLinkButton: React.FC<GooglePhotosLinkButtonProps> = ({
  clientId,
  onPhotosLoaded,
  className = '',
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [linkedCount, setLinkedCount] = useState<number>(() => getAllExtraMediaItems().length);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    installUniversalMemoryaHooks();
    loadAllStoredBlobItemsFromIDB().then((items) => {
      const all = getAllExtraMediaItems();
      setLinkedCount(all.length || items.length);
      if (all.length > 0) {
        onPhotosLoaded?.(all);
      }
    });

    const handleLoaded = (e: Event) => {
      const custom = e as CustomEvent<GooglePhotoMediaItem[]>;
      const items = custom.detail || getAllExtraMediaItems();
      setLinkedCount(items.length);
      onPhotosLoaded?.(items);
    };
    window.addEventListener('memorya:google-photos-loaded', handleLoaded);
    return () => window.removeEventListener('memorya:google-photos-loaded', handleLoaded);
  }, []);

  const handleGooglePhotosClick = async () => {
    setLoading(true);
    setStatus('Connecting to Google Photos...');
    try {
      let token = getGooglePhotosAccessToken();
      if (!token) {
        token = await requestGooglePhotosLink(clientId);
      }

      const libraryItems = await listGooglePhotosLibraryItems(token);
      if (libraryItems.length > 0) {
        const allNow = getAllExtraMediaItems();
        setLinkedCount(allNow.length);
        onPhotosLoaded?.(allNow);
      }

      const allPicked = await pickGooglePhotosInteractive(token, (msg) => setStatus(msg));
      setLinkedCount(allPicked.length);
      onPhotosLoaded?.(allPicked);
      setStatus(`Synced ${allPicked.length} photos`);
    } catch (err: any) {
      console.warn('Google Photos API fallback to native picker:', err);
      setStatus('Select photos from your Google Photos app / device gallery...');
      fileInputRef.current?.click();
    } finally {
      setLoading(false);
    }
  };

  const handleLocalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setLoading(true);
    const count = e.target.files.length;
    setStatus(`Adding ${count} photo(s)...`);
    try {
      const all = await importLocalOrMobileFiles(e.target.files);
      setLinkedCount(all.length);
      onPhotosLoaded?.(all);
      setStatus(`Added ${count} photo(s) (${all.length} total)`);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div
      data-memorya-google-photos-btn="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={handleLocalFileChange}
      />

      <button
        type="button"
        onClick={handleGooglePhotosClick}
        disabled={loading}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 14px',
          borderRadius: '9999px',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          background:
            'linear-gradient(135deg, #4285F4 0%, #EA4335 35%, #FBBC05 70%, #34A853 100%)',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: '13px',
          cursor: loading ? 'wait' : 'pointer',
          boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
        }}
      >
        <span>
          {loading
            ? 'Loading...'
            : linkedCount > 0
            ? `Google Photos (${linkedCount})`
            : 'Google Photos'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 14px',
          borderRadius: '9999px',
          border: '1px solid rgba(255, 255, 255, 0.22)',
          background: 'rgba(30, 41, 59, 0.92)',
          color: '#f8fafc',
          fontWeight: 600,
          fontSize: '13px',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          whiteSpace: 'nowrap',
        }}
      >
        <span>+ Local / Phone Photos</span>
      </button>

      {status && (
        <span style={{ fontSize: '12px', opacity: 0.9 }}>
          {status}
        </span>
      )}
    </div>
  );
};

export default GooglePhotosLinkButton;

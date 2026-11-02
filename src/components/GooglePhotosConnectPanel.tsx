import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, EyeOff, FolderHeart, Plus } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import GooglePhotosModal, { GooglePhotosIcon } from './GooglePhotosModal';
import {
  ensureGooglePhotosBootHydration,
  GOOGLE_PHOTOS_UPDATED_EVENT,
  readGooglePhotosCollectionsSummary,
  readGooglePhotosState,
  setGooglePhotosCollectionSelected,
  type GooglePhotosCollectionSummary,
} from '../services/googlePhotosService';

export const GooglePhotosBoot: React.FC = () => {
  useEffect(() => {
    ensureGooglePhotosBootHydration();
  }, []);
  return null;
};

const GooglePhotosConnectPanel: React.FC = () => {
  const { config } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'link' | 'collections'>('link');
  const [accountEmail, setAccountEmail] = useState(() => readGooglePhotosState().account?.email || '');
  const [collections, setCollections] = useState<GooglePhotosCollectionSummary[]>(() =>
    readGooglePhotosCollectionsSummary(),
  );

  useEffect(() => {
    ensureGooglePhotosBootHydration();
    const sync = () => {
      setAccountEmail(readGooglePhotosState().account?.email || '');
      setCollections(readGooglePhotosCollectionsSummary());
    };
    window.addEventListener(GOOGLE_PHOTOS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(GOOGLE_PHOTOS_UPDATED_EVENT, sync);
  }, []);

  const linked = Boolean(accountEmail || collections.length > 0);
  const selectedCollections = collections.filter(col => col.selected);
  const visibleItemsCount = selectedCollections.reduce((sum, col) => sum + col.count, 0);

  const openModal = (tab: 'link' | 'collections') => {
    setModalTab(tab);
    setModalOpen(true);
  };

  return (
    <>
      <div className="neon-card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border"
            style={{
              borderColor: 'rgba(251, 188, 4, 0.38)',
              background:
                'linear-gradient(135deg, rgba(66,133,244,0.16), rgba(234,67,53,0.14), rgba(251,188,4,0.14), rgba(52,168,83,0.16))',
            }}
          >
            <GooglePhotosIcon size={23} />
          </span>

          <div>
            <h2 className="font-black text-white">
              {linked ? 'Google Photos linked' : 'Link Google Photos (Phone & PC)'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-white/58">
              {linked
                ? `${accountEmail ? `${accountEmail} · ` : ''}${selectedCollections.length} of ${collections.length} ${collections.length === 1 ? 'collection' : 'collections'} visible (${visibleItemsCount} ${visibleItemsCount === 1 ? 'memory' : 'memories'} on site). Tap a collection below to show or hide it.`
                : 'Link the Gmail account used by Google Photos on your phone or PC, then select which collections appear across your site.'}
            </p>

            {collections.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {collections.map(col => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setGooglePhotosCollectionSelected(col.id, !col.selected)}
                    title={
                      col.selected
                        ? `Click to hide "${col.name}" from site`
                        : `Click to show "${col.name}" on site`
                    }
                    className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all"
                    style={{
                      borderColor: col.selected ? '#36f1cd66' : 'rgba(255,255,255,0.14)',
                      background: col.selected ? 'rgba(54,241,205,0.11)' : 'rgba(255,255,255,0.03)',
                      color: col.selected ? '#e6fff9' : 'rgba(255,255,255,0.48)',
                    }}
                  >
                    {col.selected ? (
                      <Check size={13} style={{ color: '#36f1cd' }} />
                    ) : (
                      <EyeOff size={13} className="text-white/40" />
                    )}
                    <span>
                      {col.name} ({col.count})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <motion.button
            type="button"
            onClick={() => openModal('link')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="neon-button flex items-center justify-center gap-2 px-5 py-3 text-sm font-black"
            style={{
              color: linked ? '#36f1cd' : '#ffd166',
              borderColor: linked ? '#36f1cd55' : '#fbbc0466',
            }}
          >
            {linked ? <Plus size={15} /> : <GooglePhotosIcon size={16} />}
            <span>{linked ? 'Add Google Photos' : 'Link Google Photos'}</span>
          </motion.button>

          <button
            type="button"
            onClick={() => openModal('collections')}
            className="neon-button flex items-center justify-center gap-2 px-5 py-3 text-sm font-black"
            style={{ color: config.primary, borderColor: `${config.primary}44` }}
          >
            <FolderHeart size={15} />
            <span>
              Collections{collections.length > 0 ? ` (${selectedCollections.length}/${collections.length})` : ''}
            </span>
          </button>
        </div>
      </div>

      <GooglePhotosModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialTab={modalTab}
      />
    </>
  );
};

export default GooglePhotosConnectPanel;

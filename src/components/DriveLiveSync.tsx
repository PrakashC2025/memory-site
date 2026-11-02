import React, { useEffect } from 'react';
import { isVisualMemory, type Memory } from '../data/memories';
import {
  clearDriveChangePageToken,
  acquireDriveSyncLock,
  DRIVE_ACCESS_TOKEN_UPDATED_EVENT,
  readDriveAccessToken,
  readDriveAuthRequired,
  readDriveFolderId,
  readDriveMemories,
  releaseDriveSyncLock,
  saveDriveAccessToken,
  saveDriveAuthRequired,
  saveDriveMemories,
} from '../services/driveLibrary';
import { cacheDriveMediaFiles, deleteCachedDriveMedia } from '../services/driveCache';
import { googleDriveService, isDriveAuthorizationError, isVisualDriveFile, type DriveMediaFile } from '../services/googleDriveService';
import { deleteCachedStoryMedia } from '../services/storyMediaCache';

const isVisualMedia = (file: DriveMediaFile) =>
  isVisualDriveFile(file);

const normalizeFolderId = (folderId?: string) =>
  !folderId || folderId === 'drive-root' ? '' : folderId;

const DriveLiveSync: React.FC = () => {
  useEffect(() => {
    let active = true;
    const driveAuthRequiredRef = { current: readDriveAuthRequired() };
    let syncNow: (() => void) | null = null;
    const onTokenUpdated = (event: Event) => {
      if ((event as CustomEvent<string>).detail) {
        driveAuthRequiredRef.current = false;
        syncNow?.();
      }
    };
    window.addEventListener(DRIVE_ACCESS_TOKEN_UPDATED_EVENT, onTokenUpdated);

    const reconcileFolderSnapshot = async (accessToken: string, folderId: string) => {
      // Record the set of Drive IDs present BEFORE starting the network scan.
      // Any photo uploaded to Drive or captured via DriveCameraCapture while
      // listAllMedia is in flight was NOT in preScanIds and must never be
      // treated as deleted if Drive's index has not yet surfaced it.
      const preScanIds = new Set(
        readDriveMemories()
          .map(memory => memory.driveFileId)
          .filter((id): id is string => Boolean(id)),
      );
      const snapshotFiles = await googleDriveService.listAllMedia(accessToken, folderId);
      const snapshotVisualFiles = snapshotFiles.filter(file => isVisualMedia(file) && !file.trashed);
      const current = readDriveMemories();
      const currentByDriveId = new Map(
        current.filter(memory => memory.driveFileId).map(memory => [memory.driveFileId as string, memory]),
      );
      const imported = snapshotVisualFiles
        .map(file => googleDriveService.toMemory(file, accessToken))
        .filter(memory => {
          const existing = memory.driveFileId ? currentByDriveId.get(memory.driveFileId) : undefined;
          if (!existing) return true;
          return existing.title !== memory.title ||
            existing.date !== memory.date ||
            existing.type !== memory.type ||
            existing.mimeType !== memory.mimeType ||
            existing.modifiedTime !== memory.modifiedTime ||
            existing.orientation !== memory.orientation ||
            existing.width !== memory.width ||
            existing.height !== memory.height ||
            existing.thumbnail !== memory.thumbnail;
        });
      const importedIds = new Set(imported.map(memory => memory.driveFileId).filter(Boolean));
      const snapshotIds = new Set(snapshotVisualFiles.map(file => file.id));
      // Only remove files that existed BEFORE the scan started and are now absent
      // from the snapshot; never remove a freshly uploaded photo published mid-scan.
      const removed = new Set(current
        .filter(memory => memory.driveFileId && preScanIds.has(memory.driveFileId) && !snapshotIds.has(memory.driveFileId))
        .map(memory => memory.driveFileId as string));
      const filesToCache = snapshotVisualFiles.filter(file => {
        const existing = currentByDriveId.get(file.id);
        return !existing || importedIds.has(file.id);
      });
      return { imported, removed, filesToCache };
    };

    const sync = async () => {
      if (!active || !dueForSync()) return;
      // Yield to Story Mode's fast 2s changes-feed poller while the camera wall
      // is active so a full-library scan never blocks live Story Mode insertions.
      if (document.documentElement.classList.contains('heavy-visual-paused') || document.querySelector('[data-reel-state]')) {
        return;
      }
      if (driveAuthRequiredRef.current || readDriveAuthRequired() || !acquireDriveSyncLock()) return;
      lastSyncAt = Date.now();
      let accessToken = readDriveAccessToken();
      if (!accessToken) {
        releaseDriveSyncLock();
        return;
      }
      const folderId = normalizeFolderId(readDriveFolderId());
      try {
        let result: Awaited<ReturnType<typeof reconcileFolderSnapshot>>;
        try {
          result = await reconcileFolderSnapshot(accessToken, folderId);
        } catch (error) {
          if (!isDriveAuthorizationError(error)) throw error;
          accessToken = await googleDriveService.refreshAccessToken(undefined, true);
          saveDriveAccessToken(accessToken);
          driveAuthRequiredRef.current = false;
          saveDriveAuthRequired(false);
          result = await reconcileFolderSnapshot(accessToken, folderId);
        }
        const { imported, removed, filesToCache } = result;
        if (!active) return;
        if (removed.size) {
          void Promise.all(Array.from(removed).flatMap(id => [deleteCachedDriveMedia(id), deleteCachedStoryMedia(id)]));
        }
        const cachePromise = filesToCache.length
          ? cacheDriveMediaFiles(filesToCache, accessToken)
          : Promise.resolve();
        if (removed.size || imported.length) {
          const latest = mergeDriveMemories(readDriveMemories(), imported, removed);
          saveDriveMemories(latest, accessToken, folderId);
        }
        if (filesToCache.length) {
          void cachePromise.then(() => {
            if (active && normalizeFolderId(readDriveFolderId()) === folderId && readDriveAccessToken() === accessToken && (removed.size || imported.length)) {
              saveDriveMemories(readDriveMemories(), accessToken, folderId, false);
            }
          });
        }
      } catch (error) {
        if (isDriveAuthorizationError(error)) {
          driveAuthRequiredRef.current = true;
          saveDriveAuthRequired(true);
          clearDriveChangePageToken();
        }
      } finally {
        releaseDriveSyncLock();
      }
    };

    const SYNC_INTERVAL_MS = 60000;
    const SYNC_COOLDOWN_MS = 45000;
    let lastSyncAt = 0;
    const dueForSync = () => Date.now() - lastSyncAt >= SYNC_COOLDOWN_MS;

    syncNow = () => void sync();
    const onFocus = () => syncNow?.();
    const onOnline = () => syncNow?.();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncNow?.();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    void sync();
    const interval = window.setInterval(() => void sync(), SYNC_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
      syncNow = null;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener(DRIVE_ACCESS_TOKEN_UPDATED_EVENT, onTokenUpdated);
    };
  }, []);

  return null;
};

const mergeDriveMemories = (current: Memory[], imported: Memory[], removed = new Set<string>()) => {
  const importedById = new Map(imported.map(memory => [memory.driveFileId, memory]));
  const kept = current.filter(memory => isVisualMemory(memory) && (!memory.driveFileId || !removed.has(memory.driveFileId)));
  const replaced = kept.map(memory => memory.driveFileId && importedById.get(memory.driveFileId)
    ? importedById.get(memory.driveFileId)!
    : memory);
  const existingIds = new Set(replaced.map(memory => memory.driveFileId || memory.id));
  return [...replaced, ...imported.filter(memory => !existingIds.has(memory.driveFileId || memory.id))]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export default DriveLiveSync;

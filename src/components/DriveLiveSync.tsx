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
      // The Drive changes feed can occasionally lag, omit a usable file
      // payload, or reject an old cursor. A fresh metadata-only folder snapshot
      // keeps additions and deletions live without downloading the
      // media before it is needed.
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
            existing.thumbnail !== memory.thumbnail;
        });
      const importedIds = new Set(imported.map(memory => memory.driveFileId).filter(Boolean));
      const snapshotIds = new Set(snapshotVisualFiles.map(file => file.id));
      const removed = new Set(current
        .filter(memory => memory.driveFileId && !snapshotIds.has(memory.driveFileId))
        .map(memory => memory.driveFileId as string));
      const filesToCache = snapshotVisualFiles.filter(file => {
        const existing = currentByDriveId.get(file.id);
        return !existing || importedIds.has(file.id);
      });
      return { imported, removed, filesToCache };
    };

    const sync = async () => {
      if (!active || driveAuthRequiredRef.current || readDriveAuthRequired() || !acquireDriveSyncLock()) return;
      let accessToken = readDriveAccessToken();
      if (!accessToken) {
        releaseDriveSyncLock();
        return;
      }
      const folderId = readDriveFolderId();
      try {
        let result: Awaited<ReturnType<typeof reconcileFolderSnapshot>>;
        try {
          result = await reconcileFolderSnapshot(accessToken, folderId);
        } catch (error) {
          if (!isDriveAuthorizationError(error)) throw error;
          // Access tokens expire while the TV/story screen stays open. Try a
          // prompt-free GIS refresh before giving up on live synchronization.
          accessToken = await googleDriveService.refreshAccessToken(undefined, true);
          saveDriveAccessToken(accessToken);
          driveAuthRequiredRef.current = false;
          saveDriveAuthRequired(false);
          result = await reconcileFolderSnapshot(accessToken, folderId);
        }
        const { imported, removed, filesToCache } = result;
        if (!active) return;
        const next = mergeDriveMemories(readDriveMemories(), imported, removed);
        if (removed.size) {
          void Promise.all(Array.from(removed).flatMap(id => [deleteCachedDriveMedia(id), deleteCachedStoryMedia(id)]));
        }
        const cachePromise = filesToCache.length
          ? cacheDriveMediaFiles(filesToCache, accessToken)
          : Promise.resolve();
        if (removed.size || imported.length) saveDriveMemories(next, accessToken, folderId);
        if (filesToCache.length) {
          // The first event makes the new metadata visible immediately. The
          // second event swaps the new item to its local blob after the
          // background download finishes, so Story Mode never gets stuck on a
          // missing preview or waits for a manual refresh.
          void cachePromise.then(() => {
            if (active && readDriveFolderId() === folderId && readDriveAccessToken() === accessToken && (removed.size || imported.length)) {
              saveDriveMemories(readDriveMemories(), accessToken, folderId);
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
    const interval = window.setInterval(() => void sync(), 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
      syncNow = null;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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

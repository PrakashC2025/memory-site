import React, { useEffect } from 'react';
import { isVisualMemory, type Memory } from '../data/memories';
import {
  clearDriveChangePageToken,
  acquireDriveSyncLock,
  readDriveAccessToken,
  readDriveChangePageToken,
  readDriveFolderId,
  readDriveMemories,
  removeDriveMemories,
  releaseDriveSyncLock,
  saveDriveAccessToken,
  saveDriveChangePageToken,
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

    const sync = async () => {
      if (!active || !acquireDriveSyncLock()) return;
      const accessToken = readDriveAccessToken();
      if (!accessToken) {
        releaseDriveSyncLock();
        return;
      }
      const folderId = readDriveFolderId();
      try {
        let changePageToken = readDriveChangePageToken();
        if (!changePageToken) {
          const startPageToken = await googleDriveService.getStartPageToken(accessToken);
          const files = await googleDriveService.listAllMedia(accessToken, folderId);
          if (!active) return;
          const imported = files.filter(file => isVisualMedia(file) && !file.trashed)
            .map(file => googleDriveService.toMemory(file, accessToken));
          const next = mergeDriveMemories(readDriveMemories(), imported);
          saveDriveMemories(next, accessToken, folderId);
          void cacheDriveMediaFiles(files, accessToken);
          saveDriveChangePageToken(startPageToken);
          return;
        }

        const changedFiles: DriveMediaFile[] = [];
        const removedIds: string[] = [];
        let nextStartPageToken = '';
        do {
          const page = await googleDriveService.listChanges(accessToken, changePageToken);
          if (!active) return;
          page.changes.forEach(change => {
            if (change.removed || !change.file) removedIds.push(change.fileId);
            else changedFiles.push(change.file);
          });
          changePageToken = page.nextPageToken || '';
          nextStartPageToken = page.newStartPageToken || nextStartPageToken;
        } while (changePageToken && active);
        if (!active) return;

        const inFolder = (file: DriveMediaFile) => !folderId || !file.parents || file.parents.includes(folderId);
        const removed = new Set([
          ...removedIds,
          ...changedFiles.filter(file => !isVisualMedia(file) || !inFolder(file) || file.trashed).map(file => file.id),
        ]);
        const imported = changedFiles.filter(file => isVisualMedia(file) && inFolder(file) && !file.trashed)
          .map(file => googleDriveService.toMemory(file, accessToken));
        const next = mergeDriveMemories(readDriveMemories(), imported, removed);
        if (removed.size) {
          removeDriveMemories(removed);
          void Promise.all(Array.from(removed).flatMap(id => [deleteCachedDriveMedia(id), deleteCachedStoryMedia(id)]));
        }
        if (imported.length) void cacheDriveMediaFiles(changedFiles.filter(file => isVisualMedia(file) && inFolder(file)), accessToken);
        if (removed.size || imported.length) saveDriveMemories(next, accessToken, folderId);
        const nextToken = nextStartPageToken || readDriveChangePageToken();
        saveDriveChangePageToken(nextToken);
      } catch (error) {
        if (error instanceof Error && /Drive scan failed \(4\d\d\)/i.test(error.message)) {
          clearDriveChangePageToken();
        }
        if (isDriveAuthorizationError(error)) {
          try {
            const refreshedToken = await googleDriveService.refreshAccessToken(undefined, true);
            saveDriveAccessToken(refreshedToken);
          } catch {
            // Cached memories remain available until the user reconnects.
          }
        }
      } finally {
        releaseDriveSyncLock();
      }
    };

    void sync();
    const interval = window.setInterval(() => void sync(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
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

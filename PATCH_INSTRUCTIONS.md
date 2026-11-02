# Memoriya (`PrakashC2025/memory-site`) — Bug Fixes & Stitch Design Upgrade Guide

## 1. Root Cause of Live Drive Uploads Not Appearing While Story Mode Is Playing

1. **`src/pages/StoryMode.tsx` (Line 1000) — `navigator.online` Typo Permadeadlocks Live Polling**
   - **Bug:** `if (typeof navigator !== 'undefined' && !navigator.online) return;`
   - **Why it broke Live Story Mode:** The standard Web API property is `navigator.onLine` (capital `L`), not `navigator.online`. In every browser, `navigator.online` is `undefined`, so `!navigator.online` evaluates to `true` 100% of the time. Every 2-second (`LIVE_STORY_FAST_POLL_MS`) and 8-second (`LIVE_STORY_POLL_MS`) interval tick returned early on line 1000 without ever calling `syncDrive()`.
   - **Fix:** Replace `!navigator.online` with `navigator.onLine === false` (included in `src/pages/StoryMode.tsx` in this archive).

2. **`src/pages/StoryMode.tsx` (Line 962) — `applyCached(known)` Overwrites `freshPublished` Uploads**
   - **Bug:** Line 955 saved `[...known, ...freshPublished]` to `sessionStorage`, but line 962 called `void applyCached(known)` without `freshPublished`. As soon as `hydrateCachedDriveMemories(known)` resolved, it called `setDriveMemories(result.memories)` and wiped out any photo uploaded while the Drive scan was in flight.
   - **Fix:** Pass `mergedKnown` (`[...known, ...freshPublished]`) to `applyCached(mergedKnown)` and track `newlyImportedIdsRef` so newly uploaded Drive photos are promoted to the front of the incoming diff (inserting at `shot + 1` even when the uploaded file has an older EXIF capture date).

3. **`src/pages/Memoriya.tsx` (Lines 266, 274, 335) & `src/services/googleDriveService.ts` (Line 255) — `'drive-root'` Sentinel Folder Mismatch**
   - **Bug:** Connecting Drive or choosing "All My Drive photos" sets `driveFolderId = 'drive-root'`.
     - In `googleDriveService.listMediaPage`, `folderId === 'drive-root'` was not normalized to `''`, sending `'drive-root' in parents` to Google Drive v3 API (which matches 0 files), and `parents` was omitted from the `fields` parameter.
     - In `Memoriya.tsx` line 266 (`const isInFolder = (file: DriveMediaFile) => !driveFolderId || !file.parents || file.parents.includes(driveFolderId);`), files returned by `changes.list` have their real Drive parent ID in `file.parents`, so `file.parents.includes('drive-root')` returned `false`. Line 274 (`idsToRemove`) then treated the newly uploaded photo as deleted and removed it from `memories` and `reelConfig.memories`!
     - In `Memoriya.tsx` line 335, `listMediaPage(accessToken, '', driveFolderId, 100)` defaulted to `orderBy = 'createdTime desc'` instead of `'modifiedTime desc'`, missing newly uploaded files that carried older EXIF creation timestamps.
   - **Fix in `src/pages/Memoriya.tsx` (Lines 265–340):**
     ```tsx
     const activeFolderId = driveFolderId === 'drive-root' ? '' : driveFolderId;
     const isMedia = (file: DriveMediaFile) => isVisualDriveFile(file);
     const isInFolder = (file: DriveMediaFile) =>
       !activeFolderId || !file.parents || file.parents.includes(activeFolderId);
     ```
     And on line 335 inside `if (reelOpenRef.current)`:
     ```tsx
     const latestPage = await googleDriveService.listMediaPage(
       accessToken,
       '',
       activeFolderId,
       100,
       'modifiedTime desc',
     );
     ```

4. **`src/components/DriveLiveSync.tsx` — Background Full-Scan Race Condition**
   - **Bug:** `DriveLiveSync` ran `listAllMedia` while Story Mode was open, holding `acquireDriveSyncLock()` and marking newly uploaded photos as `removed` if they were published after `listAllMedia` started.
   - **Fix:** Yield `DriveLiveSync` while Story Mode is active (`[data-reel-state]` or `.heavy-visual-paused`), normalize `'drive-root'`, and only mark IDs as removed if they existed in `preScanIds` prior to the scan start.

5. **`vite.config.ts` & `public/sw.js` Fixes**
   - Added `/__memoriya-cast` (double underscore) proxy alongside `/_memoriya-cast` in `vite.config.ts` to match `server/realtime-server.js` and `.env.example`.
   - Fixed `public/sw.js` to populate `CACHE_NAME` and guard `caches.match(request)` so offline navigation never passes `undefined` to `event.respondWith()`.

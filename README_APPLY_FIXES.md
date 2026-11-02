# Memory-Site (`claude/design-perf-security`) Full Fix Folder

This folder contains everything needed to fix the bugs on the `claude/design-perf-security` branch of `PrakashC2025/memory-site`:

## Bugs Fixed by This Folder
1. **Missing Count ("ocount") & Unloaded Drive Data (`googleDriveService.ts` & `Memoriya.tsx`)**
   - Normalizes `'drive-root'` to `'root'` in Google Drive v3 `'... in parents'` queries so the root folder files and total item counts load properly instead of returning `0` items.
   - Changes `orderBy: 'createdTime desc'` to `orderBy: 'modifiedTime desc'` in `listMediaPage` so updated/uploaded items appear immediately.
2. **Deadlocked Background Sync Polling (`StoryMode.tsx` & `MemoryReel.tsx`)**
   - Replaces `!navigator.online` (lowercase `l`, which is `undefined` and makes `!navigator.online` always `true`) with `navigator.onLine === false`.
3. **Cached Media Hydration Overwriting New Uploads (`StoryMode.tsx` & `MemoryReel.tsx`)**
   - Updates `applyCached(known)` so `freshPublished` items are merged with `known` by `id` instead of being overwritten when cached Drive data hydrates.
4. **Faster Story Mode Image Loading (`StoryMode.tsx`, `MemoryReel.tsx`, `storyMediaCache.ts`, `mediaQueue.ts`)**
   - Changes Story Mode `<img>` elements from `loading="lazy"` to `loading="eager" decoding="async" fetchPriority="high"`.
   - Increases `mediaQueue.ts` parallel concurrency to `6` and configures async image decoding on preloaded `Image()` instances in `storyMediaCache.ts`.

---

## How to Apply (1 Step)

1. Unzip `memory-site-claude-fix-folder.zip` into your local `memory-site` repository folder.
2. Run the fixer for your OS:
   - **Windows**: Double-click `run_fix_windows.bat` (or run `python apply_claude_branch_fixes.py` from your repo root).
   - **macOS / Linux / Git Bash**:
     ```bash
     bash memory-site-claude-fix-folder/run_fix_mac_linux.sh
     ```
3. Commit and push to your `claude/design-perf-security` branch:
   ```bash
   git commit -am "Fix Drive root count query, navigator.onLine sync deadlock, and preload StoryMode images"
   git push origin claude/design-perf-security
   ```


---

## 5. Linking & Showing Google Photos Alongside Google Drive Photos

This folder now also installs two ready-to-use files into your `src/` folder when you run the patcher:
- `googlePhotosService.ts` — Handles Google Photos OAuth linking, fetches photos from the **Google Photos Library API** (`photoslibrary.googleapis.com/v1/mediaItems`) and the **Google Photos Picker API** (`photospicker.googleapis.com/v1/sessions`), converts authenticated `baseUrl` streams into fast local `blob:` URLs, and caches them for Story Mode and your main gallery.
- `GooglePhotosLinkButton.tsx` — A drop-in **"Link Google Photos"** button component that connects the user's Google Photos account and merges their Google Photos directly into your gallery and Story Mode count.

### Quick Setup in Google Cloud Console (1 Minute)
1. Open [Google Cloud Console -> APIs & Services -> Library](https://console.cloud.google.com/apis/library).
2. Enable both **Google Photos Picker API** and **Photos Library API** on the same Google Cloud project you use for Google Drive.
3. Under **OAuth consent screen -> Scopes**, add:
   - `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`
   - `https://www.googleapis.com/auth/photoslibrary.readonly`

### Adding the "Link Google Photos" Button in `Memoriya.tsx`
Import `GooglePhotosLinkButton` in `Memoriya.tsx` and merge the returned items into your media list and total count:
```tsx
import { GooglePhotosLinkButton } from './GooglePhotosLinkButton';

// Inside your header / toolbar in Memoriya.tsx:
<GooglePhotosLinkButton
  onPhotosLoaded={(googlePhotos) => {
    setMediaItems((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const merged = [...googlePhotos.filter((p) => !existingIds.has(p.id)), ...prev];
      setTotalCount(merged.length);
      return merged;
    });
  }}
/>
```

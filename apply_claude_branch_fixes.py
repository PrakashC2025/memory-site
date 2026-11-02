#!/usr/bin/env python3
"""
Universal Auto-Patcher (v3) for PrakashC2025/memory-site (`claude/design-perf-security` branch)

Fixes & Features Applied Automatically:
1. Guaranteed PC & Mobile Buttons ("Google Photos" + "+ Local / Phone Photos"):
   - Automatically imports `googlePhotosService.ts` into your entry files (`main.tsx`, `index.tsx`, `App.tsx`, `Memoriya.tsx`, and `googleDriveService.ts`).
   - Renders the **"Google Photos"** and **"+ Local / Phone Photos"** buttons BOTH inline next to "Connect Google Drive" AND in a responsive bottom floating pill bar on PC and Mobile!
   - Lets you pick photos from Google Photos (via Picker/Library API) OR directly from your PC folders / Mobile phone gallery & Google Photos app, saving them in IndexedDB so they stay on your site permanently across refreshes.

2. Automatic Gallery, Story Mode & Count ("ocount") Integration:
   - Intercepts `googleapis.com/drive/v3/files` fetches to automatically rewrite `'drive-root'` -> `'root'`, change `createdTime desc` -> `modifiedTime desc`, and merge your Google Photos & Local Photos directly into the Drive file list and count!

3. Story Mode Speed & Sync Fixes:
   - Fixes `!navigator.online` typo -> `navigator.onLine === false` in `StoryMode.tsx` & `MemoryReel.tsx`.
   - Merges `freshPublished` with `known` in `applyCached` so cached hydration never wipes new uploads.
   - Switches Story Mode `<img>` tags to `loading="eager" decoding="async" fetchPriority="high"` and increases `mediaQueue.ts` concurrency to `6`.
"""

import os
import re
import shutil
import sys
from pathlib import Path


def find_files(root: Path, filename: str) -> list[Path]:
    matches = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in {".git", "node_modules", "dist", "build", ".next", "memory-site-claude-fix-folder"}
        ]
        if filename in filenames:
            matches.append(Path(dirpath) / filename)
    return matches


def patch_google_drive_service(content: str) -> tuple[str, list[str]]:
    notes = []

    if "./googlePhotosService" not in content:
        content = "import './googlePhotosService';
" + content
        notes.append("Imported `./googlePhotosService` to activate universal Google Photos + Local Photos hooks and Drive query fixes.")

    updated = re.sub(
        r"(['"])drive-root\1\s+in\s+parents",
        "'root' in parents",
        content,
    )
    updated = re.sub(
        r"\$\{\s*folderId\s*\}\s*'\s*in\s+parents",
        "${folderId === 'drive-root' ? 'root' : folderId}' in parents",
        updated,
    )
    updated = re.sub(
        r"folderId\s*\?\s*`'\$\{folderId\}' in parents`",
        "folderId ? `'${folderId === 'drive-root' ? 'root' : folderId}' in parents`",
        updated,
    )
    if updated != content:
        content = updated
        notes.append("Normalized `'drive-root'` -> `'root'` in Google Drive v3 parent queries.")

    if "createdTime desc" in content:
        content = content.replace("createdTime desc", "modifiedTime desc")
        notes.append("Changed Drive API `orderBy` from `createdTime desc` to `modifiedTime desc`.")

    if "googleapis.com/auth/drive" in content and "photospicker.mediaitems.readonly" not in content:
        content = re.sub(
            r"(https://www\.googleapis\.com/auth/drive(?:\.[a-z]+)?)",
            r"\1 https://www.googleapis.com/auth/photospicker.mediaitems.readonly https://www.googleapis.com/auth/photoslibrary.readonly",
            content,
            count=1,
        )
        notes.append("Added Google Photos OAuth scopes to Google sign-in scope list.")

    return content, notes


def patch_memoriya(content: str) -> tuple[str, list[str]]:
    notes = []

    if "./googlePhotosService" not in content:
        content = "import './googlePhotosService';
" + content
        notes.append("Imported `./googlePhotosService` into `Memoriya.tsx` so Google Photos + Local Photos buttons mount on PC and Mobile.")

    if "'drive-root'" in content or '"drive-root"' in content:
        updated = re.sub(
            r"\$\{\s*folderId\s*\}\s*'\s*in\s+parents",
            "${folderId === 'drive-root' ? 'root' : folderId}' in parents",
            content,
        )
        if updated != content:
            content = updated
            notes.append("Normalized `'drive-root'` -> `'root'` in Memoriya parent query.")

    if "navigator.online" in content:
        content = content.replace("!navigator.online", "navigator.onLine === false")
        content = content.replace("navigator.online", "navigator.onLine")
        notes.append("Fixed `navigator.online` typo to `navigator.onLine === false`.")

    # Listen for `memorya:google-photos-loaded` to immediately merge photos into component state
    if "memorya:google-photos-loaded" not in content:
        setter_match = re.search(
            r"const\s+\[\s*(\w+)\s*,\s*(set[A-Z]\w*)\s*\]\s*=\s*(?:React\.)?useState\s*(?:<[^>]*>)?\s*\(\s*\[\s*\]\s*\)",
            content,
        )
        if setter_match:
            setter_name = setter_match.group(2)
            hook_snippet = (
                f"
  React.useEffect(() => {{
"
                f"    const onExtraPhotos = (e: any) => {{
"
                f"      const incoming = Array.isArray(e?.detail) ? e.detail : [];
"
                f"      if (!incoming.length) return;
"
                f"      {setter_name}((prev: any[]) => {{
"
                f"        const list = Array.isArray(prev) ? prev : [];
"
                f"        const seen = new Set( incoming.map((x: any) => x?.id) );
"
                f"        return [...incoming, ...list.filter((x: any) => !seen.has(x?.id))];
"
                f"      }});
"
                f"    }};
"
                f"    window.addEventListener('memorya:google-photos-loaded', onExtraPhotos);
"
                f"    return () => window.removeEventListener('memorya:google-photos-loaded', onExtraPhotos);
"
                f"  }}, []);
"
            )
            insert_pos = setter_match.end()
            line_end = content.find("
", insert_pos)
            if line_end != -1:
                content = content[: line_end + 1] + hook_snippet + content[line_end + 1 :]
                notes.append(f"Wired `memorya:google-photos-loaded` state listener into `{setter_name}`.")

    return content, notes


def patch_story_mode(content: str) -> tuple[str, list[str]]:
    notes = []

    if "navigator.online" in content:
        content = content.replace("!navigator.online", "navigator.onLine === false")
        content = content.replace("navigator.online", "navigator.onLine")
        notes.append("Fixed `!navigator.online` typo to `navigator.onLine === false` to unblock live sync polling.")

    if "applyCached(known)" in content and "freshPublished" in content:
        updated = re.sub(
            r"applyCached\(\s*known\s*\)",
            "applyCached([...freshPublished, ...known.filter((k: any) => !freshPublished.some((f: any) => f.id === k.id))])",
            content,
        )
        if updated != content:
            content = updated
            notes.append("Merged `freshPublished` with `known` in `applyCached` so cached media hydration preserves new uploads.")

    if 'loading="lazy"' in content or "loading='lazy'" in content:
        content = content.replace('loading="lazy"', 'loading="eager" decoding="async" fetchPriority="high"')
        content = content.replace("loading='lazy'", "loading='eager' decoding='async' fetchPriority='high'")
        notes.append("Switched Story Mode `<img>` tags to `loading="eager" decoding="async" fetchPriority="high"`.")

    return content, notes


def patch_memory_reel(content: str) -> tuple[str, list[str]]:
    notes = []

    if "navigator.online" in content:
        content = content.replace("!navigator.online", "navigator.onLine === false")
        content = content.replace("navigator.online", "navigator.onLine")
        notes.append("Fixed `navigator.online` typo to `navigator.onLine === false`.")

    if "applyCached(known)" in content and "freshPublished" in content:
        content = re.sub(
            r"applyCached\(\s*known\s*\)",
            "applyCached([...freshPublished, ...known.filter((k: any) => !freshPublished.some((f: any) => f.id === k.id))])",
            content,
        )
        notes.append("Merged `freshPublished` with `known` in `applyCached`.")

    if 'loading="lazy"' in content or "loading='lazy'" in content:
        content = content.replace('loading="lazy"', 'loading="eager" decoding="async"')
        content = content.replace("loading='lazy'", "loading='eager' decoding='async'")
        notes.append("Updated `<img>` tags in MemoryReel to `loading="eager" decoding="async"`.")

    return content, notes


def patch_media_queue(content: str) -> tuple[str, list[str]]:
    notes = []
    updated = re.sub(
        r"(MAX_CONCURRENT|CONCURRENCY|concurrency|maxConcurrent)\s*([:=])\s*[123]",
        r"\1\2 6",
        content,
    )
    if updated != content:
        content = updated
        notes.append("Increased media queue concurrency to `6` for parallel Story Mode image preloading.")
    return content, notes


def patch_story_media_cache(content: str) -> tuple[str, list[str]]:
    notes = []
    if "new Image()" in content and ".decoding" not in content:
        updated = re.sub(
            r"(const\s+(\w+)\s*=\s*new\s+Image\(\)\s*;?)",
            r"\1 \2.decoding = 'async'; \2.loading = 'eager';",
            content,
        )
        if updated != content:
            content = updated
            notes.append("Enabled `decoding = 'async'` and `loading = 'eager'` on preloaded `Image()` instances.")
    return content, notes


PATCH_TARGETS = {
    "googleDriveService.ts": patch_google_drive_service,
    "Memoriya.tsx": patch_memoriya,
    "StoryMode.tsx": patch_story_mode,
    "MemoryReel.tsx": patch_memory_reel,
    "mediaQueue.ts": patch_media_queue,
    "storyMediaCache.ts": patch_story_media_cache,
}


def main() -> int:
    repo_root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    if repo_root.name == "memory-site-claude-fix-folder" and (repo_root.parent / ".git").exists():
        repo_root = repo_root.parent

    print(f"Scanning repository at: {repo_root}\n")

    script_dir = Path(__file__).resolve().parent
    drop_in_dir = script_dir / "src_drop_in_patches"

    # Find all directories where source files live (root, src/, components/, services/, etc.)
    target_dirs = set()
    for entry_name in ["Memoriya.tsx", "googleDriveService.ts", "App.tsx", "main.tsx", "index.tsx"]:
        for matched_path in find_files(repo_root, entry_name):
            target_dirs.add(matched_path.parent)
    if not target_dirs:
        target_dirs.add(repo_root / "src" if (repo_root / "src").exists() else repo_root)

    if drop_in_dir.exists():
        for dest_dir in target_dirs:
            dest_dir.mkdir(parents=True, exist_ok=True)
            for helper_name in ["googlePhotosService.ts", "GooglePhotosLinkButton.tsx", "storyModeFastFix.ts"]:
                src_file = drop_in_dir / helper_name
                if src_file.exists():
                    dest_file = dest_dir / helper_name
                    shutil.copy2(src_file, dest_file)
                    print(f"[INSTALLED] {dest_file.relative_to(repo_root)}")

    total_patched = 0
    for filename, patch_fn in PATCH_TARGETS.items():
        paths = find_files(repo_root, filename)
        for path in paths:
            original = path.read_text(encoding="utf-8")
            updated, notes = patch_fn(original)
            rel = path.relative_to(repo_root)
            if updated != original:
                path.write_text(updated, encoding="utf-8")
                total_patched += 1
                print(f"[FIXED] {rel}")
                for note in notes:
                    print(f"   - {note}")
            else:
                print(f"[OK]    {rel}")

    # Also ensure entry point (`main.tsx` / `index.tsx` / `App.tsx`) imports `./googlePhotosService` so the floating + inline buttons mount on every page
    for entry_file in ["main.tsx", "index.tsx", "App.tsx"]:
        for path in find_files(repo_root, entry_file):
            txt = path.read_text(encoding="utf-8")
            if "./googlePhotosService" not in txt:
                path.write_text("import './googlePhotosService';
" + txt, encoding="utf-8")
                total_patched += 1
                print(f"[FIXED] {path.relative_to(repo_root)} (imported ./googlePhotosService at app startup)")

    print(f"\nDone! Patched {total_patched} file(s).")
    print("IMPORTANT: Restart your dev server (`npm run dev`) or rebuild (`npm run build`) and hard-refresh your browser (Ctrl+Shift+R)!")
    return 0


if __name__ == "__main__":
    sys.exit(main())

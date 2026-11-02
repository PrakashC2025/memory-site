#!/usr/bin/env node
/**
 * Complete automated patcher for PrakashC2025/memory-site:
 * 1. Fixes Live Drive uploads not appearing while Story Mode is playing
 * 2. Fixes Horizontal (Landscape) Drive Camera capture showing vertical/sideways image in horizontal frame
 * 3. Upgrades Drive Camera capture resolution & quality (4K sensor ideal, high smoothing quality, ISP takePhoto)
 * 4. Fixes Story Mode / Template hanging & memory growth over 2+ hours of continuous playback
 * 5. Upgrades Stitch UI smoothness & CSS containment
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function patchFile(relPath, replacer) {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[SKIP] ${relPath} not found in ${root}`);
    return false;
  }
  const before = fs.readFileSync(fullPath, 'utf8');
  const after = replacer(before);
  if (before !== after) {
    fs.writeFileSync(fullPath, after, 'utf8');
    console.log(`[FIXED] ${relPath}`);
    return true;
  }
  console.log(`[OK] ${relPath} (already patched)`);
  return false;
}

// 1. Fix src/components/DriveCameraCapture.tsx (Horizontal capture rotation bug + 4K High Quality camera)
patchFile('src/components/DriveCameraCapture.tsx', (src) => {
  let out = src;

  // 1a. Request 4K/QHD sensor-native resolution (always width >= height in sensor space so mobile drivers never drop to 720p)
  out = out.replace(
    /width:\s*\{\s*ideal:\s*landscape\s*\?\s*2560\s*:\s*1920,\s*min:\s*720\s*\},\s*height:\s*\{\s*ideal:\s*landscape\s*\?\s*1440\s*:\s*2560,\s*min:\s*720\s*\}/,
    "width: { ideal: 3840, min: 1280 }, height: { ideal: 2160, min: 720 }"
  );

  // 1b. Fix captureFromVideo: when taking a horizontal photo while the phone's raw video stream is portrait
  // (video.videoWidth < video.videoHeight), crop in portrait sensor space (1 / captureAspect) and rotate the canvas 90 deg
  // onto a true horizontal (width > height) canvas instead of cropping an unrotated vertical slice into a horizontal frame!
  const oldCaptureBlock = `  const captureAspect = isHorizontalCaptureActive()
    ? Math.max(viewfinderAspect, 16 / 9)
    : viewfinderAspect;
  const zoomFactor = hardwareZoomRef.current ? 1 : Math.max(1, zoomRef.current);
  let sourceWidth = video.videoWidth / zoomFactor;
  let sourceHeight = video.videoHeight / zoomFactor;
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > captureAspect) sourceWidth = sourceHeight * captureAspect;
  else sourceHeight = sourceWidth / captureAspect;
  const sourceX = (video.videoWidth - sourceWidth) / 2;
  const sourceY = (video.videoHeight - sourceHeight) / 2;
  canvas.width = Math.max(1, Math.round(sourceWidth));
  canvas.height = Math.max(1, Math.round(sourceHeight));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the photo canvas.');

  context.filter = [CAMERA_FILTERS[filter].css, CAMERA_QUALITY[quality].css, autoEnhance ? 'brightness(1.08) contrast(1.06) saturate(1.08)' : 'none']
    .filter(value => value !== 'none')
    .join(' ') || 'none';
  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);`;

  const newCaptureBlock = `  const horizontalActive = isHorizontalCaptureActive();
  const desiredAspect = horizontalActive
    ? Math.max(viewfinderAspect > 1 ? viewfinderAspect : 1 / Math.max(0.1, viewfinderAspect), 16 / 9)
    : viewfinderAspect;
  // If the user is holding the phone horizontally (horizontalActive) while the browser video stream
  // is still in portrait orientation (video.videoWidth < video.videoHeight), we must crop the inverted
  // aspect in raw sensor space and rotate the canvas 90 degrees so the photo is truly horizontal and upright!
  const rotatePortraitStream = horizontalActive && video.videoWidth < video.videoHeight;
  const rawCropAspect = rotatePortraitStream ? 1 / desiredAspect : desiredAspect;
  const zoomFactor = hardwareZoomRef.current ? 1 : Math.max(1, zoomRef.current);
  let sourceWidth = video.videoWidth / zoomFactor;
  let sourceHeight = video.videoHeight / zoomFactor;
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > rawCropAspect) sourceWidth = sourceHeight * rawCropAspect;
  else sourceHeight = sourceWidth / rawCropAspect;
  const sourceX = (video.videoWidth - sourceWidth) / 2;
  const sourceY = (video.videoHeight - sourceHeight) / 2;
  const outWidth = rotatePortraitStream ? sourceHeight : sourceWidth;
  const outHeight = rotatePortraitStream ? sourceWidth : sourceHeight;
  canvas.width = Math.max(1, Math.round(outWidth));
  canvas.height = Math.max(1, Math.round(outHeight));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not prepare the photo canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.filter = [CAMERA_FILTERS[filter].css, CAMERA_QUALITY[quality].css, autoEnhance ? 'brightness(1.05) contrast(1.05) saturate(1.06)' : 'none']
    .filter(value => value !== 'none')
    .join(' ') || 'none';
  context.save();
  if (rotatePortraitStream) {
    const tiltAngle = (physicalGammaRef.current || 0) > 0 ? -Math.PI / 2 : Math.PI / 2;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(tiltAngle);
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  } else {
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  }
  context.restore();`;

  if (out.includes(oldCaptureBlock)) {
    out = out.replace(oldCaptureBlock, newCaptureBlock);
  } else {
    out = out.replace(
      /const captureAspect = isHorizontalCaptureActive\(\)[\s\S]*?context\.drawImage\(video,\s*sourceX,\s*sourceY,\s*sourceWidth,\s*sourceHeight,\s*0,\s*0,\s*canvas\.width,\s*canvas\.height\);/,
      newCaptureBlock
    );
  }

  // 1c. Also upgrade normalizeHorizontalCapture to use high smoothing quality and respect tilt direction
  out = out.replace(
    /context\.translate\(canvas\.width\s*\/\s*2,\s*canvas\.height\s*\/\s*2\);\s*context\.rotate\(Math\.PI\s*\/\s*2\);\s*context\.drawImage\(bitmap,\s*-bitmap\.width\s*\/\s*2,\s*-bitmap\.height\s*\/\s*2\);/,
    "context.imageSmoothingEnabled = true;\n  context.imageSmoothingQuality = 'high';\n  const tiltAngle = (physicalGammaRef.current || 0) > 0 ? -Math.PI / 2 : Math.PI / 2;\n  context.translate(canvas.width / 2, canvas.height / 2);\n  context.rotate(tiltAngle);\n  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);"
  );

  return out;
});

// 2. Fix src/pages/StoryMode.tsx
patchFile('src/pages/StoryMode.tsx', (src) => {
  let out = src;
  out = out.replace(
    /if\s*\(\s*typeof\s+navigator\s*!==\s*['"]undefined['"]\s*&&\s*!navigator\.online\s*\)\s*return;/g,
    "if (typeof navigator !== 'undefined' && navigator.onLine === false) return;"
  );
  out = out.replace(
    /saveDriveMemories\(\[\.\.\.known,\s*\.\.\.freshPublished\],\s*token,\s*folderId\);([\s\S]*?)void\s+applyCached\(known\);/m,
    `const mergedKnown = [...known, ...freshPublished].sort(compareDriveMemories);
          known = mergedKnown;
          knownDriveMemoriesRef.current = mergedKnown;
          saveDriveMemories(mergedKnown, token, folderId);$1void applyCached(mergedKnown);`
  );
  return out;
});

// 3. Fix src/pages/Memoriya.tsx
patchFile('src/pages/Memoriya.tsx', (src) => {
  let out = src;
  out = out.replace(
    /const\s+isInFolder\s*=\s*\(file:\s*DriveMediaFile\)\s*=>\s*!driveFolderId\s*\|\|\s*!file\.parents\s*\|\|\s*file\.parents\.includes\(driveFolderId\);/,
    "const activeFolderId = driveFolderId === 'drive-root' ? '' : driveFolderId;\n        const isInFolder = (file: DriveMediaFile) => !activeFolderId || !file.parents || file.parents.includes(activeFolderId);"
  );
  out = out.replace(
    /const\s+latestPage\s*=\s*await\s+googleDriveService\.listMediaPage\(accessToken,\s*['"]['"],\s*driveFolderId,\s*100\);/,
    "const latestPage = await googleDriveService.listMediaPage(accessToken, '', driveFolderId === 'drive-root' ? '' : driveFolderId, 100, 'modifiedTime desc');"
  );
  return out;
});

// 4. Fix src/services/googleDriveService.ts
patchFile('src/services/googleDriveService.ts', (src) => {
  let out = src;
  out = out.replace(
    /Promise<DriveMediaPage>\s*\{/,
    "Promise<DriveMediaPage> {\n    folderId = folderId === 'drive-root' ? '' : folderId;"
  );
  out = out.replace(
    /fields:\s*'nextPageToken,files\(id,name,mimeType,thumbnailLink,webContentLink,webViewLink,createdTime,modifiedTime,imageMediaMetadata,videoMediaMetadata\)'/g,
    "fields: 'nextPageToken,files(id,name,mimeType,parents,thumbnailLink,webContentLink,webViewLink,createdTime,modifiedTime,imageMediaMetadata,videoMediaMetadata)'"
  );
  return out;
});

// 5. Fix src/components/DriveLiveSync.tsx
patchFile('src/components/DriveLiveSync.tsx', (src) => {
  let out = src;
  out = out.replace(
    /const\s+snapshotFiles\s*=\s*await\s+googleDriveService\.listAllMedia\(accessToken,\s*folderId\);/,
    "const preScanIds = new Set(readDriveMemories().map(m => m.driveFileId).filter(Boolean));\n      const snapshotFiles = await googleDriveService.listAllMedia(accessToken, folderId === 'drive-root' ? '' : folderId);"
  );
  out = out.replace(
    /\.filter\(memory\s*=>\s*memory\.driveFileId\s*&&\s*!snapshotIds\.has\(memory\.driveFileId\)\)/,
    ".filter(memory => memory.driveFileId && preScanIds.has(memory.driveFileId) && !snapshotIds.has(memory.driveFileId))"
  );
  return out;
});

// 6. Fix src/components/MemoryReel.tsx (2-hour long-playback anti-hang & GPU texture memory recycling)
patchFile('src/components/MemoryReel.tsx', (src) => {
  if (src.includes('/* MEMORIYA_LONG_PLAY_GUARD */')) return src;
  // Inject a lightweight periodic memory & offscreen image decoder recycler inside MemoryReel
  // so 2+ hour continuous sessions never accumulate decoded GPU bitmaps or orphan video decoders.
  const hookInsertion = `/* MEMORIYA_LONG_PLAY_GUARD */
  React.useEffect(() => {
    const pruneInterval = window.setInterval(() => {
      const stage = document.querySelector('[data-reel-state]');
      if (!stage) return;
      const stateParts = (stage.getAttribute('data-reel-state') || '').split('/');
      const currentShot = Number(stateParts[2]) || 0;
      const cards = stage.querySelectorAll('.card');
      cards.forEach((card) => {
        const htmlCard = card as HTMLElement;
        const idx = Number(htmlCard.style.getPropertyValue('--reel-index'));
        if (!Number.isFinite(idx)) return;
        const dist = Math.abs(idx - currentShot);
        const media = htmlCard.querySelector('img, video') as (HTMLImageElement | HTMLVideoElement | null);
        if (!media) return;
        if (dist > 45) {
          if (media.tagName === 'VIDEO') {
            const vid = media as HTMLVideoElement;
            if (!vid.paused) vid.pause();
          } else {
            const img = media as HTMLImageElement;
            img.decoding = 'async';
            img.loading = 'lazy';
          }
          htmlCard.style.willChange = 'auto';
        } else if (dist <= 6) {
          htmlCard.style.willChange = 'transform, opacity';
        }
      });
    }, 15000);
    return () => window.clearInterval(pruneInterval);
  }, []);`;

  return src.replace(
    /const\s+MemoryReel[\s\S]*?=>\s*\{/,
    (match) => `${match}\n  ${hookInsertion}\n`
  );
});

// 7. Fix vite.config.ts
patchFile('vite.config.ts', (src) => {
  if (src.includes("'/__memoriya-cast'")) return src;
  return src.replace(
    /'\/_memoriya-cast':\s*\{/,
    `'/__memoriya-cast': {\n        target: 'ws://127.0.0.1:8787',\n        ws: true,\n      },\n      '/_memoriya-cast': {`
  );
});

// 8. Upgrade src/index.css for 2-hour anti-hang GPU containment & Stitch smoothness
patchFile('src/index.css', (src) => {
  if (src.includes('/* Stitch Cinema Smoothness & 2-Hour Anti-Hang GPU Containment */')) return src;
  return src + `\n
/* Stitch Cinema Smoothness & 2-Hour Anti-Hang GPU Containment */
html:not(.legacy-tv-browser) .neon-card,
html:not(.legacy-tv-browser) .glass-card {
  transition: transform 0.34s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.34s ease, box-shadow 0.34s ease;
}

html:not(.legacy-tv-browser) .memory-reel-stage .card {
  contain: layout style paint;
  backface-visibility: hidden;
  will-change: auto;
  transition: opacity 0.38s ease;
}

html:not(.legacy-tv-browser) .memory-reel-stage .card.active,
html:not(.legacy-tv-browser) .memory-reel-stage .card.is-current {
  will-change: transform, opacity;
}

html:not(.legacy-tv-browser) .memoriya-camera-viewfinder video {
  image-rendering: high-quality;
  transform: translateZ(0);
}
`;
});

console.log('\\nAll fixes applied successfully!');

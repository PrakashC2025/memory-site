# Memory Tree Product Architecture

## Product Surfaces

- Landing and auth: cinematic entry, Google sign-in boundary, manual demo fallback.
- Import wizard: Google Drive source selection, scan progress, metadata extraction, preview tree.
- Memory Tree Explorer: virtualized root, year, event, album, and media nodes with animated SVG branch energy.
- Album studio: drag reorder, captions, frames, cover selection, duplicate removal, sub-albums.
- Story studio: template recommendation, slide order, captions, music, preview, draft, publish.
- Invitation builder: event media placement, editable templates, animated preview, export/share.
- Fullscreen viewer: image/video lightbox, keyboard/swipe navigation, metadata, favorite, share, download.
- Sharing center: private links, email access, family access, expiry, revoke controls.
- Settings: storage, sync, theme, animation intensity, music, privacy, connected accounts.

## Component Structure

- `pages/MemoryTree.tsx`: graph layout engine, viewport, SVG branch rendering, chunked node loading, studio panels.
- `components/MemoryLightbox.tsx`: portal-based fullscreen viewer so it stays above navigation on every viewport.
- `components/AnimatedBackground.tsx`: ambient particles, light ribbons, and depth grid.
- `services/googleDriveService.ts`: OAuth and Drive import boundary.
- `services/accessControl.ts`: share/access decision boundary.
- `services/memoryOrganizer.ts`: grouping, recap, and event derivation logic.

## Tree Rendering Strategy

- Build a stable graph from `root -> year -> event -> media`.
- Place nodes with fixed card dimensions, bounded x coordinates, and per-year vertical sections.
- Render branches in one SVG layer using Bezier paths from parent to child.
- Use animated stroke drawing, gradient dash flow, bloom filters, and active path highlighting.
- Use a render limit plus an intersection sentinel for progressive loading.
- Cull offscreen media nodes with a vertical viewport buffer while keeping structural branch nodes stable.
- Keep horizontal exploration inside `.memory-tree-viewport` so the document body has no horizontal overflow.
- Center the root on mount for desktop, tablet, and mobile.

## Responsive Rules

- Desktop: wide cinematic graph, full toolbar labels, multi-column studio.
- Tablet: wrapped toolbar, two-column studio, centered root.
- Mobile: icon-only toolbar buttons, sticky mini controls, centered root, internal pan/zoom, single-column studio.
- All cards use fixed dimensions or aspect-ratio containers to prevent layout shift.
- Body overflow-x remains hidden; only the tree viewport scrolls horizontally.

## Data Schema

`users`

- `id`, `email`, `name`, `avatar_url`, `created_at`

`memory_spaces`

- `id`, `owner_id`, `title`, `description`, `cover_media_id`, `privacy`, `created_at`, `updated_at`

`media_files`

- `id`, `space_id`, `drive_file_id`, `type`, `url`, `thumbnail_url`, `width`, `height`, `duration_seconds`, `date_taken`, `location_label`, `tags`, `is_favorite`, `is_pinned`

`albums`

- `id`, `space_id`, `parent_album_id`, `title`, `event_name`, `year`, `month`, `cover_media_id`, `frame_theme`, `branch_color`, `sort_order`

`album_media`

- `album_id`, `media_id`, `sort_order`, `caption`, `frame_override`, `is_hero`

`stories`

- `id`, `space_id`, `source_album_id`, `title`, `template`, `music_mood`, `transition_style`, `duration_ms`, `status`

`story_slides`

- `id`, `story_id`, `media_id`, `sort_order`, `caption`, `duration_ms`, `transition`

`invitations`

- `id`, `space_id`, `source_album_id`, `template`, `title`, `payload_json`, `share_id`

`shares`

- `id`, `space_id`, `resource_type`, `resource_id`, `token_hash`, `permission`, `password_hash`, `expires_at`, `revoked_at`, `watermark`

## API Shape

- `POST /api/auth/google/start`
- `POST /api/import/drive/connect`
- `POST /api/import/drive/scan`
- `GET /api/memory-spaces/:id/tree?cursor=...`
- `PATCH /api/albums/:id`
- `POST /api/albums/:id/reorder`
- `POST /api/stories`
- `PATCH /api/stories/:id/slides`
- `POST /api/invitations`
- `POST /api/exports`
- `POST /api/shares`
- `PATCH /api/shares/:id/revoke`

## Google Import Flow

1. Request explicit Google OAuth consent with readonly Drive scopes.
2. Let the user select folders.
3. List image/video files with thumbnails and media metadata.
4. Normalize best date from EXIF, Drive created time, or modified time.
5. Group by year, month, folder/event hints, location, and tags.
6. Store metadata first, then fetch thumbnails lazily.
7. Queue background thumbnail caching and duplicate detection.
8. Re-sync using stored folder ids and user-controlled permissions.

## Export System

- Client prepares export selection, captions, theme, ratio, quality, and watermark settings.
- Server validates ownership/share permission.
- Image exports render with high-DPI canvas.
- PDF exports use themed page templates and print-safe dimensions.
- ZIP exports stream original or permitted optimized files.
- MP4 story export is queued as a background job when video rendering is available.

## Permission Model

- Owner can edit, delete, export, share, and revoke.
- Family can view/comment where enabled.
- Friend can view selected resources.
- Public/private links require signed tokens and optional password.
- Every media fetch validates space ownership or active share permissions.
- Revoked or expired shares fail closed.

## Performance Checklist

- Virtualize media nodes and progressively increase render chunks.
- Use fixed card sizes and thumbnail aspect ratios.
- Lazy-load images and render full media only in lightbox/story mode.
- Debounce search and filters.
- Cache metadata and nearby thumbnails.
- Keep SVG path count bounded by visible chunk.
- Avoid body horizontal overflow; use internal viewport pan.
- Respect reduced motion settings.

## Testing Checklist

- Login and navigation to Memory Tree.
- Root visible on desktop, tablet, and mobile.
- No body horizontal overflow.
- No visible card overlaps.
- Branch expand/collapse does not break paths.
- Search returns stable tree layout.
- Random Memory opens lightbox.
- Lightbox stays above nav and closes on all viewports.
- Story journey play/pause selects nodes without layout shift.
- Drag reorder keeps album tiles stable.
- Export/share/invitation controls wrap on mobile.

# Memory Platform Architecture

## Folder Structure

- `components/` reusable UI such as the lightbox, Drive connector, player, nav, and background.
- `context/` user, theme, and app state providers.
- `data/` demo memory sets and theme definitions.
- `pages/` main product routes: login, dashboard, tree, timeline, event explorer, story mode, settings.
- `services/` product logic that can later talk to real APIs: access control, Drive import, metadata extraction, memory organization.
- `types/` long-term domain models for media, events, spaces, users, and sharing.

## Current Demo Data Model

`Memory`

- `id`
- `title`
- `caption`
- `date`
- `year`
- `month`
- `type`
- `url`
- `thumbnail`
- `location`
- `emotion`
- `tags`
- `event`
- `isFavorite`
- `note`

## Production Model Roadmap

`MemorySpace`

- owner user id
- allowed email list
- privacy mode
- selected Google Drive folders
- generated years, months, events, recaps

`MediaFile`

- Google Drive file id
- MIME type
- thumbnail URL
- full media URL
- EXIF date taken
- created/modified fallback dates
- optional location
- detected faces/people ids

## Google Drive Integration

Use `GoogleDriveService` as the integration boundary:

1. Start Google OAuth with Drive readonly scope.
2. Open Google Picker for folder selection.
3. Fetch image/video files from selected folders.
4. Extract metadata from `imageMediaMetadata`, `videoMediaMetadata`, `createdTime`, and `modifiedTime`.
5. Convert Drive files into normalized `Memory` records.
6. Cache thumbnails and lazy load full media on demand.

## AI Roadmap

- AI-generated captions from image/video context.
- Auto event detection by dense date ranges and repeated locations.
- Face grouping with user-approved person labels.
- Recap video generation from selected events.
- Private family sharing with role-based permissions.
- On-this-day reminders.
- Memory book PDF export.
- Journey map mode from location metadata.

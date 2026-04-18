// ─────────────────────────────────────────────
//  Memoriam — Demo Memory Dataset
//  Replace with real Google Drive API data
// ─────────────────────────────────────────────

import type { MediaFile, MemorySpace, MemoryYear, MemoryMonth, MemoryEvent } from '../types';

// Using Unsplash for demo images – replace with real Drive thumbnails
const DEMO_PHOTOS: MediaFile[] = [
  // 2021 — College Begins
  {
    id: 'p001', name: 'First day orientation.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=400',
    dateTaken: new Date('2021-08-15'), dateCreated: new Date('2021-08-15'),
    tags: ['college', 'orientation', 'new beginnings'], mood: 'growth',
    isFavorite: true, isPinned: true,
    customCaption: 'The first day everything changed.',
  },
  {
    id: 'p002', name: 'Campus morning light.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?w=400',
    dateTaken: new Date('2021-09-03'), dateCreated: new Date('2021-09-03'),
    tags: ['campus', 'morning', 'college'], mood: 'nostalgia',
    isFavorite: false, isPinned: false,
  },
  {
    id: 'p003', name: 'First friends.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400',
    dateTaken: new Date('2021-09-10'), dateCreated: new Date('2021-09-10'),
    tags: ['friends', 'college', 'together'], mood: 'friendship',
    isFavorite: true, isPinned: true,
    customCaption: 'The people who became family.',
  },
  {
    id: 'p004', name: 'Library study night.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    dateTaken: new Date('2021-10-20'), dateCreated: new Date('2021-10-20'),
    tags: ['study', 'library', 'night'], mood: 'growth',
    isFavorite: false, isPinned: false,
  },
  {
    id: 'p005', name: 'Autumn campus walk.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=400',
    dateTaken: new Date('2021-11-05'), dateCreated: new Date('2021-11-05'),
    tags: ['autumn', 'campus', 'nature'], mood: 'nostalgia',
    isFavorite: true, isPinned: false,
  },
  {
    id: 'p006', name: 'Winter holiday lights.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1482517967863-00e15c9b44be?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1482517967863-00e15c9b44be?w=400',
    dateTaken: new Date('2021-12-20'), dateCreated: new Date('2021-12-20'),
    tags: ['winter', 'holidays', 'lights'], mood: 'joy',
    isFavorite: true, isPinned: false,
    customCaption: 'Lights that made the cold warm.',
  },

  // 2022 — Deepening Bonds
  {
    id: 'p007', name: 'Spring picnic with friends.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400',
    dateTaken: new Date('2022-03-15'), dateCreated: new Date('2022-03-15'),
    tags: ['spring', 'picnic', 'friends', 'outdoors'], mood: 'friendship',
    isFavorite: true, isPinned: false,
    customCaption: 'Every Sunday felt like summer.',
  },
  {
    id: 'p008', name: 'Road trip begin.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400',
    dateTaken: new Date('2022-05-01'), dateCreated: new Date('2022-05-01'),
    tags: ['road trip', 'travel', 'adventure'], mood: 'adventure',
    isFavorite: true, isPinned: true,
    customCaption: 'The open road, a full tank, and the best people.',
  },
  {
    id: 'p009', name: 'Mountain sunrise.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
    dateTaken: new Date('2022-05-03'), dateCreated: new Date('2022-05-03'),
    tags: ['mountain', 'sunrise', 'travel'], mood: 'adventure',
    isFavorite: true, isPinned: false,
    customCaption: 'Woke up at 4AM for this. Worth every second.',
  },
  {
    id: 'p010', name: 'Beach sunset golden hour.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400',
    dateTaken: new Date('2022-07-12'), dateCreated: new Date('2022-07-12'),
    tags: ['beach', 'sunset', 'golden hour', 'summer'], mood: 'joy',
    isFavorite: true, isPinned: true,
    customCaption: 'Golden hour that lasted forever in my heart.',
  },
  {
    id: 'p011', name: 'Birthday celebration.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400',
    dateTaken: new Date('2022-08-24'), dateCreated: new Date('2022-08-24'),
    tags: ['birthday', 'celebration', 'friends'], mood: 'celebration',
    isFavorite: true, isPinned: false,
    customCaption: 'They remembered. They always remember.',
  },
  {
    id: 'p012', name: 'Late night talks.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=400',
    dateTaken: new Date('2022-10-08'), dateCreated: new Date('2022-10-08'),
    tags: ['night', 'friends', 'conversations'], mood: 'friendship',
    isFavorite: false, isPinned: false,
  },

  // 2023 — Growth & Love
  {
    id: 'p013', name: 'Valentine flowers.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=400',
    dateTaken: new Date('2023-02-14'), dateCreated: new Date('2023-02-14'),
    tags: ['love', 'flowers', 'valentines'], mood: 'love',
    isFavorite: true, isPinned: true,
    customCaption: 'Some moments are not meant to be explained, only felt.',
  },
  {
    id: 'p014', name: 'Paris trip arc de triomphe.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400',
    dateTaken: new Date('2023-04-10'), dateCreated: new Date('2023-04-10'),
    tags: ['paris', 'travel', 'europe', 'architecture'], mood: 'adventure',
    isFavorite: true, isPinned: true,
    customCaption: 'Paris was everything they said it would be.',
    location: { lat: 48.8738, lng: 2.295, label: 'Paris, France' },
  },
  {
    id: 'p015', name: 'Eiffel Tower night.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=400',
    dateTaken: new Date('2023-04-11'), dateCreated: new Date('2023-04-11'),
    tags: ['paris', 'eiffel tower', 'night', 'lights'], mood: 'love',
    isFavorite: true, isPinned: false,
    location: { lat: 48.8584, lng: 2.2945, label: 'Eiffel Tower, Paris' },
  },
  {
    id: 'p016', name: 'Graduation rehearsal.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=400',
    dateTaken: new Date('2023-11-20'), dateCreated: new Date('2023-11-20'),
    tags: ['graduation', 'academic', 'milestone'], mood: 'growth',
    isFavorite: true, isPinned: true,
    customCaption: 'Four years in one gown.',
  },
  {
    id: 'p017', name: 'Night city lights.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400',
    dateTaken: new Date('2023-09-14'), dateCreated: new Date('2023-09-14'),
    tags: ['city', 'night', 'lights', 'urban'], mood: 'adventure',
    isFavorite: false, isPinned: false,
  },
  {
    id: 'p018', name: 'Family reunion.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1511895426328-dc8714191011?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1511895426328-dc8714191011?w=400',
    dateTaken: new Date('2023-12-25'), dateCreated: new Date('2023-12-25'),
    tags: ['family', 'reunion', 'christmas', 'holidays'], mood: 'family',
    isFavorite: true, isPinned: true,
    customCaption: 'Home is wherever they are.',
  },

  // 2024 — Final Chapter & New Horizons
  {
    id: 'p019', name: 'Graduation day.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1627556704302-624286467c65?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1627556704302-624286467c65?w=400',
    dateTaken: new Date('2024-05-15'), dateCreated: new Date('2024-05-15'),
    tags: ['graduation', 'achievement', 'milestone', 'college'], mood: 'growth',
    isFavorite: true, isPinned: true,
    customCaption: 'We made it. Every late night was worth it.',
  },
  {
    id: 'p020', name: 'Farewell dinner with friends.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400',
    dateTaken: new Date('2024-05-20'), dateCreated: new Date('2024-05-20'),
    tags: ['farewell', 'friends', 'dinner', 'end of era'], mood: 'farewell',
    isFavorite: true, isPinned: true,
    customCaption: 'One last dinner. A thousand unspoken words.',
  },
  {
    id: 'p021', name: 'New city apartment.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400',
    dateTaken: new Date('2024-07-01'), dateCreated: new Date('2024-07-01'),
    tags: ['new beginning', 'apartment', 'city', 'independence'], mood: 'adventure',
    isFavorite: false, isPinned: false,
    customCaption: 'A blank page in a new city.',
  },
  {
    id: 'p022', name: 'Sunset over the sea.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400',
    dateTaken: new Date('2024-08-12'), dateCreated: new Date('2024-08-12'),
    tags: ['sunset', 'ocean', 'travel', 'reflection'], mood: 'nostalgia',
    isFavorite: true, isPinned: false,
    customCaption: 'Every sunset holds a memory.',
  },
  {
    id: 'p023', name: 'First job moment.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=400',
    dateTaken: new Date('2024-09-01'), dateCreated: new Date('2024-09-01'),
    tags: ['career', 'first job', 'milestone', 'new chapter'], mood: 'growth',
    isFavorite: true, isPinned: true,
    customCaption: 'Day one of the rest of my life.',
  },
  {
    id: 'p024', name: 'Autumn coffee reflections.jpg', type: 'photo',
    url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200',
    thumbnailUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400',
    dateTaken: new Date('2024-10-30'), dateCreated: new Date('2024-10-30'),
    tags: ['coffee', 'autumn', 'reflection', 'quiet'], mood: 'nostalgia',
    isFavorite: false, isPinned: false,
  },
];

// ─── Events ─────────────────────────────────────
const EVENTS_2021: MemoryEvent[] = [
  {
    id: 'e001', title: 'College Orientation', mood: 'growth',
    startDate: new Date('2021-08-15'), endDate: new Date('2021-08-20'),
    mediaIds: ['p001', 'p002'], isAutoDetected: true,
    tags: ['orientation', 'first days', 'college'],
    description: 'The first steps into a new world.',
    coverMediaId: 'p001',
  },
  {
    id: 'e002', title: 'First Friendships', mood: 'friendship',
    startDate: new Date('2021-09-01'), endDate: new Date('2021-09-15'),
    mediaIds: ['p003'], isAutoDetected: true,
    tags: ['friends', 'bonds'],
    description: 'The beginning of bonds that would last forever.',
    coverMediaId: 'p003',
  },
  {
    id: 'e003', title: 'Winter Memories', mood: 'nostalgia',
    startDate: new Date('2021-12-10'), endDate: new Date('2021-12-31'),
    mediaIds: ['p006'], isAutoDetected: true,
    tags: ['winter', 'holidays'],
    coverMediaId: 'p006',
  },
];

const EVENTS_2022: MemoryEvent[] = [
  {
    id: 'e004', title: 'Epic Road Trip', mood: 'adventure',
    startDate: new Date('2022-05-01'), endDate: new Date('2022-05-07'),
    mediaIds: ['p008', 'p009'], isAutoDetected: true,
    tags: ['road trip', 'adventure', 'travel'],
    description: 'Five days, four cities, one unforgettable journey.',
    coverMediaId: 'p008',
  },
  {
    id: 'e005', title: 'Summer Beach Days', mood: 'joy',
    startDate: new Date('2022-07-01'), endDate: new Date('2022-07-31'),
    mediaIds: ['p010'], isAutoDetected: true,
    tags: ['summer', 'beach', 'sun'],
    coverMediaId: 'p010',
  },
  {
    id: 'e006', title: 'Birthday Bash', mood: 'celebration',
    startDate: new Date('2022-08-24'), endDate: new Date('2022-08-24'),
    mediaIds: ['p011'], isAutoDetected: false,
    tags: ['birthday', 'celebration'],
    coverMediaId: 'p011',
  },
];

const EVENTS_2023: MemoryEvent[] = [
  {
    id: 'e007', title: 'Paris Adventure', mood: 'adventure',
    startDate: new Date('2023-04-10'), endDate: new Date('2023-04-15'),
    mediaIds: ['p014', 'p015'], isAutoDetected: true,
    tags: ['paris', 'europe', 'travel'],
    description: 'Croissants, cobblestones, and the city of light.',
    coverMediaId: 'p014',
    location: { lat: 48.8566, lng: 2.3522, label: 'Paris, France' },
  } as MemoryEvent & { location?: any },
  {
    id: 'e008', title: 'Graduation Prep', mood: 'growth',
    startDate: new Date('2023-11-01'), endDate: new Date('2023-12-01'),
    mediaIds: ['p016'], isAutoDetected: true,
    tags: ['graduation', 'milestone'],
    coverMediaId: 'p016',
  },
  {
    id: 'e009', title: 'Christmas Reunion', mood: 'family',
    startDate: new Date('2023-12-20'), endDate: new Date('2023-12-27'),
    mediaIds: ['p018'], isAutoDetected: true,
    tags: ['family', 'christmas'],
    coverMediaId: 'p018',
  },
];

const EVENTS_2024: MemoryEvent[] = [
  {
    id: 'e010', title: 'Graduation Day', mood: 'growth',
    startDate: new Date('2024-05-15'), endDate: new Date('2024-05-15'),
    mediaIds: ['p019'], isAutoDetected: false,
    tags: ['graduation', 'achievement'],
    description: 'The day four years of dreams became real.',
    coverMediaId: 'p019',
  },
  {
    id: 'e011', title: 'Final Farewell', mood: 'farewell',
    startDate: new Date('2024-05-20'), endDate: new Date('2024-05-22'),
    mediaIds: ['p020'], isAutoDetected: true,
    tags: ['farewell', 'friends', 'end of era'],
    description: 'Goodbyes that never really felt like goodbyes.',
    coverMediaId: 'p020',
  },
  {
    id: 'e012', title: 'New Beginnings', mood: 'adventure',
    startDate: new Date('2024-07-01'), endDate: new Date('2024-09-30'),
    mediaIds: ['p021', 'p023'], isAutoDetected: true,
    tags: ['new chapter', 'career', 'growth'],
    coverMediaId: 'p023',
  },
];

// ─── Months ──────────────────────────────────────
function makeMonth(y: number, m: number, label: string, ids: string[], events: MemoryEvent[], highlight?: string): MemoryMonth {
  return { year: y, month: m, label, mediaIds: ids, events, highlightMediaId: highlight };
}

// ─── Years ───────────────────────────────────────
const YEARS: MemoryYear[] = [
  {
    year: 2021, label: '2021', chapterTitle: 'New Beginnings',
    mediaCount: 6, topMoods: ['growth', 'friendship', 'nostalgia'],
    coverMediaId: 'p001',
    months: [
      makeMonth(2021, 8,  'August 2021',   ['p001', 'p002'], [EVENTS_2021[0]], 'p001'),
      makeMonth(2021, 9,  'September 2021',['p003'],          [EVENTS_2021[1]], 'p003'),
      makeMonth(2021, 10, 'October 2021',  ['p004'],          []),
      makeMonth(2021, 11, 'November 2021', ['p005'],          []),
      makeMonth(2021, 12, 'December 2021', ['p006'],          [EVENTS_2021[2]], 'p006'),
    ],
  },
  {
    year: 2022, label: '2022', chapterTitle: 'Golden Days',
    mediaCount: 6, topMoods: ['adventure', 'joy', 'friendship', 'celebration'],
    coverMediaId: 'p010',
    months: [
      makeMonth(2022, 3,  'March 2022',    ['p007'],           []),
      makeMonth(2022, 5,  'May 2022',      ['p008', 'p009'],   [EVENTS_2022[0]], 'p008'),
      makeMonth(2022, 7,  'July 2022',     ['p010'],           [EVENTS_2022[1]], 'p010'),
      makeMonth(2022, 8,  'August 2022',   ['p011'],           [EVENTS_2022[2]], 'p011'),
      makeMonth(2022, 10, 'October 2022',  ['p012'],           []),
    ],
  },
  {
    year: 2023, label: '2023', chapterTitle: 'A World Explored',
    mediaCount: 6, topMoods: ['adventure', 'love', 'growth', 'family'],
    coverMediaId: 'p014',
    months: [
      makeMonth(2023, 2,  'February 2023', ['p013'],           []),
      makeMonth(2023, 4,  'April 2023',    ['p014', 'p015'],   [EVENTS_2023[0]], 'p014'),
      makeMonth(2023, 9,  'September 2023',['p017'],           []),
      makeMonth(2023, 11, 'November 2023', ['p016'],           [EVENTS_2023[1]], 'p016'),
      makeMonth(2023, 12, 'December 2023', ['p018'],           [EVENTS_2023[2]], 'p018'),
    ],
  },
  {
    year: 2024, label: '2024', chapterTitle: 'The Final Chapter',
    mediaCount: 6, topMoods: ['growth', 'farewell', 'adventure', 'nostalgia'],
    coverMediaId: 'p019',
    months: [
      makeMonth(2024, 5,  'May 2024',      ['p019', 'p020'],   [EVENTS_2024[0], EVENTS_2024[1]], 'p019'),
      makeMonth(2024, 7,  'July 2024',     ['p021'],           [EVENTS_2024[2]]),
      makeMonth(2024, 8,  'August 2024',   ['p022'],           []),
      makeMonth(2024, 9,  'September 2024',['p023'],           []),
      makeMonth(2024, 10, 'October 2024',  ['p024'],           []),
    ],
  },
];

// ─── Main Demo Space ─────────────────────────────
export const DEMO_MEMORY_SPACE: MemorySpace = {
  id: 'space-demo',
  title: 'My College Journey',
  description: 'Four years that became the foundation of who I am.',
  ownerId: 'user-demo',
  allowedEmails: ['demo@memoriam.app', 'friend@example.com'],
  isPrivate: false,
  years: YEARS,
  allMedia: DEMO_PHOTOS,
  createdAt: new Date('2021-08-15'),
  updatedAt: new Date('2024-10-30'),
  tags: ['college', 'friendship', 'travel', 'growth'],
  coverMediaId: 'p001',
};

export const DEMO_USER = {
  id: 'user-demo',
  email: 'demo@memoriam.app',
  name: 'Alex Rivera',
  avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
  isAllowed: true,
  driveConnected: true,
  selectedFolders: [],
  sharedSpaceIds: ['space-demo'],
  preferences: {
    theme: 'warm-nostalgia' as const,
    viewMode: 'tree' as const,
    animationIntensity: 'full' as const,
    musicEnabled: false,
    autoplayStory: false,
    language: 'en',
  },
};

export { DEMO_PHOTOS };

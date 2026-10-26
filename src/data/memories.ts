export interface Memory {
  id: string;
  title: string;
  caption: string;
  date: string; // ISO string
  year: number;
  month: number;
  type: 'photo' | 'video';
  url: string;
  thumbnail: string;
  authToken?: string;
  driveFileId?: string;
  modifiedTime?: string;
  orientation?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  location?: string;
  emotion?: 'joy' | 'nostalgia' | 'love' | 'adventure' | 'friendship' | 'celebration' | 'farewell';
  tags?: string[];
  isFavorite?: boolean;
  note?: string;
  event?: string;
}

export const getMemoryAspect = (memory: Pick<Memory, 'width' | 'height' | 'orientation'>, fallback = 1) => {
  const safeWidth = Number(memory.width);
  const safeHeight = Number(memory.height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth <= 0 || safeHeight <= 0) return fallback;
  const rawAspect = safeWidth / safeHeight;
  const quarterTurn = Math.round((memory.orientation || 0) / 90) % 2 !== 0;
  return quarterTurn ? 1 / rawAspect : rawAspect;
};

const AUDIO_FILE_EXTENSION = /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|webm|aiff|aif|amr|mka|wma)$/i;

/** Runtime guard for media restored from Drive or browser session storage. */
export const isAudioMemory = (memory: Pick<Memory, 'type' | 'mimeType' | 'title'>) =>
  String(memory.type).toLowerCase() === 'audio'
  || Boolean(memory.mimeType && memory.mimeType.toLowerCase().startsWith('audio/'))
  || (String(memory.type).toLowerCase() !== 'video' && AUDIO_FILE_EXTENSION.test(memory.title || ''));

/** Only photos and videos belong in the visual memory archive. */
export const isVisualMemory = (memory: Pick<Memory, 'type' | 'mimeType' | 'title'>) =>
  !isAudioMemory(memory) && (memory.type === 'photo' || memory.type === 'video');

export const visualMemoriesOnly = (memories: Memory[]) => memories.filter(isVisualMemory);

export interface MemoryYear {
  year: number;
  memories: Memory[];
  months: MemoryMonth[];
}

export interface MemoryMonth {
  year: number;
  month: number;
  label: string;
  memories: Memory[];
}

export interface User {
  name: string;
  email: string;
  avatar?: string;
  driveConnected?: boolean;
  accessLevel?: 'owner' | 'family' | 'friend' | 'viewer';
  memorySpaceId?: string;
  authProvider?: 'google' | 'password';
}

// High-quality Unsplash images for demo
export const SAMPLE_MEMORIES: Memory[] = [
  // 2021 - College Start
  {
    id: '1',
    title: 'First Day of College',
    caption: 'The beginning of everything. New campus, new friends, new life.',
    date: '2021-08-15T09:00:00',
    year: 2021,
    month: 8,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'joy',
    tags: ['college', 'first-day', 'new-beginnings'],
    isFavorite: true,
    event: 'College Started',
  },
  {
    id: '2',
    title: 'Hostel Room Setup',
    caption: 'Making this tiny room feel like home, four walls and infinite possibilities.',
    date: '2021-08-17T15:30:00',
    year: 2021,
    month: 8,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'nostalgia',
    tags: ['hostel', 'college', 'home'],
    event: 'College Started',
  },
  {
    id: '3',
    title: 'Campus Friends',
    caption: 'Met these souls on day three. Little did we know we\'d be inseparable.',
    date: '2021-09-01T12:00:00',
    year: 2021,
    month: 9,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'friendship',
    tags: ['friends', 'college', 'campus'],
    isFavorite: true,
    event: 'New Friendships',
  },
  {
    id: '4',
    title: 'Rainy Season Walk',
    caption: 'The monsoon hit campus like poetry. We danced in the rain like children.',
    date: '2021-09-15T17:00:00',
    year: 2021,
    month: 9,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'joy',
    tags: ['rain', 'campus', 'monsoon'],
    event: 'Monsoon Memories',
  },
  {
    id: '5',
    title: 'Diwali Night',
    caption: 'Lights everywhere. The whole campus glowed. We felt like the world was celebrating us.',
    date: '2021-11-04T20:00:00',
    year: 2021,
    month: 11,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'celebration',
    tags: ['diwali', 'festival', 'lights', 'celebration'],
    isFavorite: true,
    event: 'Diwali Festival',
  },
  {
    id: '6',
    title: 'Library Late Nights',
    caption: 'Coffee cups, whispered jokes, and endless pages. This is where dreams were built.',
    date: '2021-12-10T23:00:00',
    year: 2021,
    month: 12,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'nostalgia',
    tags: ['library', 'study', 'college', 'night'],
    event: 'Exam Season',
  },
  // 2022 - Goa Trip and Adventures
  {
    id: '7',
    title: 'Goa Trip - Beach Arrival',
    caption: 'We drove through the night. Arrived at sunrise. The ocean greeted us like an old friend.',
    date: '2022-02-14T06:30:00',
    year: 2022,
    month: 2,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80',
    location: 'Goa, India',
    emotion: 'adventure',
    tags: ['goa', 'beach', 'travel', 'friends'],
    isFavorite: true,
    event: 'Goa Trip 2022',
  },
  {
    id: '8',
    title: 'Beach Sunset',
    caption: 'The sky painted our memories in gold. We sat there for hours, saying nothing, feeling everything.',
    date: '2022-02-15T18:45:00',
    year: 2022,
    month: 2,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
    location: 'Goa, India',
    emotion: 'nostalgia',
    tags: ['sunset', 'beach', 'goa'],
    isFavorite: true,
    event: 'Goa Trip 2022',
  },
  {
    id: '9',
    title: 'Sea Waves',
    caption: 'Letting go of everything and just being present. The waves knew our secrets.',
    date: '2022-02-16T10:00:00',
    year: 2022,
    month: 2,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=400&q=80',
    location: 'Goa, India',
    emotion: 'adventure',
    tags: ['sea', 'waves', 'nature', 'peace'],
    event: 'Goa Trip 2022',
  },
  {
    id: '10',
    title: 'College Fest',
    caption: 'Three days of pure magic and memories. Every performance was a heartbeat.',
    date: '2022-03-20T19:00:00',
    year: 2022,
    month: 3,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'celebration',
    tags: ['fest', 'college', 'performance', 'music'],
    isFavorite: true,
    event: 'Annual College Fest',
  },
  {
    id: '11',
    title: 'Night Canteen',
    caption: 'After midnight conversations that changed everything. The chai was terrible. The moments were perfect.',
    date: '2022-04-05T01:30:00',
    year: 2022,
    month: 4,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'friendship',
    tags: ['canteen', 'night', 'friends', 'food'],
    event: 'Everyday Magic',
  },
  {
    id: '12',
    title: 'Birthday Surprise',
    caption: 'They hid for three hours. The look on her face was worth everything.',
    date: '2022-06-12T20:00:00',
    year: 2022,
    month: 6,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'love',
    tags: ['birthday', 'surprise', 'friends', 'celebration'],
    isFavorite: true,
    event: 'Birthday Celebrations',
  },
  {
    id: '13',
    title: 'Mountain Trek',
    caption: 'Eight hours of climbing. At the summit, we forgot everything below and felt infinite.',
    date: '2022-10-08T07:00:00',
    year: 2022,
    month: 10,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=80',
    location: 'Sahyadri, India',
    emotion: 'adventure',
    tags: ['trek', 'mountains', 'nature', 'adventure'],
    isFavorite: true,
    event: 'Sahyadri Trek',
  },
  {
    id: '14',
    title: 'Winter Campus',
    caption: 'December mornings. Fog on the grass. Hot coffee. The campus was a painting.',
    date: '2022-12-20T08:00:00',
    year: 2022,
    month: 12,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1608755728617-aefab37d2edd?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1608755728617-aefab37d2edd?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'nostalgia',
    tags: ['winter', 'campus', 'morning'],
    event: 'Winter 2022',
  },
  // 2023 - Deep College Life
  {
    id: '15',
    title: 'Photography Club',
    caption: 'Found my lens. Found my voice. Found my tribe.',
    date: '2023-01-15T16:00:00',
    year: 2023,
    month: 1,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'joy',
    tags: ['photography', 'club', 'art'],
    event: 'Club Activities',
  },
  {
    id: '16',
    title: 'Coastal Road Trip',
    caption: 'Windows down. Music loud. The coast was ours for one golden weekend.',
    date: '2023-03-10T11:00:00',
    year: 2023,
    month: 3,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&q=80',
    location: 'Konkan, India',
    emotion: 'adventure',
    tags: ['road-trip', 'coast', 'travel', 'friends'],
    isFavorite: true,
    event: 'Road Trip 2023',
  },
  {
    id: '17',
    title: 'Farewell Party - Third Year',
    caption: 'To the seniors who showed us what college truly meant. Thank you.',
    date: '2023-05-30T19:00:00',
    year: 2023,
    month: 5,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'farewell',
    tags: ['farewell', 'college', 'seniors'],
    isFavorite: true,
    event: 'Farewell Night',
  },
  {
    id: '18',
    title: 'Monsoon Football',
    caption: 'Rain-soaked mud, slipping and laughing. The best game we ever played.',
    date: '2023-07-22T17:00:00',
    year: 2023,
    month: 7,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'joy',
    tags: ['football', 'rain', 'sports', 'fun'],
    event: 'Sports Day',
  },
  {
    id: '19',
    title: 'Stargazing Night',
    caption: 'We drove far from city lights. The sky opened up and so did we.',
    date: '2023-09-14T22:00:00',
    year: 2023,
    month: 9,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400&q=80',
    location: 'Lonavala, India',
    emotion: 'nostalgia',
    tags: ['stars', 'night', 'nature', 'peace'],
    isFavorite: true,
    event: 'Night Out',
  },
  {
    id: '20',
    title: 'Deepest Friendship',
    caption: 'Some bonds need no explanation. They just exist, warm and unbreakable.',
    date: '2023-11-11T14:00:00',
    year: 2023,
    month: 11,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1516831906352-1623156049b5?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1516831906352-1623156049b5?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'friendship',
    tags: ['friendship', 'love', 'bond'],
    isFavorite: true,
    event: 'Everyday Magic',
  },
  // 2024 - Final Year
  {
    id: '21',
    title: 'Final Year Begins',
    caption: 'The last chapter. We promised to make every moment count. We did.',
    date: '2024-07-01T09:00:00',
    year: 2024,
    month: 7,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'nostalgia',
    tags: ['final-year', 'college', 'new-chapter'],
    event: 'Final Year',
  },
  {
    id: '22',
    title: 'Last Goa Trip',
    caption: 'We went back. Same beach. Same people. Different hearts. Grown, but still us.',
    date: '2024-01-20T10:00:00',
    year: 2024,
    month: 1,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1518684079-3c830dcef090?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1518684079-3c830dcef090?w=400&q=80',
    location: 'Goa, India',
    emotion: 'nostalgia',
    tags: ['goa', 'last-trip', 'friends', 'final-year'],
    isFavorite: true,
    event: 'Last College Trip',
  },
  {
    id: '23',
    title: 'Dissertation Defense',
    caption: 'Four years of learning. Four minutes of trembling hands. Then: applause.',
    date: '2024-04-15T14:00:00',
    year: 2024,
    month: 4,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'joy',
    tags: ['dissertation', 'achievement', 'final-year'],
    isFavorite: true,
    event: 'Final Year',
  },
  {
    id: '24',
    title: 'Farewell Dinner',
    caption: 'The table was set. The food was warm. The laughter was real. The tears were ready.',
    date: '2024-06-01T20:00:00',
    year: 2024,
    month: 6,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'farewell',
    tags: ['farewell', 'dinner', 'final-year', 'friends'],
    isFavorite: true,
    event: 'Farewell Night',
  },
  {
    id: '25',
    title: 'Graduation Day',
    caption: 'We did it. In our caps and gowns, we were everything we promised to be.',
    date: '2024-07-20T10:00:00',
    year: 2024,
    month: 7,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1627556704283-84937f919b3f?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1627556704283-84937f919b3f?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'celebration',
    tags: ['graduation', 'achievement', 'college', 'celebration'],
    isFavorite: true,
    event: 'Graduation',
  },
  {
    id: '26',
    title: 'Last Day on Campus',
    caption: 'We walked every corner one last time. The campus felt like it knew.',
    date: '2024-07-22T17:00:00',
    year: 2024,
    month: 7,
    type: 'photo',
    url: 'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?w=1200&q=90',
    thumbnail: 'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?w=400&q=80',
    location: 'Mumbai, India',
    emotion: 'farewell',
    tags: ['last-day', 'campus', 'farewell', 'college'],
    isFavorite: true,
    event: 'Graduation',
  },
];

export function groupMemoriesByYear(memories: Memory[]): MemoryYear[] {
  const yearMap = new Map<number, Memory[]>();
  memories.forEach(m => {
    if (!yearMap.has(m.year)) yearMap.set(m.year, []);
    yearMap.get(m.year)!.push(m);
  });

  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, mems]) => {
      const monthMap = new Map<number, Memory[]>();
      mems.forEach(m => {
        if (!monthMap.has(m.month)) monthMap.set(m.month, []);
        monthMap.get(m.month)!.push(m);
      });

      const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const months: MemoryMonth[] = Array.from(monthMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([month, mems]) => ({
          year,
          month,
          label: `${MONTH_NAMES[month]} ${year}`,
          memories: mems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        }));

      return { year, memories: mems, months };
    });
}

// Verse of the day: a curated list rotated by day of the year.

export const VERSES = [
  'John 3:16', 'Jeremiah 29:11', 'Philippians 4:13', 'Romans 8:28', 'Proverbs 3:5-6',
  'Isaiah 41:10', 'Psalms 23:1', 'Joshua 1:9', 'Matthew 11:28', 'Romans 12:2',
  'Philippians 4:6-7', '2 Timothy 1:7', 'Psalms 46:1', 'Isaiah 40:31', 'Galatians 5:22-23',
  'Hebrews 11:1', 'Psalms 119:105', 'Matthew 6:33', '1 Corinthians 13:4-5', 'Lamentations 3:22-23',
  'Romans 15:13', 'Ephesians 2:8-9', 'Psalms 34:18', 'John 14:27', '2 Corinthians 5:17',
  'Psalms 37:4', 'Proverbs 16:3', 'Micah 6:8', 'Romans 5:8', '1 John 1:9',
  'Colossians 3:23', 'Psalms 27:1', 'Isaiah 26:3', 'Matthew 5:16', 'James 1:5',
  'Psalms 91:1-2', 'John 16:33', 'Hebrews 13:5', '1 Peter 5:7', 'Romans 10:9',
  'Zephaniah 3:17', 'Psalms 139:14', 'Deuteronomy 31:6', 'John 15:5', 'Psalms 121:1-2',
  'Ephesians 3:20', 'Matthew 28:19-20', 'Galatians 2:20', 'Psalms 51:10', '1 Thessalonians 5:16-18',
  'John 11:25', 'Isaiah 43:2', 'Psalms 62:1', 'Romans 8:38-39', 'Hebrews 12:1-2',
  'James 1:2-3', 'Proverbs 18:10', 'Psalms 16:11', '2 Corinthians 12:9', 'Revelation 21:4',
];

export function verseOfTheDay(date = new Date()) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const now = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfYear = Math.round((now - start) / 86400000);
  return VERSES[(dayOfYear + date.getFullYear()) % VERSES.length];
}

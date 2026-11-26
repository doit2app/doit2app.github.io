// 갤러리에서 사진 불러오기 (첫 사진, 또는 예전에 찍어 둔 사진 채워 넣기)

import * as ImagePicker from 'expo-image-picker';

import type { Project } from './data/db';
import { addShot } from './data/store';
import { cropToRatio } from './photo';
import { scheduleReminder } from './reminders';
import { listShots } from './data/db';

/** 고른 사진 수 (취소하면 0) */
export async function importFromGallery(p: Project, multiple: boolean): Promise<number> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: true,
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? 50 : 1,
    orderedSelection: true,
  });
  if (res.canceled || res.assets.length === 0) return 0;
  for (const a of res.assets) {
    const cropped = await cropToRatio(a.uri, p.ratio);
    const exifDate = (a.exif as { DateTimeOriginal?: string; DateTime?: string } | null | undefined);
    const takenAt = parseExifDate(exifDate?.DateTimeOriginal ?? exifDate?.DateTime) ?? new Date().toISOString();
    await addShot(p.id, cropped.uri, { roll: null, pitch: null, facing: null, takenAt });
  }
  const shots = await listShots(p.id);
  await scheduleReminder(p, shots[shots.length - 1]?.takenAt ?? null);
  return res.assets.length;
}

/** "2024:05:01 13:22:10" → ISO */
export function parseExifDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

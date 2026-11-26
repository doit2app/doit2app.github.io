// 백업·복원: 모든 프로젝트와 사진을 ZIP 하나로 내보내고, 그 ZIP에서 다시 들여온다.
// 휴대폰을 바꿀 때나 안드로이드(앱 데이터 자동 백업이 25MB까지)에서 사진을 지키는 용도.
//
// ZIP 안:
//   manifest.json                 프로젝트·사진 목록
//   photos/{프로젝트 id}/{파일}    원본 사진

import * as DocumentPicker from 'expo-document-picker';
import { File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { insertProject, insertShot, listAllShots, listProjects, Project, Shot } from './data/db';
import { ensureProjectDirs, makeThumb, photoFile } from './data/files';
import { notifyChanged } from './data/store';
import { rescheduleAll } from './reminders';
import { readZipEntries, readZipEntry, ZipWriter } from './zip';

type Manifest = {
  app: 'keepit2';
  version: 1;
  exportedAt: string;
  projects: Project[];
  shots: Shot[];
};

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 백업 ZIP을 만들고 공유 창을 띄운다. 사진 장수를 돌려준다 */
export async function exportBackup(onProgress?: (p: number) => void): Promise<number> {
  const projects = (await listProjects()).map(({ shotCount, firstShot, lastShot, ...p }) => p);
  const shots = await listAllShots();
  const manifest: Manifest = { app: 'keepit2', version: 1, exportedAt: new Date().toISOString(), projects, shots };

  const out = new File(Paths.cache, `keepit2-backup-${stamp()}.zip`);
  if (out.exists) out.delete();
  out.create();
  const handle = out.open(FileMode.WriteOnly);
  let count = 0;
  try {
    const zip = new ZipWriter((b) => handle.writeBytesSync(b));
    zip.addFile('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      const f = photoFile(s);
      if (!f.exists) continue;
      zip.addFile(`photos/${s.projectId}/${s.file}`, await f.bytes(), new Date(s.takenAt));
      count++;
      onProgress?.((i + 1) / shots.length);
    }
    zip.finish();
  } finally {
    handle.close();
  }

  await Sharing.shareAsync(out.uri, { mimeType: 'application/zip', dialogTitle: '킵잇투 백업 저장하기', UTI: 'public.zip-archive' });
  return count;
}

export type RestoreResult = { projects: number; shots: number } | null;

/** ZIP을 골라 들여온다. 이미 있는 프로젝트·사진은 건너뛴다. 취소하면 null */
export async function importBackup(onProgress?: (p: number) => void): Promise<RestoreResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || !picked.assets[0]) return null;

  const file = new File(picked.assets[0].uri);
  const handle = file.open(FileMode.ReadOnly);
  try {
    const size = handle.size ?? 0;
    const read = (offset: number, length: number) => {
      handle.offset = offset;
      return handle.readBytesSync(length);
    };
    const entries = readZipEntries(read, size);
    const manifestEntry = entries.find((e) => e.name === 'manifest.json');
    if (!manifestEntry) throw new Error('킵잇투 백업 파일이 아니에요');
    const manifest = JSON.parse(new TextDecoder().decode(readZipEntry(read, manifestEntry))) as Manifest;
    if (manifest.app !== 'keepit2') throw new Error('킵잇투 백업 파일이 아니에요');

    const byName = new Map(entries.map((e) => [e.name, e]));
    for (const p of manifest.projects) {
      ensureProjectDirs(p.id);
      await insertProject(p);
    }
    let restored = 0;
    for (let i = 0; i < manifest.shots.length; i++) {
      const s = manifest.shots[i];
      const entry = byName.get(`photos/${s.projectId}/${s.file}`);
      if (!entry) continue;
      const dest = photoFile(s);
      if (!dest.exists) {
        dest.create();
        await dest.write(readZipEntry(read, entry));
        await makeThumb(s).catch(() => {});
        restored++;
      }
      await insertShot(s);
      onProgress?.((i + 1) / manifest.shots.length);
    }
    notifyChanged();
    await rescheduleAll();
    return { projects: manifest.projects.length, shots: restored };
  } finally {
    handle.close();
  }
}

// 화면에서 쓰는 데이터 작업. DB와 파일을 함께 다루고, 바뀌면 화면들에 알린다.

import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';

import type { Ratio } from '../frame';
import {
  deleteProjectRow,
  deleteShotRow,
  Facing,
  getSetting,
  insertProject,
  insertShot,
  listProjects,
  listShots,
  Project,
  setSetting,
  Shot,
  updateProject,
} from './db';
import { ensureProjectDirs, makeThumb, photoFile, projectDir, thumbFile } from './files';

// ── 바뀜 알림 ───────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyChanged() {
  for (const l of listeners) l();
}

/** 데이터가 바뀔 때마다 다시 불러오는 훅 */
export function useData<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; reload: () => void } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    listeners.add(reload);
    return () => {
      listeners.delete(reload);
    };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => !cancelled && setData(d))
      .catch((e) => console.warn('불러오기 실패', e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, reload };
}

// ── 프로젝트 ────────────────────────────────────────────

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function createProject(input: {
  name: string;
  ratio: Ratio;
  intervalDays: number;
  remindHour: number;
}): Promise<Project> {
  const p: Project = { id: newId(), createdAt: new Date().toISOString(), ...input };
  ensureProjectDirs(p.id);
  await insertProject(p);
  notifyChanged();
  return p;
}

export async function editProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'intervalDays' | 'remindHour' | 'ratio'>>,
) {
  await updateProject(id, patch);
  notifyChanged();
}

export async function removeProject(id: string) {
  await deleteProjectRow(id);
  const dir = projectDir(id);
  if (dir.exists) dir.delete();
  notifyChanged();
}

// ── 사진 ───────────────────────────────────────────────

/** 임시 파일(cropToRatio 결과)을 프로젝트에 넣는다 */
export async function addShot(
  projectId: string,
  tempUri: string,
  meta: { roll: number | null; pitch: number | null; facing: Facing | null; takenAt?: string },
): Promise<Shot> {
  ensureProjectDirs(projectId);
  const id = newId();
  const shot: Shot = {
    id,
    projectId,
    file: `${id}.jpg`,
    takenAt: meta.takenAt ?? new Date().toISOString(),
    roll: meta.roll != null ? Math.round(meta.roll * 10) / 10 : null,
    pitch: meta.pitch != null ? Math.round(meta.pitch * 10) / 10 : null,
    facing: meta.facing,
  };
  await new File(tempUri).move(photoFile(shot));
  await insertShot(shot);
  try {
    await makeThumb(shot);
  } catch (e) {
    console.warn('썸네일 실패', e);
  }
  notifyChanged();
  return shot;
}

export async function removeShot(shot: Shot) {
  await deleteShotRow(shot.id);
  for (const f of [photoFile(shot), thumbFile(shot)]) if (f.exists) f.delete();
  notifyChanged();
}

// ── 설정 ───────────────────────────────────────────────

export const SETTING_SAVE_TO_GALLERY = 'saveToGallery';
export const SETTING_DEV_PRO = 'devPro';

export async function getBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await getSetting(key);
  return v == null ? fallback : v === '1';
}

export async function setBool(key: string, value: boolean) {
  await setSetting(key, value ? '1' : '0');
  notifyChanged();
}

// ── 예전 프로토타입 데이터 옮기기 ─────────────────────────────
// 프로토타입은 document/project/project.json 하나에 사진을 모았다. 있으면 프로젝트 하나로 옮긴다.

type LegacyShot = { id: string; file: string; takenAt: string; roll: number | null; pitch: number | null };

export async function migrateLegacy(): Promise<void> {
  const root = new Directory(Paths.document, 'project');
  const index = new File(root, 'project.json');
  if (!index.exists) return;
  try {
    const legacy = JSON.parse(await index.text()) as { ratio: Ratio; shots: LegacyShot[] };
    if (legacy.shots?.length) {
      const p = await createProject({ name: '내 첫 프로젝트', ratio: legacy.ratio ?? '3:4', intervalDays: 0, remindHour: 9 });
      for (const s of legacy.shots) {
        const src = new File(root, 'photos', s.file);
        if (!src.exists) continue;
        const shot: Shot = { ...s, projectId: p.id, facing: null };
        await src.move(photoFile(shot));
        await insertShot(shot);
        await makeThumb(shot).catch(() => {});
      }
    }
    root.delete();
    notifyChanged();
  } catch (e) {
    console.warn('예전 데이터 옮기기 실패', e);
  }
}

export { listProjects, listShots };

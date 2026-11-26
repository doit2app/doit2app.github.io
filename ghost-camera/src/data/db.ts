// SQLite: 프로젝트·사진 목록과 설정 값.
// 사진 파일 자체는 앱 폴더에 두고, 여기에는 파일 이름만 적는다 (files.ts).

import * as SQLite from 'expo-sqlite';

import type { Ratio } from '../frame';

export type Project = {
  id: string;
  name: string;
  ratio: Ratio;
  /** 촬영 주기(일). 0이면 알림 없음 */
  intervalDays: number;
  /** 알림 시각 (0~23시) */
  remindHour: number;
  createdAt: string;
};

export type Facing = 'back' | 'front';

export type Shot = {
  id: string;
  projectId: string;
  /** 프로젝트 사진 폴더 안의 파일 이름 */
  file: string;
  takenAt: string;
  roll: number | null;
  pitch: number | null;
  facing: Facing | null;
};

export type ProjectSummary = Project & {
  shotCount: number;
  firstShot: Shot | null;
  lastShot: Shot | null;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open() {
  const db = await SQLite.openDatabaseAsync('geujari.db');
  await migrate(db);
  return db;
}

const MIGRATIONS: string[] = [
  `
  PRAGMA journal_mode = WAL;
  CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    ratio TEXT NOT NULL,
    interval_days INTEGER NOT NULL DEFAULT 0,
    remind_hour INTEGER NOT NULL DEFAULT 9,
    created_at TEXT NOT NULL
  );
  CREATE TABLE shots (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    taken_at TEXT NOT NULL,
    roll REAL,
    pitch REAL,
    facing TEXT
  );
  CREATE INDEX shots_project ON shots(project_id, taken_at);
  CREATE TABLE kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.execAsync(MIGRATIONS[version]);
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

type ProjectRow = {
  id: string;
  name: string;
  ratio: string;
  interval_days: number;
  remind_hour: number;
  created_at: string;
};
type ShotRow = {
  id: string;
  project_id: string;
  file: string;
  taken_at: string;
  roll: number | null;
  pitch: number | null;
  facing: string | null;
};

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    ratio: r.ratio as Ratio,
    intervalDays: r.interval_days,
    remindHour: r.remind_hour,
    createdAt: r.created_at,
  };
}

export function toShot(r: ShotRow): Shot {
  return {
    id: r.id,
    projectId: r.project_id,
    file: r.file,
    takenAt: r.taken_at,
    roll: r.roll,
    pitch: r.pitch,
    facing: r.facing === 'front' || r.facing === 'back' ? r.facing : null,
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ProjectRow & { shot_count: number }>(
    `SELECT p.*, (SELECT COUNT(*) FROM shots s WHERE s.project_id = p.id) AS shot_count
     FROM projects p ORDER BY p.created_at DESC`,
  );
  const out: ProjectSummary[] = [];
  for (const r of rows) {
    const first = await db.getFirstAsync<ShotRow>(
      'SELECT * FROM shots WHERE project_id = ? ORDER BY taken_at ASC LIMIT 1',
      r.id,
    );
    const last = await db.getFirstAsync<ShotRow>(
      'SELECT * FROM shots WHERE project_id = ? ORDER BY taken_at DESC LIMIT 1',
      r.id,
    );
    out.push({
      ...toProject(r),
      shotCount: r.shot_count,
      firstShot: first ? toShot(first) : null,
      lastShot: last ? toShot(last) : null,
    });
  }
  return out;
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ProjectRow>('SELECT * FROM projects WHERE id = ?', id);
  return r ? toProject(r) : null;
}

export async function countProjects(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM projects');
  return r?.n ?? 0;
}

export async function insertProject(p: Project): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO projects (id, name, ratio, interval_days, remind_hour, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    p.id,
    p.name,
    p.ratio,
    p.intervalDays,
    p.remindHour,
    p.createdAt,
  );
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'name' | 'intervalDays' | 'remindHour' | 'ratio'>>,
): Promise<void> {
  const db = await getDb();
  const cur = await getProject(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  await db.runAsync(
    'UPDATE projects SET name = ?, ratio = ?, interval_days = ?, remind_hour = ? WHERE id = ?',
    next.name,
    next.ratio,
    next.intervalDays,
    next.remindHour,
    id,
  );
}

export async function deleteProjectRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM shots WHERE project_id = ?', id);
  await db.runAsync('DELETE FROM projects WHERE id = ?', id);
}

export async function listShots(projectId: string): Promise<Shot[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ShotRow>(
    'SELECT * FROM shots WHERE project_id = ? ORDER BY taken_at ASC',
    projectId,
  );
  return rows.map(toShot);
}

export async function listAllShots(): Promise<Shot[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ShotRow>('SELECT * FROM shots ORDER BY project_id, taken_at ASC');
  return rows.map(toShot);
}

export async function getShot(id: string): Promise<Shot | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ShotRow>('SELECT * FROM shots WHERE id = ?', id);
  return r ? toShot(r) : null;
}

export async function insertShot(s: Shot): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO shots (id, project_id, file, taken_at, roll, pitch, facing) VALUES (?, ?, ?, ?, ?, ?, ?)',
    s.id,
    s.projectId,
    s.file,
    s.takenAt,
    s.roll,
    s.pitch,
    s.facing,
  );
}

export async function deleteShotRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM shots WHERE id = ?', id);
}

// ── 설정 값 ──────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return r?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, value);
}

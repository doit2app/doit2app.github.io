// 사진은 앱 전용 폴더(document)에 보관한다.
// 목록에는 절대 경로가 아니라 폴더 안의 파일 이름만 적는다 (iOS는 업데이트·복원 때 앱 폴더 경로가 바뀔 수 있다).
// 프로토타입이라 목록은 JSON 파일 하나에 둔다. 실제 앱에서는 SQLite로 옮긴다.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { centerCrop, outputSize, Ratio, ratioValue } from './frame';

export type Shot = {
  id: string;
  /** 사진 폴더 안의 파일 이름 */
  file: string;
  takenAt: string;
  /** 찍을 때 기기 기울기(도). 불러온 사진은 모른다 */
  roll: number | null;
  pitch: number | null;
};

export type Project = {
  ratio: Ratio;
  shots: Shot[];
};

const root = new Directory(Paths.document, 'project');
const photos = new Directory(root, 'photos');
const index = new File(root, 'project.json');

function ensureDirs() {
  photos.create({ intermediates: true, idempotent: true });
}

export async function loadProject(): Promise<Project> {
  ensureDirs();
  if (!index.exists) return { ratio: '3:4', shots: [] };
  try {
    return JSON.parse(await index.text()) as Project;
  } catch {
    return { ratio: '3:4', shots: [] };
  }
}

async function saveProject(p: Project) {
  ensureDirs();
  await index.write(JSON.stringify(p));
}

export function shotUri(shot: Shot): string {
  return new File(photos, shot.file).uri;
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 찍었거나 불러온 사진을 프로젝트 비율로 가운데를 잘라 줄이고, 임시 파일로 만든다.
 * 돌려준 uri는 캐시라 "저장"을 눌러야 앱 폴더로 옮긴다.
 */
export async function cropToRatio(uri: string, width: number, height: number, ratio: Ratio): Promise<string> {
  const crop = centerCrop(width, height, ratioValue(ratio));
  const size = outputSize(crop);
  const image = await ImageManipulator.manipulate(uri).crop(crop).resize(size).renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return result.uri;
}

export async function addShot(
  project: Project,
  tempUri: string,
  tilt: { roll: number; pitch: number } | null,
): Promise<Project> {
  ensureDirs();
  const id = newId();
  const file = `${id}.jpg`;
  await new File(tempUri).move(new File(photos, file));
  const shot: Shot = {
    id,
    file,
    takenAt: new Date().toISOString(),
    roll: tilt ? round1(tilt.roll) : null,
    pitch: tilt ? round1(tilt.pitch) : null,
  };
  const next = { ...project, shots: [...project.shots, shot] };
  await saveProject(next);
  return next;
}

export async function deleteShot(project: Project, id: string): Promise<Project> {
  const shot = project.shots.find((s) => s.id === id);
  if (shot) {
    const f = new File(photos, shot.file);
    if (f.exists) f.delete();
  }
  const next = { ...project, shots: project.shots.filter((s) => s.id !== id) };
  await saveProject(next);
  return next;
}

export async function setRatio(project: Project, ratio: Ratio): Promise<Project> {
  const next = { ...project, ratio };
  await saveProject(next);
  return next;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

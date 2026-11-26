// 사진 파일 위치. 앱 폴더(document) 안에 프로젝트마다 폴더를 둔다.
//   projects/{프로젝트 id}/photos/{파일}   원본 (긴 변 2048px)
//   projects/{프로젝트 id}/thumbs/{파일}   썸네일 (가로 300px)
// DB에는 파일 이름만 적는다. iOS는 업데이트·복원 때 앱 폴더 경로가 바뀔 수 있어서.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Shot } from './db';

export const THUMB_W = 300;

export function projectDir(projectId: string): Directory {
  return new Directory(Paths.document, 'projects', projectId);
}

export function photosDir(projectId: string): Directory {
  return new Directory(projectDir(projectId), 'photos');
}

export function thumbsDir(projectId: string): Directory {
  return new Directory(projectDir(projectId), 'thumbs');
}

export function ensureProjectDirs(projectId: string) {
  photosDir(projectId).create({ intermediates: true, idempotent: true });
  thumbsDir(projectId).create({ intermediates: true, idempotent: true });
}

export function photoFile(shot: Pick<Shot, 'projectId' | 'file'>): File {
  return new File(photosDir(shot.projectId), shot.file);
}

export function thumbFile(shot: Pick<Shot, 'projectId' | 'file'>): File {
  return new File(thumbsDir(shot.projectId), shot.file);
}

export function shotUri(shot: Pick<Shot, 'projectId' | 'file'>): string {
  return photoFile(shot).uri;
}

/** 썸네일이 없으면 원본을 쓴다 (만드는 중이거나 실패했을 때) */
export function thumbUri(shot: Pick<Shot, 'projectId' | 'file'>): string {
  const t = thumbFile(shot);
  return t.exists ? t.uri : photoFile(shot).uri;
}

export async function makeThumb(shot: Pick<Shot, 'projectId' | 'file'>): Promise<void> {
  ensureProjectDirs(shot.projectId);
  const ref = await ImageManipulator.manipulate(photoFile(shot).uri).resize({ width: THUMB_W }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const dest = thumbFile(shot);
  if (dest.exists) dest.delete();
  await new File(out.uri).move(dest);
}

/** 프로젝트 폴더가 쓰는 용량 (바이트) */
export function projectBytes(projectId: string): number {
  return dirBytes(projectDir(projectId));
}

export function allProjectsBytes(): number {
  return dirBytes(new Directory(Paths.document, 'projects'));
}

function dirBytes(dir: Directory): number {
  if (!dir.exists) return 0;
  let total = 0;
  for (const item of dir.list()) {
    if (item instanceof Directory) total += dirBytes(item);
    else total += item.size ?? 0;
  }
  return total;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

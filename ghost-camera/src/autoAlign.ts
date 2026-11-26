// 찍은 뒤 자동 보정: 새 사진이 고스트(지난 사진)보다 조금 옮겨졌거나 크기가 다르면
// 새 사진을 잘라 내고 다시 키워서 지난 사진과 같은 자리에 오게 한다.
//
// 지난 사진의 점 q가 새 사진에서 p = c + scale·(q − c) + d 에 있으므로,
// 새 사진에서 가운데가 c + d, 크기가 scale배인 사각형을 잘라 원래 크기로 늘리면 q 자리에 온다.
// 사각형이 사진 밖으로 나가면(물러나야 맞는 경우, 많이 옮겨진 경우) 빈 곳을 만들지 않도록
// 사진 안으로 들여 놓는다. 그래서 그런 때는 일부만 보정된다.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { gridSize, loadGray } from './grayImage';
import { buildModel, estimate } from './match';

const GRID_W = 96;

export type AlignResult = {
  uri: string;
  /** 실제로 옮긴 양 (가로·세로 비율)과 크기 */
  dx: number;
  dy: number;
  scale: number;
  /** 사진 밖으로 나가서 다 못 맞춘 경우 */
  partial: boolean;
};

export async function autoAlign(
  newUri: string,
  ghostUri: string,
  width: number,
  height: number,
): Promise<AlignResult | null> {
  const aspect = width / height;
  const g = gridSize(GRID_W, aspect);
  const [cur, ghost] = await Promise.all([loadGray(newUri, g.w, g.h), loadGray(ghostUri, g.w, g.h)]);
  const m = estimate(buildModel(cur), buildModel(ghost), 0.15);

  // 확실할 때만: 맞춘 위치가 충분히 비슷하고, 그대로보다 확실히 낫고, 너무 크게 어긋나지 않았을 때
  const confident = m.bestScore >= 0.35 && m.bestScore - m.score >= 0.02;
  const small = Math.abs(m.dx) <= 0.15 && Math.abs(m.dy) <= 0.15 && Math.abs(m.scale - 1) <= 0.12;
  const worth = Math.abs(m.dx) > 0.004 || Math.abs(m.dy) > 0.004 || Math.abs(m.scale - 1) > 0.006;
  if (!confident || !small || !worth) return null;

  // 잘라 낼 사각형 (새 사진 픽셀 단위)
  let cw = width * m.scale;
  let ch = height * m.scale;
  let partial = false;
  if (cw > width || ch > height) {
    const f = Math.min(width / cw, height / ch);
    cw *= f;
    ch *= f;
    partial = true;
  }
  let cx = width / 2 + m.dx * width;
  let cy = height / 2 + m.dy * height;
  const clampedX = Math.max(cw / 2, Math.min(width - cw / 2, cx));
  const clampedY = Math.max(ch / 2, Math.min(height - ch / 2, cy));
  if (Math.abs(clampedX - cx) > 0.5 || Math.abs(clampedY - cy) > 0.5) partial = true;
  cx = clampedX;
  cy = clampedY;

  const crop = {
    originX: Math.round(cx - cw / 2),
    originY: Math.round(cy - ch / 2),
    width: Math.round(cw),
    height: Math.round(ch),
  };
  // 반올림으로 1px 넘어가지 않게
  crop.width = Math.min(crop.width, width - crop.originX);
  crop.height = Math.min(crop.height, height - crop.originY);

  const ref = await ImageManipulator.manipulate(newUri).crop(crop).resize({ width, height }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return {
    uri: out.uri,
    dx: (cx - width / 2) / width,
    dy: (cy - height / 2) / height,
    scale: cw / width,
    partial,
  };
}

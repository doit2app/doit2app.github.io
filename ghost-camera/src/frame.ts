// 고스트가 정확히 겹치려면 "화면에 보이는 범위"와 "저장되는 사진"이 같아야 한다.
// 카메라 미리보기는 iOS·안드로이드 모두 기본이 화면을 가득 채우는 방식(가운데 기준으로 넘치는 부분을 잘라냄)이라,
// 찍힌 사진에서도 같은 비율로 가운데를 잘라내면 미리보기에 보였던 범위와 같아진다.
// (안드로이드에서 CameraView의 ratio를 정하면 FIT으로 바뀌어 이 가정이 깨지므로 ratio는 쓰지 않는다.)

export type Ratio = '3:4' | '1:1' | '9:16';

export const RATIOS: Ratio[] = ['3:4', '1:1', '9:16'];

/** 가로 ÷ 세로 */
export function ratioValue(r: Ratio): number {
  const [w, h] = r.split(':').map(Number);
  return w / h;
}

export type Rect = { originX: number; originY: number; width: number; height: number };

/** 사진(width×height)에서 aspect(가로÷세로) 비율로 가운데를 잘라낼 영역 */
export function centerCrop(width: number, height: number, aspect: number): Rect {
  'worklet';
  const photoAspect = width / height;
  if (photoAspect > aspect) {
    // 사진이 더 넓다 → 좌우를 자른다
    const w = Math.round(height * aspect);
    return { originX: Math.floor((width - w) / 2), originY: 0, width: w, height };
  }
  // 사진이 더 길다 → 위아래를 자른다
  const h = Math.round(width / aspect);
  return { originX: 0, originY: Math.floor((height - h) / 2), width, height: h };
}

/** 정해진 공간(maxW×maxH) 안에 aspect 비율로 가장 크게 들어가는 크기 */
export function fitSize(maxW: number, maxH: number, aspect: number): { width: number; height: number } {
  if (maxW / maxH > aspect) {
    return { width: Math.floor(maxH * aspect), height: Math.floor(maxH) };
  }
  return { width: Math.floor(maxW), height: Math.floor(maxW / aspect) };
}

/** 저장할 사진의 긴 변 (장당 0.5~1MB 정도가 되게) */
export const LONG_EDGE = 2048;

export function outputSize(crop: Rect): { width: number; height: number } {
  const scale = Math.min(1, LONG_EDGE / Math.max(crop.width, crop.height));
  return { width: Math.round(crop.width * scale), height: Math.round(crop.height * scale) };
}

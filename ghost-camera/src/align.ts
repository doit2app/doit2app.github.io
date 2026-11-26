import type { Tilt } from './useTilt';

/** 고스트 사진이 없을 때: 이 각도 안이면 수평으로 본다 */
export const LEVEL_OK = 1;
/** 고스트 사진과 비교할 때: 좌우·앞뒤 차이가 이 각도 안이면 맞은 것으로 본다 */
export const MATCH_OK = 1.5;
/** 자동 촬영: 맞은 상태를 이만큼 유지하면 찍는다 */
export const HOLD_MS = 800;

/**
 * 지금 기울기가 맞았는가.
 * 고스트 사진에 기울기 기록이 있으면 그 사진과 비교하고,
 * 없으면(첫 사진, 갤러리에서 불러온 사진) 수평만 본다.
 */
export function isAligned(tilt: Tilt | null, target: Tilt | null): boolean {
  if (!tilt) return false;
  if (!target) return Math.abs(tilt.roll) < LEVEL_OK;
  return Math.abs(tilt.roll - target.roll) < MATCH_OK && Math.abs(tilt.pitch - target.pitch) < MATCH_OK;
}

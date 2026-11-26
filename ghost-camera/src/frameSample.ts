// 카메라 프레임(밝기 값)에서 미리보기와 같은 범위(프로젝트 비율로 가운데 자르기)를
// W×H 흑백 격자로 뽑는다. 카메라 스레드(워클릿)에서 돈다.

import { centerCrop } from './frame';

export type Orientation = 'up' | 'right' | 'down' | 'left';

/**
 * @param buf 밝기 값이 들어 있는 버퍼 (YUV의 Y 평면, 또는 BGRA)
 * @param bw @param bh 버퍼의 가로·세로 (픽셀)
 * @param stride 한 줄의 바이트 수
 * @param bpp 픽셀당 바이트 (Y 평면 1, BGRA 4)
 * @param lumaOffset 픽셀 안에서 읽을 바이트 위치 (Y 평면 0, BGRA는 초록 1)
 * @param orientation 버퍼가 바로 선 화면에 비해 돌아간 방향 (VisionCamera Frame.orientation)
 * @param mirrored 좌우를 뒤집어 읽어야 하는가 (Frame.isMirrored)
 */
export function sampleGray(
  buf: Uint8Array,
  bw: number,
  bh: number,
  stride: number,
  bpp: number,
  lumaOffset: number,
  orientation: Orientation,
  mirrored: boolean,
  aspect: number,
  W: number,
  H: number,
): number[] {
  'worklet';
  const sideways = orientation === 'left' || orientation === 'right';
  // 바로 세운 화면 기준 크기
  const uw = sideways ? bh : bw;
  const uh = sideways ? bw : bh;
  const crop = centerCrop(uw, uh, aspect);
  const cellW = crop.width / W;
  const cellH = crop.height / H;
  // 칸마다 몇 점을 평균낼지 (너무 많으면 느리고, 적으면 지글거린다)
  const k = Math.max(1, Math.min(3, Math.floor(Math.min(cellW, cellH))));
  const out: number[] = new Array(W * H);

  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      let sum = 0;
      for (let sy = 0; sy < k; sy++) {
        for (let sx = 0; sx < k; sx++) {
          // 바로 선 화면의 픽셀 하나로 먼저 맞춘 뒤 버퍼 좌표로 옮긴다
          let ux = Math.min(uw - 1, Math.floor(crop.originX + (gx + (sx + 0.5) / k) * cellW));
          const uy = Math.min(uh - 1, Math.floor(crop.originY + (gy + (sy + 0.5) / k) * cellH));
          if (mirrored) ux = uw - 1 - ux;
          // 바로 선 좌표 → 버퍼 좌표
          let bx: number;
          let by: number;
          if (orientation === 'right') {
            // 버퍼가 시계 방향으로 90° 돌아가 있다
            bx = uh - 1 - uy;
            by = ux;
          } else if (orientation === 'left') {
            bx = uy;
            by = uw - 1 - ux;
          } else if (orientation === 'down') {
            bx = uw - 1 - ux;
            by = uh - 1 - uy;
          } else {
            bx = ux;
            by = uy;
          }
          const ix = Math.max(0, Math.min(bw - 1, bx));
          const iy = Math.max(0, Math.min(bh - 1, by));
          sum += buf[iy * stride + ix * bpp + lumaOffset];
        }
      }
      out[gy * W + gx] = sum / (k * k);
    }
  }
  return out;
}

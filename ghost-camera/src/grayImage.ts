// 저장된 사진을 작은 흑백 격자로 읽는다 (고스트 모델, 찍은 뒤 보정용).
// 이미지 편집 모듈로 정확히 W×H로 줄인 뒤 JPEG를 JS에서 풀어 밝기만 남긴다.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import type { Gray } from './match';

export async function loadGray(uri: string, w: number, h: number): Promise<Gray> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: w, height: h }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
  if (!out.base64) throw new Error('이미지를 읽지 못했어요');
  const img = decode(base64ToBytes(out.base64), { useTArray: true, formatAsRGBA: true });
  // 혹시 크기가 다르게 나오면 가장 가까운 칸으로 맞춘다
  const data: number[] = new Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / w));
      const i = (sy * img.width + sx) * 4;
      data[y * w + x] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    }
  }
  return { w, h, data };
}

/** 분석용 격자 크기: 가로 w칸, 세로는 비율대로 */
export function gridSize(w: number, aspect: number): { w: number; h: number } {
  return { w, h: Math.round(w / aspect) };
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : -1;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

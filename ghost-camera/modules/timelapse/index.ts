// 타임랩스 MP4 만들기 (네이티브 모듈: ios/TimelapseModule.swift, android/.../TimelapseModule.kt)

import { requireNativeModule } from 'expo';

export type TimelapseFrame = {
  /** file:// 경로 */
  uri: string;
  /** 왼쪽 아래에 그릴 글자 (예: 날짜). 없으면 그리지 않는다 */
  label?: string | null;
};

export type TimelapseOptions = {
  frames: TimelapseFrame[];
  /** 만들 파일 (file:// 경로) */
  outputPath: string;
  /** 짝수로 맞춘다 */
  width: number;
  height: number;
  /** 초당 사진 수 */
  fps: number;
  /** 마지막 사진을 더 보여 줄 시간(초) */
  holdLastSeconds: number;
  /** 오른쪽 아래 워터마크 (무료 버전). 없으면 그리지 않는다 */
  watermark?: string | null;
};

type TimelapseNative = {
  exportAsync(options: TimelapseOptions): Promise<string>;
  addListener(event: 'onProgress', listener: (e: { progress: number }) => void): { remove(): void };
};

const Native = requireNativeModule<TimelapseNative>('Timelapse');

/** 만든 파일의 file:// 경로를 돌려준다 */
export async function exportTimelapse(
  options: TimelapseOptions,
  onProgress?: (p: number) => void,
): Promise<string> {
  const sub = onProgress ? Native.addListener('onProgress', (e) => onProgress(e.progress)) : null;
  try {
    return await Native.exportAsync(options);
  } finally {
    sub?.remove();
  }
}

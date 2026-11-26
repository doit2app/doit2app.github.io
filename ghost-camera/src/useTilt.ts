// 가속도계로 기기 기울기를 잰다 (세로로 들고 있을 때 기준).
// roll: 좌우로 돌아간 정도 (0이면 수평), pitch: 앞뒤로 숙인 정도 (0이면 똑바로 섬).
// 같은 기기에서 지난 사진의 값과 비교하는 용도라, 플랫폼마다 부호가 달라도 "차이"는 맞다.

import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';

export type Tilt = { roll: number; pitch: number };

const DEG = 180 / Math.PI;

export function useTilt(enabled: boolean): Tilt | null {
  const [tilt, setTilt] = useState<Tilt | null>(null);
  const smooth = useRef<Tilt | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let sub: { remove(): void } | null = null;
    let cancelled = false;

    Accelerometer.isAvailableAsync().then((ok) => {
      if (!ok || cancelled) return;
      Accelerometer.setUpdateInterval(50);
      sub = Accelerometer.addListener(({ x, y, z }) => {
        const g = Math.sqrt(x * x + y * y + z * z) || 1;
        const raw = {
          roll: Math.asin(clamp(x / g)) * DEG,
          pitch: Math.asin(clamp(z / g)) * DEG,
        };
        // 손떨림에 숫자가 튀지 않게 살짝 부드럽게
        const prev = smooth.current ?? raw;
        const next = {
          roll: prev.roll + (raw.roll - prev.roll) * 0.25,
          pitch: prev.pitch + (raw.pitch - prev.pitch) * 0.25,
        };
        smooth.current = next;
        setTilt(next);
      });
    });

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);

  return tilt;
}

function clamp(v: number) {
  return Math.max(-1, Math.min(1, v));
}

import { useRef } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';

import { LEVEL_OK, MATCH_OK } from '../align';
import type { Tilt } from '../useTilt';

/** 3×3 격자 */
export function Grid() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[1, 2].map((i) => (
        <View key={`v${i}`} style={[styles.line, styles.vLine, { left: `${(i * 100) / 3}%` }]} />
      ))}
      {[1, 2].map((i) => (
        <View key={`h${i}`} style={[styles.line, styles.hLine, { top: `${(i * 100) / 3}%` }]} />
      ))}
    </View>
  );
}

/**
 * 반반 나눠 보기: 경계선 왼쪽은 지난 사진, 오른쪽은 지금 카메라(또는 새 사진).
 * 경계선을 좌우로 끌어 옮긴다. 지난 사진은 늘리지 않고 프레임 크기 그대로 두고 왼쪽만 보여서,
 * 경계선에서 물건의 선이 끊기지 않고 이어지면 맞은 것이다.
 */
export function SplitGhost({
  uri,
  width,
  height,
  position,
  onChange,
}: {
  uri: string;
  width: number;
  height: number;
  /** 경계선 위치 (0~1) */
  position: number;
  onChange: (p: number) => void;
}) {
  const start = useRef(position);
  const latest = useRef(position);
  latest.current = position;
  // PanResponder는 한 번만 만들므로 최신 값은 ref로 넘긴다
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const widthRef = useRef(width);
  widthRef.current = width;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.current = latest.current;
      },
      onPanResponderMove: (_, g) => {
        onChangeRef.current(clamp(start.current + g.dx / widthRef.current, 0.05, 0.95));
      },
    }),
  ).current;

  const x = Math.round(width * position);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={[styles.splitClip, { width: x }]}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="cover" />
      </View>
      <View pointerEvents="none" style={[styles.splitLine, { left: x - 1 }]} />
      <View pointerEvents="none" style={[styles.splitLabel, { right: width - x + 8 }]}>
        <Text style={styles.splitLabelText}>지난</Text>
      </View>
      <View pointerEvents="none" style={[styles.splitLabel, { left: x + 8 }]}>
        <Text style={styles.splitLabelText}>지금</Text>
      </View>
      {/* 손가락으로 잡기 쉽게 넓은 터치 영역 */}
      <View {...pan.panHandlers} style={[styles.splitTouch, { left: x - 28 }]}>
        <View style={styles.splitHandle}>
          <Text style={styles.splitHandleText}>‹ ›</Text>
        </View>
      </View>
    </View>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** 가운데 수평선: 기기가 돌아간 만큼 반대로 돌아 실제 수평을 가리킨다 */
export function LevelLine({ tilt }: { tilt: Tilt | null }) {
  if (!tilt) return null;
  const ok = Math.abs(tilt.roll) < LEVEL_OK;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <View
        style={[
          styles.level,
          { backgroundColor: ok ? '#4ADE80' : '#FFFFFF', transform: [{ rotate: `${-tilt.roll}deg` }] },
        ]}
      />
    </View>
  );
}

/** 지금 기울기와 고스트 사진을 찍을 때 기울기의 차이 */
export function TiltReadout({ tilt, target }: { tilt: Tilt | null; target: Tilt | null }) {
  if (!tilt) return <Text style={styles.readout}>기울기 센서를 쓸 수 없어요</Text>;

  if (!target) {
    const ok = Math.abs(tilt.roll) < LEVEL_OK;
    return (
      <Text style={[styles.readout, ok && styles.ok]}>
        수평 {fmt(tilt.roll)} · 앞뒤 {fmt(tilt.pitch)}
      </Text>
    );
  }

  const dRoll = tilt.roll - target.roll;
  const dPitch = tilt.pitch - target.pitch;
  const rollOk = Math.abs(dRoll) < MATCH_OK;
  const pitchOk = Math.abs(dPitch) < MATCH_OK;
  return (
    <View style={styles.readoutRow}>
      <Text style={styles.readoutLabel}>지난 사진과 차이</Text>
      <Text style={[styles.readout, rollOk && styles.ok]}>좌우 {fmt(dRoll)}</Text>
      <Text style={[styles.readout, pitchOk && styles.ok]}>앞뒤 {fmt(dPitch)}</Text>
      {rollOk && pitchOk && <Text style={[styles.readout, styles.ok]}>✓ 맞았어요</Text>}
    </View>
  );
}

function fmt(n: number) {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}°`;
}

const styles = StyleSheet.create({
  line: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)' },
  vLine: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  hLine: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
  center: { alignItems: 'center', justifyContent: 'center' },
  level: { width: 120, height: 2, borderRadius: 1 },
  splitClip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  splitLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#FFFFFF' },
  splitTouch: { position: 'absolute', top: 0, bottom: 0, width: 56, alignItems: 'center', justifyContent: 'center' },
  splitHandle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitHandleText: { color: '#000', fontSize: 14, fontWeight: '700' },
  splitLabel: {
    position: 'absolute',
    top: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  splitLabelText: { color: '#fff', fontSize: 12 },
  readoutRow: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  readoutLabel: { color: '#A1A1AA', fontSize: 13 },
  readout: { color: '#F4F4F5', fontSize: 14, fontVariant: ['tabular-nums'] },
  ok: { color: '#4ADE80', fontWeight: '600' },
});

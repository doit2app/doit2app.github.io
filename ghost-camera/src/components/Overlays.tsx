import { StyleSheet, Text, View } from 'react-native';

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

const LEVEL_OK = 1; // 이 각도 안이면 맞은 것으로 본다

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

const MATCH_OK = 1.5;

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
  readoutRow: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  readoutLabel: { color: '#A1A1AA', fontSize: 13 },
  readout: { color: '#F4F4F5', fontSize: 14, fontVariant: ['tabular-nums'] },
  ok: { color: '#4ADE80', fontWeight: '600' },
});

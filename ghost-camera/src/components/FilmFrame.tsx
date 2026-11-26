// 필름 사진 한 칸: 빛바램(오래된 사진일수록 더), 필름 입자, 가장자리 어둡게, 주황색 날짜 도장

import { Image, StyleSheet, Text, View } from 'react-native';

const GRAIN = require('../../assets/film/grain.png');
const VIGNETTE = require('../../assets/film/vignette.png');

export const FILM_ORANGE = '#FF9F43';

/** 옛날 필름 카메라 날짜 도장 모양: '24 11 26 */
export function filmDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `'${p(d.getFullYear() % 100)} ${p(d.getMonth() + 1)} ${p(d.getDate())}`;
}

export function FilmPhoto({
  uri,
  width,
  height,
  takenAt,
  /** 0이면 지금처럼 선명, 1이면 가장 빛바랜 */
  age,
  showDate = true,
}: {
  uri: string;
  width: number;
  height: number;
  takenAt: string;
  age: number;
  showDate?: boolean;
}) {
  const a = Math.max(0, Math.min(1, age));
  return (
    <View style={{ width, height, overflow: 'hidden', backgroundColor: '#000' }}>
      <Image source={{ uri }} style={{ width, height }} resizeMode="cover" />
      {/* 빛바램: 누런 막과 살짝 뿌연 막 */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(190,120,50,${0.1 + 0.22 * a})` }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,240,215,${0.02 + 0.08 * a})` }]} />
      {/* 필름 입자 */}
      <Image
        pointerEvents="none"
        source={GRAIN}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, { opacity: 0.22 + 0.25 * a }]}
      />
      {/* 가장자리 어둡게 */}
      <Image pointerEvents="none" source={VIGNETTE} resizeMode="stretch" style={[StyleSheet.absoluteFill, { opacity: 0.7 + 0.3 * a }]} />
      {showDate && (
        <Text style={[styles.date, { fontSize: Math.max(11, width * 0.055), right: width * 0.05, bottom: height * 0.04 }]}>
          {filmDate(takenAt)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  date: {
    position: 'absolute',
    color: FILM_ORANGE,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 1,
    textShadowColor: 'rgba(255,120,20,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});

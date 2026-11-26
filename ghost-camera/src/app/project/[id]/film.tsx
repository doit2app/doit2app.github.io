// 필름으로 보기: 35mm 필름 띠 위에 사진을 한 칸씩 놓고 옆으로 밀어 넘기거나 영사기처럼 재생한다.
// 오래된 사진일수록 더 빛바래 보이고, 사진 구석에 주황색 날짜 도장이 찍혀 있다.

import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FILM_ORANGE, FilmPhoto } from '../../../components/FilmFrame';
import { getProject, listShots, Shot } from '../../../data/db';
import { shotUri } from '../../../data/files';
import { useData } from '../../../data/store';
import { ratioValue } from '../../../frame';
import { formatDate } from '../../../ui';

const FILM = '#1A1410';
const HOLE = '#0A0806';

export default function FilmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data } = useData(async () => {
    const [project, shots] = await Promise.all([getProject(id), listShots(id)]);
    return { project, shots };
  }, [id]);

  const shots = useMemo(() => data?.shots ?? [], [data]);
  const project = data?.project;
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const list = useRef<FlatList<Shot>>(null);

  // 사진이 찍힌 기간에서 얼마나 오래됐는지 (0 = 가장 최근, 1 = 가장 처음)
  const ageOf = useMemo(() => {
    if (shots.length < 2) return () => 0;
    const first = new Date(shots[0].takenAt).getTime();
    const last = new Date(shots[shots.length - 1].takenAt).getTime();
    const span = Math.max(1, last - first);
    return (s: Shot) => (last - new Date(s.takenAt).getTime()) / span;
  }, [shots]);

  // 칸 크기: 화면 가운데에 한 칸이 크게, 양옆 칸이 살짝 보이게
  const aspect = project ? ratioValue(project.ratio) : 3 / 4;
  const stripH = area ? Math.min(area.height * 0.78, (area.width * 0.78) / aspect + 80) : 0;
  const holeBand = 40;
  const photoH = Math.max(0, stripH - holeBand * 2);
  const photoW = photoH * aspect;
  const cell = photoW + 24;
  const side = area ? (area.width - cell) / 2 : 0;

  // 영사기처럼 재생
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setIndex((i) => {
        const next = i + 1;
        if (next >= shots.length) {
          setPlaying(false);
          return i;
        }
        list.current?.scrollToOffset({ offset: next * cell, animated: true });
        return next;
      });
    }, 700);
    return () => clearInterval(t);
  }, [playing, shots.length, cell]);

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.max(0, Math.min(shots.length - 1, Math.round(e.nativeEvent.contentOffset.x / cell))));
  }

  function togglePlay() {
    if (!playing && index >= shots.length - 1) {
      list.current?.scrollToOffset({ offset: 0, animated: false });
      setIndex(0);
    }
    setPlaying((p) => !p);
  }

  const current = shots[index];

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
      <Stack.Screen
        options={{
          title: project?.name ?? '',
          headerStyle: { backgroundColor: HOLE },
          headerTintColor: '#F5E6D3',
          contentStyle: { backgroundColor: HOLE },
        }}
      />

      <View style={styles.area} onLayout={(e: LayoutChangeEvent) => setArea(e.nativeEvent.layout)}>
        {area && shots.length > 0 && (
          <View style={{ height: stripH, backgroundColor: FILM }}>
            <FlatList
              ref={list}
              data={shots}
              keyExtractor={(s) => s.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={cell}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: side }}
              getItemLayout={(_, i) => ({ length: cell, offset: cell * i, index: i })}
              onMomentumScrollEnd={onScrollEnd}
              onScrollBeginDrag={() => setPlaying(false)}
              windowSize={7}
              renderItem={({ item, index: i }) => (
                <View style={{ width: cell, height: stripH }}>
                  <Holes width={cell} />
                  <View style={{ height: photoH, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={[styles.frame, i === index && styles.frameOn]}>
                      <FilmPhoto
                        uri={shotUri(item)}
                        width={photoW}
                        height={photoH}
                        takenAt={item.takenAt}
                        age={ageOf(item)}
                        showDate={showDate}
                      />
                    </View>
                  </View>
                  <View style={styles.edgeRow}>
                    <Text style={styles.edgeText}>{`${i + 1}`}</Text>
                    <Text style={styles.edgeText}>{`${i + 1}A`}</Text>
                  </View>
                  <Holes width={cell} bottom />
                </View>
              )}
            />
          </View>
        )}
        {shots.length === 0 && <Text style={styles.empty}>아직 사진이 없어요</Text>}
      </View>

      {current && (
        <View style={styles.caption}>
          <Text style={styles.captionDate}>{formatDate(current.takenAt)}</Text>
          <Text style={styles.captionSub}>
            {index + 1} / {shots.length}
            {shots.length > 1 ? ` · 처음 사진부터 ${daysBetween(shots[0].takenAt, current.takenAt)}일` : ''}
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <Pressable onPress={() => setShowDate((v) => !v)} style={[styles.pill, showDate && styles.pillOn]}>
          <Text style={[styles.pillText, showDate && styles.pillTextOn]}>날짜 도장</Text>
        </Pressable>
        <Pressable onPress={togglePlay} disabled={shots.length < 2} style={[styles.play, shots.length < 2 && { opacity: 0.4 }]}>
          <Text style={styles.playText}>{playing ? '멈추기' : '재생'}</Text>
        </Pressable>
        <View style={{ width: 92 }} />
      </View>
    </View>
  );
}

/** 필름 구멍 한 줄 */
function Holes({ width, bottom }: { width: number; bottom?: boolean }) {
  const n = Math.max(3, Math.floor(width / 34));
  return (
    <View style={[styles.holes, bottom ? { alignItems: 'flex-start' } : { alignItems: 'flex-end' }]}>
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} style={styles.hole} />
      ))}
    </View>
  );
}

function daysBetween(a: string, b: string) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: HOLE },
  area: { flex: 1, justifyContent: 'center' },
  holes: {
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  hole: { width: 16, height: 20, borderRadius: 4, backgroundColor: HOLE },
  frame: { borderRadius: 3, overflow: 'hidden', opacity: 0.55 },
  frameOn: { opacity: 1 },
  edgeRow: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  edgeText: { color: FILM_ORANGE, opacity: 0.55, fontSize: 9, fontFamily: 'monospace', fontWeight: '700' },
  empty: { color: '#A8A29E', textAlign: 'center' },
  caption: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  captionDate: { color: '#F5E6D3', fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  captionSub: { color: '#A8A29E', fontSize: 13 },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  pill: {
    width: 92,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(245,230,211,0.35)',
    alignItems: 'center',
  },
  pillOn: { backgroundColor: FILM_ORANGE, borderColor: FILM_ORANGE },
  pillText: { color: '#F5E6D3', fontSize: 13 },
  pillTextOn: { color: '#1A1410', fontWeight: '700' },
  play: {
    width: 120,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F5E6D3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { color: '#1A1410', fontSize: 16, fontWeight: '800' },
});

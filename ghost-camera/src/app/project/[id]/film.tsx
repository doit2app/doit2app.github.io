// 필름으로 보기: 필름 키링처럼 왼쪽 필름통에서 필름이 가로로 뽑혀 나오고,
// 작은 사진 칸들이 이어져 있다. 칸을 누르면 위에 크게 보이고, 재생하면 필름이 저절로 감긴다.

import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FILM_ORANGE, filmDate } from '../../../components/FilmFrame';
import { getProject, listShots, Shot } from '../../../data/db';
import { shotUri, thumbUri } from '../../../data/files';
import { useData } from '../../../data/store';
import { ratioValue } from '../../../frame';
import { formatDate } from '../../../ui';

const BG = '#EAE3D7';
const FILM = '#111111';
const FRAME_H = 132; // 필름 칸 사진 높이
const BAND = 22; // 위아래 구멍 띠
const GAP = 8; // 칸 사이 검은 틈
const HOLE = 7;
const HOLE_STEP = 13;
const CAN_W = 96; // 필름통 너비

export default function FilmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data } = useData(async () => {
    const [project, shots] = await Promise.all([getProject(id), listShots(id)]);
    return { project, shots };
  }, [id]);

  const shots = useMemo(() => data?.shots ?? [], [data]);
  const project = data?.project;
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [width, setWidth] = useState(0);
  const list = useRef<FlatList<Shot>>(null);

  const aspect = project ? ratioValue(project.ratio) : 3 / 4;
  const frameW = Math.round(FRAME_H * aspect);
  const cell = frameW + GAP;
  const stripH = FRAME_H + BAND * 2;

  // 재생: 한 칸씩 고르며 필름을 감는다
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setSelected((i) => {
        const next = i + 1;
        if (next >= shots.length) {
          setPlaying(false);
          return i;
        }
        list.current?.scrollToOffset({ offset: Math.max(0, next * cell - cell), animated: true });
        return next;
      });
    }, 650);
    return () => clearInterval(t);
  }, [playing, shots.length, cell]);

  function togglePlay() {
    if (!playing && selected >= shots.length - 1) {
      setSelected(0);
      list.current?.scrollToOffset({ offset: 0, animated: false });
    }
    setPlaying((p) => !p);
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (playing) return;
    // 필름을 손으로 넘기면 필름통 바로 오른쪽 칸을 고른다
    const i = Math.round(e.nativeEvent.contentOffset.x / cell);
    if (i !== selected && i >= 0 && i < shots.length) setSelected(i);
  }

  const current = shots[selected];

  return (
    <View
      style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      <Stack.Screen options={{ title: project?.name ?? '', headerStyle: { backgroundColor: BG }, contentStyle: { backgroundColor: BG } }} />

      {/* 고른 칸을 크게 */}
      <View style={styles.big}>
        {current ? (
          <View style={styles.bigCard}>
            <View style={{ width: Math.min(width - 64, 320), aspectRatio: aspect, maxHeight: 360 }}>
              <Image source={{ uri: shotUri(current) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              {showDate && <Text style={styles.stamp}>{filmDate(current.takenAt)}</Text>}
            </View>
            <Text style={styles.bigDate}>{formatDate(current.takenAt)}</Text>
            <Text style={styles.bigSub}>
              {selected + 1}번째 장면
              {shots.length > 1 && selected > 0 ? ` · 처음부터 ${daysBetween(shots[0].takenAt, current.takenAt)}일` : ''}
            </Text>
          </View>
        ) : (
          <Text style={styles.bigSub}>아직 사진이 없어요</Text>
        )}
      </View>

      {/* 필름통에서 뽑혀 나온 필름 */}
      {shots.length > 0 && (
        <View style={{ height: stripH + 40, justifyContent: 'center' }}>
          <FlatList
            ref={list}
            data={shots}
            keyExtractor={(s) => s.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            onScrollBeginDrag={() => setPlaying(false)}
            getItemLayout={(_, i) => ({ length: cell, offset: CAN_W - 20 + cell * i, index: i })}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingLeft: CAN_W - 20, paddingRight: 24, alignItems: 'center' }}
            ListFooterComponent={<FilmTail height={stripH} />}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => {
                  setPlaying(false);
                  setSelected(index);
                }}
                style={{ width: cell, height: stripH, backgroundColor: FILM }}
              >
                <Holes width={cell} />
                <View style={{ height: FRAME_H, paddingLeft: GAP / 2 }}>
                  <Image source={{ uri: thumbUri(item) }} style={{ width: frameW, height: FRAME_H }} resizeMode="cover" />
                  {index === selected && <View style={[styles.selected, { width: frameW, height: FRAME_H }]} />}
                </View>
                <Holes width={cell} />
                <Text style={styles.edgeNumber}>{index + 1}</Text>
              </Pressable>
            )}
          />
          <Canister height={stripH + 34} />
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

/** 위아래 촘촘한 필름 구멍 */
function Holes({ width }: { width: number }) {
  const n = Math.floor(width / HOLE_STEP);
  return (
    <View style={styles.holes}>
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} style={styles.hole} />
      ))}
    </View>
  );
}

/** 필름 끝: 둥글게 마무리하고 키링 금속 구멍 */
function FilmTail({ height }: { height: number }) {
  return (
    <View style={[styles.tail, { height }]}>
      <View style={styles.grommet}>
        <View style={styles.grommetHole} />
      </View>
    </View>
  );
}

/** 필름통 (킵잇투 디자인) */
function Canister({ height }: { height: number }) {
  return (
    <View pointerEvents="none" style={[styles.canister, { height }]}>
      <View style={styles.capTop} />
      <View style={styles.canBody}>
        <Text style={styles.canBig}>200</Text>
        <Text style={styles.canBrand}>KEEPIT2</Text>
        <Text style={styles.canSmall}>MEMORY FILM · 36</Text>
        <View style={styles.canStripe} />
      </View>
      <View style={styles.capBottom} />
    </View>
  );
}

function daysBetween(a: string, b: string) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  big: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  bigCard: { alignItems: 'center', gap: 6 },
  stamp: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    color: FILM_ORANGE,
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1,
    textShadowColor: 'rgba(255,120,20,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  bigDate: { marginTop: 10, fontSize: 19, fontWeight: '800', color: '#1C1917', letterSpacing: 0.5 },
  bigSub: { fontSize: 13, color: '#78716C' },

  holes: {
    height: BAND,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 2,
  },
  hole: { width: HOLE, height: HOLE, borderRadius: 1.5, backgroundColor: BG },
  selected: { position: 'absolute', left: GAP / 2, top: 0, borderWidth: 3, borderColor: FILM_ORANGE },
  edgeNumber: {
    position: 'absolute',
    left: 6,
    bottom: BAND - 2,
    color: FILM_ORANGE,
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '700',
    opacity: 0.8,
  },

  tail: {
    width: 64,
    backgroundColor: FILM,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grommet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#C9A86A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E8D3A4',
  },
  grommetHole: { width: 12, height: 12, borderRadius: 6, backgroundColor: BG },

  canister: { position: 'absolute', left: 8, width: CAN_W, justifyContent: 'center' },
  capTop: { height: 12, marginHorizontal: 14, backgroundColor: '#1C1917', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  capBottom: { height: 12, marginHorizontal: 14, backgroundColor: '#1C1917', borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  canBody: {
    flex: 1,
    backgroundColor: '#F4B63F',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 2, height: 4 },
    elevation: 6,
  },
  canBig: { fontSize: 30, fontWeight: '900', color: '#1C1917', letterSpacing: -1 },
  canBrand: { fontSize: 12, fontWeight: '900', color: '#B91C1C', letterSpacing: 1.5 },
  canSmall: { fontSize: 7, fontWeight: '700', color: '#1C1917', marginTop: 2 },
  canStripe: { position: 'absolute', left: 0, right: 0, bottom: 18, height: 6, backgroundColor: '#B91C1C' },

  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 },
  pill: {
    width: 92,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#A8A29E',
    alignItems: 'center',
  },
  pillOn: { backgroundColor: '#1C1917', borderColor: '#1C1917' },
  pillText: { color: '#44403C', fontSize: 13 },
  pillTextOn: { color: '#fff', fontWeight: '700' },
  play: {
    width: 120,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1C1917',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

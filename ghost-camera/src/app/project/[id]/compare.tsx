// 전후 비교: 두 사진을 손가락으로 밀어 비교하고, 나란히 놓은 이미지 한 장으로 저장·공유한다.

import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { getProject, listShots, Shot } from '../../../data/db';
import { shotUri, thumbUri } from '../../../data/files';
import { useData } from '../../../data/store';
import { ratioValue } from '../../../frame';
import { albumName, saveToGallery } from '../../../gallery';
import { usePro } from '../../../pro';
import { Button, C, Chip, ChipRow, formatDate } from '../../../ui';

const WATERMARK = '그자리';

export default function CompareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const pro = usePro();
  const { data } = useData(async () => {
    const [project, shots] = await Promise.all([getProject(id), listShots(id)]);
    return { project, shots };
  }, [id]);

  const shots = data?.shots ?? [];
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [picking, setPicking] = useState<'before' | 'after'>('before');
  const [busy, setBusy] = useState(false);
  const composeRef = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    if (shots.length && !beforeId) setBeforeId(shots[0].id);
    if (shots.length && !afterId) setAfterId(shots[shots.length - 1].id);
  }, [shots, beforeId, afterId]);

  const project = data?.project;
  const before = shots.find((s) => s.id === beforeId);
  const after = shots.find((s) => s.id === afterId);
  if (!project || !before || !after) return <View style={styles.screen} />;
  const aspect = ratioValue(project.ratio);

  async function makeImage(): Promise<string> {
    return captureRef(composeRef, { format: 'jpg', quality: 0.92, result: 'tmpfile', width: 1600 });
  }

  async function share() {
    setBusy(true);
    try {
      await Sharing.shareAsync(await makeImage(), { mimeType: 'image/jpeg' });
    } catch (e) {
      Alert.alert('이미지를 만들지 못했어요', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const ok = await saveToGallery(await makeImage(), albumName(project!.name));
      Alert.alert(ok ? '사진첩에 저장했어요' : '저장하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.sliderWrap}>
        <WipeCompare before={before} after={after} aspect={aspect} />
      </View>

      <ChipRow>
        <Chip label={`전: ${formatDate(before.takenAt)}`} on={picking === 'before'} onPress={() => setPicking('before')} />
        <Chip label={`후: ${formatDate(after.takenAt)}`} on={picking === 'after'} onPress={() => setPicking('after')} />
      </ChipRow>
      <Text style={styles.hint}>{picking === 'before' ? '"전" 사진을 골라요' : '"후" 사진을 골라요'}</Text>
      <FlatList
        horizontal
        data={shots}
        keyExtractor={(s) => s.id}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 6 }}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => {
          const sel = item.id === (picking === 'before' ? beforeId : afterId);
          return (
            <Pressable onPress={() => (picking === 'before' ? setBeforeId(item.id) : setAfterId(item.id))}>
              <Image
                source={{ uri: thumbUri(item) }}
                style={[styles.strip, { aspectRatio: aspect }, sel && styles.stripOn]}
              />
            </Pressable>
          );
        }}
      />

      <View style={styles.row}>
        <Button label="사진첩에 저장" kind="secondary" onPress={save} busy={busy} style={{ flex: 1 }} />
        <Button label="공유하기" onPress={share} busy={busy} style={{ flex: 1 }} />
      </View>

      {/* 저장·공유할 이미지 (화면 밖에 그려 두고 찍는다) */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={composeRef} collapsable={false} style={styles.compose}>
          {[before, after].map((s, i) => (
            <View key={s.id + i} style={{ flex: 1 }}>
              <Image source={{ uri: shotUri(s) }} style={{ width: '100%', aspectRatio: aspect }} />
              <Text style={styles.composeLabel}>{formatDate(s.takenAt)}</Text>
            </View>
          ))}
          {!pro && <Text style={styles.watermark}>{WATERMARK}</Text>}
        </View>
      </View>
    </View>
  );
}

/** 경계선을 끌어 왼쪽은 전, 오른쪽은 후 */
function WipeCompare({ before, after, aspect }: { before: Shot; after: Shot; aspect: number }) {
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState(0.5);
  const latest = useRef({ pos, width });
  latest.current = { pos, width };
  const start = useRef(0.5);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const w = latest.current.width || 1;
        // 누른 곳으로 바로 옮긴다
        const p = Math.max(0.02, Math.min(0.98, e.nativeEvent.locationX / w));
        start.current = p;
        setPos(p);
      },
      onPanResponderMove: (_, g) => {
        const w = latest.current.width || 1;
        setPos(Math.max(0.02, Math.min(0.98, start.current + g.dx / w)));
      },
    }),
  ).current;

  const height = width / aspect;
  const x = width * pos;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.wipe, { aspectRatio: aspect }]}
      {...pan.panHandlers}
    >
      {width > 0 && (
        <>
          <Image source={{ uri: shotUri(after) }} style={StyleSheet.absoluteFill} />
          <View style={[styles.clip, { width: x }]}>
            <Image source={{ uri: shotUri(before) }} style={{ width, height }} />
          </View>
          <View style={[styles.line, { left: x - 1 }]} />
          <View style={[styles.handle, { left: x - 18, top: height / 2 - 18 }]}>
            <Text style={styles.handleText}>‹ ›</Text>
          </View>
          <Text style={[styles.tag, { left: 8 }]}>{formatDate(before.takenAt)}</Text>
          <Text style={[styles.tag, { right: 8 }]}>{formatDate(after.takenAt)}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, padding: 16, gap: 12 },
  sliderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wipe: { width: '100%', maxHeight: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: C.soft },
  clip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },
  handle: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleText: { fontWeight: '700', color: '#000' },
  tag: {
    position: 'absolute',
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  hint: { fontSize: 12, color: C.faint },
  strip: { height: 64, borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
  stripOn: { borderColor: C.accent },
  row: { flexDirection: 'row', gap: 10 },
  offscreen: { position: 'absolute', left: -10000, top: 0, width: 800 },
  compose: { width: 800, flexDirection: 'row', backgroundColor: '#000', padding: 8, gap: 8 },
  composeLabel: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center', paddingVertical: 10 },
  watermark: { position: 'absolute', right: 16, bottom: 12, color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '700' },
});

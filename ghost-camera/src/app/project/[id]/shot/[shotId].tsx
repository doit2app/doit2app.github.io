// 사진 보기: 사진첩처럼 옆으로 밀어 넘기고, 아래 막대를 끌어 빠르게 훑어본다.
// 날짜와 찍을 때 기울기를 보여 주고, 사진첩에 저장하거나 지울 수 있다.

import Slider from '@react-native-community/slider';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, LayoutChangeEvent, type ListViewToken, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getProject, listShots, Shot } from '../../../../data/db';
import { shotUri } from '../../../../data/files';
import { removeShot, useData } from '../../../../data/store';
import { ratioValue } from '../../../../frame';
import { albumName, saveToGallery } from '../../../../gallery';
import { scheduleReminder } from '../../../../reminders';
import { Button, C, formatDateTime } from '../../../../ui';

export default function ShotScreen() {
  const { id, shotId } = useLocalSearchParams<{ id: string; shotId: string }>();
  const insets = useSafeAreaInsets();
  const { data } = useData(async () => {
    const [project, shots] = await Promise.all([getProject(id), listShots(id)]);
    return { project, shots };
  }, [id]);

  const shots = data?.shots ?? [];
  const project = data?.project;
  const [index, setIndex] = useState<number | null>(null);
  const [page, setPage] = useState<{ width: number; height: number } | null>(null);
  const list = useRef<FlatList<Shot>>(null);

  // 처음 연 사진 위치
  useEffect(() => {
    if (index != null || !shots.length) return;
    const i = shots.findIndex((s) => s.id === shotId);
    setIndex(i >= 0 ? i : shots.length - 1);
  }, [shots, shotId, index]);

  // 지우거나 해서 사진 수가 줄면 범위 안으로
  useEffect(() => {
    if (index != null && shots.length && index > shots.length - 1) setIndex(shots.length - 1);
  }, [shots.length, index]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }).current;

  const jump = useCallback((i: number) => {
    setIndex(i);
    list.current?.scrollToIndex({ index: i, animated: false });
  }, []);

  if (!project || index == null || !shots[index]) {
    return <View style={styles.screen} />;
  }
  const shot = shots[index];
  const aspect = ratioValue(project.ratio);

  function confirmDelete() {
    Alert.alert('이 사진을 지울까요?', '지우면 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const rest = shots.filter((s) => s.id !== shot.id);
          await removeShot(shot);
          await scheduleReminder(project!, rest[rest.length - 1]?.takenAt ?? null).catch(() => {});
          if (rest.length === 0) router.back();
        },
      },
    ]);
  }

  async function save() {
    const ok = await saveToGallery(shotUri(shot), albumName(project!.name));
    Alert.alert(ok ? '사진첩에 저장했어요' : '저장하지 못했어요', ok ? undefined : '사진 보관함 권한을 확인해 주세요.');
  }

  const tilt =
    shot.roll != null && shot.pitch != null
      ? `좌우 ${shot.roll.toFixed(1)}° · 앞뒤 ${shot.pitch.toFixed(1)}°`
      : '기울기 기록 없음';

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
      <Stack.Screen options={{ title: `${index + 1} / ${shots.length}` }} />

      {/* 옆으로 밀어 넘기는 사진들 */}
      <View style={styles.pager} onLayout={(e: LayoutChangeEvent) => setPage(e.nativeEvent.layout)}>
        {page && (
          <FlatList
            ref={list}
            data={shots}
            keyExtractor={(s) => s.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: page.width, offset: page.width * i, index: i })}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            windowSize={5}
            renderItem={({ item }) => (
              <View style={{ width: page.width, height: page.height, alignItems: 'center', justifyContent: 'center' }}>
                <Image
                  source={{ uri: shotUri(item) }}
                  style={fit(page.width - 32, page.height, aspect)}
                  resizeMode="cover"
                />
              </View>
            )}
          />
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.date}>{formatDateTime(shot.takenAt)}</Text>
        <Text style={styles.meta}>
          {tilt}
          {shot.facing ? ` · ${shot.facing === 'front' ? '앞 카메라' : '뒤 카메라'}` : ''}
        </Text>
      </View>

      {/* 끌어서 빠르게 훑어보기 */}
      {shots.length > 1 && (
        <View style={styles.scrub}>
          <Text style={styles.scrubLabel}>처음</Text>
          <Slider
            style={{ flex: 1, height: 36 }}
            minimumValue={0}
            maximumValue={shots.length - 1}
            step={1}
            value={index}
            onValueChange={(v) => {
              const i = Math.round(v);
              if (i !== index) jump(i);
            }}
            minimumTrackTintColor={C.accent}
            maximumTrackTintColor={C.line}
            thumbTintColor={C.accent}
          />
          <Text style={styles.scrubLabel}>지금</Text>
        </View>
      )}

      <View style={styles.row}>
        <Button label="사진첩에 저장" kind="secondary" onPress={save} style={{ flex: 1 }} />
        <Button label="지우기" kind="danger" onPress={confirmDelete} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** 정해진 공간에 비율대로 가장 크게 */
function fit(maxW: number, maxH: number, aspect: number) {
  if (maxW / maxH > aspect) return { width: Math.floor(maxH * aspect), height: Math.floor(maxH), borderRadius: 12 };
  return { width: Math.floor(maxW), height: Math.floor(maxW / aspect), borderRadius: 12 };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, gap: 12 },
  pager: { flex: 1 },
  info: { alignItems: 'center', gap: 4, paddingHorizontal: 16 },
  date: { fontSize: 17, fontWeight: '700', color: C.text },
  meta: { fontSize: 13, color: C.sub },
  scrub: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  scrubLabel: { fontSize: 12, color: C.faint },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
});

// 사진 한 장 보기: 날짜, 찍을 때 기울기, 앞뒤 사진으로 넘기기, 지우기, 사진첩에 저장

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getProject, listShots } from '../../../../data/db';
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
  const index = shots.findIndex((s) => s.id === shotId);
  const shot = shots[index];
  const project = data?.project;
  if (!project || !shot) return <View style={styles.screen} />;

  const go = (i: number) =>
    router.setParams({ shotId: shots[Math.max(0, Math.min(shots.length - 1, i))].id });

  function confirmDelete() {
    Alert.alert('이 사진을 지울까요?', '지우면 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          await removeShot(shot!);
          const rest = shots.filter((s) => s.id !== shot!.id);
          await scheduleReminder(project!, rest[rest.length - 1]?.takenAt ?? null).catch(() => {});
          router.back();
        },
      },
    ]);
  }

  async function save() {
    const ok = await saveToGallery(shotUri(shot!), albumName(project!.name));
    Alert.alert(ok ? '사진첩에 저장했어요' : '저장하지 못했어요', ok ? undefined : '사진 보관함 권한을 확인해 주세요.');
  }

  const tilt =
    shot.roll != null && shot.pitch != null ? `좌우 ${shot.roll.toFixed(1)}° · 앞뒤 ${shot.pitch.toFixed(1)}°` : '기울기 기록 없음';

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
      <Stack.Screen options={{ title: `${index + 1} / ${shots.length}` }} />
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: shotUri(shot) }}
          style={{ width: '100%', aspectRatio: ratioValue(project.ratio), maxHeight: '100%' }}
          resizeMode="contain"
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.date}>{formatDateTime(shot.takenAt)}</Text>
        <Text style={styles.meta}>
          {tilt}
          {shot.facing ? ` · ${shot.facing === 'front' ? '앞 카메라' : '뒤 카메라'}` : ''}
        </Text>
      </View>
      <View style={styles.nav}>
        <Button label="‹ 이전" kind="secondary" onPress={() => go(index - 1)} disabled={index <= 0} style={{ flex: 1 }} />
        <Button
          label="다음 ›"
          kind="secondary"
          onPress={() => go(index + 1)}
          disabled={index >= shots.length - 1}
          style={{ flex: 1 }}
        />
      </View>
      <View style={styles.nav}>
        <Button label="사진첩에 저장" kind="secondary" onPress={save} style={{ flex: 1 }} />
        <Button label="지우기" kind="danger" onPress={confirmDelete} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16, gap: 12 },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  info: { alignItems: 'center', gap: 4 },
  date: { fontSize: 17, fontWeight: '700', color: C.text },
  meta: { fontSize: 13, color: C.sub },
  nav: { flexDirection: 'row', gap: 10 },
});

// 타임랩스 만들기: 속도·날짜 글자를 고르고 MP4로 만든 뒤 공유하거나 사진첩에 저장한다.
// 무료: 1280px, 워터마크 / 평생 이용권: 1920px, 워터마크 없음

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { exportTimelapse } from '../../../../modules/timelapse';
import { getProject, listShots } from '../../../data/db';
import { shotUri } from '../../../data/files';
import { useData } from '../../../data/store';
import { ratioValue } from '../../../frame';
import { albumName, saveToGallery } from '../../../gallery';
import { FREE_EXPORT_LONG_EDGE, PRO_EXPORT_LONG_EDGE, usePro } from '../../../pro';
import { Button, C, Card, Chip, ChipRow, formatDate, Label } from '../../../ui';

const SPEEDS = [
  { fps: 2, label: '천천히' },
  { fps: 4, label: '보통' },
  { fps: 8, label: '빠르게' },
  { fps: 12, label: '아주 빠르게' },
];
const HOLD_LAST = 1.5;
const WATERMARK = '킵잇투로 간직한 순간';

function even(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const pro = usePro();
  const { data } = useData(async () => {
    const [project, shots] = await Promise.all([getProject(id), listShots(id)]);
    return { project, shots };
  }, [id]);

  const [fps, setFps] = useState(4);
  const [showDate, setShowDate] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const project = data?.project;
  const shots = data?.shots ?? [];
  if (!project) return <View style={styles.screen} />;

  const aspect = ratioValue(project.ratio);
  const long = pro ? PRO_EXPORT_LONG_EDGE : FREE_EXPORT_LONG_EDGE;
  const size = aspect <= 1 ? { width: even(long * aspect), height: even(long) } : { width: even(long), height: even(long / aspect) };
  const seconds = shots.length / fps + HOLD_LAST;

  async function make() {
    setResult(null);
    setProgress(0);
    try {
      const out = new File(Paths.cache, `keepit2-${project!.id}-${Date.now()}.mp4`);
      const uri = await exportTimelapse(
        {
          frames: shots.map((s) => ({ uri: shotUri(s), label: showDate ? formatDate(s.takenAt) : null })),
          outputPath: out.uri,
          width: size.width,
          height: size.height,
          fps,
          holdLastSeconds: HOLD_LAST,
          watermark: pro ? null : WATERMARK,
        },
        setProgress,
      );
      setResult(uri);
    } catch (e) {
      Alert.alert('영상을 만들지 못했어요', String(e));
    } finally {
      setProgress(null);
    }
  }

  async function save() {
    if (!result) return;
    const ok = await saveToGallery(result, albumName(project!.name));
    Alert.alert(ok ? '사진첩에 저장했어요' : '저장하지 못했어요', ok ? undefined : '사진 보관함 권한을 확인해 주세요.');
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Card>
          <Text style={styles.big}>사진 {shots.length}장 → 약 {seconds.toFixed(1)}초</Text>
          <Text style={styles.sub}>
            {size.width}×{size.height} · 초당 {fps}장{pro ? '' : ' · 워터마크 있음'}
          </Text>
        </Card>

        <Label>속도</Label>
        <ChipRow>
          {SPEEDS.map((s) => (
            <Chip key={s.fps} label={s.label} on={fps === s.fps} onPress={() => setFps(s.fps)} />
          ))}
        </ChipRow>

        <Label>날짜 글자</Label>
        <ChipRow>
          <Chip label="보이기" on={showDate} onPress={() => setShowDate(true)} />
          <Chip label="숨기기" on={!showDate} onPress={() => setShowDate(false)} />
        </ChipRow>

        {!pro && (
          <Card style={{ marginTop: 24 }}>
            <Text style={styles.proTitle}>평생 이용권이면</Text>
            <Text style={styles.sub}>워터마크 없이, 더 선명한 1920px로 만들 수 있어요.</Text>
            <Button
              label="자세히 보기"
              kind="secondary"
              onPress={() => router.push({ pathname: '/paywall', params: { reason: 'export' } })}
              style={{ marginTop: 12, height: 44 }}
            />
          </Card>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {progress != null && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}
        {result ? (
          <View style={styles.row}>
            <Button label="사진첩에 저장" kind="secondary" onPress={save} style={{ flex: 1 }} />
            <Button
              label="공유하기"
              onPress={() => Sharing.shareAsync(result, { mimeType: 'video/mp4' })}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
        <Button
          label={progress != null ? `만드는 중… ${Math.round(progress * 100)}%` : result ? '다시 만들기' : '타임랩스 만들기'}
          kind={result ? 'secondary' : 'primary'}
          onPress={make}
          disabled={progress != null || shots.length < 2}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  big: { fontSize: 18, fontWeight: '700', color: C.text },
  sub: { fontSize: 13, color: C.sub, marginTop: 4 },
  proTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  footer: { paddingHorizontal: 20, gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  track: { height: 4, borderRadius: 2, backgroundColor: C.line, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: C.accent },
});

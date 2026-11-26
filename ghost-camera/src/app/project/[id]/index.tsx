// 프로젝트: 최신 사진, 찍기·넘겨보기·비교·내보내기, 날짜별 사진 격자

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getProject, listShots, Project, Shot } from '../../../data/db';
import { formatBytes, projectBytes, shotUri, thumbUri } from '../../../data/files';
import { useData } from '../../../data/store';
import { ratioValue } from '../../../frame';
import { importFromGallery } from '../../../importPhoto';
import { dueLabel, intervalLabel } from '../../../reminders';
import { Button, C, formatDate } from '../../../ui';

const COLS = 3;
const GAP = 4;

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data } = useData(async () => {
    const [project, shots] = await Promise.all([getProject(id), listShots(id)]);
    return { project, shots };
  }, [id]);

  const project = data?.project;
  const shots = useMemo(() => data?.shots ?? [], [data]);
  const latest = shots[shots.length - 1];
  const bytes = useMemo(() => (shots.length ? projectBytes(id) : 0), [id, shots.length]);

  // 넘겨보기
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!playing) return;
    setFrame(0);
    const t = setInterval(() => {
      setFrame((f) => {
        if (f + 1 >= shots.length) {
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, 220);
    return () => clearInterval(t);
  }, [playing, shots.length]);

  if (data && !project) {
    return (
      <View style={styles.center}>
        <Text style={styles.sub}>프로젝트를 찾을 수 없어요</Text>
      </View>
    );
  }
  if (!project) return <View style={styles.screen} />;

  const aspect = ratioValue(project.ratio);
  const cell = Math.floor((width - 32 - GAP * (COLS - 1)) / COLS);
  const shown = playing ? shots[frame] : latest;
  const due = dueLabel(project, latest?.takenAt ?? null);

  async function addFromGallery() {
    try {
      const n = await importFromGallery(project!, true);
      if (n > 0) Alert.alert(`${n}장을 넣었어요`, '찍은 날짜 순서대로 정리돼요.');
    } catch (e) {
      Alert.alert('사진을 불러오지 못했어요', String(e));
    }
  }

  const header = (
    <View style={{ gap: 14, paddingBottom: 16 }}>
      <View>
        <Text style={styles.title}>{project.name}</Text>
        <Text style={styles.sub}>
          사진 {shots.length}장 · {intervalLabel(project.intervalDays)}
          {due ? ` · ${due}` : ''}
        </Text>
      </View>

      <View style={[styles.preview, { aspectRatio: aspect }]}>
        {shown ? (
          <>
            <Image source={{ uri: shotUri(shown) }} style={StyleSheet.absoluteFill} />
            <Text style={styles.badge}>{playing ? `${frame + 1} / ${shots.length}` : formatDate(shown.takenAt)}</Text>
          </>
        ) : (
          <Text style={styles.emptyPreview}>아직 사진이 없어요</Text>
        )}
      </View>

      <Button
        label={shots.length ? '같은 자리에서 찍기' : '첫 사진 찍기'}
        onPress={() => router.push({ pathname: '/project/[id]/camera', params: { id } })}
      />
      <View style={styles.actions}>
        <Action label={playing ? '■ 멈추기' : '▶ 넘겨보기'} disabled={shots.length < 2} onPress={() => setPlaying((p) => !p)} />
        <Action
          label="전후 비교"
          disabled={shots.length < 2}
          onPress={() => router.push({ pathname: '/project/[id]/compare', params: { id } })}
        />
        <Action
          label="타임랩스"
          disabled={shots.length < 2}
          onPress={() => router.push({ pathname: '/project/[id]/export', params: { id } })}
        />
      </View>

      <View style={styles.gridHeader}>
        <Text style={styles.gridTitle}>모든 사진</Text>
        <Pressable onPress={addFromGallery} hitSlop={8}>
          <Text style={styles.link}>+ 갤러리에서 넣기</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/project/[id]/edit', params: { id } })} hitSlop={12}>
              <Text style={styles.headerLink}>설정</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={[...shots].reverse()}
        keyExtractor={(s) => s.id}
        numColumns={COLS}
        ListHeaderComponent={header}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ padding: 16, gap: GAP, paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => <Thumb shot={item} project={project} size={cell} aspect={aspect} />}
        ListFooterComponent={
          shots.length > 0 ? <Text style={styles.footer}>이 프로젝트가 쓰는 용량 {formatBytes(bytes)}</Text> : undefined
        }
      />
    </View>
  );
}

function Thumb({ shot, project, size, aspect }: { shot: Shot; project: Project; size: number; aspect: number }) {
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/project/[id]/shot/[shotId]', params: { id: project.id, shotId: shot.id } })
      }
      style={{ width: size }}
    >
      <Image source={{ uri: thumbUri(shot) }} style={[styles.thumb, { width: size, height: size / aspect }]} />
      <Text style={styles.thumbDate}>{formatDate(shot.takenAt)}</Text>
    </Pressable>
  );
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Button label={label} kind="secondary" onPress={onPress} disabled={disabled} style={{ flex: 1, height: 46 }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: C.text },
  sub: { fontSize: 14, color: C.sub, marginTop: 4 },
  headerLink: { fontSize: 16, color: C.text, fontWeight: '600' },
  preview: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
    maxHeight: 520,
    alignSelf: 'center',
  },
  emptyPreview: { color: C.faint, fontSize: 15 },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', gap: 8 },
  gridHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  gridTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  link: { fontSize: 14, color: C.text, fontWeight: '600' },
  thumb: { borderRadius: 8, backgroundColor: C.soft },
  thumbDate: { fontSize: 11, color: C.sub, marginTop: 4, marginBottom: 6 },
  footer: { textAlign: 'center', color: C.faint, fontSize: 12, marginTop: 16 },
});

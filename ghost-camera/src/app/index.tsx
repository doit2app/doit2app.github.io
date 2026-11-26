// 프로젝트 목록

import { router, Stack } from 'expo-router';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listProjects, ProjectSummary } from '../data/db';
import { thumbUri } from '../data/files';
import { useData } from '../data/store';
import { ratioValue } from '../frame';
import { FREE_PROJECTS, usePro } from '../pro';
import { dueLabel, intervalLabel } from '../reminders';
import { Button, C, formatDate } from '../ui';

export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const { data: projects } = useData(listProjects, []);
  const pro = usePro();

  function startNew() {
    if (!pro && (projects?.length ?? 0) >= FREE_PROJECTS) {
      router.push({ pathname: '/paywall', params: { reason: 'projects' } });
      return;
    }
    router.push('/new');
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
              <Text style={styles.headerIcon}>⚙︎</Text>
            </Pressable>
          ),
        }}
      />
      {projects && projects.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📷</Text>
          <Text style={styles.emptyTitle}>같은 자리에서, 다시 한 장</Text>
          <Text style={styles.emptyText}>
            아이 키, 키우는 식물, 우리 집 창밖처럼{'\n'}
            시간이 흐르며 바뀌는 걸 같은 구도로 남겨요.{'\n'}
            지난 사진을 겹쳐 보며 찍으면 맞추기 쉬워요.
          </Text>
        </View>
      ) : (
        <FlatList
          data={projects ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => <ProjectCard p={item} />}
        />
      )}
      <View style={styles.footer}>
        <Button label="+ 새 프로젝트" onPress={startNew} />
        {!pro && (projects?.length ?? 0) > 0 && (
          <Text style={styles.limit}>
            무료로 프로젝트 {FREE_PROJECTS}개까지 · 지금 {projects?.length ?? 0}개
          </Text>
        )}
      </View>
    </View>
  );
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  const due = dueLabel(p, p.lastShot?.takenAt ?? null);
  const overdue = due?.includes('지남') || due === '오늘 찍을 날';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.cover, { aspectRatio: ratioValue(p.ratio) }]}>
        {p.lastShot ? (
          <Image source={{ uri: thumbUri(p.lastShot) }} style={StyleSheet.absoluteFill} />
        ) : (
          <Text style={styles.coverEmpty}>📷</Text>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {p.name}
        </Text>
        <Text style={styles.cardSub}>
          사진 {p.shotCount}장{p.firstShot ? ` · ${formatDate(p.firstShot.takenAt)}부터` : ''}
        </Text>
        <Text style={[styles.cardDue, overdue && styles.cardDueOn]}>
          {due ? `${intervalLabel(p.intervalDays)} · ${due}` : '알림 없음'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  headerIcon: { fontSize: 22, color: C.text },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  emptyText: { fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 23 },
  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  cover: {
    width: 76,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmpty: { fontSize: 24 },
  cardBody: { flex: 1, justifyContent: 'center', gap: 4 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  cardSub: { fontSize: 13, color: C.sub },
  cardDue: { fontSize: 13, color: C.faint },
  cardDueOn: { color: C.warn, fontWeight: '700' },
  footer: { paddingHorizontal: 16, gap: 8 },
  limit: { textAlign: 'center', fontSize: 12, color: C.faint },
});

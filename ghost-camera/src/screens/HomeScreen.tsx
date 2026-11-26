import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ratio, RATIOS, ratioValue } from '../frame';
import { Project, shotUri } from '../storage';

type Props = {
  project: Project;
  onOpenCamera: () => void;
  onImport: (uri: string) => Promise<void>;
  onDelete: (id: string) => void;
  onRatio: (r: Ratio) => void;
};

export function HomeScreen({ project, onOpenCamera, onImport, onDelete, onRatio }: Props) {
  const insets = useSafeAreaInsets();
  const { shots } = project;
  const latest = shots[shots.length - 1];
  const aspect = ratioValue(project.ratio);

  // 넘겨보기: 타임랩스가 어떻게 보일지 미리 보는 간단한 재생
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
    }, 250);
    return () => clearInterval(t);
  }, [playing, shots.length]);

  const shown = playing ? shots[frame] : latest;

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await onImport(a.uri);
  }

  function confirmDelete(id: string) {
    Alert.alert('이 사진을 지울까요?', '지우면 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => onDelete(id) },
    ]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <Text style={styles.title}>그자리</Text>
      <Text style={styles.subtitle}>고스트 촬영 프로토타입 · 사진 {shots.length}장</Text>

      <View style={styles.preview}>
        {shown ? (
          <View style={{ width: '100%', aspectRatio: aspect, maxHeight: '100%' }}>
            <Image source={{ uri: shotUri(shown) }} style={styles.previewImage} />
            {playing && <Text style={styles.badge}>{frame + 1} / {shots.length}</Text>}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📷</Text>
            <Text style={styles.emptyText}>
              첫 사진을 찍거나, 예전에 찍은 사진을 불러오세요.{'\n'}다음부터는 그 사진을 겹쳐 보며 찍어요.
            </Text>
            <Text style={styles.label}>사진 비율</Text>
            <View style={styles.ratioRow}>
              {RATIOS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => onRatio(r)}
                  style={[styles.ratio, project.ratio === r && styles.ratioOn]}
                >
                  <Text style={[styles.ratioText, project.ratio === r && styles.ratioTextOn]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>

      {shots.length > 0 && (
        <FlatList
          horizontal
          data={shots}
          keyExtractor={(s) => s.id}
          style={styles.strip}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable onLongPress={() => confirmDelete(item.id)}>
              <Image source={{ uri: shotUri(item) }} style={[styles.thumb, { aspectRatio: aspect }]} />
            </Pressable>
          )}
        />
      )}

      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={onOpenCamera}>
          <Text style={styles.primaryText}>{shots.length ? '같은 자리에서 찍기' : '첫 사진 찍기'}</Text>
        </Pressable>
        <View style={styles.row}>
          {shots.length === 0 && (
            <Pressable style={styles.secondary} onPress={pick}>
              <Text style={styles.secondaryText}>갤러리에서 불러오기</Text>
            </Pressable>
          )}
          {shots.length > 1 && (
            <Pressable style={styles.secondary} onPress={() => setPlaying((p) => !p)}>
              <Text style={styles.secondaryText}>{playing ? '■ 멈추기' : '▶ 넘겨보기'}</Text>
            </Pressable>
          )}
        </View>
        {shots.length > 0 && <Text style={styles.hint}>사진을 길게 누르면 지울 수 있어요</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAF9' },
  title: { fontSize: 28, fontWeight: '800', color: '#18181B', paddingHorizontal: 20 },
  subtitle: { fontSize: 14, color: '#71717A', paddingHorizontal: 20, marginTop: 4 },

  preview: { flex: 1, margin: 20, alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '100%', borderRadius: 16, backgroundColor: '#E4E4E7' },
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
  empty: { alignItems: 'center', gap: 12 },
  emptyEmoji: { fontSize: 44 },
  emptyText: { fontSize: 15, color: '#52525B', textAlign: 'center', lineHeight: 23 },
  label: { marginTop: 12, fontSize: 13, color: '#71717A' },
  ratioRow: { flexDirection: 'row', gap: 8 },
  ratio: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#D4D4D8' },
  ratioOn: { backgroundColor: '#18181B', borderColor: '#18181B' },
  ratioText: { color: '#3F3F46', fontSize: 14 },
  ratioTextOn: { color: '#fff', fontWeight: '600' },

  strip: { flexGrow: 0, marginBottom: 16 },
  thumb: { height: 72, borderRadius: 8, backgroundColor: '#E4E4E7' },

  actions: { paddingHorizontal: 20, gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  primary: { height: 54, borderRadius: 14, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F0F0EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#27272A', fontSize: 15, fontWeight: '600' },
  hint: { textAlign: 'center', fontSize: 12, color: '#A1A1AA' },
});

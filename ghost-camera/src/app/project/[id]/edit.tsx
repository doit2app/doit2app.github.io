// 프로젝트 설정: 이름·주기·알림 시각 바꾸기, 프로젝트 지우기

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProjectForm, ProjectFormValue } from '../../../components/ProjectForm';
import { getProject, listShots } from '../../../data/db';
import { editProject, removeProject } from '../../../data/store';
import { cancelReminder, ensureNotificationPermission, scheduleReminder } from '../../../reminders';
import { Button, C } from '../../../ui';

export default function EditProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState<ProjectFormValue | null>(null);
  const [shotCount, setShotCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getProject(id);
      if (!p) return;
      setValue({ name: p.name, ratio: p.ratio, intervalDays: p.intervalDays, remindHour: p.remindHour });
      setShotCount((await listShots(id)).length);
    })();
  }, [id]);

  if (!value) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  async function save() {
    if (!value) return;
    setBusy(true);
    try {
      await editProject(id, { ...value, name: value.name.trim() || '새 프로젝트' });
      const p = await getProject(id);
      const shots = await listShots(id);
      if (p && p.intervalDays > 0) await ensureNotificationPermission();
      if (p) await scheduleReminder(p, shots[shots.length - 1]?.takenAt ?? null);
      router.back();
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert('이 프로젝트를 지울까요?', `사진 ${shotCount}장도 함께 지워져요. 사진첩에 저장된 사진은 그대로 남아요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          await cancelReminder(id);
          await removeProject(id);
          router.dismissAll();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ProjectForm value={value} onChange={setValue} ratioLocked={shotCount > 0} />
        <Text style={styles.dangerLabel}>위험한 작업</Text>
        <Button label="프로젝트 지우기" kind="danger" onPress={confirmDelete} />
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="저장" onPress={save} busy={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40 },
  dangerLabel: { fontSize: 13, color: C.sub, marginTop: 32, marginBottom: 8, fontWeight: '600' },
  footer: { paddingHorizontal: 20, paddingTop: 8 },
});

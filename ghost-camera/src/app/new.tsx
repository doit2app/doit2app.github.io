// 새 프로젝트: 이름·비율·주기를 정하고, 첫 사진을 찍거나 불러온다.

import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProjectForm, ProjectFormValue } from '../components/ProjectForm';
import { createProject } from '../data/store';
import { importFromGallery } from '../importPhoto';
import { ensureNotificationPermission, scheduleReminder } from '../reminders';
import { Button } from '../ui';

export default function NewProjectScreen() {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState<ProjectFormValue>({ name: '', ratio: '3:4', intervalDays: 7, remindHour: 19 });
  const [busy, setBusy] = useState<'camera' | 'gallery' | null>(null);

  async function create() {
    const name = value.name.trim() || '새 프로젝트';
    const p = await createProject({ ...value, name });
    if (value.intervalDays > 0) {
      await ensureNotificationPermission();
      await scheduleReminder(p, null);
    }
    return p;
  }

  async function withCamera() {
    setBusy('camera');
    try {
      const p = await create();
      router.dismissTo({ pathname: '/project/[id]', params: { id: p.id } });
      router.push({ pathname: '/project/[id]/camera', params: { id: p.id } });
    } finally {
      setBusy(null);
    }
  }

  async function withGallery() {
    setBusy('gallery');
    try {
      const p = await create();
      await importFromGallery(p, false);
      router.dismissTo({ pathname: '/project/[id]', params: { id: p.id } });
    } catch (e) {
      Alert.alert('사진을 불러오지 못했어요', String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ProjectForm value={value} onChange={setValue} />
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="만들고 첫 사진 찍기" onPress={withCamera} busy={busy === 'camera'} disabled={!!busy} />
        <Button
          label="갤러리에서 첫 사진 불러오기"
          kind="secondary"
          onPress={withGallery}
          busy={busy === 'gallery'}
          disabled={!!busy}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40 },
  footer: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
});

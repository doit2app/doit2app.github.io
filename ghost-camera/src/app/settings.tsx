// 설정: 이용권, 사진첩 자동 저장, 알림, 백업·복원, 용량

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { exportBackup, importBackup } from '../backup';
import { allProjectsBytes, formatBytes } from '../data/files';
import { getBool, setBool, SETTING_SAVE_TO_GALLERY, useData } from '../data/store';
import { purchasesConfigured, restorePro, setDevPro, usePro } from '../pro';
import { ensureNotificationPermission, rescheduleAll } from '../reminders';
import { C, Card, Label, Row } from '../ui';

const PRIVACY_URL = 'https://doit2app.github.io/keepit2/privacy.html';

export default function SettingsScreen() {
  const pro = usePro();
  const { data: saveToGallery } = useData(() => getBool(SETTING_SAVE_TO_GALLERY, true), []);
  const [notif, setNotif] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bytes, setBytes] = useState(0);

  useEffect(() => {
    Notifications.getPermissionsAsync().then((p) => setNotif(p.granted));
    setBytes(allProjectsBytes());
  }, []);

  async function turnOnNotifications() {
    const ok = await ensureNotificationPermission();
    setNotif(ok);
    if (ok) await rescheduleAll();
    else Linking.openSettings();
  }

  async function backup() {
    setBusy('backup');
    try {
      const n = await exportBackup();
      if (n === 0) Alert.alert('백업할 사진이 없어요');
    } catch (e) {
      Alert.alert('백업하지 못했어요', String(e));
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy('restore');
    try {
      const r = await importBackup();
      if (r) Alert.alert('복원했어요', `프로젝트 ${r.projects}개, 새 사진 ${r.shots}장`);
      setBytes(allProjectsBytes());
    } catch (e) {
      Alert.alert('복원하지 못했어요', String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Label>평생 이용권</Label>
      <Card>
        {pro ? (
          <Row title="평생 이용권을 쓰고 있어요" detail="프로젝트 무제한 · 워터마크 없음 · 1920px 영상" />
        ) : (
          <Row title="평생 이용권 알아보기" detail="한 번 결제로 계속 써요" onPress={() => router.push('/paywall')} right={<Text style={styles.chev}>›</Text>} />
        )}
        {purchasesConfigured() ? (
          <Row
            title="구매 복원"
            onPress={async () => {
              const ok = await restorePro().catch(() => false);
              Alert.alert(ok ? '복원했어요' : '복원할 구매가 없어요');
            }}
          />
        ) : (
          <Row
            title="시험용 잠금 해제"
            detail="결제가 연결되지 않은 시험용 빌드에서만 보여요"
            right={<Switch value={pro} onValueChange={(v) => setDevPro(v)} />}
          />
        )}
      </Card>

      <Label>사진</Label>
      <Card>
        <Row
          title="찍은 사진을 사진첩에도 저장"
          detail="앱을 지워도 사진이 남고, iCloud 사진·Google 포토로 백업돼요"
          right={
            <Switch value={saveToGallery ?? true} onValueChange={(v) => setBool(SETTING_SAVE_TO_GALLERY, v)} />
          }
        />
        <Row title="사진이 쓰는 용량" detail={formatBytes(bytes)} />
      </Card>

      <Label>알림</Label>
      <Card>
        {notif === false ? (
          <Row title="알림이 꺼져 있어요" detail="찍을 날을 알려 드리려면 켜 주세요" onPress={turnOnNotifications} right={<Text style={styles.chev}>›</Text>} />
        ) : (
          <Row title="알림 켜짐" detail="프로젝트마다 주기와 시각을 정할 수 있어요" />
        )}
      </Card>

      <Label>백업</Label>
      <Card>
        <Row
          title={busy === 'backup' ? '백업 파일 만드는 중…' : '백업 파일 만들기'}
          detail="모든 프로젝트와 사진을 ZIP 하나로. 파일 앱·드라이브에 저장해 두세요"
          onPress={busy ? undefined : backup}
        />
        <Row
          title={busy === 'restore' ? '복원하는 중…' : '백업 파일에서 복원'}
          detail="이미 있는 사진은 건너뛰어요"
          onPress={busy ? undefined : restore}
        />
      </Card>

      <Label>정보</Label>
      <Card>
        <Row
          title="개인정보처리방침"
          detail="사진과 기록은 이 휴대폰 안에만 저장돼요"
          onPress={() => Linking.openURL(PRIVACY_URL)}
          right={<Text style={styles.chev}>›</Text>}
        />
        <Row title="문의" detail="doit2team@gmail.com" onPress={() => Linking.openURL('mailto:doit2team@gmail.com')} />
      </Card>

      <View style={{ alignItems: 'center', marginTop: 32 }}>
        <Text style={styles.version}>킵잇투 {Constants.expoConfig?.version ?? ''}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chev: { fontSize: 22, color: C.faint },
  version: { fontSize: 12, color: C.faint },
});

// 평생 이용권 (한 번 구매)

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buyPro, FREE_PROJECTS, getLifetimePackage, purchasesConfigured, restorePro, usePro } from '../pro';
import { Button, C, Card } from '../ui';

const BENEFITS = [
  { title: '프로젝트 무제한', detail: `무료는 ${FREE_PROJECTS}개까지` },
  { title: '워터마크 없는 타임랩스·비교 이미지', detail: '' },
  { title: '더 선명한 1920px 영상', detail: '무료는 1280px' },
  { title: '한 번만 결제', detail: '구독이 아니에요. 기기를 바꿔도 복원돼요' },
];

export default function PaywallScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const insets = useSafeAreaInsets();
  const pro = usePro();
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  useEffect(() => {
    getLifetimePackage()
      .then((p) => setPrice(p?.product.priceString ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (pro) router.back();
  }, [pro]);

  async function buy() {
    setBusy('buy');
    try {
      const r = await buyPro();
      if (r === 'unavailable') {
        Alert.alert(
          '지금은 구매할 수 없어요',
          purchasesConfigured() ? '스토어 상품 정보를 불러오지 못했어요. 잠시 뒤 다시 해 주세요.' : '시험용 빌드라 결제가 연결되어 있지 않아요. 설정의 "시험용 잠금 해제"를 써 주세요.',
        );
      }
    } catch (e) {
      Alert.alert('구매하지 못했어요', String(e));
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy('restore');
    try {
      const ok = await restorePro();
      if (!ok) Alert.alert('복원할 구매가 없어요', '이 스토어 계정으로 산 기록이 없어요.');
    } catch (e) {
      Alert.alert('복원하지 못했어요', String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={styles.title}>
          {reason === 'projects' ? `무료로는 프로젝트를 ${FREE_PROJECTS}개까지 만들 수 있어요` : '킵잇투 평생 이용권'}
        </Text>
        <Text style={styles.sub}>한 번 결제하면 계속 써요.</Text>
        <Card style={{ gap: 14, marginTop: 8 }}>
          {BENEFITS.map((b) => (
            <View key={b.title} style={styles.benefit}>
              <View style={styles.check}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bTitle}>{b.title}</Text>
                {b.detail ? <Text style={styles.bDetail}>{b.detail}</Text> : null}
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
      <View style={styles.footer}>
        <Button label={price ? `${price}에 평생 이용하기` : '평생 이용하기'} onPress={buy} busy={busy === 'buy'} disabled={!!busy} />
        <Button label="구매 복원" kind="secondary" onPress={restore} busy={busy === 'restore'} disabled={!!busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  title: { fontSize: 24, fontWeight: '800', color: C.text, lineHeight: 32 },
  sub: { fontSize: 15, color: C.sub },
  benefit: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bTitle: { fontSize: 16, color: C.text, fontWeight: '600' },
  bDetail: { fontSize: 13, color: C.sub, marginTop: 2 },
  footer: { paddingHorizontal: 20, gap: 10 },
});

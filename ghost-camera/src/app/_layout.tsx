import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { migrateLegacy } from '../data/store';
import { initPurchases } from '../pro';
import { rescheduleAll, setupNotifications } from '../reminders';
import { C } from '../ui';

setupNotifications();

export default function RootLayout() {
  useEffect(() => {
    (async () => {
      await migrateLegacy();
      await rescheduleAll().catch((e) => console.warn('알림 다시 잡기 실패', e));
      await initPurchases().catch((e) => console.warn('구매 초기화 실패', e));
    })();
  }, []);

  // 알림을 누르면 그 프로젝트로
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const id = r?.notification.request.content.data?.projectId;
      if (typeof id === 'string') router.push({ pathname: '/project/[id]', params: { id } });
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.text,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: '그자리' }} />
        <Stack.Screen name="new" options={{ title: '새 프로젝트', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: '설정' }} />
        <Stack.Screen name="paywall" options={{ title: '평생 이용권', presentation: 'modal' }} />
        <Stack.Screen name="project/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="project/[id]/camera" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="project/[id]/edit" options={{ title: '프로젝트 설정', presentation: 'modal' }} />
        <Stack.Screen name="project/[id]/compare" options={{ title: '전후 비교' }} />
        <Stack.Screen name="project/[id]/export" options={{ title: '타임랩스 만들기' }} />
        <Stack.Screen name="project/[id]/shot/[shotId]" options={{ title: '' }} />
      </Stack>
    </SafeAreaProvider>
  );
}

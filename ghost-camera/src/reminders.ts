// 촬영 주기 알림 (기기 안에서만 도는 로컬 알림, 서버 없음).
// 프로젝트마다 알림 하나: 마지막 사진(없으면 만든 날) + 주기 일수, 정한 시각에.
// 사진을 찍거나 설정을 바꾸거나 앱을 열 때마다 다시 잡는다.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { listProjects, Project, ProjectSummary } from './data/db';

const CHANNEL = 'reminders';
const DAY = 24 * 60 * 60 * 1000;

export const INTERVALS: { days: number; label: string }[] = [
  { days: 0, label: '알림 없음' },
  { days: 1, label: '매일' },
  { days: 7, label: '매주' },
  { days: 14, label: '2주마다' },
  { days: 30, label: '매달' },
  { days: 365, label: '매년' },
];

export const REMIND_HOURS = [8, 12, 19, 21];

export function intervalLabel(days: number): string {
  return INTERVALS.find((i) => i.days === days)?.label ?? `${days}일마다`;
}

export function hourLabel(h: number): string {
  if (h === 0) return '밤 12시';
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return '낮 12시';
  return `${h < 18 ? '오후' : '저녁'} ${h - 12}시`;
}

export function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: '촬영 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

/** 찍을 날 (그날의 알림 시각). 주기가 없으면 null */
export function dueDate(p: Pick<Project, 'intervalDays' | 'remindHour' | 'createdAt'>, lastShotAt: string | null): Date | null {
  if (!p.intervalDays) return null;
  const base = new Date(lastShotAt ?? p.createdAt);
  const due = new Date(base.getTime() + p.intervalDays * DAY);
  due.setHours(p.remindHour, 0, 0, 0);
  return due;
}

/** 실제로 알림을 띄울 때: 찍을 날이 지났으면 다음 알림 시각(오늘 또는 내일) */
export function nextFire(due: Date, remindHour: number, now = new Date()): Date {
  if (due.getTime() > now.getTime()) return due;
  const t = new Date(now);
  t.setHours(remindHour, 0, 0, 0);
  if (t.getTime() <= now.getTime()) t.setTime(t.getTime() + DAY);
  return t;
}

/** "오늘 찍을 날", "3일 남음", "2일 지남" */
export function dueLabel(p: Pick<Project, 'intervalDays' | 'remindHour' | 'createdAt'>, lastShotAt: string | null, now = new Date()): string | null {
  const due = dueDate(p, lastShotAt);
  if (!due) return null;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(due) - startOf(now)) / DAY);
  if (days === 0) return '오늘 찍을 날';
  if (days > 0) return `${days}일 남음`;
  return `${-days}일 지남`;
}

function idFor(projectId: string) {
  return `remind-${projectId}`;
}

export async function cancelReminder(projectId: string) {
  await Notifications.cancelScheduledNotificationAsync(idFor(projectId)).catch(() => {});
}

export async function scheduleReminder(p: Project, lastShotAt: string | null) {
  await cancelReminder(p.id);
  const due = dueDate(p, lastShotAt);
  if (!due) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: idFor(p.id),
    content: {
      title: p.name,
      body: '오늘 같은 자리에서 찍을 날이에요',
      data: { projectId: p.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextFire(due, p.remindHour),
      channelId: CHANNEL,
    },
  });
}

export async function rescheduleAll(projects?: ProjectSummary[]) {
  const list = projects ?? (await listProjects());
  for (const p of list) {
    await scheduleReminder(p, p.lastShot?.takenAt ?? null).catch((e) => console.warn('알림 예약 실패', e));
  }
}

// 평생 이용권 (일회 구매). RevenueCat으로 처리한다.
//
// 준비할 것 (README 참고):
// - 앱스토어·플레이스토어에 비소모성 상품(예: keepit2_pro_lifetime)을 만든다
// - RevenueCat에 앱을 연결하고, 권한(entitlement) "pro"와 기본 오퍼링에 "Lifetime" 패키지를 만든다
// - API 키를 환경 변수로 넣는다: EXPO_PUBLIC_RC_IOS_KEY, EXPO_PUBLIC_RC_ANDROID_KEY
//
// 키가 없으면(지금처럼 시험할 때) 구매 대신 설정 화면의 "시험용 잠금 해제"를 쓴다.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

import { getBool, setBool, SETTING_DEV_PRO } from './data/store';

export const ENTITLEMENT = 'pro';
/** 무료로 만들 수 있는 프로젝트 수 */
export const FREE_PROJECTS = 2;
/** 무료 내보내기 해상도 (긴 변). 평생 이용권은 1920 */
export const FREE_EXPORT_LONG_EDGE = 1280;
export const PRO_EXPORT_LONG_EDGE = 1920;

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY,
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY,
});

export function purchasesConfigured(): boolean {
  return !!API_KEY;
}

let configured = false;
let isPro = false;
const listeners = new Set<(v: boolean) => void>();

function setPro(v: boolean) {
  if (isPro === v) return;
  isPro = v;
  for (const l of listeners) l(v);
}

function fromInfo(info: CustomerInfo): boolean {
  return info.entitlements.active[ENTITLEMENT] != null;
}

export async function initPurchases() {
  if (API_KEY && !configured) {
    Purchases.configure({ apiKey: API_KEY });
    configured = true;
    Purchases.addCustomerInfoUpdateListener((info) => setPro(fromInfo(info)));
  }
  await refreshPro();
}

export async function refreshPro() {
  try {
    if (configured) {
      setPro(fromInfo(await Purchases.getCustomerInfo()));
    } else {
      setPro(await getBool(SETTING_DEV_PRO, false));
    }
  } catch (e) {
    console.warn('구매 정보 확인 실패', e);
  }
}

export function usePro(): boolean {
  const [v, setV] = useState(isPro);
  useEffect(() => {
    setV(isPro);
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

export async function getLifetimePackage(): Promise<PurchasesPackage | null> {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  const cur = offerings.current;
  return cur?.lifetime ?? cur?.availablePackages[0] ?? null;
}

export type BuyResult = 'purchased' | 'cancelled' | 'unavailable';

export async function buyPro(): Promise<BuyResult> {
  const pkg = await getLifetimePackage();
  if (!pkg) return 'unavailable';
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    setPro(fromInfo(customerInfo));
    return fromInfo(customerInfo) ? 'purchased' : 'cancelled';
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
    throw e;
  }
}

/** 복원했고 이용권이 있으면 true */
export async function restorePro(): Promise<boolean> {
  if (!configured) return isPro;
  const info = await Purchases.restorePurchases();
  setPro(fromInfo(info));
  return fromInfo(info);
}

/** 키가 없을 때만: 시험용으로 이용권 켜고 끄기 */
export async function setDevPro(v: boolean) {
  await setBool(SETTING_DEV_PRO, v);
  setPro(v);
}

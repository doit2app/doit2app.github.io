# 킵잇투 (KeepIt2) — 그때와 지금, 같은 자리 사진

지난 사진을 겹쳐 보며 같은 자리·같은 구도로 다시 찍고, 쌓인 사진을 타임랩스로 만드는 앱이에요.
서버 없이 기기 안에서만 동작해서, 한 번 구매(평생 이용권)로 팔 수 있게 만들었어요.

## 기능

**촬영**
- 고스트 보이는 방식 3가지: 겹치기(투명도 조절) · 깜빡이기 · 반반(경계선을 끌어 비교)
- 첫 사진 / 직전 사진 중 무엇에 맞출지 고르기, 3×3 격자, 앞·뒤 카메라
- 배경 일치도(%)와 방향 안내("→ 오른쪽으로", "뒤로 한 걸음")
- 기울기 비교: 지난 사진을 찍을 때와 지금의 좌우·앞뒤 기울기 차이
- 다 맞으면 셔터가 초록색으로 바뀌고 진동 (자동 촬영은 코드에 남겨 두고 꺼 둠: `ENABLE_AUTO_CAPTURE`)
- 찍은 뒤 자동 보정: 조금 어긋난 새 사진을 지난 사진 자리에 맞춰 자름 (켬/끔 비교)

**프로젝트·기록**
- 프로젝트 여러 개 (이름, 비율 3:4·1:1·9:16, 촬영 주기, 알림 시각)
- 사진 격자(날짜 표시), 한 장씩 보기(기울기·카메라 정보, 지우기, 사진첩 저장)
- 넘겨보기, 갤러리에서 예전 사진 넣기(찍은 날짜 순으로 정리)
- 촬영 주기 알림: 마지막 사진부터 세어 정한 시각에 (기기 안 로컬 알림)

**내보내기**
- 타임랩스 MP4 (속도, 날짜 글자). 네이티브 모듈 `modules/timelapse`
- 전후 비교: 밀어서 비교 + 나란히 놓은 이미지로 저장·공유
- 무료는 워터마크와 1280px, 평생 이용권은 워터마크 없이 1920px

**저장·백업**
- 사진은 앱 폴더에, 목록은 SQLite에. 썸네일 따로 만듦
- 찍을 때 사진첩에도 저장 (설정에서 끌 수 있음, 프로젝트 이름으로 앨범)
- 백업 ZIP 만들기 / ZIP에서 복원 (일반 ZIP이라 컴퓨터에서도 열림)

**평생 이용권 (RevenueCat)**
- 무료: 프로젝트 2개, 워터마크, 1280px / 이용권: 무제한, 워터마크 없음, 1920px

## 설치해서 써 보기

Expo Go로는 열 수 없어요(VisionCamera와 직접 만든 네이티브 모듈 때문). 빌드한 앱을 설치해요.

```bash
npx eas-cli@latest build -p android --profile preview      # 설치용 APK
npx eas-cli@latest device:create                            # 아이폰 등록 (처음 한 번)
npx eas-cli@latest build -p ios --profile preview           # 아이폰 (Apple 개발자 계정 필요)
npx eas-cli@latest build -p ios --profile ios-simulator     # 아이폰 시뮬레이터용 (계정 없이)
```

코드를 고치면서 바로 보려면 `--profile development`로 개발용 빌드를 설치하고 `npx expo start`로 연결해요.

## 출시 전에 할 일

1. **결제 연결**: 앱스토어·플레이스토어에 비소모성 상품을 만들고, RevenueCat에 앱을 연결해 권한 `pro`와
   기본 오퍼링의 Lifetime 패키지를 만든 뒤 키를 넣어요.
   ```bash
   npx eas-cli@latest env:create --name EXPO_PUBLIC_RC_IOS_KEY --value appl_xxx --environment production
   npx eas-cli@latest env:create --name EXPO_PUBLIC_RC_ANDROID_KEY --value goog_xxx --environment production
   ```
   키가 없는 빌드에서는 설정 화면에 "시험용 잠금 해제"가 보여요 (출시 빌드에는 키를 꼭 넣어야 해요).
2. 앱 아이콘·스플래시, 스토어 스크린샷, 개인정보처리방침(사진은 기기 밖으로 나가지 않음)

## 휴대폰에서 꼭 확인할 것

| 확인할 것 | 방법 | 문제가 있으면 |
|---|---|---|
| 고스트와 저장된 사진이 정확히 겹치는가 | 폰을 움직이지 말고 두 장 연속 찍기 → 확인 화면에서 슬라이더 | `src/frame.ts`의 `centerCrop` |
| 비율 3가지, 앞 카메라 | 같은 방법 | 앞 카메라는 `cropToRatio`의 `flip` |
| 사진 방향 | 찍은 사진·불러온 사진이 눕지 않는가 | `cropToRatio`의 `rotateIfLandscape` |
| 배경 일치도 | 같은 자리에서 몇 %인지, 옆으로 비켜서면 얼마나 떨어지는지 | `src/match.ts`의 `SCORE_OK`(50%) |
| 방향 안내 | 오른쪽으로 비켜섰을 때 "← 왼쪽으로"가 나오는가 | `src/match.ts`의 `guideText` |
| 셔터 초록색 | 다 맞았을 때 바뀌고 진동이 한 번 오는가 | `isMatched`, `isAligned` 기준 |
| 자동 보정 | 일부러 조금 비켜 찍고 켬/끔 비교 | `src/autoAlign.ts` |
| 수평계 방향 | 폰을 돌릴 때 선이 실제 수평을 유지하는가 | `src/useTilt.ts`의 `roll` 부호 |
| 타임랩스 | 안드로이드 기기 2대 이상에서 색이 이상하지 않은가 | `TimelapseModule.kt`의 `writeYuv` |
| 알림 | 주기를 "매일"로 두고 다음 날 알림이 오는가 | `src/reminders.ts` |
| 백업·복원 | 백업 → 앱 삭제 → 다시 설치 → 복원 | `src/backup.ts` |

## 파일

- `src/app/` — 화면 (Expo Router)
  - `index` 프로젝트 목록 · `new` 새 프로젝트 · `settings` 설정 · `paywall` 평생 이용권
  - `project/[id]/index` 프로젝트 · `camera` 촬영 · `edit` 설정 · `compare` 전후 비교 · `export` 타임랩스 · `shot/[shotId]` 한 장 보기
- `src/screens/CameraScreen.tsx` — 고스트 촬영 화면
- `src/data/` — SQLite(`db.ts`), 파일 위치·썸네일(`files.ts`), 화면용 작업과 바뀜 알림(`store.ts`)
- `src/match.ts` · `src/frameSample.ts` · `src/grayImage.ts` · `src/autoAlign.ts` — 배경 비교와 자동 보정
- `src/frame.ts` · `src/photo.ts` — 비율, 가운데 자르기
- `src/reminders.ts` — 촬영 주기 알림
- `src/gallery.ts` — 사진첩 저장
- `src/backup.ts` · `src/zip.ts` — 백업 ZIP
- `src/pro.ts` — 평생 이용권
- `modules/timelapse/` — 타임랩스 MP4 네이티브 모듈 (iOS AVAssetWriter, 안드로이드 MediaCodec)

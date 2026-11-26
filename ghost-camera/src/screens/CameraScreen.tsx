import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, LayoutChangeEvent, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  CommonResolutions,
  type Frame,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

import { HOLD_MS, isAligned } from '../align';
import { AlignResult, autoAlign } from '../autoAlign';
import { Grid, LevelLine, SplitGhost, TiltReadout } from '../components/Overlays';
import { fitSize, ratioValue } from '../frame';
import { sampleGray } from '../frameSample';
import { gridSize, loadGray } from '../grayImage';
import { buildModel, estimate, guideFrom, guideText, isMatched, MatchModel, MatchResult, SCORE_OK } from '../match';
import type { Facing, Project, Shot } from '../data/db';
import { shotUri } from '../data/files';
import { cropToRatio } from '../photo';
import { Tilt, useTilt } from '../useTilt';

type GhostSource = 'first' | 'previous';
/** 고스트 보이는 방식: 반투명 겹치기 / 켰다 껐다 / 반반 나눠 보기 */
type GhostMode = 'overlay' | 'blink' | 'split';

const MODES: { key: GhostMode; label: string }[] = [
  { key: 'overlay', label: '겹치기' },
  { key: 'blink', label: '깜빡이기' },
  { key: 'split', label: '반반' },
];

/**
 * 맞으면 자동 촬영. MVP에서는 끄고(직접 찍기), 다 맞으면 셔터가 초록색이 되고 진동이 온다.
 * 나중에 설정 옵션으로 되살릴 수 있게 코드는 남겨 둔다.
 */
const ENABLE_AUTO_CAPTURE = false;

/** 실시간 비교용 격자 가로 칸 수 (작을수록 빠르다) */
const LIVE_GRID_W = 32;
/** 실시간 비교 간격 */
const LIVE_INTERVAL_MS = 200;
/** 이보다 오래된 비교 결과는 버린다 */
const MATCH_STALE_MS = 1000;

type Props = {
  project: Project;
  shots: Shot[];
  onClose: () => void;
  onSave: (tempUri: string, meta: { tilt: Tilt | null; facing: Facing }) => Promise<void>;
};

type Review = {
  /** 찍은 그대로 */
  original: string;
  /** 자동 보정한 사진 (보정할 게 없거나 확실하지 않으면 없음) */
  aligned: AlignResult | null;
  aligning: boolean;
  useAligned: boolean;
  tilt: Tilt | null;
  facing: Facing;
};

export function CameraScreen({ project, shots, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();

  const [facing, setFacing] = useState<Facing>('back');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);

  const [source, setSource] = useState<GhostSource>('previous');
  const [opacity, setOpacity] = useState(0.45);
  const [showGrid, setShowGrid] = useState(true);
  const [mode, setMode] = useState<GhostMode>('overlay');
  const [blinkOn, setBlinkOn] = useState(true);
  const [splitAt, setSplitAt] = useState(0.5);
  const [auto, setAuto] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);

  const [review, setReview] = useState<Review | null>(null);

  const tilt = useTilt(!review);

  const ghost: Shot | undefined = source === 'first' ? shots[0] : shots[shots.length - 1];
  const ghostUri = ghost ? shotUri(ghost) : null;
  const ghostTilt: Tilt | null =
    ghost && ghost.roll != null && ghost.pitch != null ? { roll: ghost.roll, pitch: ghost.pitch } : null;

  const aspect = ratioValue(project.ratio);
  const frame = area ? fitSize(area.width, area.height, aspect) : null;
  const grid = useMemo(() => gridSize(LIVE_GRID_W, aspect), [aspect]);

  // ── 카메라 출력 ─────────────────────────────────────────────
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_4_3,
    containerFormat: 'jpeg',
    quality: 0.95,
  });

  // ── 배경 비교 ──────────────────────────────────────────────
  // 고스트 사진을 작은 윤곽선 격자로 만들어 두고, 카메라 스레드가 프레임마다 비교한다.
  const [ghostModel, setGhostModel] = useState<MatchModel | null>(null);
  useEffect(() => {
    setGhostModel(null);
    if (!ghostUri) return;
    let cancelled = false;
    loadGray(ghostUri, grid.w, grid.h)
      .then((g) => !cancelled && setGhostModel(buildModel(g)))
      .catch((e) => console.warn('고스트 분석 실패', e));
    return () => {
      cancelled = true;
    };
  }, [ghostUri, grid.w, grid.h]);

  const [match, setMatch] = useState<(MatchResult & { at: number }) | null>(null);
  const onMatch = useCallback((m: MatchResult) => setMatch({ ...m, at: Date.now() }), []);
  useEffect(() => setMatch(null), [ghostModel]);

  const onFrame = useCallback(
    (f: Frame) => {
      'worklet';
      try {
        if (ghostModel == null) return;
        // 프레임마다 하면 배터리만 먹으니 LIVE_INTERVAL_MS에 한 번
        const g = globalThis as unknown as { __ghostLast?: number };
        const now = Date.now();
        if (now - (g.__ghostLast ?? 0) < LIVE_INTERVAL_MS) return;
        g.__ghostLast = now;

        let gray: number[];
        if (f.isPlanar) {
          // YUV: 첫 평면(Y)이 곧 흑백 밝기
          const y = f.getPlanes()[0];
          gray = sampleGray(
            new Uint8Array(y.getPixelBuffer()),
            y.width,
            y.height,
            y.bytesPerRow,
            1,
            0,
            f.orientation,
            f.isMirrored,
            aspect,
            grid.w,
            grid.h,
          );
        } else {
          // BGRA 등: 초록 값을 밝기 대신 쓴다
          gray = sampleGray(
            new Uint8Array(f.getPixelBuffer()),
            f.width,
            f.height,
            f.bytesPerRow,
            4,
            1,
            f.orientation,
            f.isMirrored,
            aspect,
            grid.w,
            grid.h,
          );
        }
        const result = estimate(buildModel({ w: grid.w, h: grid.h, data: gray }), ghostModel);
        scheduleOnRN(onMatch, result);
      } finally {
        f.dispose();
      }
    },
    [ghostModel, aspect, grid.w, grid.h, onMatch],
  );

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'yuv',
    // 프레임을 바로 세워서 받는다 (미리보기와 같은 방향)
    enablePhysicalBufferRotation: true,
    onFrame,
    onFrameDropped: () => {},
  });

  const now = Date.now();
  const liveMatch = match && now - match.at < MATCH_STALE_MS ? match : null;
  const guide = liveMatch ? guideFrom(liveMatch) : null;
  const guideLines = guideText(guide);

  // ── 깜빡이기 ───────────────────────────────────────────────
  const blink = mode === 'blink' && !review;
  useEffect(() => {
    if (!blink) {
      setBlinkOn(true);
      return;
    }
    const t = setInterval(() => setBlinkOn((v) => !v), 450);
    return () => clearInterval(t);
  }, [blink]);

  // ── 맞으면 자동 촬영 ────────────────────────────────────────
  // 기울기가 맞고, 고스트가 있으면 배경도 맞은 상태를 HOLD_MS 동안 유지하면 찍는다.
  // 한 번 찍고 나면 한 번 어긋났다가 다시 맞춰야 또 찍힌다 (다시 찍기 직후 바로 찍히지 않게).
  const tiltOk = isAligned(tilt, ghostTilt);
  const backgroundOk = !ghost || isMatched(liveMatch);
  const aligned = tiltOk && backgroundOk;
  const alignedSince = useRef<number | null>(null);
  const armed = useRef(true);
  useEffect(() => {
    if (!aligned) armed.current = true;
    const canShoot = ENABLE_AUTO_CAPTURE && auto && aligned && armed.current && ready && !busy && !review;
    if (!canShoot) {
      alignedSince.current = null;
      setHoldProgress(0);
      return;
    }
    const t = Date.now();
    if (alignedSince.current == null) {
      alignedSince.current = t;
      Haptics.selectionAsync().catch(() => {});
    }
    const p = (t - alignedSince.current) / HOLD_MS;
    if (p >= 1) {
      alignedSince.current = null;
      armed.current = false;
      setHoldProgress(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      takePicture();
    } else {
      setHoldProgress(p);
    }
    // takePicture는 매번 새로 만들어지지만 여기서는 최신 것을 부르면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilt, match, aligned, auto, ready, busy, review]);

  // 직접 찍기: 다 맞는 순간 한 번 진동으로 알려 준다
  const wasAligned = useRef(false);
  useEffect(() => {
    if (review) {
      wasAligned.current = false;
      return;
    }
    if (aligned && !wasAligned.current && ghost) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    wasAligned.current = aligned;
  }, [aligned, review, ghost]);
  const readyToShoot = aligned && !!ghost;

  function onAreaLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  }

  async function takePicture() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const tiltAtShot = tilt;
      const file = await photoOutput.capturePhotoToFile({ enableShutterSound: true }, {});
      const uri = file.filePath.startsWith('file://') ? file.filePath : `file://${file.filePath}`;
      const cropped = await cropToRatio(uri, project.ratio, {
        // 사진 회전 정보가 반영되지 않았을 때를 위한 안전장치 (세로 화면 고정)
        rotateIfLandscape: file.orientation === 'left' ? -90 : 90,
        // 앞 카메라 미리보기는 거울처럼 보이니 저장도 똑같이
        flip: facing === 'front' && !file.isMirrored,
      });
      setReview({
        original: cropped.uri,
        aligned: null,
        aligning: !!ghostUri,
        useAligned: true,
        tilt: tiltAtShot,
        facing,
      });

      // 찍은 뒤 자동 보정 (고스트가 있을 때만)
      if (ghostUri) {
        autoAlign(cropped.uri, ghostUri, cropped.width, cropped.height)
          .then((aligned) => setReview((r) => (r && r.original === cropped.uri ? { ...r, aligned, aligning: false } : r)))
          .catch((e) => {
            console.warn('자동 보정 실패', e);
            setReview((r) => (r && r.original === cropped.uri ? { ...r, aligning: false } : r));
          });
      }
    } catch (e) {
      console.warn('촬영 실패', e);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!review) return;
    setBusy(true);
    try {
      const uri = review.useAligned && review.aligned ? review.aligned.uri : review.original;
      await onSave(uri, { tilt: review.tilt, facing: review.facing });
    } finally {
      setBusy(false);
    }
  }

  if (!hasPermission) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.permText}>같은 자리에서 다시 찍으려면{'\n'}카메라 권한이 필요해요</Text>
        <Pressable
          style={styles.permButton}
          onPress={() => {
            // 한 번 거절하면 앱에서 다시 물을 수 없어서 설정 화면으로 보낸다
            if (canRequestPermission) requestPermission();
            else Linking.openSettings();
          }}
        >
          <Text style={styles.primaryText}>{canRequestPermission ? '권한 허용하기' : '설정에서 카메라 허용하기'}</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const ghostVisible = !!ghost && (!blink || blinkOn);
  const showOpacity = !!ghost && mode !== 'split';
  const reviewUri = review ? (review.useAligned && review.aligned ? review.aligned.uri : review.original) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      {/* 위 막대 */}
      <View style={styles.topBar}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.topText}>✕</Text>
        </Pressable>
        {shots.length > 1 ? (
          <View style={styles.segment}>
            {(['first', 'previous'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setSource(s)}
                style={[styles.segmentItem, source === s && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, source === s && styles.segmentTextActive]}>
                  {s === 'first' ? '첫 사진' : '직전 사진'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.topHint}>{ghost ? '첫 사진에 맞춰 찍어요' : '첫 사진을 찍어요'}</Text>
        )}
        <Pressable
          onPress={() => {
            setReady(false);
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
          }}
          hitSlop={12}
          disabled={!!review}
        >
          <Text style={[styles.topText, review && styles.dim]}>⟲</Text>
        </Pressable>
      </View>

      {/* 촬영 영역: 프로젝트 비율 그대로. 미리보기도 이 크기로 잘려 보인다 */}
      <View style={styles.area} onLayout={onAreaLayout}>
        {frame && (
          <View style={[styles.frame, frame]}>
            <Camera
              style={StyleSheet.absoluteFill}
              device={facing}
              isActive={!review}
              outputs={[photoOutput, frameOutput]}
              resizeMode="cover"
              mirrorMode="auto"
              orientationSource="interface"
              onStarted={() => setReady(true)}
              onStopped={() => setReady(false)}
              onError={(e) => console.warn('카메라 오류', e)}
            />
            {reviewUri && <Image source={{ uri: reviewUri }} style={StyleSheet.absoluteFill} />}
            {ghostUri && mode !== 'split' && ghostVisible && (
              <Image
                source={{ uri: ghostUri }}
                style={[StyleSheet.absoluteFill, { opacity: review ? reviewOpacity(opacity) : opacity }]}
                resizeMode="cover"
                pointerEvents="none"
              />
            )}
            {showGrid && <Grid />}
            {!review && <LevelLine tilt={tilt} />}
            {ghostUri && mode === 'split' && (
              <SplitGhost
                uri={ghostUri}
                width={frame.width}
                height={frame.height}
                position={splitAt}
                onChange={setSplitAt}
              />
            )}

            {/* 배경 일치도와 방향 안내 */}
            {!review && ghost && (
              <View pointerEvents="none" style={styles.matchBadge}>
                <Text style={[styles.matchText, matchColor(liveMatch, backgroundOk)]}>
                  {!ghostModel ? '배경 분석 중…' : liveMatch ? `배경 일치도 ${Math.round(liveMatch.score * 100)}%` : '배경 비교 중…'}
                </Text>
                {guideLines.length > 0 && <Text style={styles.guideText}>{guideLines.join('  ·  ')}</Text>}
              </View>
            )}

            {ENABLE_AUTO_CAPTURE && auto && !review && (
              <View pointerEvents="none" style={styles.autoBadge}>
                <Text style={styles.autoBadgeText}>
                  {holdProgress > 0
                    ? '그대로 멈춰 주세요…'
                    : aligned
                      ? '조금 움직였다 다시 맞춰 주세요'
                      : !tiltOk
                        ? '기울기를 맞추면 자동으로 찍혀요'
                        : '배경을 맞추면 자동으로 찍혀요'}
                </Text>
                <View style={styles.autoTrack}>
                  <View style={[styles.autoFill, { width: `${Math.round(holdProgress * 100)}%` }]} />
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* 아래 조작부 */}
      <View style={styles.controls}>
        {!review ? (
          <>
            <TiltReadout tilt={tilt} target={ghostTilt} />
            {ghost && <ModePicker mode={mode} onChange={setMode} />}
            {showOpacity && (
              <View style={styles.sliderRow}>
                <Text style={styles.small}>고스트</Text>
                <Slider
                  style={styles.slider}
                  value={opacity}
                  onValueChange={setOpacity}
                  minimumValue={0}
                  maximumValue={0.9}
                  minimumTrackTintColor="#FFFFFF"
                  maximumTrackTintColor="rgba(255,255,255,0.3)"
                  thumbTintColor="#FFFFFF"
                />
                <Text style={[styles.small, styles.percent]}>{Math.round(opacity * 100)}%</Text>
              </View>
            )}
            <View style={styles.shutterRow}>
              <Toggle label="격자" on={showGrid} onPress={() => setShowGrid((v) => !v)} />
              <Pressable
                onPress={takePicture}
                disabled={!ready || busy}
                style={({ pressed }) => [
                  styles.shutter,
                  readyToShoot && styles.shutterReady,
                  (pressed || busy) && styles.shutterPressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <View style={[styles.shutterInner, readyToShoot && styles.shutterInnerReady]} />
                )}
              </Pressable>
              {ENABLE_AUTO_CAPTURE ? (
                <Toggle label="자동 촬영" on={auto} onPress={() => setAuto((v) => !v)} disabled={!tilt} />
              ) : (
                <View style={styles.readyHint}>
                  <Text style={[styles.readyHintText, readyToShoot && styles.readyHintOn]}>
                    {!ghost ? '' : readyToShoot ? '지금 찍으세요' : tiltOk ? '배경 맞추는 중' : '기울기 맞추는 중'}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.reviewHint}>
              {!ghost
                ? '첫 사진으로 쓸까요?'
                : mode === 'split'
                  ? '경계선을 끌어 선이 이어지는지 확인해 보세요'
                  : '슬라이더를 움직여 얼마나 맞았는지 확인해 보세요'}
            </Text>
            {ghost && <AlignRow review={review} onToggle={() => setReview((r) => r && { ...r, useAligned: !r.useAligned })} />}
            {ghost && <ModePicker mode={mode === 'blink' ? 'overlay' : mode} onChange={setMode} hideBlink />}
            {showOpacity && (
              <View style={styles.sliderRow}>
                <Text style={styles.small}>새 사진</Text>
                <Slider
                  style={styles.slider}
                  value={opacity}
                  onValueChange={setOpacity}
                  minimumValue={0}
                  maximumValue={0.9}
                  minimumTrackTintColor="#FFFFFF"
                  maximumTrackTintColor="rgba(255,255,255,0.3)"
                  thumbTintColor="#FFFFFF"
                />
                <Text style={styles.small}>지난 사진</Text>
              </View>
            )}
            <View style={styles.reviewButtons}>
              <Pressable style={styles.secondary} onPress={() => setReview(null)} disabled={busy}>
                <Text style={styles.secondaryText}>다시 찍기</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={save} disabled={busy || review.aligning}>
                {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>저장</Text>}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

/** 찍은 뒤 자동 보정 상태와 켜기/끄기 */
function AlignRow({ review, onToggle }: { review: Review; onToggle: () => void }) {
  if (review.aligning) {
    return (
      <View style={styles.alignRow}>
        <ActivityIndicator color="#fff" size="small" />
        <Text style={styles.alignText}>지난 사진에 맞춰 자동 보정하는 중…</Text>
      </View>
    );
  }
  const a = review.aligned;
  if (!a) return <Text style={styles.alignText}>자동 보정할 만큼 어긋나지 않았어요</Text>;
  const parts: string[] = [];
  if (Math.abs(a.dx) >= 0.005) parts.push(`${a.dx > 0 ? '오른쪽' : '왼쪽'} ${pct(a.dx)}`);
  if (Math.abs(a.dy) >= 0.005) parts.push(`${a.dy > 0 ? '아래' : '위'} ${pct(a.dy)}`);
  if (Math.abs(a.scale - 1) >= 0.005) parts.push(`크기 ${a.scale > 1 ? '+' : '−'}${pct(a.scale - 1)}`);
  return (
    <View style={styles.alignRow}>
      <Text style={styles.alignText}>
        자동 보정 {parts.join(', ')}
        {a.partial ? ' (일부만)' : ''}
      </Text>
      <Pressable onPress={onToggle} style={[styles.toggle, review.useAligned && styles.toggleOn]}>
        <Text style={[styles.toggleText, review.useAligned && styles.toggleTextOn]}>
          {review.useAligned ? '보정 켬' : '보정 끔'}
        </Text>
      </Pressable>
    </View>
  );
}

function pct(v: number) {
  return `${(Math.abs(v) * 100).toFixed(1)}%`;
}

function matchColor(m: MatchResult | null, ok: boolean) {
  if (!m) return { color: '#A1A1AA' };
  if (ok) return { color: '#4ADE80' };
  if (m.score >= SCORE_OK * 0.7) return { color: '#FACC15' };
  return { color: '#F4F4F5' };
}

/** 확인 단계에서는 슬라이더 끝까지 밀면 지난 사진이 거의 다 보이게 */
function reviewOpacity(v: number) {
  return Math.min(1, v / 0.9);
}

function ModePicker({
  mode,
  onChange,
  hideBlink,
}: {
  mode: GhostMode;
  onChange: (m: GhostMode) => void;
  hideBlink?: boolean;
}) {
  return (
    <View style={styles.segment}>
      {MODES.filter((m) => !(hideBlink && m.key === 'blink')).map((m) => (
        <Pressable
          key={m.key}
          onPress={() => onChange(m.key)}
          style={[styles.segmentItem, mode === m.key && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, mode === m.key && styles.segmentTextActive]}>{m.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Toggle({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.toggle, on && styles.toggleOn, disabled && styles.dim]}>
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  permText: { color: '#fff', fontSize: 17, textAlign: 'center', lineHeight: 26 },

  topBar: {
    height: 52,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topText: { color: '#fff', fontSize: 24 },
  topHint: { color: '#D4D4D8', fontSize: 14 },
  dim: { opacity: 0.35 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: 3 },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { color: '#D4D4D8', fontSize: 13 },
  segmentTextActive: { color: '#000', fontWeight: '600' },

  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { overflow: 'hidden', backgroundColor: '#111' },
  matchBadge: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 2,
  },
  matchText: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  guideText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  autoBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    alignItems: 'center',
  },
  autoBadgeText: { color: '#fff', fontSize: 13 },
  autoTrack: { width: 140, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  autoFill: { height: 3, backgroundColor: '#4ADE80' },

  controls: { paddingHorizontal: 20, paddingTop: 14, gap: 14, alignItems: 'center' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  slider: { flex: 1, height: 36 },
  small: { color: '#A1A1AA', fontSize: 12 },
  percent: { width: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },

  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: { opacity: 0.6 },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  shutterReady: { borderColor: '#4ADE80' },
  shutterInnerReady: { backgroundColor: '#4ADE80' },
  readyHint: { width: 80, alignItems: 'center' },
  readyHintText: { color: '#A1A1AA', fontSize: 12, textAlign: 'center' },
  readyHintOn: { color: '#4ADE80', fontWeight: '700' },
  toggle: {
    minWidth: 80,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
  },
  toggleOn: { backgroundColor: '#fff', borderColor: '#fff' },
  toggleText: { color: '#E4E4E7', fontSize: 13 },
  toggleTextOn: { color: '#000', fontWeight: '600' },

  alignRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alignText: { color: '#D4D4D8', fontSize: 13 },
  reviewHint: { color: '#E4E4E7', fontSize: 14 },
  reviewButtons: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  primary: {
    flex: 1,
    minWidth: 140,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#000', fontSize: 16, fontWeight: '700' },
  secondary: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  permButton: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  textButton: { padding: 8 },
  textButtonLabel: { color: '#A1A1AA', fontSize: 15 },
});

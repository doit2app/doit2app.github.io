import Slider from '@react-native-community/slider';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HOLD_MS, isAligned } from '../align';
import { Grid, LevelLine, SplitGhost, TiltReadout } from '../components/Overlays';
import { fitSize, ratioValue } from '../frame';
import { cropToRatio, Project, Shot, shotUri } from '../storage';
import { Tilt, useTilt } from '../useTilt';

type GhostSource = 'first' | 'previous';
/** 고스트 보이는 방식: 반투명 겹치기 / 켰다 껐다 / 반반 나눠 보기 */
type GhostMode = 'overlay' | 'blink' | 'split';

const MODES: { key: GhostMode; label: string }[] = [
  { key: 'overlay', label: '겹치기' },
  { key: 'blink', label: '깜빡이기' },
  { key: 'split', label: '반반' },
];

type Props = {
  project: Project;
  onClose: () => void;
  onSave: (tempUri: string, tilt: Tilt | null) => Promise<void>;
};

export function CameraScreen({ project, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const [facing, setFacing] = useState<CameraType>('back');
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

  // 찍은 뒤 확인 단계
  const [review, setReview] = useState<{ uri: string; tilt: Tilt | null } | null>(null);

  const tilt = useTilt(!review);

  const shots = project.shots;
  const ghost: Shot | undefined = source === 'first' ? shots[0] : shots[shots.length - 1];
  const ghostTilt: Tilt | null =
    ghost && ghost.roll != null && ghost.pitch != null ? { roll: ghost.roll, pitch: ghost.pitch } : null;

  // 깜빡이기: 고스트를 켰다 껐다 하면 어긋난 곳이 눈에 잘 띈다
  const blink = mode === 'blink' && !review;
  useEffect(() => {
    if (!blink) {
      setBlinkOn(true);
      return;
    }
    const t = setInterval(() => setBlinkOn((v) => !v), 450);
    return () => clearInterval(t);
  }, [blink]);

  // 맞으면 자동 촬영: 기울기가 맞은 상태를 HOLD_MS 동안 유지하면 찍는다.
  // 한 번 찍고 나면 한 번 어긋났다가 다시 맞춰야 또 찍힌다 (다시 찍기 직후 바로 찍히지 않게).
  const aligned = isAligned(tilt, ghostTilt);
  const alignedSince = useRef<number | null>(null);
  const armed = useRef(true);
  useEffect(() => {
    if (!aligned) armed.current = true;
    const canShoot = auto && aligned && armed.current && ready && !busy && !review;
    if (!canShoot) {
      alignedSince.current = null;
      setHoldProgress(0);
      return;
    }
    const now = Date.now();
    if (alignedSince.current == null) {
      alignedSince.current = now;
      Haptics.selectionAsync().catch(() => {});
    }
    const p = (now - alignedSince.current) / HOLD_MS;
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
  }, [tilt, aligned, auto, ready, busy, review]);

  const aspect = ratioValue(project.ratio);
  const frame = area ? fitSize(area.width, area.height, aspect) : null;

  function onAreaLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  }

  async function takePicture() {
    if (!camera.current || !ready || busy) return;
    setBusy(true);
    try {
      const tiltAtShot = tilt;
      const photo = await camera.current.takePictureAsync({ quality: 1, shutterSound: true });
      const uri = await cropToRatio(photo.uri, photo.width, photo.height, project.ratio);
      setReview({ uri, tilt: tiltAtShot });
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
      await onSave(review.uri, review.tilt);
    } finally {
      setBusy(false);
    }
  }

  if (!permission) return <View style={styles.screen} />;

  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.permText}>같은 자리에서 다시 찍으려면{'\n'}카메라 권한이 필요해요</Text>
        <Pressable style={styles.primary} onPress={requestPermission}>
          <Text style={styles.primaryText}>권한 허용하기</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const ghostVisible = !!ghost && (!blink || blinkOn);
  const showOpacity = !!ghost && mode !== 'split';

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
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
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
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mirror={facing === 'front'}
              active={!review}
              onCameraReady={() => setReady(true)}
            />
            {review && <Image source={{ uri: review.uri }} style={StyleSheet.absoluteFill} />}
            {ghost && mode !== 'split' && ghostVisible && (
              <Image
                source={{ uri: shotUri(ghost) }}
                style={[StyleSheet.absoluteFill, { opacity: review ? reviewOpacity(opacity) : opacity }]}
                resizeMode="cover"
                pointerEvents="none"
              />
            )}
            {showGrid && <Grid />}
            {!review && <LevelLine tilt={tilt} />}
            {ghost && mode === 'split' && (
              <SplitGhost
                uri={shotUri(ghost)}
                width={frame.width}
                height={frame.height}
                position={splitAt}
                onChange={setSplitAt}
              />
            )}
            {auto && !review && (
              <View pointerEvents="none" style={styles.autoBadge}>
                <Text style={styles.autoBadgeText}>
                  {holdProgress > 0 ? '그대로 멈춰 주세요…' : aligned ? '조금 움직였다 다시 맞춰 주세요' : '맞추면 자동으로 찍혀요'}
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
                style={({ pressed }) => [styles.shutter, (pressed || busy) && styles.shutterPressed]}
              >
                {busy ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
              </Pressable>
              <Toggle label="자동 촬영" on={auto} onPress={() => setAuto((v) => !v)} disabled={!tilt} />
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
              <Pressable style={styles.primary} onPress={save} disabled={busy}>
                {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryText}>저장</Text>}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
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
  toggle: {
    width: 80,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
  },
  toggleOn: { backgroundColor: '#fff', borderColor: '#fff' },
  toggleText: { color: '#E4E4E7', fontSize: 13 },
  toggleTextOn: { color: '#000', fontWeight: '600' },

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
  textButton: { padding: 8 },
  textButtonLabel: { color: '#A1A1AA', fontSize: 15 },
});

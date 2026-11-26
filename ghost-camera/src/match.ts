// 배경 비교: 지금 카메라 화면과 고스트(지난 사진)가 얼마나 맞는지, 어느 쪽으로 어긋났는지 계산한다.
//
// 1. 두 사진을 아주 작게 줄인 흑백 격자(예: 32×43)로 만든다.
// 2. 색·밝기 대신 윤곽선(소벨)으로 바꾼다. 아침·저녁처럼 밝기가 달라도 선은 그대로라서.
// 3. 가장자리에 무게를 더 준다. 찍는 대상(아이, 식물)은 보통 가운데에서 변하고, 배경은 가장자리에 있어서.
// 4. 가중 상관계수(NCC)로 "그대로 겹쳤을 때 일치도"를 잰다.
// 5. 지난 사진을 조금씩 옮기고(dx, dy) 키우거나 줄여(scale) 가장 잘 맞는 위치를 찾는다.
//    작은 격자에서 넓게 찾고, 큰 격자에서 좁혀 가며 정밀하게 찾는다 (피라미드).
//
// 좌표 약속: 지난 사진의 점 q는 지금 화면에서 p = c + scale·(q − c) + d 에 보인다 (c는 가운데).
// - dx > 0: 물건이 지금 화면에서 더 오른쪽에 있다 → 카메라를 오른쪽으로 돌리면 맞는다
// - dy > 0: 물건이 더 아래에 있다 → 카메라를 아래로
// - scale > 1: 물건이 더 크게 보인다 → 뒤로 물러나면 맞는다
//
// 카메라 스레드(워클릿)에서도 돌아야 해서 모든 함수에 'worklet'을 붙이고, 배열과 Math만 쓴다.

export type Gray = { w: number; h: number; data: number[] };
export type EdgeLevel = { w: number; h: number; edge: number[]; weight: number[] };
/** 피라미드: [0]이 가장 큰 격자 */
export type MatchModel = EdgeLevel[];

export type MatchResult = {
  /** 그대로 겹쳤을 때 일치도 (0~1) */
  score: number;
  /** 가장 잘 맞는 위치에서의 일치도 (0~1) */
  bestScore: number;
  /** 가장 잘 맞는 위치: 화면 가로·세로에 대한 비율 */
  dx: number;
  dy: number;
  scale: number;
};

/** 2×2 평균으로 절반 크기 */
export function downsample(g: Gray): Gray {
  'worklet';
  const w = Math.floor(g.w / 2);
  const h = Math.floor(g.h / 2);
  const out: number[] = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 2 * y * g.w + 2 * x;
      out[y * w + x] = (g.data[i] + g.data[i + 1] + g.data[i + g.w] + g.data[i + g.w + 1]) / 4;
    }
  }
  return { w, h, data: out };
}

/** 소벨 윤곽선 + 가장자리 가중치 */
export function edgeLevel(g: Gray): EdgeLevel {
  'worklet';
  const { w, h, data } = g;
  const edge: number[] = new Array(w * h).fill(0);
  const weight: number[] = new Array(w * h).fill(0);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = data[i - w - 1];
      const t = data[i - w];
      const tr = data[i - w + 1];
      const l = data[i - 1];
      const r = data[i + 1];
      const bl = data[i + w - 1];
      const b = data[i + w];
      const br = data[i + w + 1];
      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      // 제곱근으로 아주 강한 선 하나가 전부를 좌우하지 않게
      edge[i] = Math.sqrt(Math.sqrt(gx * gx + gy * gy));
      const nx = Math.abs((x / (w - 1)) * 2 - 1);
      const ny = Math.abs((y / (h - 1)) * 2 - 1);
      weight[i] = 0.35 + 0.65 * Math.max(nx, ny);
    }
  }
  return { w, h, edge, weight };
}

/** 흑백 격자에서 피라미드 모델을 만든다. 가장 작은 단계가 가로 12칸 아래로 내려가지 않게 */
export function buildModel(g: Gray): MatchModel {
  'worklet';
  const levels: MatchModel = [edgeLevel(g)];
  let cur = g;
  while (cur.w >= 24 && cur.h >= 24) {
    cur = downsample(cur);
    levels.push(edgeLevel(cur));
  }
  return levels;
}

/**
 * 지난 사진(ghost)을 (dx, dy, scale)만큼 옮겼다고 보고 지금 화면(cur)과의 가중 상관계수.
 * dx, dy는 이 단계의 칸 단위. 겹치는 부분이 절반이 안 되면 -1.
 */
export function corrAt(cur: EdgeLevel, ghost: EdgeLevel, dx: number, dy: number, scale: number): number {
  'worklet';
  const w = cur.w;
  const h = cur.h;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const inv = 1 / scale;
  let sw = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  let count = 0;
  const gw = ghost.w;
  const ge = ghost.edge;
  for (let y = 1; y < h - 1; y++) {
    const qy = cy + (y - cy - dy) * inv;
    if (qy < 1 || qy > ghost.h - 2) continue;
    const y0 = Math.floor(qy);
    const fy = qy - y0;
    for (let x = 1; x < w - 1; x++) {
      const qx = cx + (x - cx - dx) * inv;
      if (qx < 1 || qx > gw - 2) continue;
      const x0 = Math.floor(qx);
      const fx = qx - x0;
      const i = y * w + x;
      const wt = cur.weight[i];
      const a = cur.edge[i];
      // 칸 사이는 이웃 네 칸을 섞는다 (작은 이동·크기 차이도 값이 달라지게)
      const j = y0 * gw + x0;
      const b =
        (ge[j] * (1 - fx) + ge[j + 1] * fx) * (1 - fy) + (ge[j + gw] * (1 - fx) + ge[j + gw + 1] * fx) * fy;
      sw += wt;
      sa += wt * a;
      sb += wt * b;
      saa += wt * a * a;
      sbb += wt * b * b;
      sab += wt * a * b;
      count++;
    }
  }
  if (count < ((w - 2) * (h - 2)) / 2 || sw === 0) return -1;
  const ma = sa / sw;
  const mb = sb / sw;
  const va = saa / sw - ma * ma;
  const vb = sbb / sw - mb * mb;
  if (va <= 1e-9 || vb <= 1e-9) return 0;
  return (sab / sw - ma * mb) / Math.sqrt(va * vb);
}

const COARSE_SCALES = [0.9, 0.95, 1, 1.05, 1.1];

/**
 * 가장 잘 맞는 위치를 찾는다. cur와 ghost는 같은 크기의 격자에서 만든 모델이어야 한다.
 * @param range 가장 작은 단계에서 찾을 범위 (가로 칸 수에 대한 비율)
 */
export function estimate(cur: MatchModel, ghost: MatchModel, range: number = 0.2): MatchResult {
  'worklet';
  const top = cur.length - 1;
  const score = Math.max(0, corrAt(cur[0], ghost[0], 0, 0, 1));

  // 1) 가장 작은 단계에서 넓게
  const R = Math.max(2, Math.round(cur[top].w * range));
  let bx = 0;
  let by = 0;
  let bs = 1;
  let best = -2;
  for (let si = 0; si < COARSE_SCALES.length; si++) {
    const s = COARSE_SCALES[si];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const c = corrAt(cur[top], ghost[top], dx, dy, s);
        // 같은 값이면 덜 움직인 쪽을 고른다
        if (
          c > best + 1e-6 ||
          (Math.abs(c - best) <= 1e-6 &&
            Math.abs(dx) + Math.abs(dy) + Math.abs(s - 1) * 20 < Math.abs(bx) + Math.abs(by) + Math.abs(bs - 1) * 20)
        ) {
          best = c;
          bx = dx;
          by = dy;
          bs = s;
        }
      }
    }
  }

  // 2) 한 단계씩 키우며 ±1칸, 크기 ±2.5% 안에서 좁혀 간다
  for (let lv = top - 1; lv >= 0; lv--) {
    const fx = cur[lv].w / cur[lv + 1].w;
    const fy = cur[lv].h / cur[lv + 1].h;
    const cx0 = Math.round(bx * fx);
    const cy0 = Math.round(by * fy);
    const s0 = bs;
    // 가운데(그대로)부터 재서, 같은 값이면 덜 움직인 쪽이 남게 한다
    best = corrAt(cur[lv], ghost[lv], cx0, cy0, s0);
    bx = cx0;
    by = cy0;
    bs = s0;
    for (let ds = -1; ds <= 1; ds++) {
      const s = s0 * (1 + ds * 0.025);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ds === 0 && ox === 0 && oy === 0) continue;
          const c = corrAt(cur[lv], ghost[lv], cx0 + ox, cy0 + oy, s);
          if (c > best + 1e-6) {
            best = c;
            bx = cx0 + ox;
            by = cy0 + oy;
            bs = s;
          }
        }
      }
    }
  }

  // 3) 칸 사이 값은 포물선으로 어림 (가로·세로 각각)
  const L = cur[0];
  const G = ghost[0];
  const cL = corrAt(L, G, bx - 1, by, bs);
  const cR = corrAt(L, G, bx + 1, by, bs);
  const cU = corrAt(L, G, bx, by - 1, bs);
  const cD = corrAt(L, G, bx, by + 1, bs);
  const fxSub = subpixel(cL, best, cR);
  const fySub = subpixel(cU, best, cD);

  return {
    score,
    bestScore: Math.max(0, best),
    dx: (bx + fxSub) / L.w,
    dy: (by + fySub) / L.h,
    scale: bs,
  };
}

function subpixel(a: number, b: number, c: number): number {
  'worklet';
  if (a < 0 || c < 0) return 0;
  const den = a - 2 * b + c;
  if (den >= 0) return 0;
  const off = (0.5 * (a - c)) / den;
  return Math.max(-0.5, Math.min(0.5, off));
}

/** 이만큼 넘어야 "배경이 맞았다"고 본다. 휴대폰에서 써 보며 조정할 값 */
export const SCORE_OK = 0.5;
/** 위치 차이가 이 비율 안이면 맞은 것 */
export const OFFSET_OK = 0.03;
export const SCALE_OK = 0.03;

export type Guide = { right: number; down: number; back: number };

/**
 * 어느 쪽으로 움직이면 되는지. 다른 위치가 그대로보다 확실히 더 잘 맞을 때만 알려 준다.
 * right > 0 오른쪽으로, down > 0 아래로, back > 0 뒤로 물러나기.
 */
export function guideFrom(m: MatchResult): Guide | null {
  if (m.bestScore < 0.25 || m.bestScore - m.score < 0.03) return null;
  return { right: m.dx, down: m.dy, back: m.scale - 1 };
}

export function isMatched(m: MatchResult | null): boolean {
  if (!m) return false;
  if (m.score < SCORE_OK) return false;
  const g = guideFrom(m);
  if (!g) return true;
  return Math.abs(g.right) < OFFSET_OK && Math.abs(g.down) < OFFSET_OK && Math.abs(g.back) < SCALE_OK;
}

export function guideText(g: Guide | null): string[] {
  if (!g) return [];
  const out: string[] = [];
  if (g.right > OFFSET_OK) out.push('→ 오른쪽으로');
  else if (g.right < -OFFSET_OK) out.push('← 왼쪽으로');
  if (g.down > OFFSET_OK) out.push('↓ 아래로');
  else if (g.down < -OFFSET_OK) out.push('↑ 위로');
  if (g.back > SCALE_OK) out.push('뒤로 한 걸음');
  else if (g.back < -SCALE_OK) out.push('앞으로 한 걸음');
  return out;
}

/**
 * 逐字演出时间轴:把 [speed]/[wait] 标记编译成每个字形的出现时刻。
 * 时序只依赖解析结果,与分页无关;翻页时按页内首字形归零重放。
 */
import type { ParsedLine } from './markup.ts';

export interface Timeline {
  /** 按"正文逐字单元"的出现时刻(ms)。注音不占单元,随正文首字出现。 */
  appearAt: number[];
  totalMs: number;
  /** cluster 下标 → 该 cluster 第一个单元的下标(-1 = 换行符,不占时间) */
  clusterUnitBase: number[];
}

export function buildTimeline(parsed: ParsedLine, defaultMsPerChar: number): Timeline {
  const appearAt: number[] = [];
  const clusterUnitBase: number[] = new Array(parsed.clusters.length).fill(-1);
  let clock = 0;
  let speed = defaultMsPerChar;
  let eventIdx = 0;
  const events = parsed.events;

  for (let ci = 0; ci < parsed.clusters.length; ci++) {
    while (eventIdx < events.length && events[eventIdx].beforeCluster <= ci) {
      const ev = events[eventIdx];
      if (ev.op === 'wait') clock += ev.value;
      else speed = ev.value;
      eventIdx++;
    }
    const c = parsed.clusters[ci];
    if (c.isLineBreak || c.chars.length === 0) continue;
    clusterUnitBase[ci] = appearAt.length;
    for (let k = 0; k < c.chars.length; k++) {
      appearAt.push(clock);
      clock += speed;
    }
  }
  while (eventIdx < events.length) {
    const ev = events[eventIdx];
    if (ev.op === 'wait') clock += ev.value;
    eventIdx++;
  }
  return { appearAt, totalMs: clock, clusterUnitBase };
}

/**
 * 某页内、某 cluster 的出现时刻(相对页首)。
 * clusterGlyphCount: 该 cluster 的正文字数。
 */
export function clusterAppearAt(
  tl: Timeline,
  parsed: ParsedLine,
  clusterIndex: number,
  pageFirstCluster: number,
): number {
  const base = tl.clusterUnitBase[clusterIndex];
  const pageBase = tl.clusterUnitBase[pageFirstCluster];
  if (base < 0) return 0;
  return tl.appearAt[base] - (pageBase >= 0 ? tl.appearAt[pageBase] : 0);
}

/** 确定性伪随机(抖字用,保证同一帧同一字偏移一致,回放可复现) */
export function hashNoise(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 0xffffffff;
}

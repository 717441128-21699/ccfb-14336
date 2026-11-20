/**
 * 排版引擎:横排/竖排、避头尾、注音(ルビ)、按句读分页。
 *
 * 输出与渲染无关的 GlyphRun 列表(坐标相对文本框左上角,均为字形中心点),
 * 渲染器只负责按坐标绘制,因此历史回放可以直接冻结本模块的输出。
 */
import { canBreakBetween, lineEndsSentence, NO_LINE_END } from './kinsoku.ts';
import type { Cluster, ParsedLine } from './markup.ts';

export type WritingMode = 'horizontal' | 'vertical';

export interface LayoutConfig {
  mode: WritingMode;
  /** 文本框内尺寸(px) */
  boxWidth: number;
  boxHeight: number;
  fontSize: number;
  /** 行距:横排=行高,竖排=列宽 */
  lineHeight: number;
  /** 注音字号 = fontSize * rubyScale */
  rubyScale: number;
  padding: number;
}

/** 字宽测量接口,浏览器里用 canvas measureText,测试里用定宽近似 */
export interface Measurer {
  measure(ch: string, sizePx: number): number;
}

export interface GlyphRun {
  char: string;
  x: number;
  y: number;
  size: number;
  /** 竖排下的拉丁字母/数字旋转 90° */
  rotate: boolean;
  isRuby: boolean;
  /** 所属 cluster 在原文中的下标(演出时序按它对齐) */
  clusterIndex: number;
  /** 全局字形序号(逐字显示的顺序) */
  glyphIndex: number;
}

export interface Line {
  clusters: PlacedCluster[];
  /** 已用行宽 */
  used: number;
  endsSentence: boolean;
}

export interface PlacedCluster {
  cluster: Cluster;
  clusterIndex: number;
  /** 行内偏移 */
  offset: number;
  /** 占用宽度(注音撑开后) */
  width: number;
  /** 每个正文字的实际步进 */
  advances: number[];
}

export interface PageLayout {
  glyphs: GlyphRun[];
  /** 本页第一个 cluster 的全局下标(演出用) */
  firstCluster: number;
  lastCluster: number;
}

export interface LaidOutDialogue {
  pages: PageLayout[];
  config: LayoutConfig;
}

const RUBY_GAP_RATIO = 0.08; // 注音与正文间隙,相对字号

function isAsciiAlnum(ch: string): boolean {
  return ch.length === 1 && /[A-Za-z0-9]/.test(ch);
}

/** 计算一个 cluster 的占位宽度与逐字步进(注音比正文长时拉开正文字距) */
export function measureCluster(
  c: Cluster,
  cfg: LayoutConfig,
  meas: Measurer,
): { width: number; advances: number[]; rubyWidth: number } {
  const rubySize = cfg.fontSize * cfg.rubyScale;
  const advances = c.chars.map((ch) => meas.measure(ch, cfg.fontSize));
  const baseWidth = advances.reduce((a, b) => a + b, 0);
  let rubyWidth = 0;
  if (c.ruby) rubyWidth = [...c.ruby].reduce((a, ch) => a + meas.measure(ch, rubySize), 0);
  if (c.ruby && rubyWidth > baseWidth && c.chars.length > 0) {
    const extra = (rubyWidth - baseWidth) / c.chars.length;
    for (let k = 0; k < advances.length; k++) advances[k] += extra;
    return { width: rubyWidth, advances, rubyWidth };
  }
  return { width: baseWidth, advances, rubyWidth };
}

/** 断行:贪心 + 避头尾(行首禁则字悬垂,行末禁则字追出到下一行) */
export function breakLines(parsed: ParsedLine, cfg: LayoutConfig, meas: Measurer): Line[] {
  const capacity =
    (cfg.mode === 'horizontal' ? cfg.boxWidth : cfg.boxHeight) - cfg.padding * 2;
  const lines: Line[] = [];
  let cur: Line = { clusters: [], used: 0, endsSentence: false };

  const finishLine = () => {
    // 判定句读收尾(允许句读后跟闭引号)
    const tail: string[] = [];
    for (let i = cur.clusters.length - 1; i >= 0 && tail.length < 3; i--) {
      const chs = cur.clusters[i].cluster.chars;
      if (chs.length > 0) tail.unshift(chs[chs.length - 1]);
    }
    cur.endsSentence = tail.length > 0 && lineEndsSentence(tail);
    lines.push(cur);
    cur = { clusters: [], used: 0, endsSentence: false };
  };

  const lastCharOf = (line: Line): string | undefined => {
    for (let i = line.clusters.length - 1; i >= 0; i--) {
      const chs = line.clusters[i].cluster.chars;
      if (chs.length > 0) return chs[chs.length - 1];
    }
    return undefined;
  };

  for (let ci = 0; ci < parsed.clusters.length; ci++) {
    const c = parsed.clusters[ci];
    if (c.isLineBreak) {
      finishLine();
      continue;
    }
    const { width, advances } = measureCluster(c, cfg, meas);
    if (cur.used > 0 && cur.used + width > capacity) {
      if (canBreakBetween(lastCharOf(cur), c.chars[0])) {
        // 正常断行
        finishLine();
      } else {
        // 禁则处理:行尾若有开括号类(行末禁止),追出到下一行;
        // 否则视为行首禁则字,悬垂在当前行尾(允许轻微溢出)。
        const kicked: PlacedCluster[] = [];
        while (cur.clusters.length > 0) {
          const lastPlaced = cur.clusters[cur.clusters.length - 1];
          const lastCh = lastPlaced.cluster.chars[lastPlaced.cluster.chars.length - 1];
          if (lastCh !== undefined && NO_LINE_END.has(lastCh)) {
            kicked.unshift(lastPlaced);
            cur.clusters.pop();
            cur.used -= lastPlaced.width;
          } else break;
        }
        if (kicked.length > 0) {
          finishLine();
          for (const p of kicked) {
            p.offset = cur.used;
            cur.clusters.push(p);
            cur.used += p.width;
          }
        }
        // kicked 为空 → 行首禁则字,直接落进当前行(悬垂)
      }
    }
    const placed: PlacedCluster = { cluster: c, clusterIndex: ci, offset: cur.used, width, advances };
    cur.clusters.push(placed);
    cur.used += width;
  }
  if (cur.clusters.length > 0 || lines.length === 0) finishLine();
  return lines;
}

/** 分页:行装入页面,溢出时优先在句读处切页;cluster(含注音)不可拆分 */
export function paginate(lines: Line[], cfg: LayoutConfig): Line[][] {
  const block =
    (cfg.mode === 'horizontal' ? cfg.boxHeight : cfg.boxWidth) - cfg.padding * 2;
  const perPage = Math.max(1, Math.floor(block / cfg.lineHeight));
  const pages: Line[][] = [];
  let i = 0;
  while (i < lines.length) {
    let end = Math.min(i + perPage, lines.length);
    if (end < lines.length) {
      // 从页尾往前找句读行,至少保留一行
      let cut = -1;
      for (let j = end - 1; j >= i; j--) {
        if (lines[j].endsSentence) { cut = j + 1; break; }
      }
      if (cut > i) end = cut;
    }
    pages.push(lines.slice(i, end));
    i = end;
  }
  return pages;
}

/** 把分页后的行展开为逐字坐标 */
export function emitGlyphs(
  pages: Line[][],
  parsed: ParsedLine,
  cfg: LayoutConfig,
  meas: Measurer,
): LaidOutDialogue {
  const rubySize = cfg.fontSize * cfg.rubyScale;
  const rubyGap = cfg.fontSize * RUBY_GAP_RATIO;
  const out: PageLayout[] = [];
  let glyphIndex = 0;
  // cluster 下标 → 该 cluster 第一个字形的全局序号
  const clusterGlyphBase: number[] = new Array(parsed.clusters.length).fill(-1);

  for (const pageLines of pages) {
    const glyphs: GlyphRun[] = [];
    let firstCluster = -1;
    let lastCluster = -1;
    for (let li = 0; li < pageLines.length; li++) {
      const line = pageLines[li];
      for (const pc of line.clusters) {
        const c = pc.cluster;
        if (firstCluster === -1) firstCluster = pc.clusterIndex;
        lastCluster = pc.clusterIndex;
        if (clusterGlyphBase[pc.clusterIndex] === -1) clusterGlyphBase[pc.clusterIndex] = glyphIndex;
        // 正文字
        let u = cfg.padding + pc.offset;
        for (let k = 0; k < c.chars.length; k++) {
          const adv = pc.advances[k];
          const cu = u + adv / 2;
          const pos = place(cu, li, cfg, false, rubySize, rubyGap);
          glyphs.push({
            char: c.chars[k],
            x: pos.x,
            y: pos.y,
            size: cfg.fontSize,
            rotate: cfg.mode === 'vertical' && isAsciiAlnum(c.chars[k]),
            isRuby: false,
            clusterIndex: pc.clusterIndex,
            glyphIndex: glyphIndex++,
          });
          u += adv;
        }
        // 注音字:沿行文方向排在正文上方(横排)或右侧(竖排),整体居中
        if (c.ruby) {
          const rchars = [...c.ruby];
          const rw = rchars.map((ch) => meas.measure(ch, rubySize));
          const total = rw.reduce((a, b) => a + b, 0);
          let ru = cfg.padding + pc.offset + (pc.width - total) / 2;
          for (let k = 0; k < rchars.length; k++) {
            const cu = ru + rw[k] / 2;
            const pos = place(cu, li, cfg, true, rubySize, rubyGap);
            glyphs.push({
              char: rchars[k],
              x: pos.x,
              y: pos.y,
              size: rubySize,
              rotate: cfg.mode === 'vertical' && isAsciiAlnum(rchars[k]),
              isRuby: true,
              clusterIndex: pc.clusterIndex,
              glyphIndex: clusterGlyphBase[pc.clusterIndex], // 注音随正文首字一起出现
            });
            ru += rw[k];
          }
        }
      }
    }
    out.push({ glyphs, firstCluster: Math.max(0, firstCluster), lastCluster });
  }
  return { pages: out, config: cfg };
}

/** (行文方向坐标 u, 行号) → 文本框内 x/y(字形中心) */
function place(
  u: number,
  lineIndex: number,
  cfg: LayoutConfig,
  isRuby: boolean,
  rubySize: number,
  rubyGap: number,
): { x: number; y: number } {
  const blockCenter = cfg.padding + lineIndex * cfg.lineHeight + cfg.lineHeight / 2;
  if (cfg.mode === 'horizontal') {
    const y = isRuby
      ? blockCenter - cfg.fontSize / 2 - rubyGap - rubySize / 2
      : blockCenter;
    return { x: u, y };
  }
  // 竖排:列从右往左
  const colCenter = cfg.boxWidth - (cfg.padding + lineIndex * cfg.lineHeight + cfg.lineHeight / 2);
  const x = isRuby
    ? colCenter + cfg.fontSize / 2 + rubyGap + rubySize / 2
    : colCenter;
  return { x, y: u };
}

/** 一步到位:解析后的台词 → 分页排版结果 */
export function layoutDialogue(
  parsed: ParsedLine,
  cfg: LayoutConfig,
  meas: Measurer,
): LaidOutDialogue {
  const lines = breakLines(parsed, cfg, meas);
  const pages = paginate(lines, cfg);
  return emitGlyphs(pages, parsed, cfg, meas);
}

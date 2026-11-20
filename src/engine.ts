/**
 * 引擎门面:解析 → 排版 → 演出 → 历史,串成一条线。
 * 渲染循环由调用方驱动(rAF),引擎只计算状态,保证 60fps 下每帧 O(可见字数)。
 */
import { parseLine, type ParsedLine } from './markup.ts';
import {
  layoutDialogue,
  type LaidOutDialogue,
  type LayoutConfig,
  type Measurer,
} from './layout.ts';
import { buildTimeline, type Timeline } from './timeline.ts';
import { Backlog, type HistoryEntry } from './history.ts';

export interface EngineOptions {
  config: LayoutConfig;
  measurer: Measurer;
  /** 默认每字毫秒 */
  defaultMsPerChar?: number;
  now?: () => number;
}

export type PlayState = 'typing' | 'page-done' | 'done';

export class VNEngine {
  readonly backlog = new Backlog();
  private cfg: LayoutConfig;
  private meas: Measurer;
  private defaultMsPerChar: number;
  private now: () => number;

  private parsed: ParsedLine = { clusters: [], events: [] };
  private layout: LaidOutDialogue | null = null;
  private timeline: Timeline = { appearAt: [], totalMs: 0, clusterUnitBase: [] };
  private pageIndex = 0;
  private pageStart = 0;
  private completed = false; // 当前页被点击立即显示完
  speaker = '';

  constructor(opts: EngineOptions) {
    this.cfg = opts.config;
    this.meas = opts.measurer;
    this.defaultMsPerChar = opts.defaultMsPerChar ?? 50;
    this.now = opts.now ?? (() => performance.now());
  }

  get config(): LayoutConfig {
    return this.cfg;
  }

  setConfig(cfg: Partial<LayoutConfig>): void {
    this.cfg = { ...this.cfg, ...cfg };
  }

  /** 说一句台词:解析、排版、入历史、开始逐字演出 */
  say(speaker: string, text: string): void {
    this.speaker = speaker;
    this.parsed = parseLine(text);
    this.layout = layoutDialogue(this.parsed, this.cfg, this.meas);
    this.timeline = buildTimeline(this.parsed, this.defaultMsPerChar);
    this.pageIndex = 0;
    this.pageStart = this.now();
    this.completed = false;
    this.backlog.push({
      speaker,
      source: text,
      config: { ...this.cfg },
      layout: this.layout,
      at: this.now(),
    });
  }

  get currentLayout(): LaidOutDialogue | null {
    return this.layout;
  }

  get currentParsed(): ParsedLine {
    return this.parsed;
  }

  get currentTimeline(): Timeline {
    return this.timeline;
  }

  get page(): number {
    return this.pageIndex;
  }

  get pageCount(): number {
    return this.layout?.pages.length ?? 0;
  }

  /** 当前页内已流逝时间(ms);点击补完后为 Infinity */
  get pageTime(): number {
    if (this.completed) return Infinity;
    return this.now() - this.pageStart;
  }

  /** 当前页是否已全部显示 */
  get pageFullyShown(): boolean {
    if (!this.layout) return true;
    if (this.completed) return true;
    const page = this.layout.pages[this.pageIndex];
    // 页内最后一个 cluster 的出现时刻
    const last = page.lastCluster;
    const unit = this.timeline.clusterUnitBase[last];
    if (unit < 0) return true;
    const firstUnit = this.timeline.clusterUnitBase[page.firstCluster];
    const appear = this.timeline.appearAt[unit] - (firstUnit >= 0 ? this.timeline.appearAt[firstUnit] : 0);
    return this.pageTime >= appear;
  }

  get state(): PlayState {
    if (!this.layout) return 'done';
    if (!this.pageFullyShown) return 'typing';
    return this.pageIndex < this.layout.pages.length - 1 ? 'page-done' : 'done';
  }

  /**
   * 点击:打字中 → 立即显示完本页;本页完 → 下一页;最后页完 → 返回 false(调用方推进剧本)
   */
  click(): boolean {
    if (!this.layout) return false;
    if (!this.pageFullyShown) {
      this.completed = true;
      return true;
    }
    if (this.pageIndex < this.layout.pages.length - 1) {
      this.pageIndex++;
      this.pageStart = this.now();
      this.completed = false;
      return true;
    }
    return false;
  }

  /** 历史回放条目(排版已冻结,直接渲染即可) */
  historyEntry(i: number): HistoryEntry | undefined {
    return this.backlog.get(i);
  }
}

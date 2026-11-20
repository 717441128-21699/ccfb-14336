/**
 * 历史回放:冻结每条台词的排版结果。
 * 回看时直接重放存储的 GlyphRun 坐标,排版与当时逐像素一致,
 * 不受后续字号/横竖排/框尺寸设置影响。
 */
import type { LaidOutDialogue, LayoutConfig } from './layout.ts';

export interface HistoryEntry {
  speaker: string;
  /** 原始台词(含标记) */
  source: string;
  /** 排版时的配置快照 */
  config: LayoutConfig;
  /** 冻结的排版结果 */
  layout: LaidOutDialogue;
  /** 记录时间戳(外部注入,便于测试) */
  at: number;
}

export class Backlog {
  private entries: HistoryEntry[] = [];
  private capacity: number;
  constructor(capacity = 200) {
    this.capacity = capacity;
  }

  push(entry: HistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
  }

  get length(): number {
    return this.entries.length;
  }

  /** 0 = 最早 */
  get(index: number): HistoryEntry | undefined {
    return this.entries[index];
  }

  /** 最新一条 */
  latest(): HistoryEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  all(): readonly HistoryEntry[] {
    return this.entries;
  }
}

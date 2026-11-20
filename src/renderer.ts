/**
 * Canvas 渲染器:按 GlyphRun 坐标逐字绘制,叠加抖字/渐显效果。
 * 每帧只画当前可见字形,排版结果预先算好,60fps 无压力。
 */
import type { GlyphRun, PageLayout } from './layout.ts';
import type { ParsedLine } from './markup.ts';
import { clusterAppearAt, hashNoise, type Timeline } from './timeline.ts';

export interface RenderState {
  /** 页内已流逝时间 ms;Infinity = 整页立即显示完 */
  pageTime: number;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  constructor(
    private canvas: HTMLCanvasElement,
    private fontFamily: string,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
  }

  /** 竖排标点偏移:。、等移到字框右上 */
  private static VERT_PUNCT = new Set([...'。、，．,．!！?？:：;；·・…‥ー―～~']);

  drawPage(
    page: PageLayout,
    parsed: ParsedLine,
    tl: Timeline,
    state: RenderState,
    originX: number,
    originY: number,
    mode: 'horizontal' | 'vertical',
  ): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const t = state.pageTime;
    const shakeTick = Math.floor(t / 33);

    for (const g of page.glyphs) {
      const appear = clusterAppearAt(tl, parsed, g.clusterIndex, page.firstCluster);
      if (t < appear) continue;
      const cluster = parsed.clusters[g.clusterIndex];
      const age = t - appear;

      let alpha = 1;
      if (cluster.fade > 0 && Number.isFinite(age)) {
        alpha = Math.min(1, age / cluster.fade);
      }
      let dx = 0;
      let dy = 0;
      if (cluster.shake > 0 && Number.isFinite(t)) {
        const a = cluster.shake;
        dx = (hashNoise(g.glyphIndex, shakeTick) * 2 - 1) * a;
        dy = (hashNoise(g.glyphIndex + 7919, shakeTick) * 2 - 1) * a;
      }
      // 竖排标点视觉修正
      let px = 0;
      let py = 0;
      if (mode === 'vertical' && !g.isRuby && CanvasRenderer.VERT_PUNCT.has(g.char)) {
        px = g.size * 0.32;
        py = -g.size * 0.32;
      }

      ctx.globalAlpha = alpha;
      ctx.font = `${g.size}px "${this.fontFamily}"`;
      const x = originX + g.x + dx + px;
      const y = originY + g.y + dy + py;
      if (g.rotate) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(g.char, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(g.char, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** 静态整页绘制(历史回放用,无效果) */
  drawPageStatic(page: PageLayout, originX: number, originY: number, mode: 'horizontal' | 'vertical'): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const g of page.glyphs) {
      let px = 0;
      let py = 0;
      if (mode === 'vertical' && !g.isRuby && CanvasRenderer.VERT_PUNCT.has(g.char)) {
        px = g.size * 0.32;
        py = -g.size * 0.32;
      }
      ctx.font = `${g.size}px "${this.fontFamily}"`;
      const x = originX + g.x + px;
      const y = originY + g.y + py;
      if (g.rotate) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(g.char, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(g.char, x, y);
      }
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }
}

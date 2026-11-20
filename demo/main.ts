/**
 * 浏览器演示:三语切换、横竖排切换、逐字演出、历史回放。
 * 字体为按需加载的剧本子集(tools/build-fonts.ts 生成)。
 */
import { VNEngine } from '../src/engine.ts';
import { CanvasRenderer } from '../src/renderer.ts';
import { SAMPLE_DIALOGUES, type Dialogue, type Lang } from '../src/script/corpus.ts';
import type { LayoutConfig, Measurer } from '../src/layout.ts';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const W = canvas.width;
const H = canvas.height;

// ---- 布局配置(横/竖两套文本框) ----
const BOX_H = { x: 40, y: 330, w: 880, h: 170 };
const BOX_V = { x: 600, y: 30, w: 320, h: 480 };

function makeConfig(mode: 'horizontal' | 'vertical'): LayoutConfig {
  const box = mode === 'horizontal' ? BOX_H : BOX_V;
  return {
    mode,
    boxWidth: box.w,
    boxHeight: box.h,
    fontSize: 26,
    lineHeight: 48,
    rubyScale: 0.5,
    padding: 16,
  };
}

// ---- 字体按需加载(每个语言包一个子集) ----
const familyOf = (lang: Lang) => `VN-${lang}`;
async function ensureFont(lang: Lang): Promise<void> {
  const fam = familyOf(lang);
  if (document.fonts.check(`16px "${fam}"`)) return;
  const buf = await (await fetch(`assets/vnfont-${lang}.ttf`)).arrayBuffer();
  const face = new FontFace(fam, buf);
  await face.load();
  document.fonts.add(face);
}

// ---- 测量器:用当前语言的字体量宽 ----
let currentLang: Lang = 'zh-Hans';
const mctx = document.createElement('canvas').getContext('2d')!;
const measurer: Measurer = {
  measure(ch, size) {
    mctx.font = `${size}px "${familyOf(currentLang)}"`;
    return mctx.measureText(ch).width;
  },
};

let mode: 'horizontal' | 'vertical' = 'horizontal';
const engine = new VNEngine({ config: makeConfig(mode), measurer, defaultMsPerChar: 45 });
let renderer = new CanvasRenderer(canvas, familyOf(currentLang));

// ---- 剧本推进 ----
let script: Dialogue[] = [];
let scriptIdx = 0;

async function setLang(lang: Lang): Promise<void> {
  currentLang = lang;
  await ensureFont(lang);
  renderer = new CanvasRenderer(canvas, familyOf(lang));
  script = SAMPLE_DIALOGUES.filter((d) => d.lang === lang);
  scriptIdx = 0;
  sayCurrent();
}

function sayCurrent(): void {
  const d = script[scriptIdx % script.length];
  engine.setConfig(makeConfig(mode));
  engine.say(d.speaker, d.text);
}

function advance(): void {
  if (!engine.click()) {
    scriptIdx++;
    sayCurrent();
  }
}

// ---- 历史回放 ----
let backlogOpen = false;
let backlogIdx = 0;
let backlogPage = 0;

// ---- 渲染循环 ----
let frames = 0;
let fps = 0;
let fpsT = performance.now();

function box(): { x: number; y: number; w: number; h: number } {
  return mode === 'horizontal' ? BOX_H : BOX_V;
}

function frame(): void {
  frames++;
  const now = performance.now();
  if (now - fpsT >= 1000) {
    fps = frames;
    frames = 0;
    fpsT = now;
  }
  const ctx = renderer.context;
  ctx.clearRect(0, 0, W, H);

  if (backlogOpen) {
    drawBacklog(ctx);
  } else {
    drawMain(ctx);
  }
  requestAnimationFrame(frame);
}

function drawMain(ctx: CanvasRenderingContext2D): void {
  const b = box();
  // 文本框
  ctx.fillStyle = 'rgba(10,14,22,0.72)';
  ctx.strokeStyle = '#4a5570';
  ctx.lineWidth = 1.5;
  roundRect(ctx, b.x, b.y, b.w, b.h, 10);
  ctx.fill();
  ctx.stroke();

  // 说话人
  ctx.fillStyle = '#e8ecf4';
  ctx.font = `20px "${familyOf(currentLang)}"`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(engine.speaker, b.x + 4, b.y - 10);

  // 正文(逐字+效果)
  const layout = engine.currentLayout;
  if (layout) {
    ctx.fillStyle = '#f2f4f8';
    renderer.drawPage(
      layout.pages[engine.page],
      engine.currentParsed,
      engine.currentTimeline,
      { pageTime: engine.pageTime },
      b.x,
      b.y,
      mode,
    );
  }

  // 翻页/继续指示
  if (engine.state !== 'typing') {
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#9fb4ff';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const ix = mode === 'horizontal' ? b.x + b.w - 18 : b.x + b.w / 2;
      const iy = mode === 'horizontal' ? b.y + b.h - 14 : b.y + b.h - 14;
      ctx.fillText('▼', ix, iy);
    }
  }

  // 状态栏
  ctx.fillStyle = '#66708a';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `${fps} fps | ${currentLang} | ${mode === 'horizontal' ? '横排' : '竖排'} | ` +
      `页 ${engine.page + 1}/${engine.pageCount} | 句 ${(scriptIdx % script.length) + 1}/${script.length}`,
    12,
    20,
  );
}

function drawBacklog(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(8,10,16,0.94)';
  ctx.fillRect(0, 0, W, H);
  const entry = engine.historyEntry(backlogIdx);
  ctx.fillStyle = '#8a93a6';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `历史回放 ${backlogIdx + 1}/${engine.backlog.length}  (←/→ 切换,↑/↓ 翻页,B/Esc 关闭)——排版快照冻结,与当时完全一致`,
    24,
    28,
  );
  if (!entry) return;
  const cfg = entry.config;
  const bw = cfg.boxWidth;
  const bh = cfg.boxHeight;
  const bx = (W - bw) / 2;
  const by = (H - bh) / 2 + 10;
  ctx.strokeStyle = '#4a5570';
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#e8ecf4';
  ctx.font = `18px "${familyOf(currentLang)}"`;
  ctx.fillText(entry.speaker, bx, by - 10);
  const page = entry.layout.pages[Math.min(backlogPage, entry.layout.pages.length - 1)];
  ctx.fillStyle = '#f2f4f8';
  renderer.drawPageStatic(page, bx, by, cfg.mode);
  ctx.fillStyle = '#66708a';
  ctx.font = '12px sans-serif';
  ctx.fillText(
    `页 ${Math.min(backlogPage, entry.layout.pages.length - 1) + 1}/${entry.layout.pages.length} | ${cfg.mode} | ${cfg.fontSize}px`,
    24,
    H - 20,
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- 交互 ----
canvas.addEventListener('click', () => {
  if (backlogOpen) return;
  advance();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'b' || e.key === 'B' || e.key === 'Escape') {
    if (e.key === 'Escape' && !backlogOpen) return;
    backlogOpen = !backlogOpen;
    if (backlogOpen) {
      backlogIdx = engine.backlog.length - 1;
      backlogPage = 0;
    }
    return;
  }
  if (backlogOpen) {
    if (e.key === 'ArrowLeft' && backlogIdx > 0) {
      backlogIdx--;
      backlogPage = 0;
    } else if (e.key === 'ArrowRight' && backlogIdx < engine.backlog.length - 1) {
      backlogIdx++;
      backlogPage = 0;
    } else if (e.key === 'ArrowUp' && backlogPage > 0) {
      backlogPage--;
    } else if (e.key === 'ArrowDown') {
      backlogPage++;
    }
    return;
  }
  if (e.key === 'v' || e.key === 'V') {
    mode = mode === 'horizontal' ? 'vertical' : 'horizontal';
    sayCurrent();
  } else if (e.key === '1') void setLang('zh-Hans');
  else if (e.key === '2') void setLang('zh-Hant');
  else if (e.key === '3') void setLang('ja');
  else if (e.key === ' ' || e.key === 'Enter') advance();
});

void setLang('zh-Hans').then(() => requestAnimationFrame(frame));

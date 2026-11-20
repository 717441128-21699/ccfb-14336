/**
 * 台词标记解析。
 *
 * 语法:
 *   {漢字|かんじ}     注音(ルビ/拼音/注音符号均可,正文可多个字)
 *   [speed=80]        之后每字毫秒数
 *   [wait=500]        停顿毫秒
 *   [shake=3]...[/shake]   抖字,振幅 px
 *   [fade=200]...[/fade]   逐字渐显,毫秒
 *   \n                强制换行
 *   {{ }} [ ] 转义: 用 \ 前缀,如 \{ \[
 */

export interface Cluster {
  /** 正文字(逐字;注音组可为多字) */
  chars: string[];
  /** 注音文本(无则 undefined) */
  ruby?: string;
  /** 抖字振幅 px,0 = 无 */
  shake: number;
  /** 渐显时长 ms,0 = 无 */
  fade: number;
  /** 强制换行标记(零宽,不绘制) */
  isLineBreak?: boolean;
}

export interface TimelineEvent {
  /** 在该下标的 cluster 之前生效 */
  beforeCluster: number;
  op: 'wait' | 'speed';
  value: number;
}

export interface ParsedLine {
  clusters: Cluster[];
  events: TimelineEvent[];
}

export function parseLine(src: string): ParsedLine {
  const clusters: Cluster[] = [];
  const events: TimelineEvent[] = [];
  // 效果栈,支持嵌套与恢复
  const shakeStack: number[] = [0];
  const fadeStack: number[] = [0];

  let i = 0;
  const n = src.length;

  const cur = (): Cluster => ({
    chars: [],
    shake: shakeStack[shakeStack.length - 1],
    fade: fadeStack[fadeStack.length - 1],
  });

  while (i < n) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < n && '{}[]\\'.includes(src[i + 1])) {
      const c = cur();
      c.chars.push(src[i + 1]);
      clusters.push(c);
      i += 2;
      continue;
    }
    if (ch === '{') {
      const end = src.indexOf('}', i + 1);
      if (end !== -1) {
        const body = src.slice(i + 1, end);
        const bar = body.indexOf('|');
        if (bar !== -1) {
          const base = body.slice(0, bar);
          const ruby = body.slice(bar + 1);
          if (base.length > 0 && ruby.length > 0) {
            const c = cur();
            c.chars = [...base];
            c.ruby = ruby;
            clusters.push(c);
            i = end + 1;
            continue;
          }
        }
      }
      // 不是合法注音,按普通字符
      const c = cur();
      c.chars.push(ch);
      clusters.push(c);
      i += 1;
      continue;
    }
    if (ch === '[') {
      const end = src.indexOf(']', i + 1);
      if (end !== -1) {
        const tag = src.slice(i + 1, end);
        const m = tag.match(/^(speed|wait|shake|fade)\s*=\s*(\d+(?:\.\d+)?)$/);
        if (m) {
          const v = Number(m[2]);
          if (m[1] === 'speed') events.push({ beforeCluster: clusters.length, op: 'speed', value: v });
          else if (m[1] === 'wait') events.push({ beforeCluster: clusters.length, op: 'wait', value: v });
          else if (m[1] === 'shake') shakeStack.push(v);
          else fadeStack.push(v);
          i = end + 1;
          continue;
        }
        if (tag === '/shake') { if (shakeStack.length > 1) shakeStack.pop(); i = end + 1; continue; }
        if (tag === '/fade') { if (fadeStack.length > 1) fadeStack.pop(); i = end + 1; continue; }
      }
      const c = cur();
      c.chars.push(ch);
      clusters.push(c);
      i += 1;
      continue;
    }
    if (ch === '\n') {
      clusters.push({ chars: [], shake: 0, fade: 0, isLineBreak: true });
      i += 1;
      continue;
    }
    const c = cur();
    c.chars.push(ch);
    clusters.push(c);
    i += 1;
  }
  return { clusters, events };
}

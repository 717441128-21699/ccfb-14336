/**
 * 极简 TTF 读写:只覆盖子集化所需的表
 * (head/maxp/hhea/hmtx/loca/glyf/cmap format 4,name/post/OS-2 原样拷贝)。
 * 仅支持 BMP(≤0xFFFF)码位,足够简中/繁中/日文剧本使用。
 */

export class Writer {
  bytes: number[] = [];
  u8(v: number): void { this.bytes.push(v & 0xff); }
  u16(v: number): void { this.bytes.push((v >> 8) & 0xff, v & 0xff); }
  i16(v: number): void { this.u16(v & 0xffff); }
  u32(v: number): void {
    this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }
  tag(s: string): void { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); }
  raw(b: Uint8Array): void { for (const x of b) this.bytes.push(x); }
  pad4(): void { while (this.bytes.length % 4 !== 0) this.bytes.push(0); }
  setU32(pos: number, v: number): void {
    this.bytes[pos] = (v >>> 24) & 0xff;
    this.bytes[pos + 1] = (v >>> 16) & 0xff;
    this.bytes[pos + 2] = (v >>> 8) & 0xff;
    this.bytes[pos + 3] = v & 0xff;
  }
  setU16(pos: number, v: number): void {
    this.bytes[pos] = (v >> 8) & 0xff;
    this.bytes[pos + 1] = v & 0xff;
  }
  toUint8Array(): Uint8Array { return new Uint8Array(this.bytes); }
}

export function u16at(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
export function i16at(b: Uint8Array, o: number): number {
  const v = u16at(b, o);
  return v >= 0x8000 ? v - 0x10000 : v;
}
export function u32at(b: Uint8Array, o: number): number {
  return ((b[o] * 0x1000000) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])) >>> 0;
}

/** 表校验和(按 4 字节对齐补零后求和) */
export function checksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = ((data[i] * 0x1000000) +
      ((data[i + 1] ?? 0) << 16) +
      ((data[i + 2] ?? 0) << 8) +
      (data[i + 3] ?? 0)) >>> 0;
    sum = (sum + v) >>> 0;
  }
  return sum;
}

export interface TableRec {
  tag: string;
  data: Uint8Array;
}

/** 打包 sfnt:目录按 tag 排序,自动算校验和与 checkSumAdjustment(要求含 head 表) */
export function buildSfnt(tables: TableRec[]): Uint8Array {
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const n = sorted.length;
  const maxPow2 = 2 ** Math.floor(Math.log2(n));
  const w = new Writer();
  w.u32(0x00010000);
  w.u16(n);
  w.u16(maxPow2 * 16);
  w.u16(Math.log2(maxPow2));
  w.u16(n * 16 - maxPow2 * 16);

  let offset = 12 + n * 16;
  const offsets: number[] = [];
  for (const t of sorted) {
    offsets.push(offset);
    offset += t.data.length;
    while (offset % 4 !== 0) offset++;
  }
  for (let i = 0; i < n; i++) {
    w.tag(sorted[i].tag);
    w.u32(checksum(sorted[i].data));
    w.u32(offsets[i]);
    w.u32(sorted[i].data.length);
  }
  let headFilePos = -1;
  for (let i = 0; i < n; i++) {
    if (sorted[i].tag === 'head') headFilePos = w.bytes.length + 8;
    w.raw(sorted[i].data);
    w.pad4();
  }
  const out = w.toUint8Array();
  if (headFilePos >= 0) {
    // checkSumAdjustment = 0xB1B0AFBA - 整个文件(该字段置 0)的校验和
    const total = checksum(out);
    const adj = (0xb1b0afba - total) >>> 0;
    out[headFilePos] = (adj >>> 24) & 0xff;
    out[headFilePos + 1] = (adj >>> 16) & 0xff;
    out[headFilePos + 2] = (adj >>> 8) & 0xff;
    out[headFilePos + 3] = adj & 0xff;
  }
  return out;
}

export interface TtfFont {
  buf: Uint8Array;
  tables: Map<string, { offset: number; length: number }>;
  numGlyphs: number;
  unitsPerEm: number;
  indexToLocFormat: number;
  numberOfHMetrics: number;
  loca: Uint32Array;
  cmap: Map<number, number>;
}

export function parseTtf(buf: Uint8Array): TtfFont {
  const numTables = u16at(buf, 4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    tables.set(tag, { offset: u32at(buf, o + 8), length: u32at(buf, o + 12) });
  }
  const need = (tag: string) => {
    const t = tables.get(tag);
    if (!t) throw new Error(`missing table ${tag}`);
    return t;
  };
  const head = need('head');
  const maxp = need('maxp');
  const hhea = need('hhea');
  const numGlyphs = u16at(buf, maxp.offset + 4);
  const indexToLocFormat = i16at(buf, head.offset + 50);
  const numberOfHMetrics = u16at(buf, hhea.offset + 34);
  const unitsPerEm = u16at(buf, head.offset + 18);

  const locaT = need('loca');
  const loca = new Uint32Array(numGlyphs + 1);
  for (let i = 0; i <= numGlyphs; i++) {
    loca[i] = indexToLocFormat === 0
      ? u16at(buf, locaT.offset + i * 2) * 2
      : u32at(buf, locaT.offset + i * 4);
  }

  const cmapT = need('cmap');
  const numSub = u16at(buf, cmapT.offset + 2);
  let cmap: Map<number, number> | null = null;
  for (let i = 0; i < numSub; i++) {
    const rec = cmapT.offset + 4 + i * 8;
    const subOff = cmapT.offset + u32at(buf, rec + 4);
    const format = u16at(buf, subOff);
    if (format === 4 && !cmap) {
      cmap = parseCmap4(buf.subarray(subOff, subOff + u16at(buf, subOff + 2)));
    }
  }
  if (!cmap) throw new Error('no cmap format 4 subtable');

  return {
    buf, tables, numGlyphs, unitsPerEm, indexToLocFormat, numberOfHMetrics, loca, cmap,
  };
}

function parseCmap4(sub: Uint8Array): Map<number, number> {
  const segCount = u16at(sub, 6) / 2;
  const endBase = 14;
  const startBase = endBase + segCount * 2 + 2;
  const deltaBase = startBase + segCount * 2;
  const roBase = deltaBase + segCount * 2;
  const map = new Map<number, number>();
  for (let i = 0; i < segCount; i++) {
    const end = u16at(sub, endBase + i * 2);
    const start = u16at(sub, startBase + i * 2);
    const delta = i16at(sub, deltaBase + i * 2);
    const ro = u16at(sub, roBase + i * 2);
    if (start === 0xffff && end === 0xffff) continue;
    for (let cp = start; cp <= end; cp++) {
      let gid: number;
      if (ro === 0) {
        gid = (cp + delta) & 0xffff;
      } else {
        const addr = roBase + i * 2 + ro + (cp - start) * 2;
        gid = u16at(sub, addr);
        if (gid !== 0) gid = (gid + delta) & 0xffff;
      }
      if (gid !== 0) map.set(cp, gid);
    }
  }
  return map;
}

/** 构造 cmap format 4 子表(glyphIdArray 方案,支持任意 gid 重排) */
export function buildCmap4(mapping: Map<number, number>): Uint8Array {
  const cps = [...mapping.keys()].sort((a, b) => a - b);
  // 连续码位合并为段
  const runs: { start: number; end: number }[] = [];
  for (const cp of cps) {
    const last = runs[runs.length - 1];
    if (last && cp === last.end + 1) last.end = cp;
    else runs.push({ start: cp, end: cp });
  }
  const segCount = runs.length + 1; // + 0xFFFF 终止段
  const maxPow2 = 2 ** Math.floor(Math.log2(segCount));
  const gidArray: number[] = [];
  const rangeOffsets: number[] = [];
  for (let i = 0; i < runs.length; i++) {
    // idRangeOffset[i] = 2 * (目标槽位 - 自身槽位),槽位以 u16 计、从 idRangeOffset 数组头起算
    rangeOffsets.push(2 * (segCount + gidArray.length - i));
    for (let cp = runs[i].start; cp <= runs[i].end; cp++) gidArray.push(mapping.get(cp)!);
  }
  rangeOffsets.push(0); // 终止段

  const length = 16 + segCount * 8 + gidArray.length * 2;
  const w = new Writer();
  w.u16(4); // format
  w.u16(length);
  w.u16(0); // language
  w.u16(segCount * 2);
  w.u16(maxPow2 * 2);
  w.u16(Math.log2(maxPow2));
  w.u16(segCount * 2 - maxPow2 * 2);
  for (const r of runs) w.u16(r.end);
  w.u16(0xffff);
  w.u16(0); // reservedPad
  for (const r of runs) w.u16(r.start);
  w.u16(0xffff);
  for (let i = 0; i < runs.length; i++) w.i16(0); // idDelta(glyphIdArray 方案不用)
  w.i16(1); // 终止段 delta
  for (const ro of rangeOffsets) w.u16(ro);
  for (const g of gidArray) w.u16(g);
  return w.toUint8Array();
}

/** 完整 cmap 表(单个 platform 3 / encoding 1 子表) */
export function buildCmapTable(mapping: Map<number, number>): Uint8Array {
  const sub = buildCmap4(mapping);
  const w = new Writer();
  w.u16(0); // version
  w.u16(1); // numTables
  w.u16(3); // platformID
  w.u16(1); // encodingID
  w.u32(12); // subtable offset
  w.raw(sub);
  return w.toUint8Array();
}

export function tableData(font: TtfFont, tag: string): Uint8Array {
  const t = font.tables.get(tag);
  if (!t) throw new Error(`missing table ${tag}`);
  return font.buf.subarray(t.offset, t.offset + t.length);
}

export function glyphData(font: TtfFont, gid: number): Uint8Array {
  const glyf = font.tables.get('glyf')!;
  const start = glyf.offset + font.loca[gid];
  const end = glyf.offset + font.loca[gid + 1];
  return font.buf.subarray(start, end);
}

/** 复合字形的组件 gid 列表(简单字形返回空) */
export function glyphComponents(data: Uint8Array): number[] {
  if (data.length < 10) return [];
  if (i16at(data, 0) !== -1) return [];
  const out: number[] = [];
  let o = 10;
  for (;;) {
    const flags = u16at(data, o);
    out.push(u16at(data, o + 2));
    o += 4;
    o += flags & 0x0001 ? 4 : 2; // args
    if (flags & 0x0008) o += 2;
    else if (flags & 0x0040) o += 4;
    else if (flags & 0x0080) o += 8;
    if (!(flags & 0x0020)) {
      if (flags & 0x0100) {
        const len = u16at(data, o);
        o += 2 + len;
      }
      break;
    }
  }
  return out;
}

/** 从一组 gid 出发,沿复合字形引用闭包扩展 */
export function glyphClosure(font: TtfFont, gids: Iterable<number>): Set<number> {
  const seen = new Set<number>([0]); // .notdef 永远保留
  const queue: number[] = [];
  for (const g of gids) {
    if (!seen.has(g)) {
      seen.add(g);
      queue.push(g);
    }
  }
  while (queue.length > 0) {
    const g = queue.pop()!;
    for (const c of glyphComponents(glyphData(font, g))) {
      if (!seen.has(c)) {
        seen.add(c);
        queue.push(c);
      }
    }
  }
  return seen;
}

export function getMetric(font: TtfFont, gid: number): { advance: number; lsb: number } {
  const hmtx = font.tables.get('hmtx')!;
  const b = font.buf;
  if (gid < font.numberOfHMetrics) {
    return {
      advance: u16at(b, hmtx.offset + gid * 4),
      lsb: i16at(b, hmtx.offset + gid * 4 + 2),
    };
  }
  const advance = u16at(b, hmtx.offset + (font.numberOfHMetrics - 1) * 4);
  const lsb = i16at(b, hmtx.offset + font.numberOfHMetrics * 4 + (gid - font.numberOfHMetrics) * 2);
  return { advance, lsb };
}

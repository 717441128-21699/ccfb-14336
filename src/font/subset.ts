/**
 * TTF 子集化:只保留剧本用到的字。
 * 重写 glyf/loca/hmtx/cmap,修补 head/maxp/hhea,其余表原样拷贝。
 */
import {
  buildCmapTable,
  buildSfnt,
  getMetric,
  glyphClosure,
  glyphData,
  i16at,
  parseTtf,
  tableData,
  u16at,
  Writer,
  type TableRec,
  type TtfFont,
} from './ttf.ts';

export interface SubsetResult {
  ttf: Uint8Array;
  glyphCount: number;
  /** 原字体里缺的码位 */
  missing: number[];
}

/** 复合字形:重写组件 gid 引用 */
function remapComposite(data: Uint8Array, map: Map<number, number>): Uint8Array {
  const w = new Writer();
  w.raw(data.subarray(0, 10));
  let o = 10;
  for (;;) {
    const flags = u16at(data, o);
    const gid = u16at(data, o + 2);
    const newGid = map.get(gid);
    if (newGid === undefined) throw new Error(`component gid ${gid} not in subset`);
    w.u16(flags);
    w.u16(newGid);
    o += 4;
    const argBytes = flags & 0x0001 ? 4 : 2;
    w.raw(data.subarray(o, o + argBytes));
    o += argBytes;
    let extra = 0;
    if (flags & 0x0008) extra = 2;
    else if (flags & 0x0040) extra = 4;
    else if (flags & 0x0080) extra = 8;
    w.raw(data.subarray(o, o + extra));
    o += extra;
    if (!(flags & 0x0020)) {
      if (flags & 0x0100) {
        const len = u16at(data, o);
        w.raw(data.subarray(o, o + 2 + len));
        o += 2 + len;
      }
      break;
    }
  }
  return w.toUint8Array();
}

export function subsetFont(buf: Uint8Array, codepoints: Iterable<number>): SubsetResult {
  const font = parseTtf(buf);
  const missing: number[] = [];
  const wanted = new Set<number>();
  for (const cp of codepoints) {
    const gid = font.cmap.get(cp);
    if (gid === undefined) missing.push(cp);
    else wanted.add(gid);
  }
  const closure = glyphClosure(font, wanted);
  // 新 gid 顺序:0 = .notdef,其余按原 gid 升序(确定性输出)
  const oldGids = [...closure].sort((a, b) => a - b);
  const gidMap = new Map<number, number>();
  oldGids.forEach((g, i) => gidMap.set(g, i));
  const newNumGlyphs = oldGids.length;

  // glyf + loca(long 格式)
  const glyfW = new Writer();
  const locaW = new Writer();
  for (const oldGid of oldGids) {
    locaW.u32(glyfW.bytes.length);
    let data = glyphData(font, oldGid);
    if (data.length >= 10 && i16at(data, 0) === -1) {
      data = remapComposite(data, gidMap);
    }
    glyfW.raw(data);
    glyfW.pad4();
  }
  locaW.u32(glyfW.bytes.length);

  // hmtx:全部展开为长条目
  const hmtxW = new Writer();
  for (const oldGid of oldGids) {
    const m = getMetric(font, oldGid);
    hmtxW.u16(m.advance);
    hmtxW.i16(m.lsb);
  }

  // cmap:码位 → 新 gid
  const cmapMap = new Map<number, number>();
  for (const [cp, gid] of font.cmap) {
    const ng = gidMap.get(gid);
    if (ng !== undefined) cmapMap.set(cp, ng);
  }

  // 修补表
  const head = new Uint8Array(tableData(font, 'head'));
  head[8] = head[9] = head[10] = head[11] = 0; // checkSumAdjustment 置 0
  head[50] = 0;
  head[51] = 1; // indexToLocFormat = long
  const maxp = new Uint8Array(tableData(font, 'maxp'));
  maxp[4] = (newNumGlyphs >> 8) & 0xff;
  maxp[5] = newNumGlyphs & 0xff;
  const hhea = new Uint8Array(tableData(font, 'hhea'));
  hhea[34] = (newNumGlyphs >> 8) & 0xff;
  hhea[35] = newNumGlyphs & 0xff;

  const tables: TableRec[] = [
    { tag: 'cmap', data: buildCmapTable(cmapMap) },
    { tag: 'glyf', data: glyfW.toUint8Array() },
    { tag: 'head', data: head },
    { tag: 'hhea', data: hhea },
    { tag: 'hmtx', data: hmtxW.toUint8Array() },
    { tag: 'loca', data: locaW.toUint8Array() },
    { tag: 'maxp', data: maxp },
  ];
  for (const tag of ['OS/2', 'name', 'post']) {
    if (font.tables.has(tag)) tables.push({ tag, data: tableData(font, tag) });
  }

  return { ttf: buildSfnt(tables), glyphCount: newNumGlyphs, missing };
}

/** 字表统计:从剧本行收集码位(经标记解析,含注音文本) */
export function collectScriptCodepoints(
  lines: string[],
  parse: (s: string) => { clusters: { chars: string[]; ruby?: string }[] },
): Set<number> {
  const out = new Set<number>();
  const addStr = (s: string) => {
    for (const ch of s) out.add(ch.codePointAt(0)!);
  };
  for (const line of lines) {
    for (const c of parse(line).clusters) {
      for (const ch of c.chars) addStr(ch);
      if (c.ruby) addStr(c.ruby);
    }
  }
  return out;
}

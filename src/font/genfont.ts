/**
 * 合成测试字体生成器:为给定码位生成合法 TTF。
 * 字形是码位确定性派生的"方框+笔画"图案(字体样张自造,无版权问题),
 * 排版/子集化/加载链路走的都是真实 TTF 格式。
 */
import {
  buildCmapTable,
  buildSfnt,
  Writer,
  type TableRec,
} from './ttf.ts';

export interface GenFontOptions {
  codepoints: number[];
  /** 复合字形:码位 → 引用的组件码位(测试子集化闭包用) */
  composites?: Map<number, number[]>;
  familyName?: string;
  upm?: number;
}

const UPM = 1000;
const ASCENT = 880;
const DESCENT = -120;

interface Contour {
  pts: [number, number][];
}

/** 码位 → 确定性伪随机数(0..1) */
function rand(cp: number, salt: number): number {
  let h = (cp * 2654435761 + salt * 40503) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 0xffffffff;
}

function rect(x0: number, y0: number, x1: number, y1: number): Contour {
  return { pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] };
}

/** 伪字形:外框 + 1~3 根内笔画,形状随码位变化 */
function pseudoGlyph(cp: number): Contour[] {
  if (cp === 0x20) return []; // 空格无轮廓
  const inset = 60 + Math.floor(rand(cp, 1) * 60);
  const contours: Contour[] = [rect(inset, 0, UPM - inset, 760)];
  const strokes = 1 + Math.floor(rand(cp, 2) * 3);
  for (let i = 0; i < strokes; i++) {
    const y = 120 + Math.floor(rand(cp, 3 + i) * 520);
    const x0 = inset + 60 + Math.floor(rand(cp, 7 + i) * 200);
    const x1 = UPM - inset - 60 - Math.floor(rand(cp, 11 + i) * 200);
    contours.push(rect(Math.min(x0, x1), y, Math.max(x0, x1), y + 56));
  }
  return contours;
}

function simpleGlyph(contours: Contour[]): { data: Uint8Array; bbox: number[] } {
  let pts = 0;
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const c of contours) {
    for (const [x, y] of c.pts) {
      xMin = Math.min(xMin, x); yMin = Math.min(yMin, y);
      xMax = Math.max(xMax, x); yMax = Math.max(yMax, y);
    }
    pts += c.pts.length;
  }
  if (pts === 0) {
    return { data: new Uint8Array(0), bbox: [0, 0, 0, 0] };
  }
  const w = new Writer();
  w.i16(contours.length);
  w.i16(xMin); w.i16(yMin); w.i16(xMax); w.i16(yMax);
  let end = -1;
  for (const c of contours) {
    end += c.pts.length;
    w.u16(end);
  }
  w.u16(0); // instructionLength
  for (let i = 0; i < pts; i++) w.u8(0x01); // 全部 on-curve,16 位坐标
  for (const c of contours) {
    let prev = 0;
    for (const [x] of c.pts) { w.i16(x - prev); prev = x; }
  }
  for (const c of contours) {
    let prev = 0;
    for (const [, y] of c.pts) { w.i16(y - prev); prev = y; }
  }
  return { data: w.toUint8Array(), bbox: [xMin, yMin, xMax, yMax] };
}

function compositeGlyph(
  components: { gid: number; dx: number; dy: number }[],
  bbox: number[],
): Uint8Array {
  const w = new Writer();
  w.i16(-1);
  w.i16(bbox[0]); w.i16(bbox[1]); w.i16(bbox[2]); w.i16(bbox[3]);
  components.forEach((c, i) => {
    const more = i < components.length - 1 ? 0x0020 : 0;
    w.u16(0x0001 | 0x0002 | more); // words args + xy values
    w.u16(c.gid);
    w.i16(c.dx);
    w.i16(c.dy);
  });
  return w.toUint8Array();
}

export function generateFont(opts: GenFontOptions): Uint8Array {
  const cps = [...new Set(opts.codepoints)].sort((a, b) => a - b);
  const family = opts.familyName ?? 'VNTestFont';
  const gidOf = new Map<number, number>();
  cps.forEach((cp, i) => gidOf.set(cp, i + 1));
  const numGlyphs = cps.length + 1;

  // 先算简单字形,再算复合(组件 bbox 需要)
  const glyphDatas: Uint8Array[] = new Array(numGlyphs);
  const bboxes: number[][] = new Array(numGlyphs);
  glyphDatas[0] = simpleGlyph([rect(80, 0, UPM - 80, 760)]).data; // .notdef
  bboxes[0] = [80, 0, UPM - 80, 760];

  const simpleCache = new Map<number, { data: Uint8Array; bbox: number[] }>();
  for (const cp of cps) {
    if (opts.composites?.has(cp)) continue;
    const g = simpleGlyph(pseudoGlyph(cp));
    simpleCache.set(cp, g);
    glyphDatas[gidOf.get(cp)!] = g.data;
    bboxes[gidOf.get(cp)!] = g.bbox;
  }
  if (opts.composites) {
    for (const [cp, parts] of opts.composites) {
      const comps = parts.map((p, i) => {
        const g = gidOf.get(p);
        if (g === undefined) throw new Error(`composite part U+${p.toString(16)} not in font`);
        return { gid: g, dx: 0, dy: i * 0 };
      });
      // bbox = 组件 bbox 并集
      let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
      for (const c of comps) {
        const b = bboxes[c.gid];
        xMin = Math.min(xMin, b[0]); yMin = Math.min(yMin, b[1]);
        xMax = Math.max(xMax, b[2]); yMax = Math.max(yMax, b[3]);
      }
      const bbox = [xMin, yMin, xMax, yMax];
      const gid = gidOf.get(cp)!;
      glyphDatas[gid] = compositeGlyph(comps, bbox);
      bboxes[gid] = bbox;
    }
  }

  // glyf + loca
  const glyfW = new Writer();
  const locaW = new Writer();
  for (let i = 0; i < numGlyphs; i++) {
    locaW.u32(glyfW.bytes.length);
    glyfW.raw(glyphDatas[i]);
    glyfW.pad4();
  }
  locaW.u32(glyfW.bytes.length);

  // hmtx(全部长条目)
  const hmtxW = new Writer();
  const advanceOf = (cp: number) => (cp < 0x2e80 ? 500 : UPM);
  hmtxW.u16(UPM); hmtxW.i16(80); // .notdef
  for (const cp of cps) {
    hmtxW.u16(advanceOf(cp));
    hmtxW.i16(bboxes[gidOf.get(cp)!][0]);
  }

  // maxp:统计真实最大值
  let maxPoints = 0, maxContours = 0, maxCompElements = 0;
  for (const cp of cps) {
    if (opts.composites?.has(cp)) {
      maxCompElements = Math.max(maxCompElements, opts.composites.get(cp)!.length);
    } else {
      const g = simpleCache.get(cp)!;
      if (g.data.length >= 2) {
        const nc = (g.data[0] << 8) | g.data[1];
        maxContours = Math.max(maxContours, nc);
      }
    }
  }
  for (const cp of cps) {
    if (!opts.composites?.has(cp)) {
      // 每轮廓 4 点
      maxPoints = Math.max(maxPoints, pseudoGlyph(cp).length * 4);
    }
  }

  const maxpW = new Writer();
  maxpW.u32(0x00010000);
  maxpW.u16(numGlyphs);
  maxpW.u16(maxPoints);
  maxpW.u16(maxContours);
  maxpW.u16(0); // maxCompositePoints
  maxpW.u16(0); // maxCompositeContours
  maxpW.u16(2); // maxZones
  maxpW.u16(0); // maxTwilightPoints
  maxpW.u16(0); // maxStorage
  maxpW.u16(0); // maxFunctionDefs
  maxpW.u16(0); // maxInstructionDefs
  maxpW.u16(0); // maxStackElements
  maxpW.u16(0); // maxSizeOfInstructions
  maxpW.u16(maxCompElements);
  maxpW.u16(maxCompElements > 0 ? 1 : 0); // maxComponentDepth

  const fontXMin = Math.min(...bboxes.map((b) => b[0]));
  const fontYMin = Math.min(...bboxes.map((b) => b[1]));
  const fontXMax = Math.max(...bboxes.map((b) => b[2]));
  const fontYMax = Math.max(...bboxes.map((b) => b[3]));

  const headW = new Writer();
  headW.u32(0x00010000); // version
  headW.u32(0x00010000); // fontRevision
  headW.u32(0); // checkSumAdjustment(buildSfnt 回填)
  headW.u32(0x5f0f3cf5); // magic
  headW.u16(0); // flags
  headW.u16(UPM);
  headW.u32(0); headW.u32(0); // created
  headW.u32(0); headW.u32(0); // modified
  headW.i16(fontXMin); headW.i16(fontYMin); headW.i16(fontXMax); headW.i16(fontYMax);
  headW.u16(0); // macStyle
  headW.u16(8); // lowestRecPPEM
  headW.i16(2); // fontDirectionHint
  headW.i16(1); // indexToLocFormat = long
  headW.i16(0); // glyphDataFormat

  const hheaW = new Writer();
  hheaW.u32(0x00010000);
  hheaW.i16(ASCENT); hheaW.i16(DESCENT); hheaW.i16(0);
  hheaW.u16(UPM); // advanceWidthMax
  hheaW.i16(fontXMin); // minLeftSideBearing
  hheaW.i16(0); // minRightSideBearing
  hheaW.i16(fontXMax); // xMaxExtent
  hheaW.i16(1); hheaW.i16(0); hheaW.i16(0); // caret
  hheaW.i16(0); hheaW.i16(0); hheaW.i16(0); hheaW.i16(0); // reserved
  hheaW.i16(0); // metricDataFormat
  hheaW.u16(numGlyphs); // numberOfHMetrics

  const os2W = new Writer();
  os2W.u16(0); // version
  os2W.i16(500); // xAvgCharWidth
  os2W.u16(400); // usWeightClass
  os2W.u16(5); // usWidthClass
  os2W.u16(0); // fsType(可嵌入)
  for (let i = 0; i < 8; i++) os2W.i16(0); // sub/superscript 占位
  os2W.i16(50); os2W.i16(250); // strikeout size/pos
  os2W.i16(0); // sFamilyClass
  for (let i = 0; i < 10; i++) os2W.u8(0); // panose
  os2W.u32(0); os2W.u32(0); os2W.u32(0); os2W.u32(0); // unicode ranges
  os2W.tag('VNTE'); // vendor
  os2W.u16(0x0040); // fsSelection = REGULAR
  os2W.u16(cps[0] ?? 0x20); // firstChar
  os2W.u16(cps[cps.length - 1] ?? 0x20); // lastChar
  os2W.i16(ASCENT); os2W.i16(DESCENT); os2W.i16(0); // typo metrics
  os2W.u16(ASCENT); os2W.u16(-DESCENT); // win metrics

  const postW = new Writer();
  postW.u32(0x00030000); // version 3(无字形名)
  postW.u32(0); // italicAngle
  postW.i16(-100); postW.i16(50); // underline
  postW.u32(0); postW.u32(0); postW.u32(0); postW.u32(0); postW.u32(0);

  // name 表(UTF-16BE)
  const nameW = new Writer();
  const names: [number, string][] = [
    [1, family],
    [2, 'Regular'],
    [4, `${family} Regular`],
    [6, family.replace(/\s/g, '')],
  ];
  const storage = new Writer();
  nameW.u16(0); // format
  nameW.u16(names.length);
  nameW.u16(6 + names.length * 12); // stringOffset
  for (const [id, str] of names) {
    nameW.u16(3); nameW.u16(1); nameW.u16(0x0409);
    nameW.u16(id);
    nameW.u16(str.length * 2);
    nameW.u16(storage.bytes.length);
    for (const ch of str) storage.u16(ch.charCodeAt(0));
  }
  nameW.raw(storage.toUint8Array());

  const cmapMap = new Map<number, number>();
  for (const cp of cps) cmapMap.set(cp, gidOf.get(cp)!);

  const tables: TableRec[] = [
    { tag: 'OS/2', data: os2W.toUint8Array() },
    { tag: 'cmap', data: buildCmapTable(cmapMap) },
    { tag: 'glyf', data: glyfW.toUint8Array() },
    { tag: 'head', data: headW.toUint8Array() },
    { tag: 'hhea', data: hheaW.toUint8Array() },
    { tag: 'hmtx', data: hmtxW.toUint8Array() },
    { tag: 'loca', data: locaW.toUint8Array() },
    { tag: 'maxp', data: maxpW.toUint8Array() },
    { tag: 'name', data: nameW.toUint8Array() },
    { tag: 'post', data: postW.toUint8Array() },
  ];
  return buildSfnt(tables);
}

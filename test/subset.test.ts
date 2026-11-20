import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFont } from '../src/font/genfont.ts';
import { subsetFont } from '../src/font/subset.ts';
import { checksum, glyphComponents, glyphData, parseTtf } from '../src/font/ttf.ts';

const CPS = [0x41, 0x42, 0x4e00, 0x4e01, 0x4e02, 0x3042];

test('合成字体可解析,cmap 正确', () => {
  const font = parseTtf(generateFont({ codepoints: CPS }));
  assert.equal(font.numGlyphs, CPS.length + 1);
  assert.equal(font.cmap.get(0x41), 1);
  assert.equal(font.cmap.get(0x4e02), 6); // 码位排序后 0x4E02 是第 6 个字形
  assert.equal(font.unitsPerEm, 1000);
});

test('子集化:只保留用到的字,文件校验和合法', () => {
  const full = generateFont({ codepoints: CPS });
  const sub = subsetFont(full, [0x41, 0x4e00, 0x3042]);
  assert.equal(sub.glyphCount, 4); // .notdef + 3
  assert.deepEqual(sub.missing, []);
  const font = parseTtf(sub.ttf);
  assert.equal(font.numGlyphs, 4);
  assert.ok(font.cmap.has(0x41));
  assert.ok(font.cmap.has(0x4e00));
  assert.ok(font.cmap.has(0x3042));
  assert.ok(!font.cmap.has(0x42));
  // checkSumAdjustment:整个文件校验和应为 0xB1B0AFBA
  assert.equal(checksum(sub.ttf), 0xb1b0afba);
  // 子集应显著小于全量
  assert.ok(sub.ttf.length < full.length);
});

test('子集化:复合字形组件进入闭包且引用被重映射', () => {
  const composites = new Map([[0x4e02, [0x4e00, 0x41]]]);
  const full = generateFont({ codepoints: CPS, composites });
  // 只请求复合字本身 → 组件 0x4E00 / 0x41 必须被闭包拉进来
  const sub = subsetFont(full, [0x4e02]);
  assert.equal(sub.glyphCount, 4); // .notdef + 4E02 + 4E00 + 41
  const font = parseTtf(sub.ttf);
  assert.ok(font.cmap.has(0x4e02));
  assert.ok(font.cmap.has(0x4e00));
  assert.ok(font.cmap.has(0x41));
  assert.ok(!font.cmap.has(0x42));
  // 复合字的组件引用应指向子集内的新 gid
  const gid = font.cmap.get(0x4e02)!;
  const comps = glyphComponents(glyphData(font, gid));
  assert.equal(comps.length, 2);
  const reverse = new Map<number, number>();
  for (const [cp, g] of font.cmap) reverse.set(g, cp);
  assert.deepEqual(
    comps.map((g) => reverse.get(g)).sort((a, b) => a! - b!),
    [0x41, 0x4e00],
  );
});

test('子集化:缺失码位如实报告', () => {
  const full = generateFont({ codepoints: [0x41] });
  const sub = subsetFont(full, [0x41, 0x4e9c]);
  assert.deepEqual(sub.missing, [0x4e9c]);
});

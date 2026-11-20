import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../src/markup.ts';
import { collectScriptCodepoints, subsetFont } from '../src/font/subset.ts';
import { generateFont } from '../src/font/genfont.ts';
import { byLang, generateCorpus, SAMPLE_DIALOGUES } from '../src/script/corpus.ts';

test('性能:一万句字表统计 + 三语切子集 < 10s', () => {
  const dialogues = [...SAMPLE_DIALOGUES, ...generateCorpus(10000)];
  const lines = dialogues.map((d) => d.text);

  const t0 = performance.now();
  const used = collectScriptCodepoints(lines, parseLine);
  for (let cp = 0x20; cp < 0x7f; cp++) used.add(cp);
  const t1 = performance.now();

  // 全量字库(用到的字 + 4000 填充字)
  const fullSet = new Set(used);
  for (let i = 0; fullSet.size < used.size + 4000; i++) {
    fullSet.add(0x4e00 + ((i * 149) % 0x5fff));
  }
  const fullFont = generateFont({ codepoints: [...fullSet] });

  let subsetMs = 0;
  const groups = byLang(dialogues);
  assert.equal(groups.size, 3);
  for (const [, langLines] of groups) {
    const cps = collectScriptCodepoints(langLines, parseLine);
    for (let cp = 0x20; cp < 0x7f; cp++) cps.add(cp);
    const s0 = performance.now();
    const sub = subsetFont(fullFont, cps);
    subsetMs += performance.now() - s0;
    assert.deepEqual(sub.missing, []);
    assert.ok(sub.ttf.length < fullFont.length);
  }
  const total = t1 - t0 + subsetMs;
  console.log(
    `  字表统计 ${Math.round(t1 - t0)}ms,三语切子集 ${Math.round(subsetMs)}ms,` +
      `合计 ${Math.round(total)}ms(字表 ${used.size} 字,全量 ${fullSet.size} 字)`,
  );
  assert.ok(total < 10_000, `字表统计+切子集 ${Math.round(total)}ms 超过 10s`);
});

test('语料生成确定性', () => {
  const a = generateCorpus(100);
  const b = generateCorpus(100);
  assert.deepEqual(a, b);
  assert.equal(a.length, 100);
});

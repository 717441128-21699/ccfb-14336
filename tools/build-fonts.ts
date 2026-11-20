/**
 * 字体打包管线:
 *   1. 统计剧本(样例 + 一万句语料)用到的全部字符(含注音)
 *   2. 生成"全量"测试字体(额外填充 4000 字,模拟真实字库)
 *   3. 按语言切子集,写出 demo/assets/*.ttf 与打包报告
 * 性能要求:一万句的字表统计 + 切子集 < 10s。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLine } from '../src/markup.ts';
import { collectScriptCodepoints, subsetFont } from '../src/font/subset.ts';
import { generateFont } from '../src/font/genfont.ts';
import { byLang, generateCorpus, SAMPLE_DIALOGUES, type Lang } from '../src/script/corpus.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'demo', 'assets');
mkdirSync(assetsDir, { recursive: true });

const allDialogues = [...SAMPLE_DIALOGUES, ...generateCorpus(10000)];
const allLines = allDialogues.map((d) => d.text);

// 1. 字表统计
const t0 = performance.now();
const used = collectScriptCodepoints(allLines, parseLine);
// UI 与标点兜底:可打印 ASCII + 常用 CJK 标点
for (let cp = 0x20; cp < 0x7f; cp++) used.add(cp);
for (const ch of '。、,!?;:…‥「」『』【】()〈〉《》—―ー・~～') used.add(ch.codePointAt(0)!);
const t1 = performance.now();

// 2. 全量字体 = 用到的字 + 4000 个填充字(模拟真实字库规模)
const fullSet = new Set(used);
for (let i = 0; fullSet.size < used.size + 4000; i++) {
  fullSet.add(0x4e00 + ((i * 149) % 0x5fff));
}
const fullFont = generateFont({ codepoints: [...fullSet] });
writeFileSync(join(assetsDir, 'vnfont-full.ttf'), fullFont);
const t2 = performance.now();

// 3. 按语言切子集(共享标点/ASCII 并入每个包)
const shared = new Set<number>();
for (let cp = 0x20; cp < 0x7f; cp++) shared.add(cp);
for (const ch of '。、,!?;:…‥「」『』【】()〈〉《》—―ー・~～') shared.add(ch.codePointAt(0)!);

const groups = byLang(allDialogues);
const report: Record<string, unknown> = {
  totalLines: allLines.length,
  uniqueChars: used.size,
  fullFontBytes: fullFont.length,
  statsMs: Math.round(t1 - t0),
  genFullMs: Math.round(t2 - t1),
  subsets: {} as Record<string, unknown>,
};

let subsetMsTotal = 0;
for (const [lang, lines] of groups) {
  const cps = collectScriptCodepoints(lines, parseLine);
  for (const cp of shared) cps.add(cp);
  const s0 = performance.now();
  const sub = subsetFont(fullFont, cps);
  const ms = performance.now() - s0;
  subsetMsTotal += ms;
  const name = `vnfont-${lang}.ttf`;
  writeFileSync(join(assetsDir, name), sub.ttf);
  (report.subsets as Record<string, unknown>)[lang] = {
    file: name,
    chars: cps.size,
    glyphs: sub.glyphCount,
    bytes: sub.ttf.length,
    missing: sub.missing.length,
    subsetMs: Math.round(ms),
  };
}
const t3 = performance.now();
report.subsetMsTotal = Math.round(subsetMsTotal);
report.pipelineMs = Math.round(t3 - t0);

writeFileSync(join(assetsDir, 'glyph-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const statsAndSubset = t1 - t0 + subsetMsTotal;
if (statsAndSubset > 10_000) {
  console.error(`FAIL: 字表统计+切子集耗时 ${Math.round(statsAndSubset)}ms > 10s`);
  process.exit(1);
}
console.log(`OK: 字表统计+切子集 ${Math.round(statsAndSubset)}ms(< 10s)`);

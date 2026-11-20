import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../src/markup.ts';
import {
  breakLines,
  layoutDialogue,
  measureCluster,
  paginate,
  type LayoutConfig,
  type Measurer,
} from '../src/layout.ts';
import { NO_LINE_START } from '../src/kinsoku.ts';

/** 定宽测量:CJK 全宽,ASCII 半宽 */
const meas: Measurer = {
  measure: (ch, size) => (ch.codePointAt(0)! >= 0x2e80 ? size : size * 0.5),
};

const cfg = (over: Partial<LayoutConfig> = {}): LayoutConfig => ({
  mode: 'horizontal',
  boxWidth: 50,
  boxHeight: 180,
  fontSize: 10,
  lineHeight: 18,
  rubyScale: 0.5,
  padding: 0,
  ...over,
});

test('避头:行首禁则字悬垂,不落到行首', () => {
  const lines = breakLines(parseLine('あいうえお、き'), cfg(), meas);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].clusters.map((c) => c.cluster.chars[0]).join(''), 'あいうえお、');
  assert.equal(lines[1].clusters[0].cluster.chars[0], 'き');
});

test('避头:小假名・长音不落到行首', () => {
  for (const ch of ['っ', 'ゃ', 'ー', '々']) {
    const lines = breakLines(parseLine(`あいうえお${ch}き`), cfg(), meas);
    for (const line of lines) {
      const first = line.clusters[0]?.cluster.chars[0];
      if (first) assert.ok(!NO_LINE_START.has(first), `行首出现禁则字 ${first}`);
    }
  }
});

test('避尾:开括号追出到下一行', () => {
  const lines = breakLines(parseLine('あいうえ「き」'), cfg(), meas);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].clusters.map((c) => c.cluster.chars[0]).join(''), 'あいうえ');
  assert.equal(lines[1].clusters[0].cluster.chars[0], '「');
});

test('注音比正文长时正文字距自动拉开', () => {
  const p = parseLine('{漢|かんじ}');
  const m = measureCluster(p.clusters[0], cfg(), meas);
  // 正文 10,注音 3 字 × 5 = 15 → 占位 15,正文步进拉宽到 15
  assert.equal(m.width, 15);
  assert.deepEqual(m.advances, [15]);
});

test('注音短于正文时不拉开', () => {
  const p = parseLine('{漢字|かん}');
  const m = measureCluster(p.clusters[0], cfg(), meas);
  assert.equal(m.width, 20);
  assert.deepEqual(m.advances, [10, 10]);
});

test('分页:按句读位置切页', () => {
  // 5 句,每句 20 字(容量 10 → 每句 2 行),每页 3 行 → 应在句末(第 2 行)切
  const text = Array.from({ length: 5 }, () => 'あいうえおかきくけこさしすせそたちつて。').join('');
  const c = cfg({ boxWidth: 100, boxHeight: 54 }); // perPage = 3
  const lines = breakLines(parseLine(text), c, meas);
  assert.equal(lines.length, 10);
  const pages = paginate(lines, c);
  assert.equal(pages.length, 5);
  for (const page of pages) {
    assert.equal(page.length, 2);
    assert.ok(page[page.length - 1].endsSentence);
  }
});

test('分页:注音和它的汉字不拆到两页', () => {
  // 构造让注音组正好落在页边界附近
  const head = 'あ。'.repeat(14); // 28 字
  const text = head + '{漢字|かんじ}' + 'い。'.repeat(14);
  const c = cfg({ boxWidth: 100, boxHeight: 36 }); // perPage = 2
  const laid = layoutDialogue(parseLine(text), c, meas);
  assert.ok(laid.pages.length > 1);
  // 每个 cluster 的全部字形(正文+注音)必须在同一页
  const clusterPage = new Map<number, number>();
  laid.pages.forEach((page, pi) => {
    for (const g of page.glyphs) {
      const existing = clusterPage.get(g.clusterIndex);
      if (existing !== undefined && existing !== pi) {
        assert.fail(`cluster ${g.clusterIndex} 被拆到第 ${existing} 页和第 ${pi} 页`);
      }
      clusterPage.set(g.clusterIndex, pi);
    }
  });
  // 确认注音组确实存在且完整落在某一页
  const rubyCluster = 28; // head 28 字之后就是 {漢字|かんじ}
  assert.ok(clusterPage.has(rubyCluster));
});

test('竖排:列从右往左,拉丁字母旋转', () => {
  const c = cfg({ mode: 'vertical', boxWidth: 200, boxHeight: 100, lineHeight: 20 });
  const laid = layoutDialogue(parseLine('あいうえおかきくけこA1'), c, meas);
  const page = laid.pages[0];
  const col0 = page.glyphs.filter((g) => !g.isRuby && g.clusterIndex < 10);
  const col1 = page.glyphs.filter((g) => !g.isRuby && g.clusterIndex >= 10);
  assert.ok(col0.every((g) => g.x === 190), `第 1 列 x 应为 190,实际 ${col0[0]?.x}`);
  assert.ok(col1.every((g) => g.x === 170), `第 2 列 x 应为 170,实际 ${col1[0]?.x}`);
  assert.ok(col1[0].y < col1[1].y, '列内自上而下');
  const latin = page.glyphs.filter((g) => g.char === 'A' || g.char === '1');
  assert.ok(latin.every((g) => g.rotate), '竖排拉丁应旋转');
});

test('竖排避头尾同样生效', () => {
  const c = cfg({ mode: 'vertical', boxWidth: 200, boxHeight: 50, lineHeight: 20 });
  const lines = breakLines(parseLine('あいうえお、き'), c, meas);
  assert.equal(lines[0].clusters.map((x) => x.cluster.chars[0]).join(''), 'あいうえお、');
});

test('句末带闭引号也算句读', () => {
  const lines = breakLines(parseLine('あいうえお。」き'), cfg({ boxWidth: 70 }), meas);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].endsSentence);
});

test('排版确定性:同一输入两次结果一致', () => {
  const text = '「{漢字|かんじ}のテスト、[shake=3]確認[/shake]します。」';
  const a = layoutDialogue(parseLine(text), cfg({ boxWidth: 120 }), meas);
  const b = layoutDialogue(parseLine(text), cfg({ boxWidth: 120 }), meas);
  assert.deepEqual(
    a.pages.map((p) => p.glyphs),
    b.pages.map((p) => p.glyphs),
  );
});

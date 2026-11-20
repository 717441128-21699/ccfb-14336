import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VNEngine } from '../src/engine.ts';
import type { LayoutConfig, Measurer } from '../src/layout.ts';

const meas: Measurer = {
  measure: (ch, size) => (ch.codePointAt(0)! >= 0x2e80 ? size : size * 0.5),
};

const cfg: LayoutConfig = {
  mode: 'horizontal',
  boxWidth: 200,
  boxHeight: 90,
  fontSize: 10,
  lineHeight: 18,
  rubyScale: 0.5,
  padding: 0,
};

function makeEngine(now: () => number) {
  return new VNEngine({ config: cfg, measurer: meas, defaultMsPerChar: 50, now });
}

test('历史回放:排版快照冻结,不随后续配置变化', () => {
  let t = 0;
  const engine = makeEngine(() => t);
  engine.say('甲', '「{漢字|かんじ}のテストです。」');
  const entry0 = engine.historyEntry(0)!;
  const snapshot = JSON.stringify(entry0.layout.pages.map((p) => p.glyphs));

  // 之后改成竖排、大字号再说一句
  engine.setConfig({ mode: 'vertical', fontSize: 20 });
  engine.say('乙', 'まったく別の{文章|ぶんしょう}です。');

  // 第一条的排版必须和当时一模一样
  assert.equal(JSON.stringify(entry0.layout.pages.map((p) => p.glyphs)), snapshot);
  assert.equal(entry0.config.mode, 'horizontal');
  assert.equal(entry0.config.fontSize, 10);
  assert.equal(engine.backlog.length, 2);
});

test('点击:打字中→立即显示完,页末→翻页,末页→返回 false', () => {
  let t = 0;
  const engine = makeEngine(() => t);
  // 长文本,保证多页
  engine.say('甲', 'あいうえおかきくけこ。'.repeat(10));
  assert.ok(engine.pageCount > 1);
  assert.equal(engine.state, 'typing');

  engine.click(); // 补完本页
  assert.equal(engine.state, 'page-done');

  engine.click(); // 翻页
  assert.equal(engine.page, 1);
  assert.equal(engine.state, 'typing');

  // 补完并翻到末页
  while (engine.state !== 'done') {
    engine.click();
  }
  assert.equal(engine.click(), false);
});

test('单页台词:补完后状态为 done', () => {
  const engine = makeEngine(() => 0);
  engine.say('甲', '短い。');
  engine.click();
  assert.equal(engine.state, 'done');
});

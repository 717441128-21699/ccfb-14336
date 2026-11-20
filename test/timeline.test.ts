import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../src/markup.ts';
import { buildTimeline, clusterAppearAt, hashNoise } from '../src/timeline.ts';

test('逐字时序:速度变更与停顿', () => {
  const p = parseLine('[speed=100]あい[wait=500]う[speed=10]か');
  const tl = buildTimeline(p, 50);
  // あ@0 い@100 (wait 500) う@700(仍按旧速 100ms) か@800(新速 10ms)
  assert.equal(clusterAppearAt(tl, p, 0, 0), 0);
  assert.equal(clusterAppearAt(tl, p, 1, 0), 100);
  assert.equal(clusterAppearAt(tl, p, 2, 0), 700);
  assert.equal(clusterAppearAt(tl, p, 3, 0), 800);
  assert.equal(tl.totalMs, 810);
});

test('注音组内多字依次出现,换行不占时间', () => {
  const p = parseLine('{漢字|かんじ}\nあ');
  const tl = buildTimeline(p, 40);
  assert.equal(clusterAppearAt(tl, p, 0, 0), 0); // 漢
  assert.equal(clusterAppearAt(tl, p, 2, 0), 80); // あ(换行簇不占时)
  assert.equal(tl.totalMs, 120);
});

test('页内时序按页首归零', () => {
  const p = parseLine('あいうえお');
  const tl = buildTimeline(p, 100);
  // 第 3 字作为页首 → 第 4 字相对页首 100ms
  assert.equal(clusterAppearAt(tl, p, 3, 2), 100);
});

test('抖字噪声确定性', () => {
  assert.equal(hashNoise(7, 42), hashNoise(7, 42));
  assert.notEqual(hashNoise(7, 42), hashNoise(7, 43));
  for (let i = 0; i < 100; i++) {
    const v = hashNoise(i, i * 3);
    assert.ok(v >= 0 && v <= 1);
  }
});

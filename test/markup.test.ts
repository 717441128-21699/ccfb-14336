import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../src/markup.ts';

test('注音标记解析', () => {
  const p = parseLine('这是{漢字|かんじ}测试');
  assert.equal(p.clusters.length, 5);
  const ruby = p.clusters[2];
  assert.deepEqual(ruby.chars, ['漢', '字']);
  assert.equal(ruby.ruby, 'かんじ');
});

test('speed/wait 事件锚定在 cluster 下标', () => {
  const p = parseLine('ab[speed=100]cd[wait=500]e');
  assert.equal(p.clusters.length, 5);
  assert.deepEqual(p.events, [
    { beforeCluster: 2, op: 'speed', value: 100 },
    { beforeCluster: 4, op: 'wait', value: 500 },
  ]);
});

test('shake/fade 效果嵌套与恢复', () => {
  const p = parseLine('a[shake=3]b[fade=200]c[/shake]d[/fade]e');
  const fx = p.clusters.map((c) => [c.shake, c.fade]);
  assert.deepEqual(fx, [
    [0, 0],
    [3, 0],
    [3, 200],
    [0, 200],
    [0, 0],
  ]);
});

test('转义与强制换行', () => {
  const p = parseLine('a\\{b\\[c\nd');
  assert.equal(p.clusters[1].chars[0], '{');
  assert.equal(p.clusters[3].chars[0], '[');
  assert.ok(p.clusters[5].isLineBreak);
  assert.equal(p.clusters[6].chars[0], 'd');
});

test('非法标记按普通字符处理', () => {
  const p = parseLine('a{b}c[xyz]d');
  assert.ok(p.clusters.length > 5);
  assert.equal(p.events.length, 0);
});

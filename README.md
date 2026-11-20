# 视觉小说文本显示引擎

TypeScript + Canvas 的 CJK(简中/繁中/日文)文本引擎:排版、逐字演出、字体子集化三条线,零运行时依赖。

## 快速开始

```bash
npm install
npm test          # 29 个单元/性能测试(node:test,Node ≥ 22 直接跑 TS)
npm run fonts     # 字体管线:字表统计 → 合成全量字库 → 按语言切子集
npm run build     # tsc → dist/
npm run serve     # http://localhost:8321/ (演示页,需先跑 fonts 和 build)
```

演示操作:**点击** 逐字→补完→下一句;**V** 横/竖排切换;**B** 历史回放;**1/2/3** 简中/繁中/日文。

## 台词标记语法

```
{漢字|かんじ}        注音(ルビ/拼音/注音符号;正文可多个字)
[speed=80]           之后每字毫秒数
[wait=500]           停顿毫秒
[shake=3]...[/shake] 抖字(振幅 px,可与其他效果叠加)
[fade=200]...[/fade] 逐字渐显(毫秒)
\n                   强制换行
\{ \[ \\             转义
```

## 排版(src/layout.ts)

- **横排/竖排**同一套断行逻辑,竖排列从右往左,拉丁字母/数字自动旋转 90°,标点偏移到字框右上。
- **避头尾**(src/kinsoku.ts):三语并集禁则表。行首禁则字(闭标点、小假名、长音、迭字符号)悬垂在行尾;行末禁则字(开括号/开引号)追出到下一行;`……` `——` 等重复符号不可从中断开。
- **注音**:正文+注音是一个原子 cluster,断行/分页都不可拆。注音比正文长时,正文字距自动拉开对齐注音宽度;注音整体居中排在正文上方(横排)或右侧(竖排)。
- **分页**:整段超出文本框时,优先在句读(。!?…,允许跟闭引号)处切页;找不到句读才硬切。
- 排版输出是与渲染无关的 `GlyphRun` 坐标表,**历史回放直接冻结该输出**,回看时逐像素复现当时的排版(src/history.ts)。

## 演出(src/timeline.ts, src/renderer.ts)

- 逐字显示,`[speed]`/`[wait]` 编译成每个字形的出现时刻;翻页时按页首归零。
- 抖字用确定性噪声(同一帧同一字偏移固定,回放可复现);渐显按字龄推进 alpha;效果可叠加。
- 点击立即补完本页,再点翻页/推进。
- 渲染每帧只画可见字形,坐标全部预计算,60fps 余量很大(演示页左上角有实时 fps)。

## 字体子集化(src/font/)

- `ttf.ts`:零依赖 TTF 解析/打包(cmap format 4、glyf/loca、hmtx、校验和、checkSumAdjustment)。
- `subset.ts`:按剧本字表切子集,复合字形组件自动进闭包并重映射 gid。
- `genfont.ts`:合成测试字体(码位确定性派生的伪字形,无版权问题,Windows 字体栈实测可加载可渲染)。
- `tools/build-fonts.ts`:一万句语料 → 字表统计 → 全量字库 → 简中/繁中/日文三个子集包 + `demo/assets/glyph-report.json` 报告。

**实测性能**(10012 句,字表 481 字,全量字库 4481 字形):

| 阶段 | 耗时 |
|---|---|
| 字表统计 | ~60ms |
| 三语切子集 | ~6ms |
| **合计(要求 <10s)** | **~66ms** |
| 全量字库 | 354KB |
| 每语言子集 | ~23KB |

## 接入真实字库

`subsetFont(ttfBytes, codepoints)` 接受任意 TrueType(BMP,cmap format 4)。把 `tools/build-fonts.ts` 里的 `generateFont` 换成读入正式字体文件即可,子集化逻辑不变。注意确认字体的嵌入许可(fsType)。

## 目录

```
src/markup.ts     标记解析          src/engine.ts    引擎门面
src/kinsoku.ts    避头尾规则表       src/history.ts   历史回放(冻结快照)
src/layout.ts     断行/注音/分页     src/font/        TTF 解析/子集化/合成字体
src/timeline.ts   演出时间轴         src/script/      三语剧本 + 一万句语料
src/renderer.ts   Canvas 渲染        tools/           字体管线 + 静态服务器
test/             29 个测试          demo/            浏览器演示
```

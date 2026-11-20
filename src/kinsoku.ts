/**
 * 中日文避头尾(禁则)规则表。
 * 简中/繁中/日文共用一套并集表,覆盖三语标点。
 */

/** 行首禁止(避头):闭标点、小假名、长音、迭字符号等 */
export const NO_LINE_START = new Set([
  ...'。、，．！？：；）］｝」』】〉》〙〛…”’',
  ...',.!?;:)]}％‰%°′″',
  ...'…‥・ー―‐‑–—~～゛゜々〻ゝゞヽヾ',
  // 小假名(平/片)
  ...'ぁぃぅぇぉっゃゅょゎゕゖ',
  ...'ァィゥェォッャュョヮヵヶ',
]);

/** 行末禁止(避尾):开括号、开引号 */
export const NO_LINE_END = new Set([
  ...'（［｛「『【〈《〘〚“‘',
  ...'([{',
]);

/** 句读(分页锚点):句末标点 */
export const SENTENCE_END = new Set([...'。！？…‥!?']);

/** 句末闭引号:若其前一字是句读,该行同样视为句末 */
export const CLOSING_QUOTE = new Set([...'」』”’）】']);

/** 不可拆分的重复符号(如 ……、—— 中间不可断行) */
const INSEPARABLE_REPEAT = new Set([...'…‥—―ー～~']);

/**
 * 两个相邻字符之间是否允许断行。
 * a = 行内最后一字,b = 下一行第一字。
 */
export function canBreakBetween(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return true;
  if (NO_LINE_START.has(b)) return false;      // b 不能落在行首
  if (NO_LINE_END.has(a)) return false;        // a 不能落在行末
  if (a === b && INSEPARABLE_REPEAT.has(a)) return false;
  return true;
}

/** 该行是否以句读收尾(允许句读后跟闭引号/闭括号) */
export function lineEndsSentence(lastChars: string[]): boolean {
  // lastChars: 行尾若干个 cluster 的末字,从后往前看
  for (let i = lastChars.length - 1; i >= 0; i--) {
    const ch = lastChars[i];
    if (SENTENCE_END.has(ch)) return true;
    if (CLOSING_QUOTE.has(ch)) continue;
    return false;
  }
  return false;
}

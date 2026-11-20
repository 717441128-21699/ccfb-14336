/**
 * 测试剧本:简中/繁中/日文样例 + 一万句确定性生成语料。
 * 标记语法见 markup.ts。
 */

export type Lang = 'zh-Hans' | 'zh-Hant' | 'ja';

export interface Dialogue {
  lang: Lang;
  speaker: string;
  text: string;
}

export const SAMPLE_DIALOGUES: Dialogue[] = [
  // ---- 简中 ----
  {
    lang: 'zh-Hans',
    speaker: '林晚晴',
    text: '「{汉字|hàn zì}旁边的{注音|zhù yīn}小字,会自己躲开行首,标点也一样。」',
  },
  {
    lang: 'zh-Hans',
    speaker: '林晚晴',
    text: '你……[wait=600]你说什么?![shake=4]这、这不可能![/shake]',
  },
  {
    lang: 'zh-Hans',
    speaker: '顾长风',
    text: '[speed=200]我——说——得——够——慢——了——吧。[speed=25]好那我现在一口气把剩下的全部说完你可别眨眼!',
  },
  {
    lang: 'zh-Hans',
    speaker: '顾长风',
    text: '[fade=500]这句话是一个字一个字浮现出来的。[/fade]而这句话不是。',
  },
  {
    lang: 'zh-Hans',
    speaker: '旁白',
    text: '雪下了整整一夜。天快亮的时候,{驿站|yì zhàn}的灯笼还亮着,昏黄的光落在雪地上,像一层化不开的蜜。她裹紧斗篷走出城门,回头望了一眼——城墙上的旗还在,人却都不见了。风从北边来,卷着雪粒子打在脸上,生疼。她想起他说过的话:「等开春,我就回来。」可是开春还有三个月,而她的盘缠,只够走十天。',
  },
  // ---- 繁中 ----
  {
    lang: 'zh-Hant',
    speaker: '林晚晴',
    text: '「{漢字|ㄏㄢˋ ㄗˋ}旁邊的{注音|ㄓㄨˋ ㄧㄣ}小字,會自己躲開行首,標點也一樣。」',
  },
  {
    lang: 'zh-Hant',
    speaker: '顧長風',
    text: '你……[wait=600]你說什麼?![shake=4]這、這不可能![/shake]',
  },
  {
    lang: 'zh-Hant',
    speaker: '旁白',
    text: '雪下了整整一夜。天快亮的時候,{驛站|ㄧˋ ㄓㄢˋ}的燈籠還亮著,昏黃的光落在雪地上,像一層化不開的蜜。她裹緊斗篷走出城門,回頭望了一眼——城牆上的旗還在,人卻都不見了。風從北邊來,捲著雪粒子打在臉上,生疼。她想起他說過的話:「等開春,我就回來。」可是開春還有三個月,而她的盤纏,只夠走十天。',
  },
  // ---- 日文 ----
  {
    lang: 'ja',
    speaker: '凛(りん)',
    text: '「{漢字|かんじ}の{隣|となり}に{振|ふ}り{仮名|がな}が{表示|ひょうじ}できます。{縦書|たてが}きも{大丈夫|だいじょうぶ}です。」',
  },
  {
    lang: 'ja',
    speaker: '凛(りん)',
    text: 'きゃっ、[wait=500]{驚|おどろ}いた![shake=4]ほんとうに{縦書|たてが}きできるの?![/shake]',
  },
  {
    lang: 'ja',
    speaker: '蒼(そう)',
    text: '[speed=180]ゆ——っ——く——り——{話|はな}そう。[speed=25]あとはいっきに{畳|たた}みかけるから{覚悟|かくご}して!',
  },
  {
    lang: 'ja',
    speaker: 'ナレーション',
    text: '雪は{一晩中|ひとばんじゅう}降り{続|つづ}けた。{夜明|よあ}け{前|まえ}、{駅|えき}の{灯|あか}りはまだ{点|つ}いていて、{白|しろ}い{雪|ゆき}の{上|うえ}に{薄|うす}い{影|かげ}を{落|お}としていた。コートの{襟|えり}を{立|た}てて{改札|かいさつ}を{出|で}ると、{北風|きたかぜ}が{頬|ほほ}を{刺|さ}した。「{春|はる}になったら{帰|かえ}るよ」——そう{言|い}った{声|こえ}を、{彼女|かのじょ}はまだ{覚|おぼ}えていた。',
  },
];

// ---- 一万句生成语料 ----

const HANS_POOL =
  '的一是不了在人有我他这中大来上国个地说们为子和你道出而于就下得可以会自这去之' +
  '家学对生时么过作能成如都然个发事只三看天好小无同其经长么本见前头面公老从动两' +
  '雪夜灯城风花月影心梦路声色光寒暖远近山水人情言语笑泪';
const HANT_POOL =
  '的一是不了在人有我他這中大來上國個地說們為子和你道出而於就下得可以會自這去之' +
  '家學對生時麼過作能成如都然個發事隻三看天好小無同其經長麼本見前頭麵公老從動兩' +
  '雪夜燈城風花月影心夢路聲色光寒暖遠近山水人情言語笑淚';
const KANA_POOL = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const KANJI_POOL =
  '私僕君彼女今日明日学校先生友達家族時間場所言葉心夢雪夜灯城風花月影声光山水春夏秋冬' +
  '行来見聞話読書食飲歩走止立座寝起開閉出入上下左右前後新旧高低';
const PUNCT = '。、。、。、!?…';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rnd: () => number, s: string): string {
  return s[Math.floor(rnd() * s.length)];
}

/** 生成 count 条三语混合台词(确定性,seed 固定可复现) */
export function generateCorpus(count: number, seed = 20261121): Dialogue[] {
  const rnd = mulberry32(seed);
  const out: Dialogue[] = [];
  for (let i = 0; i < count; i++) {
    const lang: Lang = i % 3 === 0 ? 'zh-Hans' : i % 3 === 1 ? 'zh-Hant' : 'ja';
    const len = 10 + Math.floor(rnd() * 40);
    let text = '';
    for (let k = 0; k < len; k++) {
      const r = rnd();
      if (r < 0.08) {
        text += pick(rnd, PUNCT);
      } else if (lang === 'zh-Hans') {
        text += pick(rnd, HANS_POOL);
      } else if (lang === 'zh-Hant') {
        text += pick(rnd, HANT_POOL);
      } else {
        text += r < 0.55 ? pick(rnd, KANA_POOL) : pick(rnd, KANJI_POOL);
      }
    }
    // 5% 的台词带注音标记
    if (rnd() < 0.05 && text.length > 6) {
      const pos = 2 + Math.floor(rnd() * (text.length - 5));
      const base = text.slice(pos, pos + 2);
      const ruby =
        lang === 'ja'
          ? Array.from({ length: 3 }, () => pick(rnd, KANA_POOL)).join('')
          : lang === 'zh-Hant'
            ? 'ㄓㄨˋ'
            : 'zhù';
      text = `${text.slice(0, pos)}{${base}|${ruby}}${text.slice(pos + 2)}`;
    }
    text += '。';
    out.push({ lang, speaker: `角色${i % 7}`, text });
  }
  return out;
}

/** 按语言分组 */
export function byLang(dialogues: Dialogue[]): Map<Lang, string[]> {
  const map = new Map<Lang, string[]>();
  for (const d of dialogues) {
    if (!map.has(d.lang)) map.set(d.lang, []);
    map.get(d.lang)!.push(d.text);
  }
  return map;
}

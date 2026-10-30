// 通用章節：現有 12 個主題（12 扇魔法門）轉成章節格式（成長系統 §5.4 第 4 點：內容和語音不變）。
// key 沿用原本的 theme.<id>.title／intro／stop.<i>／end，字幕文字和音檔檔名都跟以前一樣
// （scripts/check-story-themes.ts 會比對 scripts/fixtures/theme-lines.base.json）。
// 莫莫說話慢慢的，標題句尾用句號；波波、豆豆用驚嘆號（原本 lines-themes.ts 的寫法）。
import { BEATS, THEMES, type ThemeDef, type ThemeId } from '../themes'
import type { Beat, Chapter, ChapterLook } from './types'

/** 門的樣子：路線圖、背景直接用主題的 */
export const lookOf = (t: ThemeDef): ChapterLook => ({
  title: t.title,
  zh: t.zh,
  host: t.host,
  icon: t.icon,
  scene: t.scene,
  tint: t.tint,
  deep: t.deep,
  ground: t.ground,
  stops: t.stops,
  finale: t.finale,
})

/** 門的標題句（路線圖上念） */
export const doorTitle = (t: ThemeDef): Beat => ({ who: t.host, en: `${t.title}${t.host === 'momo' ? '.' : '!'}`, key: `theme.${t.id}.title` })

/** 門後面原本的第 i 站旁白 */
export const doorStop = (t: ThemeDef, i: number): Beat => {
  const n = Math.min(i, BEATS[t.id].stops.length - 1)
  return { who: t.host, en: BEATS[t.id].stops[n], pic: t.stops[n], key: `theme.${t.id}.stop.${n}` }
}

/** 門原本的開場、結尾（長篇的章節會換成故事自己的開場、結尾） */
export const doorIntro = (t: ThemeDef): Beat => ({ who: t.host, en: BEATS[t.id].intro, key: `theme.${t.id}.intro` })
export const doorEnd = (t: ThemeDef): Beat => ({ who: t.host, en: BEATS[t.id].end, key: `theme.${t.id}.end` })

function evergreen(t: ThemeDef): Chapter {
  return {
    id: `ev-${t.id}`,
    kind: 'evergreen',
    part: 0,
    arc: 'evergreen',
    chapter: 0,
    band: 'small',
    faith: null,
    door: t.id,
    title: doorTitle(t),
    intro: [doorIntro(t)],
    // 5 站都用門原本的旁白
    stops: [null, null, null, null, null],
    finale: [doorEnd(t)],
    end: [],
  }
}

export const EVERGREEN: Record<ThemeId, Chapter> = Object.fromEntries(THEMES.map((t) => [t.id, evergreen(t)])) as Record<ThemeId, Chapter>

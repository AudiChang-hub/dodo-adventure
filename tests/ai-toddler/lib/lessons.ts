import type { Page } from '@playwright/test'

/** 首頁的一扇門 → 一堂課。live 是進去之後的那一層畫面（.scene[data-scene]） */
export interface LessonDef {
  id: string
  name: string
  door: string
  isIn: (live: string | null) => boolean
  /** 爸爸媽媽打開時說的話（小男生第一步聽到的） */
  intro: string
  /** 這一課「完成」是什麼樣子（報告寫上） */
  doneMeans: string
}

export const LESSONS: Record<string, LessonDef> = {
  en: { id: 'en', name: '英文字母', door: 'english', isIn: (l) => l === 'lesson-english', intro: '媽媽說：「我們來上英文課喔！」', doneMeans: '上完一堂、出現下課畫面' },
  zh: { id: 'zh', name: '中文課文', door: 'chinese', isIn: (l) => l === 'lesson-chinese', intro: '媽媽說：「我們來念中文故事喔！」', doneMeans: '上完一堂、出現下課畫面' },
  math: { id: 'math', name: '數學數字', door: 'math', isIn: (l) => l === 'lesson-math', intro: '媽媽說：「我們來玩數字喔！」', doneMeans: '上完一堂、出現下課畫面' },
  // 畫畫（T-138）：門進去先選白紙自由畫／著色本（draw）→ 白紙 play-d-free；著色本 coloring → 塗一張 play-d-color-<圖>。都算在畫畫裡
  draw: { id: 'draw', name: '畫畫', door: 'draw', isIn: isDraw, intro: '媽媽說：「去畫畫吧！」', doneMeans: '白紙或著色本按了完成（作品展示、慶祝或停在作品上）' },
  // 故事（T-129）：今天的英文版課文 en-<篇>（念 4 句 → 故事題 → 認角色 → 找一樣的英文字）、念完 endone-<篇>；以前的故事 replay-<id>、讀完了 done-<id>
  story: { id: 'story', name: '故事', door: 'story', isIn: isStory, intro: '媽媽說：「我們來看故事書！」', doneMeans: '一本書聽到最後（英文版：4 句和 3 題做完、出現念完的畫面）' },
  // 貼紙本（T-132）：首頁門上方牆上的貼紙板進去；看一看、點一點貼紙，自己回首頁
  stickers: { id: 'stickers', name: '貼紙本', door: 'stickers', isIn: (l) => l === 'stickers', intro: '媽媽說：「去看看你的貼紙本！」', doneMeans: '點了 3 張以上的貼紙、自己回到首頁' },
}

/** 畫畫裡的畫面：選白紙還是著色本、著色本、白紙自由畫、塗一張圖（T-138） */
export function isDraw(l: string | null) {
  return l === 'draw' || l === 'coloring' || /^play-d-(free|color)/.test(l ?? '')
}

/** 故事的那一層畫面：書架、英文版課文、以前的故事、讀完了 */
export function isStory(l: string | null) {
  return l === 'shelf' || l === 'storybook' || /^(replay|done|en|endone)-/.test(l ?? '')
}

export const ALIASES: Record<string, string> = { english: 'en', chinese: 'zh', 中文: 'zh', 英文: 'en', 數學: 'math', 畫畫: 'draw', 故事: 'story', sticker: 'stickers', 貼紙: 'stickers', 貼紙本: 'stickers' }

/**
 * 舊裝置的故事書：書架上已經有講過的章節（T-77 之後點「故事」會先講今天的新章節，講完收進書架；
 * 這 8 本是「已經用了一陣子」的樣子）。測試照 tests/toddler/story.spec.ts 放 8 本進去（通用章節、長篇、經典各一種）；
 * 要測新裝置（書架什麼都沒有）用 --fresh。
 * story.spec 的書每本只有 3～6 句、大多沒有圖（回歸測試夠用），這裡用 App 自己的 scriptOf 把每一本補成真的樣子
 * （每一句和那一句的圖），孩子才是在聽真的故事；讀不到就用原本的短版。
 */
const STORY_ROWS = (() => {
  const picks = { words: [], friends: [], stickers: [], drawings: [] }
  const base = { part: 0, arc: 'evergreen', chapter: 0, kind: 'evergreen', band: 'small', picks, choices: {}, done: true, synced: 1 }
  const doors = ['bus', 'farm', 'zoo', 'rain', 'fruit', 'ocean']
  return [
    ...doors.map((d, i) => {
      const date = `2026-09-${String(10 + i).padStart(2, '0')}`
      return { ...base, id: date, date, ref: `ev-${d}`, door: d, script: [{ k: `theme.${d}.title` }, { k: `theme.${d}.intro` }, { k: `theme.${d}.stop.0` }, { k: `theme.${d}.end` }] }
    }),
    { ...base, id: '2026-09-20', date: '2026-09-20', part: 1, arc: 'p1-a01', chapter: 1, kind: 'epic', ref: 'p1-a01-c1', door: 'bus', script: [{ k: 'story.p1-a01-c1.intro.0', pic: '@rainbow-egg' }, { k: 'story.p1-a01-c1.intro.1', pic: '@rainbow-egg' }, { k: 'theme.bus.stop.0' }, { k: 'story.p1-a01-c1.stop.1', pic: 'bus+@rainbow-egg' }, { k: 'story.p1-a01-c1.end.0', pic: 'house-with-garden' }, { k: 'story.p1-a01-c1.end.1' }] },
    { ...base, id: '2026-09-21', date: '2026-09-21', part: 1, arc: 'classic', chapter: 1, kind: 'classic', door: 'park', ref: 'classic-a01', script: [{ k: 'story.classic.open.0', pic: 'open-book' }, { k: 'story.classic-a01.stop.0.0', pic: 'rabbit' }, { k: 'story.classic.close', pic: 'closed-book' }] },
  ]
})()

async function storyRows() {
  try {
    // 路徑放變數：型別檢查不要把 App 的原始碼（import.meta.env）拉進測試的 tsconfig
    const src = '../../../src/content/story/index.ts'
    type Said = { key: string; pic?: string }
    type Script = { title: Said[]; intro: Said[]; stops: Said[][]; finale: Said[]; end: Said[] }
    const m = (await import(src)) as { chapterOf: (id: string) => unknown; scriptOf: (ch: unknown, input: { tracks: unknown[]; friend: null; door?: string }) => Script | null }
    return STORY_ROWS.map((r) => {
      const ch = m.chapterOf(r.ref)
      // 跟 App 記一章時一樣（src/lib/story.ts 的 startChapter → toldBeats）：每一句連同那一句的圖
      const s = ch ? m.scriptOf(ch, { tracks: [], friend: null, door: r.door }) : null
      if (!s) return r
      const beats = [...s.title, ...s.intro, ...s.stops.flat(), ...s.finale, ...s.end]
      return { ...r, script: beats.map((x) => (x.pic ? { k: x.key, pic: x.pic } : { k: x.key })) }
    })
  } catch {
    return STORY_ROWS
  }
}

export async function seedStory(page: Page) {
  const rows = await storyRows()
  await page.evaluate(async (rows) => {
    await new Promise<void>((res, rej) => {
      const rq = indexedDB.open('dodo-adventure')
      rq.onerror = () => rej(rq.error)
      rq.onsuccess = () => {
        const db = rq.result
        const tx = db.transaction(['kv', 'chapters'], 'readwrite')
        tx.objectStore('kv').put({ key: 'story', value: { part: 1, arc: 'p1-a01', next: 1, choices: {}, classicsDone: ['A01'], house: ['egg-nest'] } })
        const ch = tx.objectStore('chapters')
        for (const r of rows) ch.put(r)
        tx.oncomplete = () => {
          db.close()
          res()
        }
        tx.onerror = () => rej(tx.error)
      }
    })
    sessionStorage.setItem('dodo.resume', 'home')
  }, rows)
  await page.reload()
  await page.waitForSelector('.screen.home', { timeout: 20_000 })
}

/**
 * 舊裝置的貼紙本：已經挑過 9 張貼紙（最新的 2 張還沒點過，會輕輕發光），預設就放；--fresh 是新裝置（空的貼紙本）。
 * 跟 App 的 achieve 一樣的格式（src/lib/achievements.ts 的 kind: 'sticker'），art 是 src/content/sticker-art.ts 的主角。
 */
const STICKER_ARTS = ['t-rex', 'fire-engine', 'sauropod', 'police-car', 'dragon', 'ambulance', 'turtle', 'mammoth', 'crocodile']

export async function seedStickers(page: Page) {
  await page.evaluate(async (arts) => {
    const day = 86_400_000
    const now = Date.now()
    const log = arts.map((art, i) => {
      const ts = now - (arts.length - i) * day
      return { id: `seed-stk-${i}`, ts, date: new Date(ts).toISOString().slice(0, 10), kind: 'sticker', art, seed: 1000 + i * 37, why: { round: 5, learn: 0, fix: 0, level: 0 } }
    })
    await new Promise<void>((res, rej) => {
      const rq = indexedDB.open('dodo-adventure')
      rq.onerror = () => rej(rq.error)
      rq.onsuccess = () => {
        const db = rq.result
        const tx = db.transaction('kv', 'readwrite')
        const st = tx.objectStore('kv')
        const g = st.get('achieve')
        g.onsuccess = () => {
          const old = g.result?.value ?? {}
          st.put({ key: 'achieve', value: { best: {}, fixes: 0, picks: [], since: 0, ...old, v: 2, log, seen: log.slice(0, -2).map((m) => m.id) } })
        }
        tx.oncomplete = () => {
          db.close()
          res()
        }
        tx.onerror = () => rej(tx.error)
      }
    })
    sessionStorage.setItem('dodo.resume', 'home')
  }, STICKER_ARTS)
  await page.reload()
  await page.waitForSelector('.screen.home', { timeout: 20_000 })
}

/** 現在畫面上有沒有「這一課完成了」的樣子 */
export const doneNow = (page: Page) =>
  page
    .evaluate(() => {
      const live = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
      // 下課畫面：挑貼紙，或沒有貼紙的那堂的 LessonBye（貼紙平均每 3～4 堂一次、不固定，T-87）
      const end = document.querySelector('.cheer-scrim')
      const lessonEnd = !!end
      const picker = !!end?.querySelector('.picker')
      const dots = live ? [...live.querySelectorAll('.book-progress i')] : []
      // 聽到最後一頁：小點全亮，或已經換到「讀完了」（T-77：講完會出現讀完了的畫面）。
      // 英文版（en-<篇>）第 4 句小點就全亮了，後面還有 3 題：要等到念完的畫面 endone-<篇> 才算
      const scene = live?.dataset.scene ?? ''
      const lastPage = (!scene.startsWith('en-') && dots.length > 1 && dots.every((d) => d.classList.contains('is-done'))) || /^(done|endone)-/.test(scene)
      // 畫畫按了完成（T-138）：白紙的作品展示（data-show）、每局的慶祝、停在作品上（data-resting）；白紙或著色本
      const drawDone = /^play-d-(free|color)/.test(scene) && !!document.querySelector('[data-show], [data-resting], .cheer-scrim')
      return { lessonEnd: lessonEnd && !drawDone, picker, lastPage, drawDone, coloring: scene.startsWith('play-d-color') }
    })
    .catch(() => ({ lessonEnd: false, picker: false, lastPage: false, drawDone: false, coloring: false }))

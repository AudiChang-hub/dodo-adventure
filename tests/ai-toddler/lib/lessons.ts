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
  en: { id: 'en', name: '英文字母', door: 'english', isIn: (l) => l === 'lesson-english', intro: '媽媽說：「我們來上英文課喔！」', doneMeans: '上完一堂、出現挑貼紙' },
  zh: { id: 'zh', name: '中文課文', door: 'chinese', isIn: (l) => l === 'lesson-chinese', intro: '媽媽說：「我們來聽中文課喔！」', doneMeans: '上完一堂、出現挑貼紙' },
  math: { id: 'math', name: '數學數字', door: 'math', isIn: (l) => l === 'lesson-math', intro: '媽媽說：「我們來玩數字喔！」', doneMeans: '上完一堂、出現挑貼紙' },
  draw: { id: 'draw', name: '畫畫', door: 'draw', isIn: (l) => l === 'play-d-free', intro: '媽媽說：「去畫畫吧！」', doneMeans: '在畫布上畫了 3 筆以上' },
  story: { id: 'story', name: '故事', door: 'story', isIn: (l) => l === 'shelf' || l === 'storybook' || !!l?.startsWith('replay-'), intro: '媽媽說：「我們來看故事書！」', doneMeans: '一本書聽到最後一頁' },
}

export const ALIASES: Record<string, string> = { english: 'en', chinese: 'zh', 中文: 'zh', 英文: 'en', 數學: 'math', 畫畫: 'draw', 故事: 'story' }

/**
 * 故事書要有講過的章節才有書可以選。舊的冒險拿掉以後新裝置的書架是空的，
 * 測試照 tests/toddler/story.spec.ts 放幾本進去（通用章節、長篇、經典各一種）。
 */
export const STORY_ROWS = (() => {
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

export async function seedStory(page: Page) {
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
  }, STORY_ROWS)
  await page.reload()
  await page.waitForSelector('.screen.home', { timeout: 20_000 })
}

/** 現在畫面上有沒有「這一課完成了」的樣子 */
export const doneNow = (page: Page) =>
  page
    .evaluate(() => {
      const live = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
      const picker = !!document.querySelector('.picker')
      const dots = live ? [...live.querySelectorAll('.book-progress i')] : []
      const lastPage = dots.length > 1 && dots.every((d) => d.classList.contains('is-done'))
      return { picker, lastPage }
    })
    .catch(() => ({ picker: false, lastPage: false }))

// 英文課新玩法（T-127：泡泡、餵豆豆、塗色）三個 spec 共用的小工具：開 App、固定今天的玩法、直接從選擇題或寫寫看開始。
import { expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { attempts, boot } from './app'
import { Toddler, hashSeed } from './toddler'
import { Checker, doorAt, toHome, waitLive } from './flows'

const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
/** 跟 lesson-english.spec 用同一個名稱（--changed 改到英文課就跑） */
export const want = () => !only.length || only.includes('lesson-english')
export const LIVE = 'lesson-english'
export type Pt = { x: number; y: number }

/**
 * 開 App，固定選擇題的玩法（quiz）或寫寫看（write：不給就讓他自己選），英文進度直接放到 stage（今天、還沒上完）。
 * 今天的世界固定成農場（截圖、版面每次一樣）。
 */
export async function setup(page: Page, info: TestInfo, name: string, opts: { quiz?: 'cards' | 'bubbles' | 'feed'; write?: 'trace' | 'paint' | null; stage: 'quiz' | 'write' }) {
  const seed = hashSeed(BASE_SEED, 'lesson-english', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `英文課／${name}`
  await page.addInitScript(
    ({ quiz, write }) => {
      localStorage.setItem('dodo:world', 'farm')
      if (quiz) localStorage.setItem('dodo:en-quiz', quiz)
      if (write) localStorage.setItem('dodo:en-write', write)
      else localStorage.removeItem('dodo:en-write')
    },
    { quiz: opts.quiz ?? null, write: opts.write ?? null },
  )
  await boot(page, seed, { to: 'home' })
  await k.init()
  await page.evaluate(
    (stage) =>
      new Promise<void>((res) => {
        const d = new Date()
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const tx = rq.result.transaction('kv', 'readwrite')
          tx.objectStore('kv').put({ key: 'lesson.english', value: { idx: 0, date: today, done: false, good: false, stage, round: 0 } })
          tx.oncomplete = () => {
            rq.result.close()
            res()
          }
        }
      }),
    opts.stage,
  )
  return { k, c, seed }
}

/** 從首頁點英文課的門 */
export async function enter(k: Toddler, c: Checker) {
  if (!(await toHome(k, c))) return false
  const door = await doorAt(k.page, 'english')
  if (!door) return false
  await k.tap(door, '英文字母的門')
  const live = await waitLive(k.page, (l) => l === LIVE, 6000)
  if (live !== LIVE) await c.once('enter', '卡死', `點英文字母的門沒有進到英文課（停在 ${live}）`, '')
  return live === LIVE
}

export const stageOf = (page: Page) => page.evaluate(() => document.querySelector('.en-lesson')?.getAttribute('data-phase') ?? null)

/** 選擇題現在的樣子：要找哪一張（看豆豆頭上泡泡亮的那個）、每張選項的中心、狀態 */
export const quizNow = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.en-options:not([data-accepting="false"])') ?? document.querySelector('.en-options')
    if (!box) return null
    const want = document.querySelector('.en-ask-in b.on')?.textContent?.trim() ?? null
    const opts = [...box.querySelectorAll<HTMLElement>('.en-opt')].map((el) => {
      const r = el.getBoundingClientRect()
      return { label: el.getAttribute('aria-label') ?? '', x: r.left + r.width / 2, y: r.top + r.height / 2, cls: el.className, wait: el.classList.contains('is-wait') }
    })
    const dodo = document.querySelector('.en-feed-dodo')?.getBoundingClientRect()
    return {
      accepting: box.getAttribute('data-accepting') !== 'false',
      demo: box.classList.contains('is-demo') || !!document.querySelector('.en-quiz .demo-hand'),
      solved: box.classList.contains('is-solved'),
      want,
      opts,
      dodo: dodo ? { x: dodo.left + dodo.width * 0.4, y: dodo.top + dodo.height * 0.5 } : null,
    }
  })

/** 等到可以作答（選項出來、收作答）；回傳那一刻的樣子 */
export async function untilTurn(page: Page, ms = 20_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const q = await quizNow(page)
    if (q && q.accepting && !q.demo && !q.solved && q.opts.length && q.opts.every((o) => !o.wait)) return q
    await page.waitForTimeout(200)
  }
  return null
}

/** 這一題對的那一張、錯的那一張 */
export function pickOf(q: NonNullable<Awaited<ReturnType<typeof quizNow>>>) {
  const right = q.opts.find((o) => o.label === q.want) ?? null
  const wrong = q.opts.find((o) => o.label !== q.want) ?? null
  return { right, wrong }
}

/** 這一堂寫進的作答紀錄（某個 game） */
export const recordsOf = async (page: Page, game: string) => (await attempts(page)).filter((a) => a.game === game)

/** 等到下課（晚安道別或挑貼紙出來） */
export async function untilEnd(page: Page, ms = 60_000) {
  return !!(await page.waitForSelector('.cheer-scrim', { timeout: ms }).catch(() => null))
}

/** 截圖：TODDLER_SHOTS=資料夾 時，tab1200 的畫面存下來（docs/T-127-截圖/） */
export async function shot(page: Page, info: TestInfo, name: string) {
  const dir = process.env.TODDLER_SHOTS
  if (!dir || info.project.name !== 'tab1200') return
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`) })
}

export function finish(k: Toddler, c: Checker, name: string) {
  k.save(`lesson-english-${name}`, { screen: `英文課／${name}`, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

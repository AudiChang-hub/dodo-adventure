import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, settle, snap, targets } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, audit, pressBack, waitLive } from './lib/flows'

// 故事（G-8）的三歲模擬測試：我的故事書（冒險裡的故事時間、魔法屋 T-75 拿掉了，測試也一起拿掉）。
// 三歲孩子會做的事：旁白還在念就一直點（搶著點）、亂點、走到一半想回家（返回）。
// 「故事（試播）」預設開啟；測試還是在設定裡明確打開，再把講過的章節寫進資料庫。

const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').trim()
const want = (name: string) => !only || only.split(',').some((s) => s === 'screens' || s === 'story' || s === name)

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string) {
  const seed = hashSeed(BASE_SEED, 'story', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = name
  await boot(page, seed, { to: 'home', settings: { story: true } })
  await k.init()
  return { k, c }
}

interface Seed {
  story?: Record<string, unknown>
  chapters?: Record<string, unknown>[]
  kv?: Record<string, unknown>
}

/** 改故事進度、講過的章節，重新載入回首頁 */
async function seedStory(page: Page, s: Seed) {
  expect(await page.evaluate(() => location.port)).toBe(new URL(page.url()).port)
  await page.evaluate(async (s) => {
    await new Promise<void>((res, rej) => {
      const rq = indexedDB.open('dodo-adventure')
      rq.onerror = () => rej(rq.error)
      rq.onsuccess = () => {
        const db = rq.result
        const tx = db.transaction(['kv', 'chapters'], 'readwrite')
        const kv = tx.objectStore('kv')
        if (s.story) kv.put({ key: 'story', value: s.story })
        for (const [key, value] of Object.entries(s.kv ?? {})) kv.put({ key, value })
        const ch = tx.objectStore('chapters')
        for (const r of s.chapters ?? []) ch.put(r)
        tx.oncomplete = () => {
          db.close()
          res()
        }
        tx.onerror = () => rej(tx.error)
      }
    })
    sessionStorage.setItem('dodo.resume', 'home')
  }, s)
  await page.reload()
  await page.waitForSelector('.screen.home', { timeout: 20_000 })
  await settle(page)
}

async function center(page: Page, sel: string) {
  return page.evaluate((sel) => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    const el = root.querySelector(sel) ?? document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, sel)
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`story-${name}`, { screen: name, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

/** 點現在這一層的返回鍵，等到 want 的畫面 */
async function tapBack(k: Toddler, c: Checker, ctx: string, ok: (l: string | null) => boolean, ms = 4000) {
  const h = await homeButton(k.page)
  if (!h) {
    await c.once(`noback:${ctx}`, '無法返回', `${ctx}沒有返回鍵`, `畫面 ${(await snap(k.page)).live}`)
    return null
  }
  await pressBack(k, h, `${ctx}：${h.label}`)
  const live = await waitLive(k.page, ok, ms)
  if (!ok(live)) await c.once(`back:${ctx}`, '無法返回', `${ctx}點返回沒有回上一層`, `按鈕「${h.label}」，停在 ${live}`)
  return live
}

test.describe('故事', () => {
  // 首頁的「故事」直接進書架，書架返回回首頁
  test('我的故事書：亂點、翻頁、重聽搶著點、一層一層返回', async ({ page }, info) => {
    test.skip(!want('story-book'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '故事書')
    try {
      // 講過 8 章（兩頁）：通用章節、長篇、故事時間都有
      const doors = ['bus', 'farm', 'zoo', 'rain', 'fruit', 'ocean']
      const rows = [
        ...doors.map((d, i) => ({ id: `2026-09-${String(10 + i).padStart(2, '0')}`, date: `2026-09-${String(10 + i).padStart(2, '0')}`, part: 0, arc: 'evergreen', chapter: 0, kind: 'evergreen', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: `ev-${d}`, door: d, script: [{ k: `theme.${d}.title` }, { k: `theme.${d}.intro` }, { k: `theme.${d}.stop.0` }, { k: `theme.${d}.end` }] })),
        { id: '2026-09-20', date: '2026-09-20', part: 1, arc: 'p1-a01', chapter: 1, kind: 'epic', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'p1-a01-c1', door: 'bus', script: [{ k: 'story.p1-a01-c1.intro.0', pic: '@rainbow-egg' }, { k: 'story.p1-a01-c1.intro.1', pic: '@rainbow-egg' }, { k: 'theme.bus.stop.0' }, { k: 'story.p1-a01-c1.stop.1', pic: 'bus+@rainbow-egg' }, { k: 'story.p1-a01-c1.end.0', pic: 'house-with-garden' }, { k: 'story.p1-a01-c1.end.1' }] },
        { id: '2026-09-21', date: '2026-09-21', part: 1, arc: 'classic', chapter: 1, kind: 'classic', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'classic-a01', door: 'park', script: [{ k: 'story.classic.open.0', pic: 'open-book' }, { k: 'story.classic-a01.stop.0.0', pic: 'rabbit' }, { k: 'story.classic.close', pic: 'closed-book' }] },
      ]
      await seedStory(page, { chapters: rows, story: { part: 1, arc: 'p1-a01', next: 1, choices: {}, classicsDone: ['A01'], house: ['egg-nest'] }, kv: { houseSeen: 0 } })
      let live: string | null = null
      // 首頁 → 故事（連點）→ 書架
      k.behavior = '首頁連點故事'
      await k.spam((await center(page, '.side-door[data-door="story"]'))!, 5, '故事')
      live = await waitLive(page, (l) => l === 'shelf', 5000)
      await k.wait(1200)
      live = (await snap(page)).live
      c.outcome('首頁 → 故事書', live === 'shelf', `到 ${live}`)
      await settle(page, 3000)
      await audit(k, c, '故事書 書架')
      // 翻頁
      k.behavior = '故事書翻頁'
      const next = await center(page, '[aria-label="下一頁"]')
      if (next) {
        await k.spam(next, 3, '下一頁')
        await k.wait(800)
      }
      const cards = await page.evaluate(() => document.querySelectorAll('.book-card').length)
      c.outcome('第二頁有 2 本', cards === 2, `${cards} 本`)
      const prev = await center(page, '[aria-label="上一頁"]')
      if (prev) await k.tap(prev, '上一頁')
      await k.wait(800)
      // 點一本重聽：旁白在念就一直點，點完想回書架
      k.behavior = '重聽搶著點'
      const card = (await targets(page)).find((t) => t.label && t.label !== '上一頁' && t.label !== '下一頁' && t.label !== '故事書')
      if (card) await k.tap(card, card.label)
      live = await waitLive(page, (l) => (l ?? '').startsWith('replay-'), 5000)
      c.outcome('點書 → 重聽', (live ?? '').startsWith('replay-'), `到 ${live}`)
      await settle(page, 2000)
      await audit(k, c, '故事書 重聽')
      for (let i = 0; i < 4; i++) {
        await k.spam({ x: 600 + k.r.range(-150, 150), y: 380 }, 3 + k.r.int(3), '搶著點')
        await k.wait(700)
      }
      await c.flush()
      k.behavior = '故事書返回'
      if ((await snap(page)).live?.startsWith('replay-')) {
        live = await tapBack(k, c, '重聽', (l) => l === 'shelf')
        c.outcome('重聽按返回 → 書架', live === 'shelf', `到 ${live}`)
      } else c.outcome('重聽講完自己回書架', (await snap(page)).live === 'shelf', '')
      await k.wait(1300)
      live = await tapBack(k, c, '書架', (l) => l === 'home')
      c.outcome('書架按返回 → 首頁', live === 'home', `到 ${live}`)
      await c.flush()
    } finally {
      finish(k, c, '故事書')
    }
  })
})

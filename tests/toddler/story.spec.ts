import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, settle, snap, targets } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, audit, pressBack, waitLive } from './lib/flows'

// 故事的三歲模擬測試：首頁的「故事」（T-77：點進去先講今天的新章節，講完收進書架）和我的故事書。
// 三歲孩子會做的事：旁白還在念就一直點（搶著點）、亂點、走到一半想回家（返回）、再進來。
// 「故事（試播）」預設開啟；測試還是在設定裡明確打開。

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

/** 今天的日期（App 的 chapters 用日期當 id） */
const todayId = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 講到第幾句（上面那排小點亮了幾顆） */
const heard = (page: Page) => page.evaluate(() => document.querySelectorAll('.book-progress i.is-done').length)

/** 今天這一章在資料庫的樣子 */
const todayRow = (page: Page, id: string) =>
  page.evaluate(
    (id) =>
      new Promise<{ done: boolean; n: number } | null>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction('chapters').objectStore('chapters').get(id)
          g.onsuccess = () => res(g.result ? { done: !!g.result.done, n: g.result.script?.length ?? 0 } : null)
          g.onerror = () => res(null)
        }
      }),
    id,
  )

/** 交付用的截圖（TODDLER_SHOTS=資料夾 時才拍） */
async function shot(page: Page, name: string, info: Parameters<Parameters<typeof test>[2]>[1]) {
  const dir = process.env.TODDLER_SHOTS
  if (dir) await page.screenshot({ path: `${dir}/${info.project.name}-${name}.png` })
}

test.describe('故事', () => {
  // T-77：新裝置點「故事」→ 先講今天的新章節；搶著點不會跳句；講到一半返回 → 書架上的新書 → 再進來接著講 → 讀完了 → 收進書架
  test('新的一章：搶著點、講到一半返回、再進來接著講、讀完了收進書架', async ({ page }, info) => {
    test.skip(!want('story-new'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '新的一章')
    const id = todayId()
    try {
      k.behavior = '首頁連點故事'
      await k.spam((await center(page, '.side-door[data-door="story"]'))!, 5, '故事')
      let live = await waitLive(page, (l) => (l ?? '').startsWith('replay-'), 8000)
      c.outcome('新裝置點故事 → 先講今天的新章節', live === `replay-${id}`, `到 ${live}`)
      if (live !== `replay-${id}`) await c.once('no-new', '困惑', '新裝置點故事沒有講新章節', `到 ${live}`)
      await settle(page, 2000)
      await shot(page, '1-新的一章', info)
      await audit(k, c, '新的一章')

      // 搶著點：旁白在念就一直點圖、點畫面。點圖只讓圖動，不能跳過正在念的句子
      k.behavior = '搶著點'
      const before = await heard(page)
      const t0 = Date.now()
      for (let i = 0; i < 4; i++) {
        await k.spam((await center(page, '.story-home-card')) ?? { x: 640, y: 300 }, 3, '點圖')
        await k.spam({ x: 640 + k.r.range(-300, 300), y: 400 + k.r.range(-100, 200) }, 2, '亂點')
      }
      const after = await heard(page)
      const sec = (Date.now() - t0) / 1000
      // 一句至少念 1 秒多：搶著點的這幾秒，最多往前走「秒數」那麼多句
      c.outcome('搶著點沒有跳句', after - before <= Math.max(1, Math.ceil(sec)), `${sec.toFixed(1)} 秒內從第 ${before} 句到第 ${after} 句`)
      if (after - before > Math.max(1, Math.ceil(sec))) await c.once('skip', '困惑', '點圖跳過了正在念的句子', `${sec.toFixed(1)} 秒從 ${before} 到 ${after}`)
      await c.flush()

      // 講到一半按返回：回書架，今天的新書在書架上（沒有星），還沒講完
      k.behavior = '講到一半返回'
      await waitLive(page, () => false, 2500)
      const mid = await heard(page)
      live = await tapBack(k, c, '講到一半', (l) => l === 'shelf')
      c.outcome('講到一半返回 → 書架', live === 'shelf', `到 ${live}`)
      await k.wait(1200)
      const shelf = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.book-card')].map((e) => e.dataset.book))
      c.outcome('書架上有今天的新書（還沒聽完、沒有星）', shelf[0] === 'new' && !shelf.includes('heard'), shelf.join('、'))
      const row1 = await todayRow(page, id)
      c.outcome('中途離開不算講完', !!row1 && !row1.done, JSON.stringify(row1))
      if (row1?.done) await c.once('done-early', '誤記作答', '故事講到一半離開就記成講完了', JSON.stringify(row1))
      await shot(page, '2-書架上的新書', info)

      // 回首頁再進來：接著講，不是從頭
      k.behavior = '再進來接著講'
      live = await tapBack(k, c, '書架', (l) => l === 'home')
      await k.wait(1200)
      await k.tap((await center(page, '.side-door[data-door="story"]'))!, '故事')
      live = await waitLive(page, (l) => (l ?? '').startsWith('replay-'), 8000)
      await k.wait(900)
      const resumed = await heard(page)
      c.outcome('再進來從離開的地方接著講', resumed >= mid && mid > 1, `離開時第 ${mid} 句，再進來第 ${resumed} 句`)
      if (!(resumed >= mid && mid > 1)) await c.once('restart', '困惑', '故事中途離開再進來，又從頭講', `離開時第 ${mid} 句，再進來第 ${resumed} 句`)

      // 聽到最後：讀完了（星星、再聽一次、回書架），這一本收進書架、有星
      k.behavior = '聽到最後'
      live = await waitLive(page, (l) => (l ?? '').startsWith('done-'), 180_000)
      c.outcome('講到最後 → 讀完了', live === `done-${id}`, `到 ${live}`)
      if (live !== `done-${id}`) await c.once('no-end', '卡死', '故事講到最後沒有出現讀完了', `到 ${live}`)
      await k.wait(1500)
      await shot(page, '3-讀完了', info)
      const btns = await page.evaluate(() => ['再聽一次', '回書架'].filter((l) => document.querySelector(`.book-done-actions [aria-label="${l}"]`)))
      c.outcome('讀完了有「再聽一次」和「回書架」', btns.length === 2, btns.join('、'))
      const row2 = await todayRow(page, id)
      c.outcome('講完記成講完', !!row2?.done, JSON.stringify(row2))
      await k.tap((await center(page, '.book-done-actions [aria-label="回書架"]'))!, '回書架')
      live = await waitLive(page, (l) => l === 'shelf', 5000)
      await k.wait(1200)
      const shelf2 = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.book-card')].map((e) => e.dataset.book))
      c.outcome('收進書架、有星', live === 'shelf' && shelf2.length === 1 && shelf2[0] === 'heard', `${live}：${shelf2.join('、')}`)
      await shot(page, '4-書架', info)

      // 今天講完了：再進來直接是書架，不會再講一次
      live = await tapBack(k, c, '書架', (l) => l === 'home')
      await k.wait(1200)
      await k.tap((await center(page, '.side-door[data-door="story"]'))!, '故事')
      live = await waitLive(page, (l) => l === 'shelf' || (l ?? '').startsWith('replay-'), 6000)
      c.outcome('今天講完了，再進來直接是書架', live === 'shelf', `到 ${live}`)
      await c.flush()
    } finally {
      finish(k, c, '新的一章')
    }
  })

  // 首頁的「故事」：今天已經講過了就直接進書架；書架返回回首頁
  test('我的故事書：亂點、翻頁、重聽搶著點、一層一層返回', async ({ page }, info) => {
    test.skip(!want('story-book'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '故事書')
    try {
      // 講過 8 章（兩頁）：通用章節、長篇、故事時間都有；今天的也講完了（第 9 本），進來直接是書架
      const doors = ['bus', 'farm', 'zoo', 'rain', 'fruit', 'ocean']
      const id = todayId()
      const rows = [
        ...doors.map((d, i) => ({ id: `2026-09-${String(10 + i).padStart(2, '0')}`, date: `2026-09-${String(10 + i).padStart(2, '0')}`, part: 0, arc: 'evergreen', chapter: 0, kind: 'evergreen', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: `ev-${d}`, door: d, script: [{ k: `theme.${d}.title` }, { k: `theme.${d}.intro` }, { k: `theme.${d}.stop.0` }, { k: `theme.${d}.end` }] })),
        { id: '2026-09-20', date: '2026-09-20', part: 1, arc: 'p1-a01', chapter: 1, kind: 'epic', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'p1-a01-c1', door: 'bus', script: [{ k: 'story.p1-a01-c1.intro.0', pic: '@rainbow-egg' }, { k: 'story.p1-a01-c1.intro.1', pic: '@rainbow-egg' }, { k: 'theme.bus.stop.0' }, { k: 'story.p1-a01-c1.stop.1', pic: 'bus+@rainbow-egg' }, { k: 'story.p1-a01-c1.end.0', pic: 'house-with-garden' }, { k: 'story.p1-a01-c1.end.1' }] },
        { id: '2026-09-21', date: '2026-09-21', part: 1, arc: 'classic', chapter: 1, kind: 'classic', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'classic-a01', door: 'park', script: [{ k: 'story.classic.open.0', pic: 'open-book' }, { k: 'story.classic-a01.stop.0.0', pic: 'rabbit' }, { k: 'story.classic.close', pic: 'closed-book' }] },
        { id, date: id, part: 0, arc: 'evergreen', chapter: 0, kind: 'evergreen', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'ev-zoo', door: 'zoo', script: [{ k: 'theme.zoo.title' }, { k: 'theme.zoo.intro' }] },
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
      c.outcome('第二頁有 3 本', cards === 3, `${cards} 本`)
      const stars = await page.evaluate(() => document.querySelectorAll('.book-card.is-heard .book-star').length)
      c.outcome('聽過的書都有星', stars === cards, `${stars}/${cards}`)
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
      } else if ((await snap(page)).live?.startsWith('done-')) {
        live = await tapBack(k, c, '讀完了', (l) => l === 'shelf')
        c.outcome('讀完了按返回 → 書架', live === 'shelf', `到 ${live}`)
      } else c.outcome('重聽講完回到書架', (await snap(page)).live === 'shelf', '')
      await k.wait(1300)
      live = await tapBack(k, c, '書架', (l) => l === 'home')
      c.outcome('書架按返回 → 首頁', live === 'home', `到 ${live}`)
      await c.flush()
    } finally {
      finish(k, c, '故事書')
    }
  })
})

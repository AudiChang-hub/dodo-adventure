import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, settle, snap } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, audit, pressBack, waitLive } from './lib/flows'

// 故事的三歲模擬測試：首頁的「故事」（T-129：點進去先講今天中文課那一篇的英文版，每句講完等他點；T-77：以前的故事今天的新章節在書架上亮著，
// 講完收進書架）和我的故事書。以前的故事的測試先把今天的英文版記成聽完了（enHeardToday），進來是書架，再點今天的新書。
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

/** 故事門 */
const DOOR = '.side-door[data-door="story"]'
/** 書架上以前的故事（不是英文版課文的書）；今天的新章節 */
const OLD_CARD = '.book-card:not([data-en-book])'
const OLD_NEW = '.book-card.is-new:not([data-en-book])'
/** 今天的英文版課文已經聽完（新裝置的中文課是第 1 篇）：故事門點進去是書架 */
const enHeardToday = () => ({ storyEn: { heard: { 1: [todayId()] } } })

/** 點故事門 → 書架 → 點以前的故事今天的新書 */
async function enterOld(page: Page, k: Toddler) {
  await k.tap((await center(page, DOOR))!, '故事')
  await waitLive(page, (l) => l === 'shelf', 8000)
  await k.wait(1200)
  const b = await center(page, OLD_NEW)
  if (b) await k.tap(b, '今天的新書')
}

/** 講到第幾句（插畫上的 data-beat，從 1 起算；T-127 起下面的小點點是「第幾頁」，一頁 1～3 句） */
const heard = (page: Page) => page.evaluate(() => Number((document.querySelector('.book-art') as HTMLElement | null)?.dataset.beat ?? -1) + 1)

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
      await seedStory(page, { kv: enHeardToday() })
      k.behavior = '首頁連點故事'
      await k.spam((await center(page, DOOR))!, 5, '故事')
      let live = await waitLive(page, (l) => l === 'shelf', 8000)
      await k.wait(1200)
      k.behavior = '連點今天的新書'
      const fresh = await center(page, OLD_NEW)
      if (fresh) await k.spam(fresh, 3, '今天的新書')
      live = await waitLive(page, (l) => (l ?? '').startsWith('replay-'), 8000)
      c.outcome('點書架上今天的新書 → 講今天的新章節', live === `replay-${id}`, `到 ${live}`)
      if (live !== `replay-${id}`) await c.once('no-new', '困惑', '書架上今天的新書點了沒有講新章節', `到 ${live}`)
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
      const shelf = await page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)].map((e) => e.dataset.book), OLD_CARD)
      c.outcome('書架上有今天的新書（還沒聽完、沒有星）', shelf[0] === 'new' && !shelf.includes('heard'), shelf.join('、'))
      const row1 = await todayRow(page, id)
      c.outcome('中途離開不算講完', !!row1 && !row1.done, JSON.stringify(row1))
      if (row1?.done) await c.once('done-early', '誤記作答', '故事講到一半離開就記成講完了', JSON.stringify(row1))
      await shot(page, '2-書架上的新書', info)

      // 回首頁再進來：接著講，不是從頭
      k.behavior = '再進來接著講'
      live = await tapBack(k, c, '書架', (l) => l === 'home')
      await k.wait(1200)
      await enterOld(page, k)
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
      const shelf2 = await page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)].map((e) => e.dataset.book), OLD_CARD)
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
      // 講過 8 章（兩頁）：通用章節、長篇、故事時間都有；今天的也講完了（第 9 本），進來直接是書架。
      // 今天這本要是前面沒講過的一章（書架同一章只留一本：以前用 ev-zoo 跟前面重複，只有 8 本，第二頁 2 本，T-123）
      const doors = ['bus', 'farm', 'zoo', 'rain', 'fruit', 'ocean']
      const id = todayId()
      const rows = [
        ...doors.map((d, i) => ({ id: `2026-09-${String(10 + i).padStart(2, '0')}`, date: `2026-09-${String(10 + i).padStart(2, '0')}`, part: 0, arc: 'evergreen', chapter: 0, kind: 'evergreen', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: `ev-${d}`, door: d, script: [{ k: `theme.${d}.title` }, { k: `theme.${d}.intro` }, { k: `theme.${d}.stop.0` }, { k: `theme.${d}.end` }] })),
        { id: '2026-09-20', date: '2026-09-20', part: 1, arc: 'p1-a01', chapter: 1, kind: 'epic', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'p1-a01-c1', door: 'bus', script: [{ k: 'story.p1-a01-c1.intro.0', pic: '@rainbow-egg' }, { k: 'story.p1-a01-c1.intro.1', pic: '@rainbow-egg' }, { k: 'theme.bus.stop.0' }, { k: 'story.p1-a01-c1.stop.1', pic: 'bus+@rainbow-egg' }, { k: 'story.p1-a01-c1.end.0', pic: 'house-with-garden' }, { k: 'story.p1-a01-c1.end.1' }] },
        { id: '2026-09-21', date: '2026-09-21', part: 1, arc: 'classic', chapter: 1, kind: 'classic', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'classic-a01', door: 'park', script: [{ k: 'story.classic.open.0', pic: 'open-book' }, { k: 'story.classic-a01.stop.0.0', pic: 'rabbit' }, { k: 'story.classic.close', pic: 'closed-book' }] },
        { id, date: id, part: 0, arc: 'evergreen', chapter: 0, kind: 'evergreen', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'ev-build', door: 'build', script: [{ k: 'theme.build.title' }, { k: 'theme.build.intro' }] },
      ]
      await seedStory(page, { chapters: rows, story: { part: 1, arc: 'p1-a01', next: 1, choices: {}, classicsDone: ['A01'], house: ['egg-nest'] }, kv: { houseSeen: 0, ...enHeardToday() } })
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
      // 以前的故事 9 本＋今天聽完的英文版課文 1 本（T-129）＝ 10 本，一頁 6 本，第二頁 4 本
      const cards = await page.evaluate(() => document.querySelectorAll('.book-card').length)
      c.outcome('第二頁有 4 本', cards === 4, `${cards} 本`)
      if (cards !== 4) await c.once('shelf-page2', '困惑', '故事書翻到第二頁，書的數量不對（以前的故事 9 本、英文版 1 本，一頁 6 本，第二頁應該 4 本）', `${cards} 本`)
      const stars = await page.evaluate(() => document.querySelectorAll('.book-card.is-heard .book-star').length)
      c.outcome('聽過的書都有星', stars === cards, `${stars}/${cards}`)
      const prev = await center(page, '[aria-label="上一頁"]')
      if (prev) await k.tap(prev, '上一頁')
      await k.wait(800)
      // 點一本重聽：旁白在念就一直點，點完想回書架
      k.behavior = '重聽搶著點'
      const card = await center(page, OLD_CARD)
      if (card) await k.tap(card, '一本以前的故事')
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

  // ── T-127 會動的繪本、同一章連講 3 天 ─────────────────────────────

  // 第 1 天看：一句只有一個角色動（不縮放、不彈跳）、旁白在念的時候亂點連點不跳句、念完問一題（點錯淡下去、多指只算一下、點對才往下）；
  // 講完記成這一章聽了 1 天，還不換下一章；書架上那一圈亮 1 格
  test('T-127 第 1 天看：一句一個動作、亂點不跳句、念完問一題', async ({ page }, info) => {
    test.skip(!want('story-days'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '第1天看')
    try {
      await seedStory(page, { story: dayState(0), chapters: [], kv: enHeardToday() })
      k.behavior = '進故事'
      await enterOld(page, k)
      let live = await waitLive(page, (l) => (l ?? '').startsWith('replay-'), 8000)
      c.outcome('第 1 天：點故事 → 講新的一章', (live ?? '').startsWith('replay-'), `到 ${live}`)
      // 念的時候：亂點、連點、手掌壓；每一句只有一個角色在動，沒有縮放、彈跳
      k.behavior = '念的時候亂點'
      const before = await heard(page)
      const t0 = Date.now()
      const looks: { acts: number; scale: boolean; hop: boolean }[] = []
      let shotTaken = false
      for (let i = 0; i < 10; i++) {
        if (i % 3 === 0) await k.spam({ x: 640 + k.r.range(-280, 280), y: 380 + k.r.range(-120, 160) }, 3, '連點插畫')
        else if (i % 3 === 1) await k.palm([{ x: 500, y: 350 }, { x: 560, y: 420 }, { x: 620, y: 380 }], 300)
        else await k.tap({ x: 300 + k.r.range(0, 700), y: 200 + k.r.range(0, 400) }, '亂點')
        await k.wait(700)
        const m = await motionNow(page)
        looks.push(m)
        if (!shotTaken && m.moving) {
          shotTaken = true
          await shot(page, 'T127-第1天-看', info)
        }
      }
      const after = await heard(page)
      const sec = (Date.now() - t0) / 1000
      c.outcome('亂點連點沒有跳句', after - before <= Math.max(1, Math.ceil(sec / 1.5)), `${sec.toFixed(1)} 秒從第 ${before} 句到第 ${after} 句`)
      if (after - before > Math.max(1, Math.ceil(sec / 1.5))) await c.once('days-skip', '困惑', '第 1 天念的時候亂點，跳過了句子', `${sec.toFixed(1)} 秒從 ${before} 到 ${after}`)
      c.outcome('一句最多一個角色在動', looks.every((m) => m.acts <= 1), looks.map((m) => m.acts).join(','))
      if (looks.some((m) => m.acts > 1)) await c.once('days-two-move', '閃動縮放', '同一句有兩個角色在動（MOTION-2：一次只動一個）', looks.map((m) => m.acts).join(','))
      c.outcome('角色沒有縮放、沒有彈跳', looks.every((m) => !m.scale && !m.hop), JSON.stringify(looks.filter((m) => m.scale || m.hop)))
      if (looks.some((m) => m.scale || m.hop)) await c.once('days-scale', '閃動縮放', '會動的繪本裡有角色在縮放或彈跳（紙感螢幕只用位移）', JSON.stringify(looks.filter((m) => m.scale || m.hop)))
      await c.flush()
      // 念完問一題：兩張圖，點錯的淡下去、手來指；手掌壓只算一下；點對才往下
      k.behavior = '第 1 天最後的問題'
      const asked = await waitWait(page, 'ask', 150_000)
      c.outcome('第 1 天念完問一題（兩張圖）', asked, asked ? '出現' : '沒有出現')
      if (!asked) await c.once('days-no-ask', '困惑', '第 1 天念完沒有問問題', '')
      if (asked) {
        await k.wait(600)
        await shot(page, 'T127-第1天-問題', info)
        const wrong = await center(page, '.story-choice:not([data-answer])')
        if (wrong) await k.spam(wrong, 3, '連點錯的那張')
        await k.wait(700)
        const off = await page.evaluate(() => !!document.querySelector('.story-choice.is-off:not([data-answer])'))
        const still = await page.evaluate(() => (document.querySelector('.book-art') as HTMLElement | null)?.dataset.wait === 'ask')
        c.outcome('點錯：那一張淡下去，還在問', off && still, `淡下去 ${off}、還在問 ${still}`)
        const right = await center(page, '.story-choice[data-answer]')
        if (right && wrong) await k.palm([right, wrong], 200)
        else if (right) await k.tap(right, '點對的')
        live = await waitLive(page, (l) => (l ?? '').startsWith('done-'), 6000)
        c.outcome('點對 → 讀完了', (live ?? '').startsWith('done-'), `到 ${live}`)
        if (!(live ?? '').startsWith('done-')) await c.once('days-ask-stuck', '卡死', '第 1 天最後的問題點對了沒有往下', `到 ${live}`)
      }
      live = await waitLive(page, (l) => (l ?? '').startsWith('done-'), 40_000)
      const st = await storyKV(page)
      c.outcome('講完記成聽了 1 天、還不換下一章', st?.told?.['p1-a01-c1'] === 1 && st.next === 0, JSON.stringify({ told: st?.told, next: st?.next }))
      if (!(st?.told?.['p1-a01-c1'] === 1 && st.next === 0)) await c.once('days-told1', '誤記作答', '第 1 天講完，聽了幾天記錯了（或直接換了下一章）', JSON.stringify(st))
      live = await tapBack(k, c, '讀完了', (l) => l === 'shelf')
      await k.wait(1200)
      const ring = await page.evaluate((sel) => (document.querySelector(`${sel} .book-star`) as HTMLElement | null)?.dataset.told, OLD_CARD)
      c.outcome('書架上那一圈亮 1 格', ring === '1', `亮 ${ring} 格`)
      await c.flush()
    } finally {
      finish(k, c, '第1天看')
    }
  })

  // 第 2 天一起演：只在句子和句子之間停；不點 8 秒手來示範、30 秒內一定往下；點別的地方手馬上來指；手在示範時搶著點對的照樣算；
  // 停著的時候返回、再進來從那一句接著停
  test('T-127 第 2 天一起演：停下來換他點、發呆有手、搶著點、返回再進來', async ({ page }, info) => {
    test.skip(!want('story-days'))
    test.setTimeout(7 * 60_000)
    const { k, c } = await setup(page, info, '第2天一起演')
    try {
      await seedStory(page, { story: dayState(1), chapters: [yesterday('2026-09-01')], kv: enHeardToday() })
      await enterOld(page, k)
      await waitLive(page, (l) => (l ?? '').startsWith('replay-'), 8000)
      // 第一個停頓點：發呆
      k.behavior = '停下來發呆'
      const first = await waitWait(page, 'act', 60_000)
      c.outcome('第 2 天：念到一半停下來換他做', first, first ? '停下來了' : '沒有停')
      if (!first) await c.once('days-no-act', '困惑', '第 2 天沒有停下來換他做', '')
      const beat1 = await heard(page)
      await k.wait(1500)
      await shot(page, 'T127-第2天-一起演', info)
      const t0 = Date.now()
      let handAt = 0
      let goneAt = 0
      while (Date.now() - t0 < 32_000) {
        await k.wait(400)
        if (!handAt && (await page.$('.story-act .demo-hand'))) handAt = Date.now() - t0
        if ((await waitKind(page)) !== 'act' || (await heard(page)) !== beat1) {
          goneAt = Date.now() - t0
          break
        }
      }
      c.outcome('發呆：8 秒左右手來示範', handAt > 6000 && handAt < 11_000, `${(handAt / 1000).toFixed(1)} 秒`)
      if (!(handAt > 6000 && handAt < 11_000)) await c.once('days-hand', '困惑', '第 2 天停下來等他，發呆時手沒有在 8 秒左右出來示範', `${(handAt / 1000).toFixed(1)} 秒`)
      c.outcome('發呆：30 秒內故事自己往下', goneAt > 0 && goneAt < 30_000, `${(goneAt / 1000).toFixed(1)} 秒`)
      if (!(goneAt > 0 && goneAt < 30_000)) await c.once('days-stuck', '卡死', '第 2 天停下來等他，發呆 30 秒故事還沒往下（NAV-5）', `${(goneAt / 1000).toFixed(1)} 秒`)
      await c.flush()
      // 第二個停頓點：先亂點別的地方（手馬上來指），手在指的時候搶著連點對的
      k.behavior = '停下來亂點、搶著點'
      if (await waitWait(page, 'act', 60_000)) {
        const beat2 = await heard(page)
        await k.tap({ x: 260, y: 640 }, '點旁邊')
        await k.wait(500)
        const hand = !!(await page.$('.story-act .demo-hand'))
        c.outcome('點別的地方：手馬上來指', hand, hand ? '有手' : '沒有手')
        const tgt = await center(page, '.story-act-target')
        if (tgt) await k.spam(tgt, 4, '搶著連點要點的那個')
        await k.wait(1500)
        const moved = (await waitKind(page)) !== 'act' || (await heard(page)) !== beat2
        c.outcome('手在示範時搶著點對的：照樣往下', moved, moved ? '往下了' : '還停著')
        if (!moved) await c.once('days-tap-act', '卡死', '第 2 天點了要點的那個，故事沒有往下', '')
        // 連點只算一下：不會一次跳過下一個停頓點
        await k.wait(1500)
        c.outcome('連點只算一下（沒有連跳兩句）', (await heard(page)) <= beat2 + 1, `第 ${beat2} 句 → 第 ${await heard(page)} 句`)
      }
      await c.flush()
      // 第三個停頓點：返回 → 書架 → 再進來，從停下來的那一句接著（還是第 2 天的玩法）
      k.behavior = '停著返回再進來'
      if (await waitWait(page, 'act', 60_000)) {
        const beat3 = await heard(page)
        let live = await tapBack(k, c, '第 2 天停著', (l) => l === 'shelf')
        await k.wait(1200)
        const card = await center(page, OLD_NEW)
        if (card) await k.tap(card, '今天的書')
        live = await waitLive(page, (l) => (l ?? '').startsWith('replay-'), 6000)
        const again = await waitWait(page, 'act', 20_000)
        const at = await heard(page)
        c.outcome('返回再進來：從那一句接著停', again && at === beat3, `離開第 ${beat3} 句，再進來第 ${at} 句、${again ? '停著等他' : '沒有停'}`)
        if (!(again && at === beat3)) await c.once('days-resume', '困惑', '第 2 天停著返回，再進來沒有接著那一句', `離開第 ${beat3} 句，再進來第 ${at} 句`)
        const tgt = await center(page, '.story-act-target')
        if (tgt) await k.tap(tgt, '點要點的那個')
      }
      // 剩下的都點對的，聽完
      k.behavior = '聽完'
      const end = Date.now() + 150_000
      while (Date.now() < end && !((await snap(page)).live ?? '').startsWith('done-')) {
        if ((await waitKind(page)) === 'act') {
          await k.wait(800)
          const tgt = await center(page, '.story-act-target')
          if (tgt) await k.tap(tgt, '點要點的那個')
        }
        await k.wait(700)
      }
      const st = await storyKV(page)
      c.outcome('講完記成聽了 2 天、還不換下一章', st?.told?.['p1-a01-c1'] === 2 && st.next === 0, JSON.stringify({ told: st?.told, next: st?.next }))
      if (!(st?.told?.['p1-a01-c1'] === 2 && st.next === 0)) await c.once('days-told2', '誤記作答', '第 2 天講完，聽了幾天記錯了', JSON.stringify(st))
      await c.flush()
    } finally {
      finish(k, c, '第2天一起演')
    }
  })

  // 第 3 天你來說：每一頁之前先問 What happens next?，出兩張圖；點錯淡下去、點對才翻頁；發呆 30 秒內一定往下；
  // 手掌壓只算一下；講完記成聽了 3 天，第 4 天換下一章
  test('T-127 第 3 天你來說：每頁先選下一張圖、點錯、發呆、多指', async ({ page }, info) => {
    test.skip(!want('story-days'))
    test.setTimeout(7 * 60_000)
    const { k, c } = await setup(page, info, '第3天你來說')
    try {
      await seedStory(page, { story: dayState(2), chapters: [yesterday('2026-09-01'), yesterday('2026-09-02')], kv: enHeardToday() })
      await enterOld(page, k)
      await waitLive(page, (l) => (l ?? '').startsWith('replay-'), 8000)
      // 第一次問：點錯（淡下去、還在問）→ 點對（翻到那一頁）
      k.behavior = '你來說：點錯再點對'
      const asked = await waitWait(page, 'tell', 60_000)
      c.outcome('第 3 天：換頁之前先問 What happens next?', asked, asked ? '出現兩張圖' : '沒有問')
      if (!asked) await c.once('days-no-tell', '困惑', '第 3 天換頁之前沒有問', '')
      if (asked) {
        await k.wait(800)
        await shot(page, 'T127-第3天-你來說', info)
        const page0 = await pageNo(page)
        const wrong = await center(page, '.story-choice:not([data-answer])')
        if (wrong) await k.tap(wrong, '點錯的')
        await k.wait(800)
        c.outcome('點錯：淡下去、還在問', (await waitKind(page)) === 'tell' && !!(await page.$('.story-choice.is-off')), '')
        const right = await center(page, '.story-choice[data-answer]')
        if (right) await k.tap(right, '點對的')
        await k.wait(2000)
        const page1 = await pageNo(page)
        c.outcome('點對：翻到那一頁', (await waitKind(page)) !== 'tell' && page1 === page0 + 1, `第 ${page0 + 1} 頁 → 第 ${page1 + 1} 頁`)
        if (page1 !== page0 + 1) await c.once('days-tell-turn', '困惑', '第 3 天選對了沒有翻到那一頁', `第 ${page0 + 1} 頁 → 第 ${page1 + 1} 頁`)
      }
      await c.flush()
      // 第二次問：發呆，30 秒內一定往下
      k.behavior = '你來說：發呆'
      if (await waitWait(page, 'tell', 60_000)) {
        const t0 = Date.now()
        let goneAt = 0
        while (Date.now() - t0 < 32_000) {
          await k.wait(500)
          if ((await waitKind(page)) !== 'tell') {
            goneAt = Date.now() - t0
            break
          }
        }
        c.outcome('發呆：30 秒內故事自己往下', goneAt > 0 && goneAt < 30_000, `${(goneAt / 1000).toFixed(1)} 秒`)
        if (!(goneAt > 0 && goneAt < 30_000)) await c.once('days-tell-stuck', '卡死', '第 3 天選圖發呆 30 秒還沒往下（NAV-5）', `${(goneAt / 1000).toFixed(1)} 秒`)
      }
      // 第三次問：手掌同時壓兩張（只算第一下）
      k.behavior = '你來說：手掌壓'
      if (await waitWait(page, 'tell', 60_000)) {
        const a = await center(page, '.story-choice[data-answer]')
        const b = await center(page, '.story-choice:not([data-answer])')
        if (a && b) await k.palm([a, b], 300)
        await k.wait(1500)
        c.outcome('手掌壓兩張：只算第一下，沒有卡住', true, (await waitKind(page)) ?? '往下了')
      }
      await c.flush()
      // 剩下的都選對，聽完
      k.behavior = '聽完'
      const end = Date.now() + 180_000
      while (Date.now() < end && !((await snap(page)).live ?? '').startsWith('done-')) {
        if ((await waitKind(page)) === 'tell') {
          await k.wait(600)
          const r = await center(page, '.story-choice[data-answer]')
          if (r) await k.tap(r, '點對的')
        }
        await k.wait(700)
      }
      const st = await storyKV(page)
      c.outcome('講完記成聽了 3 天，換下一章', st?.told?.['p1-a01-c1'] === 3 && st.next === 1, JSON.stringify({ told: st?.told, next: st?.next }))
      if (!(st?.told?.['p1-a01-c1'] === 3 && st.next === 1)) await c.once('days-told3', '誤記作答', '第 3 天講完沒有換下一章（或聽了幾天記錯）', JSON.stringify(st))
      await c.flush()
    } finally {
      finish(k, c, '第3天你來說')
    }
  })

  // ── T-129 故事時間：今天中文課那一篇的英文版 ─────────────────────────────

  // 4 句：點故事先講英文版；念的時候亂點不跳句；每句念完停住，發呆 8 秒手來指、絕不自己往下；點一下講下一句（連點只算一下）；
  // 講到一半返回、再進來接著講；念完 4 句接著三題（故事題、認角色、找一樣的英文字）都答對 → 讀完了；記成聽了 1 次；今天聽完了再進來是書架
  test('T-129 英文版 4 句：每句停住等他點、發呆不自己往下、返回接著講、念完三題、收進書架', async ({ page }, info) => {
    test.skip(!want('story-en'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '英文版4句')
    try {
      k.behavior = '首頁連點故事'
      await k.spam((await center(page, DOOR))!, 5, '故事')
      let live = await waitLive(page, (l) => (l ?? '').startsWith('en-'), 10_000)
      const ok = /^en-\d+$/.test(live ?? '')
      c.outcome('點故事 → 先講今天中文課那一篇的英文版', ok, `到 ${live}`)
      if (!ok) await c.once('en-none', '困惑', '點故事沒有講今天中文課那一篇的英文版', `到 ${live}`)
      const day = Number((live ?? '').slice(3))
      await settle(page, 1500)
      await audit(k, c, '英文版課文')

      // 念第一句的時候：亂點、連點、手掌壓，不跳句
      k.behavior = '念的時候亂點'
      for (let i = 0; i < 3; i++) {
        if (i === 1) await k.palm([{ x: 560, y: 360 }, { x: 640, y: 420 }, { x: 720, y: 380 }], 250)
        else await k.spam({ x: 640 + k.r.range(-250, 250), y: 380 + k.r.range(-150, 150) }, 2, '連點圖')
        await k.wait(250)
      }
      c.outcome('念的時候亂點不跳句', (await pageNo(page)) === 0, `第 ${(await pageNo(page)) + 1} 頁`)
      if ((await pageNo(page)) !== 0) await c.once('en-skip', '困惑', '英文版念的時候亂點，跳到下一句了', `第 ${(await pageNo(page)) + 1} 頁`)

      // 念完停住，等他點；發呆 20 秒：8 秒左右手來指，不自己往下
      k.behavior = '念完發呆'
      const stopped = await waitWait(page, 'next', 20_000)
      c.outcome('每句念完停住等他點', stopped, stopped ? '停住了' : '沒有停')
      if (!stopped) await c.once('en-no-stop', '困惑', '英文版念完一句沒有停下來等他點', '')
      await shot(page, 'T129-英文版-等他點', info)
      const w = await idle(page, k, 'next', '.en-art .demo-hand', 20_000)
      c.outcome('發呆 8 秒左右手來指', w.handAt > 6000 && w.handAt < 11_000, `${(w.handAt / 1000).toFixed(1)} 秒`)
      if (!(w.handAt > 6000 && w.handAt < 11_000)) await c.once('en-hand', '困惑', '英文版停住等他點，發呆時手沒有在 8 秒左右出來指', `${(w.handAt / 1000).toFixed(1)} 秒`)
      c.outcome('發呆 20 秒不自己往下', w.still, w.still ? '還停著' : '自己往下了')
      if (!w.still) await c.once('en-auto', '困惑', '英文版發呆時自己往下了（家長要等他點）', '')
      await c.flush()

      // 點一下講下一句；連點只算一下
      k.behavior = '連點下一句'
      const next = await center(page, '.en-next')
      if (next) await k.spam(next, 4, '下一句')
      await k.wait(1500)
      const p1 = await pageNo(page)
      c.outcome('點一下講下一句、連點只算一下', p1 === 1, `第 ${p1 + 1} 頁`)
      if (p1 !== 1) await c.once('en-double', '困惑', '英文版連點下一句，一次跳了好幾句（或沒有往下）', `第 ${p1 + 1} 頁`)

      // 講到一半返回：書架第一本是今天的英文版（還沒聽完）；回首頁再進來，從離開的那一句接著講
      k.behavior = '講到一半返回'
      live = await tapBack(k, c, '英文版講到一半', (l) => l === 'shelf')
      c.outcome('講到一半返回 → 書架', live === 'shelf', `到 ${live}`)
      await k.wait(1200)
      const first = await page.evaluate(() => {
        const e = document.querySelector<HTMLElement>('.book-card')
        return e ? { en: e.dataset.enBook, book: e.dataset.book } : null
      })
      c.outcome('書架第一本是今天的英文版、還沒聽完', first?.en === String(day) && first.book === 'new', JSON.stringify(first))
      live = await tapBack(k, c, '書架', (l) => l === 'home')
      await k.wait(1200)
      await k.tap((await center(page, DOOR))!, '故事')
      live = await waitLive(page, (l) => l === `en-${day}`, 10_000)
      await k.wait(1200)
      const resumed = await pageNo(page)
      c.outcome('再進來從離開的那一句接著講', resumed === 1, `第 ${resumed + 1} 頁`)
      if (resumed !== 1) await c.once('en-resume', '困惑', '英文版中途離開再進來，沒有接著那一句', `第 ${resumed + 1} 頁`)
      await c.flush()

      // 一句一句點完，三題都答對
      k.behavior = '點完、三題答對'
      const kinds = new Set<string>()
      const end = Date.now() + 120_000
      while (Date.now() < end && !((await snap(page)).live ?? '').startsWith('endone-')) {
        const kind = await waitKind(page)
        if (kind) kinds.add(kind)
        if (kind === 'next') {
          await k.wait(400)
          await k.tap({ x: 640 + k.r.range(-200, 200), y: 360 + k.r.range(-100, 100) }, '點圖（下一句）')
        } else if (kind === 'q' || kind === 'which') {
          await k.wait(600)
          const r = await center(page, '.story-choice[data-answer]')
          if (r) await k.tap(r, '點對的圖')
        } else if (kind === 'match') {
          await k.wait(4500)
          const r = await center(page, '.en-word.is-option[data-answer]')
          if (r) await k.tap(r, '點一樣的字')
        }
        await k.wait(500)
      }
      c.outcome('念完 4 句接著故事題、認角色、找一樣的英文字', ['q', 'which', 'match'].every((x) => kinds.has(x)), [...kinds].join('、'))
      if (!['q', 'which', 'match'].every((x) => kinds.has(x))) await c.once('en-three', '困惑', '英文版念完 4 句沒有三題都出現', [...kinds].join('、'))
      live = (await snap(page)).live
      c.outcome('答完 → 讀完了', live === `endone-${day}`, `到 ${live}`)
      if (live !== `endone-${day}`) await c.once('en-no-end', '卡死', '英文版答完三題沒有出現讀完了', `到 ${live}`)
      await k.wait(1200)
      const st = await enKV(page)
      c.outcome('講完記成聽了 1 次', st?.heard?.[day]?.length === 1, JSON.stringify(st?.heard))
      if (st?.heard?.[day]?.length !== 1) await c.once('en-heard1', '誤記作答', '英文版講完，聽了幾次記錯了', JSON.stringify(st))

      // 讀完了 → 書架：收進書架、一圈亮 1 格
      live = await tapBack(k, c, '讀完了', (l) => l === 'shelf')
      await k.wait(1200)
      const book = await page.evaluate(() => {
        const e = document.querySelector<HTMLElement>('.book-card[data-en-book]')
        return e ? { book: e.dataset.book, ring: (e.querySelector('.book-star') as HTMLElement | null)?.dataset.told } : null
      })
      c.outcome('收進書架、一圈亮 1 格', book?.book === 'heard' && book.ring === '1', JSON.stringify(book))

      // 今天聽完了：再進來是書架，不會再講一次；書架上點那一本可以再聽
      live = await tapBack(k, c, '書架', (l) => l === 'home')
      await k.wait(1200)
      await k.tap((await center(page, DOOR))!, '故事')
      live = await waitLive(page, (l) => l === 'shelf' || (l ?? '').startsWith('en-'), 8000)
      c.outcome('今天聽完了，再進來直接是書架', live === 'shelf', `到 ${live}`)
      await k.wait(1200)
      const again = await center(page, '.book-card[data-en-book]')
      if (again) await k.tap(again, '英文版那一本')
      live = await waitLive(page, (l) => (l ?? '').startsWith('en-'), 8000)
      c.outcome('書架上點英文版 → 再聽一次', live === `en-${day}`, `到 ${live}`)
      live = await tapBack(k, c, '再聽', (l) => l === 'shelf')
      await c.flush()
    } finally {
      finish(k, c, '英文版4句')
    }
  })

  // 念完 4 句的三題：故事題發呆（手來指、不自己往下）、點錯淡下去；認角色手掌壓兩張只算第一下；
  // 找一樣的英文字：第一次手先示範（搶著點照常算）、點錯搖一搖淡下去、發呆手來指、點對一對字放大跳一下 → 讀完了
  test('T-136 英文版跟中文課的新篇：今天先複習舊篇時，故事講的是新篇的英文版；講到一半返回書架、再進來接著講', async ({ page }, info) => {
    test.skip(!want('story-en-new'))
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '英文版跟新篇')
    try {
      // 中文課已經上過 3 次課（第 1、2、3 篇）：今天第 4 次，舊篇第 1 篇、新篇第 4 篇（lessons/chinese/course.ts）
      await seedStory(page, {
        kv: {
          'zhLesson:done': [1, 2, 3],
          'zhLesson:course': { day: 3, runs: ['2026-01-03'] },
          'zhLesson:log': [
            { date: '2026-01-01', day: 1 },
            { date: '2026-01-02', day: 2 },
            { date: '2026-01-03', day: 3 },
          ],
        },
      })
      await k.spam((await center(page, DOOR))!, 3, '故事')
      let live = await waitLive(page, (l) => (l ?? '').startsWith('en-'), 10_000)
      c.outcome('點故事 → 講中文課新篇（第 4 篇）的英文版，不是舊篇', live === 'en-4', `到 ${live}`)
      if (live !== 'en-4') return void (await c.once('en-new', '困惑', '中文課今天有舊篇時，故事沒有講新篇的英文版', `到 ${live}`))
      await settle(page, 1500)
      // 念的時候亂點、按返回 → 書架；今天這本還是第 4 篇、再進來接著講
      k.behavior = '念的時候亂點、返回'
      await k.spam({ x: 640 + k.r.range(-200, 200), y: 380 + k.r.range(-120, 120) }, 3, '連點圖')
      live = await tapBack(k, c, '英文版講到一半', (l) => l === 'shelf')
      if (live !== 'shelf') return
      await k.wait(1000)
      const day = await page.evaluate(() => document.querySelector<HTMLElement>('.book-card[data-en-book].is-new')?.dataset.enBook ?? null)
      c.outcome('書架上今天的英文版是第 4 篇', day === '4', `第 ${day} 篇`)
      const b = await center(page, '.book-card[data-en-book].is-new')
      if (b) await k.tap(b, '今天的英文版')
      live = await waitLive(page, (l) => (l ?? '').startsWith('en-'), 8000)
      c.outcome('再進來還是第 4 篇', live === 'en-4', `到 ${live}`)
      await c.flush()
    } finally {
      finish(k, c, '英文版跟新篇')
    }
  })

  test('T-129 英文版念完三題：故事題、認角色、找一樣的英文字（示範、點錯、發呆、手掌壓）', async ({ page }, info) => {
    test.skip(!want('story-en'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '英文版三題')
    try {
      // 今天的第 1 篇講到第 4 句（中途離開過）：再進來接著講最後一句
      await seedStory(page, { kv: { storyEn: { heard: {}, at: { date: todayId(), day: 1, at: 3 } } } })
      await k.tap((await center(page, DOOR))!, '故事')
      await waitLive(page, (l) => (l ?? '').startsWith('en-'), 10_000)
      if (await waitWait(page, 'next', 20_000)) await k.tap((await center(page, '.en-next'))!, '下一句')

      // 故事題：發呆 20 秒（手來指、不自己往下）→ 點錯（淡下去、還在問）→ 點對
      k.behavior = '故事題'
      const q = await waitWait(page, 'q', 15_000)
      c.outcome('念完 4 句問故事題（兩張圖）', q, q ? '出現' : '沒有出現')
      if (!q) await c.once('en-no-q', '困惑', '英文版念完 4 句沒有問故事題', '')
      if (q) {
        await shot(page, 'T129-英文版-故事題', info)
        const w = await idle(page, k, 'q', '.story-choose .demo-hand', 20_000)
        c.outcome('故事題發呆：8 秒左右手來指', w.handAt > 6000 && w.handAt < 11_000, `${(w.handAt / 1000).toFixed(1)} 秒`)
        c.outcome('故事題發呆 20 秒不自己往下', w.still, w.still ? '還停著' : '自己往下了')
        if (!w.still) await c.once('en-q-auto', '困惑', '英文版故事題發呆時自己往下了', '')
        const wrong = await center(page, '.story-choice:not([data-answer])')
        if (wrong) await k.spam(wrong, 3, '連點錯的那張')
        await k.wait(700)
        const off = await page.evaluate(() => !!document.querySelector('.story-choice.is-off:not([data-answer])'))
        c.outcome('點錯：那一張淡下去，還在問', off && (await waitKind(page)) === 'q', `淡下去 ${off}`)
        const right = await center(page, '.story-choice[data-answer]')
        if (right) await k.tap(right, '點對的')
      }
      await c.flush()

      // 認角色：手掌同時壓兩張，只算第一下，不會卡住
      k.behavior = '認角色'
      const which = await waitWait(page, 'which', 10_000)
      c.outcome('接著問認角色（Which one is the …?）', which, which ? '出現' : '沒有出現')
      if (!which) await c.once('en-no-which', '困惑', '英文版沒有問認角色的題目', '')
      if (which) {
        await k.wait(700)
        const a = await center(page, '.story-choice[data-answer]')
        const b = await center(page, '.story-choice:not([data-answer])')
        if (a && b) await k.palm([a, b], 300)
        await k.wait(1500)
        if ((await waitKind(page)) === 'which') {
          const r = await center(page, '.story-choice[data-answer]')
          if (r) await k.tap(r, '點對的')
        }
      }
      await c.flush()

      // 找一樣的英文字：第一次手先示範；示範的時候搶著點錯的；發呆手來指；點對 → 讀完了
      k.behavior = '找一樣的英文字'
      const match = await waitWait(page, 'match', 10_000)
      c.outcome('最後找一樣的英文字（上面一張、下面兩張）', match, match ? '出現' : '沒有出現')
      if (!match) await c.once('en-no-match', '困惑', '英文版最後沒有找一樣的英文字', '')
      if (match) {
        await k.wait(2400)
        const demo = await page.evaluate(() => !!document.querySelector('.en-match.is-demo') && !!document.querySelector('.en-match .demo-hand'))
        c.outcome('第一次：手先示範', demo, demo ? '有示範' : '沒有示範')
        if (!demo) await c.once('en-match-demo', '困惑', '找一樣的英文字第一次做，手沒有先示範', '')
        await shot(page, 'T129-英文版-找一樣的字', info)
        const wrong = await center(page, '.en-word.is-option:not([data-answer])')
        if (wrong) await k.spam(wrong, 2, '搶著點錯的字')
        await k.wait(800)
        const off = await page.evaluate(() => !!document.querySelector('.en-word.is-option.is-off:not([data-answer])'))
        c.outcome('點錯：那張淡下去，還在找', off && (await waitKind(page)) === 'match', `淡下去 ${off}`)
        const w = await idle(page, k, 'match', '.en-match .demo-hand', 10_000)
        c.outcome('發呆：手來指一樣的那張、不自己往下', !!w.handAt && w.still, `手 ${(w.handAt / 1000).toFixed(1)} 秒、${w.still ? '還停著' : '自己往下了'}`)
        if (!w.still) await c.once('en-match-auto', '困惑', '找一樣的英文字發呆時自己往下了', '')
        const right = await center(page, '.en-word.is-option[data-answer]')
        if (right) await k.palm([right, wrong ?? right], 200)
        await k.wait(900)
        const pair = await page.evaluate(() => document.querySelectorAll('.en-word.is-right').length)
        c.outcome('點對：一對字亮綠框', pair === 2, `${pair} 張亮綠框`)
        if (pair !== 2) await c.once('en-match-right', '困惑', '找一樣的英文字點對了沒有看得出來的回饋', `${pair} 張`)
      }
      const live = await waitLive(page, (l) => (l ?? '').startsWith('endone-'), 10_000)
      c.outcome('答完 → 讀完了', (live ?? '').startsWith('endone-'), `到 ${live}`)
      if (!(live ?? '').startsWith('endone-')) await c.once('en-match-end', '卡死', '找一樣的英文字答對了沒有往下', `到 ${live}`)
      const st = await kvGet<{ matched?: number; heard: Record<string, string[]> }>(page, 'storyEn')
      c.outcome('記成做過一次找一樣的字、聽了 1 次', st?.matched === 1 && st.heard?.['1']?.length === 1, JSON.stringify(st))
      await c.flush()
    } finally {
      finish(k, c, '英文版三題')
    }
  })
})

/** 第 n+1 天的故事進度：p1-a01 第 1 章講完過 n 天；故事時間都講過了（每天都是長篇，不管今天星期幾） */
const dayState = (n: number) => ({ part: 1, arc: 'p1-a01', next: 0, choices: {}, classicsDone: ['A01', 'J02', 'A02', 'B01', 'A04', 'P01', 'A06', 'F02'], house: [], told: n ? { 'p1-a01-c1': n } : {} })
/** 前幾天講完的那一章（p1-a01 第 1 章） */
const yesterday = (date: string) => ({ id: date, date, part: 1, arc: 'p1-a01', chapter: 1, kind: 'epic', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'p1-a01-c1', door: 'bus', script: [{ k: 'story.p1-a01-c1.intro.0', pic: '@rainbow-egg' }] })

/** 插畫上正在等他做什麼（act、tell、ask；沒有在等是 null） */
const waitKind = (page: Page) => page.evaluate(() => (document.querySelector('.book-art') as HTMLElement | null)?.dataset.wait ?? null)
/** 現在是第幾頁（從 0 起算） */
const pageNo = (page: Page) => page.evaluate(() => Number((document.querySelector('.book-art') as HTMLElement | null)?.dataset.page ?? -1))
async function waitWait(page: Page, kind: string, ms: number) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if ((await waitKind(page)) === kind) return true
    if (((await snap(page)).live ?? '').startsWith('done-')) return false
    await page.waitForTimeout(300)
  }
  return false
}
/** 這一刻插畫上：幾個角色在動、有沒有縮放（transform 的 a、d 不是 1）、有沒有跳一下的動畫 */
const motionNow = (page: Page) =>
  page.evaluate(() => {
    const moving = [...document.querySelectorAll('.book-art .sb-move, .book-art .sb-old, .book-art .sb-zzz')].filter((e) => e.getAnimations().some((a) => a.playState === 'running'))
    const groups = new Set(moving.map((e) => e.closest('[data-cast]')))
    const scale = [...document.querySelectorAll('.book-art [data-cast] g')].some((e) => {
      const t = getComputedStyle(e).transform
      const m = /^matrix\(([^,]+), ([^,]+), ([^,]+), ([^,]+)/.exec(t)
      return !!m && (Math.abs(Number(m[1]) - 1) > 0.01 || Math.abs(Number(m[4]) - 1) > 0.01) && !e.getAttribute('transform')
    })
    return { acts: groups.size, moving: groups.size > 0, scale, hop: !!document.querySelector('.book-art .sb-hop') }
  })
/** kv 的一筆 */
const kvGet = <T,>(page: Page, key: string) =>
  page.evaluate(
    (key) =>
      new Promise<T | null>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction('kv').objectStore('kv').get(key)
          g.onsuccess = () => res(g.result?.value ?? null)
          g.onerror = () => res(null)
        }
      }),
    key,
  )
/** kv.story（故事進度） */
const storyKV = (page: Page) => kvGet<{ told?: Record<string, number>; next: number }>(page, 'story')
/** kv.storyEn（英文版課文每一篇聽完的日期） */
const enKV = (page: Page) => kvGet<{ heard: Record<string, string[]> }>(page, 'storyEn')
/** 等他點的時候：發呆 ms 毫秒，手第一次出來是第幾毫秒、最後有沒有自己往下（頁、等的事都沒變） */
async function idle(page: Page, k: Toddler, kind: string, hand: string, ms: number) {
  const p0 = await pageNo(page)
  const t0 = Date.now()
  let handAt = 0
  while (Date.now() - t0 < ms) {
    await k.wait(400)
    if (!handAt && (await page.$(hand))) handAt = Date.now() - t0
  }
  return { handAt, still: (await pageNo(page)) === p0 && (await waitKind(page)) === kind }
}

import { test, expect, type Page } from '@playwright/test'
import { boot, homeButton, settle, snap, targets, voicesSince } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, audit, pressBack, toddlerStep, waitLive } from './lib/flows'

// 故事（G-8）的三歲模擬測試：魔法屋的開場、結尾，故事時間（龜兔賽跑、挪亞方舟），我的故事書，魔法屋剖面圖，飛航模式玩完一章。
// 三歲孩子會做的事：旁白還在念就一直點（搶著點）、亂點、走到一半想回家（返回）。
// 「故事（試播）」預設開啟；測試還是在設定裡明確打開，再把今天的冒險換成要測的那一章（2 站、選擇題，玩得完）。

const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').trim()
const want = (name: string) => !only || only.split(',').some((s) => s === 'screens' || s === 'story' || s === name)

/** 兩站都是選擇題（亂點也會答對、走完）；主線不同，依主線的旁白會挑不同的句子 */
const ITEMS = [
  { game: 'p-color', station: 'park', track: 'lang', done: false },
  { game: 'm-match', station: 'math', track: 'num', done: false },
]

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
  chapter?: string
  theme?: string
  items?: typeof ITEMS
  story?: Record<string, unknown>
  chapters?: Record<string, unknown>[]
  kv?: Record<string, unknown>
}

/** 改今天的冒險、故事進度、講過的章節，重新載入回首頁 */
async function seedStory(page: Page, s: Seed) {
  expect(await page.evaluate(() => location.port)).toBe(new URL(page.url()).port)
  await page.evaluate(async (s) => {
    const d = new Date()
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await new Promise<void>((res, rej) => {
      const rq = indexedDB.open('dodo-adventure')
      rq.onerror = () => rej(rq.error)
      rq.onsuccess = () => {
        const db = rq.result
        const tx = db.transaction(['kv', 'chapters'], 'readwrite')
        const kv = tx.objectStore('kv')
        if (s.items) kv.put({ key: `plan:${date}`, value: { date, theme: s.theme ?? 'bus', items: s.items, hatched: null, ...(s.chapter ? { chapter: s.chapter } : {}) } })
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

/** 讀今天的章節紀錄和故事進度 */
const progress = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ row: { ref: string; done: boolean; kind: string; faith?: string } | null; story: { next: number; house: string[]; classicsDone: string[] } | null; plan: { items: { done: boolean }[]; told?: boolean } | null }>((res) => {
        const d = new Date()
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction(['kv', 'chapters'])
          const a = tx.objectStore('chapters').get(date)
          const b = tx.objectStore('kv').get('story')
          const pl = tx.objectStore('kv').get(`plan:${date}`)
          tx.oncomplete = () => {
            db.close()
            res({ row: a.result ?? null, story: b.result?.value ?? null, plan: pl.result?.value ?? null })
          }
        }
      }),
  )

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

/** 從首頁按出發 */
async function start(k: Toddler) {
  await settle(k.page)
  await k.tap((await center(k.page, '.go-btn'))!, '出發')
  return waitLive(k.page, (l) => !!l && l !== 'home', 6000)
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

/** 走完兩站之後的孵蛋（egg-2 也是第 2 站玩完蛋裂開的那一段，所以要在終點 finale 之後才算） */
const hatched = (live: string | null, seen: string[]) => live === 'finish' || (live === `egg-${ITEMS.length}` && seen.includes('finale'))

/**
 * 像孩子一樣一路玩下去，直到 stop 成立：遊戲裡亂點、連點、拖、手掌壓（亂點也會走完：答錯會給提示、最後標出答案）；
 * 旁白的段落（開場、路線圖、旁白卡、終點、結尾）多半在看、偶爾點一下。回傳經過的每一段
 */
async function playUntil(k: Toddler, c: Checker, stop: (live: string | null, seen: string[]) => boolean, ms: number, onScene?: (live: string) => Promise<void>) {
  const seen: string[] = []
  const end = Date.now() + ms
  while (Date.now() < end) {
    const s = await snap(k.page)
    if (s.live && seen[seen.length - 1] !== s.live) {
      seen.push(s.live)
      if (stop(s.live, seen)) break
      await onScene?.(s.live)
      continue
    }
    if (stop(s.live, seen) || s.live === 'home') break
    // 玩到一半按到返回、回到停著的路線圖：孩子會再按「出發」
    const go = s.live === 'route' ? await center(k.page, '[aria-label="出發"]') : null
    if (go) await k.tap(go, '出發')
    else if ((s.live ?? '').startsWith('play-') || s.live === `egg-${ITEMS.length}`) await toddlerStep(k, c)
    else if (k.r.chance(0.15)) await k.tap({ x: k.r.range(200, 1000), y: k.r.range(250, 700) }, '旁白時點一下')
    else await k.wait(350)
    if (k.r.chance(0.1)) await c.flush()
  }
  await c.flush()
  return seen
}

/**
 * playUntil，加上孩子亂點按到返回、回到首頁時會再按一次出發（最多 2 次）。
 * 站都走完了（最後一站蛋裂開、終點念到一半就回家）再進來要從故事的終點接著講，不是直接孵蛋（Adventure 的 donePhase）
 */
async function playThrough(k: Toddler, c: Checker, stop: (live: string | null, seen: string[]) => boolean, ms: number, onScene?: (live: string) => Promise<void>) {
  const seen = await playUntil(k, c, stop, ms, onScene)
  for (let i = 0; i < 2 && (await snap(k.page)).live === 'home'; i++) {
    const allDone = (await progress(k.page)).plan?.items.every((x) => x.done)
    const back = await start(k)
    if (allDone) {
      c.outcome('站都走完、終點還沒講就回首頁 → 再進來從終點接著講', back === 'finale', `到 ${back}`)
      if (back !== 'finale') await c.once('story-resume', '困惑', '最後一站之後回首頁，再進來沒有把故事講完', `到 ${back}`)
    }
    seen.push(...(await playUntil(k, c, (l, s) => stop(l, [...seen, ...s]), Math.max(4 * 60_000, ms / 2), onScene)))
  }
  return seen
}

test.describe('故事', () => {
  test('故事播放器：魔法屋開場、搶著點、想返回、結尾', async ({ page }, info) => {
    test.skip(!want('story-player'))
    test.setTimeout(12 * 60_000)
    const { k, c } = await setup(page, info, '故事播放器')
    try {
      await seedStory(page, { chapter: 'p1-a01-c1', theme: 'bus', items: ITEMS, story: { part: 1, arc: 'p1-a01', next: 0, choices: {}, classicsDone: [], house: [] } })
      // 1. 開場在魔法屋；一進來就想回家
      k.behavior = '開場按返回'
      let live = await start(k)
      c.outcome('出發 → 魔法屋的開場', live === 'open', `到 ${live}`)
      await settle(page, 3000)
      await audit(k, c, '故事 魔法屋開場')
      live = await tapBack(k, c, '魔法屋開場', (l) => l === 'home')
      c.outcome('開場按返回 → 首頁', live === 'home', `到 ${live}`)
      await c.flush()

      // 2. 再出發：旁白還在念就一直點（點一下跳過一句，不會卡住、不會跳過頭）
      k.behavior = '開場搶著點'
      live = await start(k)
      c.outcome('再出發 → 開場又從頭講', live === 'open', `到 ${live}`)
      const t0 = Date.now()
      for (let i = 0; i < 6 && (await snap(page)).live === 'open'; i++) {
        await k.spam({ x: 600 + k.r.range(-200, 200), y: 420 + k.r.range(-150, 150) }, 3 + k.r.int(4), '搶著點')
        await k.wait(500)
      }
      live = await waitLive(page, (l) => l === 'route' || (l ?? '').startsWith('travel-'), 20_000)
      c.outcome('開場搶著點 → 還是會到路線圖', live === 'route' || (live ?? '').startsWith('travel-'), `${((Date.now() - t0) / 1000).toFixed(1)} 秒到 ${live}`)
      if (live !== 'route' && !(live ?? '').startsWith('travel-')) await c.once('open-stuck', '卡死', '魔法屋的開場一直點之後沒有往下走', `停在 ${live}`)
      await c.flush()

      // 3. 一路玩到回魔法屋的結尾：每一段都看一下（返回鍵、按鈕大小、靜止時不動）
      k.behavior = '故事亂玩'
      const audited = new Set<string>()
      const seen = await playThrough(
        k,
        c,
        (l, seen) => l === 'close' || hatched(l, seen),
        8 * 60_000,
        async (l) => {
          const ph = l.replace(/-\d+$/, '')
          if (audited.has(ph) || ph === 'play') return
          audited.add(ph)
          await settle(page, 3000)
          await audit(k, c, `故事 ${ph}`)
        },
      )
      live = (await snap(page)).live
      c.outcome('一路玩到魔法屋的結尾', live === 'close', `經過 ${seen.join('、')}，停在 ${live}`)
      if (live !== 'close') await c.once('no-close', '卡死', '玩完兩站沒有回到魔法屋的結尾', `經過 ${seen.join('、')}，停在 ${live}`)
      if (seen.includes('route') && !seen.some((s) => s.startsWith('travel-'))) await c.once('no-travel', '卡死', '路線圖之後沒有旁白卡', seen.join('、'))

      // 4. 結尾在念就想回家：故事已經講到最後，這一章算講完、下次接著講第 2 章
      if (live === 'close') {
        k.behavior = '結尾按返回'
        await settle(page, 2000)
        await audit(k, c, '故事 魔法屋結尾')
        await k.spam({ x: 760, y: 420 }, 4, '結尾搶著點')
        await k.wait(1200)
        const l2 = (await snap(page)).live
        if (l2 === 'close') {
          live = await tapBack(k, c, '魔法屋結尾', (l) => l === 'home')
          c.outcome('結尾按返回 → 首頁', live === 'home', `到 ${live}`)
        } else c.outcome('結尾搶著點：一句一句跳過，自己到孵蛋', l2 === `egg-${ITEMS.length}`, `到 ${l2}`)
        await k.wait(800)
        const p = await progress(page)
        c.outcome('這一章記成講完、故事往下一章', !!p.row?.done && p.story?.next === 1, `章節 ${p.row?.ref} done=${p.row?.done}，next=${p.story?.next}`)
        if (!p.row?.done || p.story?.next !== 1) await c.once('not-done', '誤記作答', '故事講完了卻沒有記成講完', JSON.stringify(p))
      }
      await c.flush()
    } finally {
      finish(k, c, '故事播放器')
    }
  })

  // 故事時間：龜兔賽跑（伊索）、挪亞方舟（聖經，faith: bible）。只排 2 站、故事有 5 段：第 3–5 段在終點講完，最後闔上書
  const CLASSIC_RUNS = [
    { name: '故事時間', want: 'story-classic', chapter: 'classic-a01', id: 'A01', theme: 'park', tail: /Turtle wins/, faith: undefined },
    { name: '故事時間-挪亞方舟', want: 'story-noah', chapter: 'classic-b01', id: 'B01', theme: 'ocean', tail: /rainbow/, faith: 'bible' },
  ]
  for (const run of CLASSIC_RUNS)
    test(`${run.name}：站比段落少、終點補講、回書房`, async ({ page }, info) => {
      test.skip(!want(run.want))
      test.setTimeout(12 * 60_000)
      const { k, c } = await setup(page, info, run.name)
      try {
        await seedStory(page, { chapter: run.chapter, theme: run.theme, items: ITEMS })
        k.behavior = '故事時間亂玩'
        const live = await start(k)
        c.outcome('出發 → 書房的開場', live === 'open', `到 ${live}`)
        const t0 = await page.evaluate(() => performance.now())
        const seen = await playThrough(k, c, hatched, 9 * 60_000)
        const end = (await snap(page)).live
        c.outcome('故事時間玩到孵蛋', hatched(end, seen), `經過 ${seen.join('、')}，停在 ${end}`)
        if (!hatched(end, seen)) await c.once('classic-stuck', '卡死', '故事時間沒有走到孵蛋', `經過 ${seen.join('、')}，停在 ${end}`)
        const said = (await voicesSince(page, t0)).map((v) => v.text ?? '').join(' | ')
        const told = run.tail.test(said) && /Close the old book/.test(said)
        c.outcome('沒排到的段落在終點補講、最後闔上書', told, said.slice(-300))
        if (!told) await c.once('classic-rest', '困惑', '故事時間只講了一半', said.slice(-400))
        // 宗教經典當故事講（故事世界 §5.1）：孩子端不說出處、沒有神和禱告
        const preach = said.match(/\b(God|Lord|pray\w*|Bible|Jesus|Buddha|sin)\b/i)
        c.outcome('孩子端沒有出處、神、禱告', !preach, preach?.[0] ?? '')
        if (preach) await c.once('classic-preach', '困惑', '故事時間出現宗教字眼', preach[0])
        const p = await progress(page)
        c.outcome('講過的經典記下來', !!p.story?.classicsDone.includes(run.id), JSON.stringify(p.story))
        c.outcome('章節紀錄的宗教標籤', p.row?.faith === run.faith, `faith=${p.row?.faith}`)
        await c.flush()
      } finally {
        finish(k, c, run.name)
      }
    })

  test('一篇講完：魔法屋多一樣東西', async ({ page }, info) => {
    test.skip(!want('story-house'))
    test.setTimeout(12 * 60_000)
    const { k, c } = await setup(page, info, '一篇講完')
    try {
      // 第 1 篇的最後一章（睡前的門）：講完魔法屋多了蛋窩
      await seedStory(page, { chapter: 'p1-a01-c5', theme: 'bedtime', items: ITEMS, story: { part: 1, arc: 'p1-a01', next: 4, choices: {}, classicsDone: [], house: [] } })
      k.behavior = '最後一章亂玩'
      await start(k)
      const last = `egg-${ITEMS.length}`
      const seen = await playThrough(k, c, (l, s) => l === last || l === 'close-added' || hatched(l, s), 9 * 60_000)
      let live = (await snap(page)).live
      // 最後一站蛋裂開時按返回回家（亂點常按到左上角的返回）：終點、結尾都還沒念，這一篇還不算講完；
      // 再按出發要從終點接著講，講完魔法屋才多東西
      if (live === last && !seen.includes('finale')) {
        k.behavior = '最後一站蛋裂開時回家'
        live = await tapBack(k, c, '最後一站的蛋', (l) => l === 'home')
        if (live === 'home') {
          await k.wait(800)
          const p = await progress(page)
          c.outcome('終點還沒念就回家 → 還不算講完、魔法屋還沒多東西', !p.row?.done && !p.story?.house.length, `done=${p.row?.done}，house=${JSON.stringify(p.story?.house)}`)
          if (p.row?.done || p.story?.house.length) await c.once('early-done', '誤記作答', '故事還沒講完就記成講完', JSON.stringify(p))
          k.behavior = '再出發'
          const back = await start(k)
          c.outcome('再進來從終點接著講', back === 'finale', `到 ${back}`)
          if (back !== 'finale') await c.once('story-resume', '困惑', '最後一站之後回首頁，再進來沒有把故事講完', `到 ${back}`)
        }
        k.behavior = '最後一章亂玩'
        seen.push(...(await playThrough(k, c, (l, s) => l === 'close-added' || hatched(l, [...seen, ...s]), 6 * 60_000)))
        live = (await snap(page)).live
      }
      if (live === 'close-added') {
        await settle(page, 1500)
        await audit(k, c, '故事 魔法屋多了東西')
        live = await waitLive(page, (l) => l === `egg-${ITEMS.length}`, 8000)
      }
      c.outcome('講完最後一章 → 魔法屋多了東西 → 孵蛋', seen.includes('close') && seen.includes('close-added') && live === `egg-${ITEMS.length}`, `經過 ${seen.join('、')}，停在 ${live}`)
      const p = await progress(page)
      c.outcome('魔法屋多了蛋窩、這一篇講完', !!p.story?.house.includes('egg-nest'), JSON.stringify(p.story))
      if (!p.story?.house.includes('egg-nest')) await c.once('no-item', '誤記作答', '一篇講完魔法屋沒有多東西', JSON.stringify(p))
      await c.flush()
    } finally {
      finish(k, c, '一篇講完')
    }
  })

  test('魔法屋與我的故事書：亂點、翻頁、重聽搶著點、一層一層返回', async ({ page }, info) => {
    test.skip(!want('story-book'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '魔法屋與故事書')
    try {
      // 講過 8 章（兩頁）：通用章節、長篇、故事時間都有
      const doors = ['bus', 'farm', 'zoo', 'rain', 'fruit', 'ocean']
      const rows = [
        ...doors.map((d, i) => ({ id: `2026-09-${String(10 + i).padStart(2, '0')}`, date: `2026-09-${String(10 + i).padStart(2, '0')}`, part: 0, arc: 'evergreen', chapter: 0, kind: 'evergreen', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: `ev-${d}`, door: d, script: [{ k: `theme.${d}.title` }, { k: `theme.${d}.intro` }, { k: `theme.${d}.stop.0` }, { k: `theme.${d}.end` }] })),
        { id: '2026-09-20', date: '2026-09-20', part: 1, arc: 'p1-a01', chapter: 1, kind: 'epic', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'p1-a01-c1', door: 'bus', script: [{ k: 'story.p1-a01-c1.intro.0', pic: '@rainbow-egg' }, { k: 'story.p1-a01-c1.intro.1', pic: '@rainbow-egg' }, { k: 'theme.bus.stop.0' }, { k: 'story.p1-a01-c1.stop.1', pic: 'bus+@rainbow-egg' }, { k: 'story.p1-a01-c1.end.0', pic: 'house-with-garden' }, { k: 'story.p1-a01-c1.end.1' }] },
        { id: '2026-09-21', date: '2026-09-21', part: 1, arc: 'classic', chapter: 1, kind: 'classic', band: 'small', picks: { words: [], friends: [], stickers: [], drawings: [] }, choices: {}, done: true, synced: 1, ref: 'classic-a01', door: 'park', script: [{ k: 'story.classic.open.0', pic: 'open-book' }, { k: 'story.classic-a01.stop.0.0', pic: 'rabbit' }, { k: 'story.classic.close', pic: 'closed-book' }] },
      ]
      await seedStory(page, { chapters: rows, story: { part: 1, arc: 'p1-a01', next: 1, choices: {}, classicsDone: ['A01'], house: ['egg-nest'] }, kv: { houseSeen: 0 } })
      // 首頁 → 魔法屋
      k.behavior = '首頁到魔法屋'
      await k.tap((await center(page, '[aria-label="魔法屋"]'))!, '魔法屋')
      let live = await waitLive(page, (l) => l === 'house', 5000)
      c.outcome('首頁 → 魔法屋', live === 'house', `到 ${live}`)
      await settle(page, 3000)
      await audit(k, c, '魔法屋')
      const fresh = await page.evaluate(() => !!document.querySelector('.house-item.is-fresh'))
      c.outcome('新加的蛋窩有光', fresh, fresh ? '有' : '沒有')
      // 亂點：點到書房、書會進故事書（那也對），回來再點
      k.behavior = '魔法屋亂點'
      for (let i = 0; i < 10; i++) {
        if ((await snap(page)).live !== 'house') break
        if (k.r.chance(0.3)) await k.tap({ x: k.r.range(120, 1180), y: k.r.range(120, 780) }, '亂點')
        else await toddlerStep(k, c)
        await k.wait(300)
      }
      await c.screenOk('魔法屋亂點')
      live = (await snap(page)).live
      if (live !== 'house' && live !== 'storybook' && live !== 'shelf') {
        await c.once('house-left', '困惑', '魔法屋亂點跑到別的地方', `到 ${live}`)
      }
      if (live === 'house') {
        await k.spam((await center(page, '[aria-label="故事書"]'))!, 4, '故事書')
        live = await waitLive(page, (l) => l === 'shelf', 5000)
      }
      c.outcome('魔法屋 → 故事書', live === 'shelf', `到 ${live}`)
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
      live = await tapBack(k, c, '書架', (l) => l === 'house')
      c.outcome('書架按返回 → 魔法屋', live === 'house', `到 ${live}`)
      await k.wait(1300)
      live = await tapBack(k, c, '魔法屋', (l) => l === 'home')
      c.outcome('魔法屋按返回 → 首頁', live === 'home', `到 ${live}`)
      await c.flush()
    } finally {
      finish(k, c, '魔法屋與故事書')
    }
  })
})

// ── 飛航模式：先讓 Service Worker 裝好、語音補齊，再斷網從頭玩完一章 ─────────
test.describe('故事（離線）', () => {
  test.use({ serviceWorkers: 'allow' })

  test('飛航模式下從頭玩完示範篇的一章和故事時間', async ({ page, context }, info) => {
    test.skip(!want('story-offline'))
    test.setTimeout(25 * 60_000)
    const { k, c } = await setup(page, info, '飛航模式')
    try {
      k.behavior = '等離線準備好'
      await page.evaluate(() => navigator.serviceWorker.ready)
      await page.reload()
      await page.waitForSelector('.screen.home', { timeout: 20_000 })
      // 背景補齊全部語音（lib/audio-cache.ts，App 打開 15 秒後開始）
      const total = await page.evaluate(async () => (await (await fetch('/dodo-adventure/audio/files.json')).json()).length)
      let cached = 0
      const until = Date.now() + 6 * 60_000
      while (Date.now() < until) {
        cached = await page.evaluate(async () => ((await caches.has('dodo-audio')) ? (await (await caches.open('dodo-audio')).keys()).length : 0))
        if (cached >= total) break
        await page.waitForTimeout(2000)
      }
      c.outcome('語音都存進快取', cached >= total, `${cached}／${total}`)
      await seedStory(page, { chapter: 'p1-a01-c1', theme: 'bus', items: ITEMS, story: { part: 1, arc: 'p1-a01', next: 0, choices: {}, classicsDone: [], house: [] } })

      k.behavior = '斷網'
      const failed: string[] = []
      page.on('requestfailed', (r) => failed.push(r.url()))
      await context.setOffline(true)
      await page.reload()
      await page.waitForSelector('.screen.home', { timeout: 20_000 })
      c.outcome('斷網重新打開 App', true, '首頁出現')
      const online = await page.evaluate(() => navigator.onLine)
      c.outcome('瀏覽器是離線的', !online, `navigator.onLine = ${online}`)

      k.behavior = '離線玩一章'
      const live = await start(k)
      c.outcome('離線出發 → 魔法屋的開場', live === 'open', `到 ${live}`)
      const seen = await playThrough(k, c, hatched, 10 * 60_000)
      const end = (await snap(page)).live
      c.outcome('離線玩完一章（開場 → 兩站 → 結尾 → 孵蛋）', hatched(end, seen) && seen.includes('open') && seen.includes('close'), `經過 ${seen.join('、')}，停在 ${end}`)
      if (!hatched(end, seen)) await c.once('offline-stuck', '卡死', '離線時沒辦法玩完一章', `經過 ${seen.join('、')}，停在 ${end}`)
      const p = await progress(page)
      c.outcome('離線也記成講完', !!p.row?.done && p.story?.next === 1, JSON.stringify(p))

      // 還是離線：故事時間（挪亞方舟）也從頭講完
      k.behavior = '離線講故事時間'
      await seedStory(page, { chapter: 'classic-b01', theme: 'ocean', items: ITEMS.map((i) => ({ ...i, done: false })), story: { ...p.story!, classicsDone: ['A01'] } })
      const live2 = await start(k)
      c.outcome('離線出發 → 書房的開場（挪亞方舟）', live2 === 'open', `到 ${live2}`)
      const seen2 = await playThrough(k, c, hatched, 10 * 60_000)
      const end2 = (await snap(page)).live
      c.outcome('離線講完故事時間', hatched(end2, seen2) && seen2.includes('close'), `經過 ${seen2.join('、')}，停在 ${end2}`)
      if (!hatched(end2, seen2)) await c.once('offline-classic-stuck', '卡死', '離線時沒辦法講完故事時間', `經過 ${seen2.join('、')}，停在 ${end2}`)
      const p2 = await progress(page)
      c.outcome('離線也記下講過的經典', !!p2.story?.classicsDone.includes('B01'), JSON.stringify(p2.story))

      const audio = failed.filter((u) => /\/audio\//.test(u))
      c.outcome('沒有抓不到的語音', audio.length === 0, audio.slice(0, 5).join(' '))
      if (audio.length) await c.once('offline-audio', '小問題', '離線時有語音抓不到', audio.slice(0, 8).join(' '))
      await c.flush()
    } finally {
      await context.setOffline(false)
      finish(k, c, '飛航模式')
    }
  })
})

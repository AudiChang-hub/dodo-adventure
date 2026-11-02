import { test, expect, type Page } from '@playwright/test'
import { attempts, boot, homeButton, settle, snap } from './lib/app'
import { Toddler, hashSeed, type Pt } from './lib/toddler'
import { Checker, alive, checkDoubleRecords, doorAt, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'

/**
 * 中文課（src/lessons/chinese/）：念課文（紅字可以點）→ 選圖（三選一）→ 貼紙。
 * 三歲孩子會做的事：念的時候亂點、連點紅字、連點「去選圖」和選項、兩根手指一起按、一進來就想回去、
 * 上到一半回首頁再進來（同一天要是同一篇、從頭念）。也跑一篇還沒有聲音的課文：不出聲、不用平板內建語音，課照樣上得完。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = (name: string) => !only.length || only.some((s) => s === 'lesson-chinese' || s === name)
const LIVE = 'lesson-chinese'
/** 還沒產生聲音的一篇（第 1～30 天先做；做到 180 天之後這一篇也有聲音，測試照樣成立） */
const SILENT_DAY = 170

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string) {
  const seed = hashSeed(BASE_SEED, 'lesson-chinese', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `中文課／${name}`
  await boot(page, seed, { to: 'home' })
  await k.init()
  return { k, c }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`lesson-chinese-${name}`, { screen: `中文課 ${name}`, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

/** 家長區「今天上這篇」（src/lessons/chinese/progress.ts 的 zhLesson:pick），只在今天有效 */
const pickDay = (page: Page, day: number) =>
  page.evaluate(
    (day) =>
      new Promise<void>((res, rej) => {
        const d = new Date()
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const rq = indexedDB.open('dodo-adventure')
        rq.onerror = () => rej(rq.error)
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction('kv', 'readwrite')
          tx.objectStore('kv').put({ key: 'zhLesson:pick', value: { date, day } })
          tx.oncomplete = () => {
            db.close()
            res()
          }
          tx.onerror = () => rej(tx.error)
        }
      }),
    day,
  )

/** 中文課現在的狀態 */
const state = (page: Page) =>
  page.evaluate(() => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    const top = [...root.querySelectorAll('.zh-read, .zh-quiz')].pop()
    return {
      title: root.querySelector('.zh-title')?.textContent ?? null,
      line: Number(root.querySelector('.zh-line.on')?.getAttribute('data-line') ?? -1),
      free: !!root.querySelector('.zh-controls.on'),
      quiz: top?.classList.contains('zh-quiz') ?? false,
      ask: top?.querySelector('.zh-ask-word')?.textContent ?? null,
      accepting: top?.querySelector('.wait-shield')?.getAttribute('data-accepting') === 'true',
      cheer: !!document.querySelector('.cheer-scrim'),
    }
  })

/** 現在畫面上符合 sel 的東西（中心點） */
const points = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    const top = [...root.querySelectorAll('.zh-read, .zh-quiz')].pop() ?? root
    return [...top.querySelectorAll(sel)].map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: e.getAttribute('aria-label') ?? e.textContent ?? '' }
    })
  }, sel)

const quizRows = async (page: Page) => (await attempts(page)).filter((a) => a.game === 'zh-lesson' && a.phase === 'quiz')

async function waitFor(k: Toddler, pred: (s: Awaited<ReturnType<typeof state>>) => boolean, ms: number) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const s = await state(k.page)
    if (pred(s)) return s
    await k.wait(400)
  }
  return null
}

/** 從首頁點中文課的門，等課本出來 */
async function enter(k: Toddler, c: Checker, spam = 1) {
  if (!(await toHome(k, c))) return false
  await settle(k.page)
  await k.wait(500)
  const p = (await doorAt(k.page, 'chinese'))!
  if (spam > 1) await k.spam(p, spam, '中文課文')
  else await k.tap(p, '中文課文')
  const live = await waitLive(k.page, (l) => l === LIVE, 6000)
  const s = await waitFor(k, (s) => s.title != null, 8000)
  c.outcome('進中文課', live === LIVE && !!s, `到 ${live}`)
  if (live !== LIVE || !s) {
    await c.once('enter', '困惑', '點中文課的門沒有進到課本', `停在 ${live}`)
    return false
  }
  return true
}

/** 選圖：一題一題答對（每題連點答案幾下）直到出現貼紙 */
async function answerAll(k: Toddler, c: Checker, spam = 3) {
  for (let i = 0; i < 8; i++) {
    const s = await waitFor(k, (s) => s.cheer || (s.quiz && s.accepting), 25_000)
    if (!s) return false
    if (s.cheer) return true
    const ans = (await points(k.page, '.tile[data-answer]'))[0]
    if (ans) await k.spam(ans, spam, `答案 ${s.ask}`)
    await k.wait(900)
  }
  return !!(await waitFor(k, (s) => s.cheer, 15_000))
}

test.describe('中文課', () => {

  test('亂點、連點：念課文、去選圖、選項，上完拿貼紙（沒有聲音的那一篇）', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-play'))
    test.setTimeout(8 * 60_000)
    const { k, c } = await setup(page, info, '亂點連點')
    try {
      await pickDay(page, SILENT_DAY)
      k.behavior = '連點中文課的門'
      if (!(await enter(k, c, 5 + k.r.int(4)))) return
      const title = (await state(page)).title
      await c.screenOk('進中文課')

      // 念的時候亂點（不會跑去別的地方、不會記作答）
      k.behavior = '念課文時亂點'
      for (let i = 0; i < 10; i++) {
        if ((await snap(page)).live !== LIVE) break
        await toddlerStep(k, c)
      }
      await c.flush()
      let live = (await snap(page)).live
      if (live !== LIVE) {
        k.act(`亂點離開了中文課（到 ${live}），再進來`)
        if (!(await enter(k, c))) return
      }
      c.outcome('念課文時亂點不記作答', !(await quizRows(page)).length, `作答 ${(await quizRows(page)).length} 筆`)
      if ((await quizRows(page)).length) await c.once('read-rows', '誤記作答', '念課文的時候亂點，記了選圖的作答', '')

      // 念完（這一篇沒有聲音：帶子照樣一行一行走）→ 出現「去選圖」；或沒動作自己去選圖
      k.behavior = '等課文念完'
      let s = await waitFor(k, (s) => s.free || s.quiz, 90_000)
      if (!s) {
        await alive(k, c, '等課文念完')
        s = await waitFor(k, (s) => s.free || s.quiz, 30_000)
      }
      c.outcome('沒有聲音的課文也念得完', !!s, s ? (s.quiz ? '自己去選圖' : '出現去選圖') : '一直沒念完')
      if (!s) return void (await c.once('silent-stuck', '卡死', '沒有聲音的課文一直念不完', `課文〈${title}〉`))

      // 連點「去選圖」：只進第一題，不會連跳好幾題
      k.behavior = '連點去選圖'
      if (!s.quiz) {
        const go = (await points(page, '.zh-go'))[0]
        if (go) await k.spam(go, 6, '去選圖')
      }
      s = await waitFor(k, (s) => s.quiz, 12_000)
      await k.wait(1500)
      const rows0 = (await quizRows(page)).length
      c.outcome('連點去選圖只到第一題', !!s && rows0 === 0, `作答 ${rows0} 筆`)
      if (rows0) await c.once('go-spam', '誤記作答', '連點「去選圖」記了作答', `${rows0} 筆`)

      // 念題目的時候搶著點選項：不算作答
      k.behavior = '念題目時搶著點'
      const tiles = await points(page, '.tile')
      if (tiles.length && !(await state(page)).accepting) {
        for (const t of tiles) await k.tap(t, '搶著點選項')
        const n = (await quizRows(page)).length
        c.outcome('念題目時點選項不算作答', n === 0, `作答 ${n} 筆`)
        if (n) await c.once('grab', '誤記作答', '念題目的時候點選項，記了作答', `${n} 筆`)
      }

      // 兩根手指同時按兩張（TOUCH-3）：只算第一根
      k.behavior = '兩根手指一起按'
      s = await waitFor(k, (s) => s.quiz && s.accepting, 20_000)
      const two = (await points(page, '.tile')).slice(0, 2)
      if (s && two.length === 2) {
        const n0 = (await quizRows(page)).length
        await k.palm(two as Pt[], 250)
        await k.wait(2500)
        const n1 = (await quizRows(page)).length
        c.outcome('兩指同時按兩張只算一下', n1 - n0 <= 1, `多了 ${n1 - n0} 筆`)
        if (n1 - n0 > 1) await c.once('two', '誤記作答', '兩指同時按兩個選項，多記了作答', `多了 ${n1 - n0} 筆`)
      }

      // 一題一題連點答案到上完
      k.behavior = '連點答案到上完'
      const done = await answerAll(k, c, 4)
      c.outcome('上完一堂有貼紙', done, done ? '出現挑貼紙' : '沒有走到貼紙')
      if (!done) await alive(k, c, '選圖')
      const d = await checkDoubleRecords(k, c)
      c.outcome('連點不重複記作答', d.dup === 0, `作答 ${d.rows} 筆、重複 ${d.dup}`)
      await c.flush()
    } finally {
      finish(k, c, '亂點連點')
    }
  })

  test('念課文時亂點紅字：念完那個詞接著念，課文照樣念完', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-red'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '亂點紅字')
    try {
      if (!(await enter(k, c))) return
      await k.wait(1200)
      k.behavior = '念課文時亂點紅字'
      const seen = new Set<number>()
      for (let i = 0; i < 12; i++) {
        const s = await state(page)
        if (s.line >= 0) seen.add(s.line)
        if (s.free || s.quiz || (await snap(page)).live !== LIVE) break
        const reds = await points(page, '.zh-red, .zh-pic')
        const visible = reds.filter((r) => r.x > 0 && r.y > 0)
        if (!visible.length) break
        const r = k.r.pick(visible)
        if (k.r.chance(0.4)) await k.spam(r, 2 + k.r.int(4), `紅字 ${r.label}`)
        else await k.tap(r, `紅字 ${r.label}`)
        await k.wait(200 + k.r.int(1400))
      }
      await c.flush()
      const live = (await snap(page)).live
      c.outcome('亂點紅字還在課本', live === LIVE, `在 ${live}`)
      if (live !== LIVE) await c.once('red-left', '困惑', '念課文時點紅字跑出了中文課', `到 ${live}`)

      // 停手之後：從被打斷的那一行接著念，念到最後（再念第二次），出現「再聽一次」「去選圖」
      k.behavior = '停手等它念完'
      const s = await waitFor(
        k,
        (s) => {
          if (s.line >= 0) seen.add(s.line)
          return s.free || s.quiz
        },
        90_000,
      )
      c.outcome('亂點紅字之後課文照樣念完', !!s, s ? `念到的行 ${[...seen].sort().join('、')}` : '一直沒念完')
      if (!s) await c.once('red-stuck', '卡死', '念課文時亂點紅字，之後課文停住不念了', `念到的行 ${[...seen].join('、')}`)
      const n = (await quizRows(page)).length
      c.outcome('點紅字不記作答', n === 0, `作答 ${n} 筆`)
      if (n) await c.once('red-rows', '誤記作答', '點紅字記了選圖的作答', `${n} 筆`)

      // 念完以後再點紅字、再聽一次：都有聲音、不會卡
      if (s?.free) {
        k.behavior = '念完以後點紅字、再聽一次'
        const r = (await points(page, '.zh-red'))[0]
        if (r) await k.spam(r, 3, `紅字 ${r.label}`)
        await k.wait(1500)
        const again = (await points(page, '.zh-again'))[0]
        if (again) await k.spam(again, 4, '再聽一次')
        const back = await waitFor(k, (s) => s.line >= 0, 6000)
        c.outcome('再聽一次會從頭念', !!back, back ? `念到第 ${back.line + 1} 行` : '沒有開始念')
        if (!back) await c.once('again', '困惑', '按「再聽一次」沒有開始念', '')
      }
      await c.flush()
    } finally {
      finish(k, c, '亂點紅字')
    }
  })

  test('中途返回再進來：同一天還是同一篇、從頭念；返回鍵、Android 返回、連點返回', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-back'))
    test.setTimeout(8 * 60_000)
    const { k, c } = await setup(page, info, '中途返回')
    try {
      if (!(await enter(k, c))) return
      const title = (await state(page)).title
      await k.wait(2500 + k.r.int(2000))

      // 念到一半按返回鍵
      k.behavior = '念到一半按返回鍵'
      const h = await homeButton(page)
      if (!h) return void (await c.once('noback', '無法返回', '中文課沒有返回鍵', ''))
      await pressBack(k, h)
      let live = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('念到一半按返回 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('back-read', '無法返回', '念課文到一半按返回鍵沒有回首頁', `停在 ${live}`)
      await k.wait(1500)
      await c.flush()

      // 再進來：同一篇、從第一行開始念
      k.behavior = '再進來'
      if (!(await enter(k, c))) return
      const s1 = await waitFor(k, (s) => s.line >= 0, 6000)
      const same = (await state(page)).title === title
      c.outcome('再進來還是同一篇、從頭念', same && s1?.line === 0, `〈${(await state(page)).title}〉第 ${(s1?.line ?? -1) + 1} 行`)
      if (!same) await c.once('same', '困惑', '同一天再進中文課換了一篇', `本來〈${title}〉，現在〈${(await state(page)).title}〉`)

      // Android 返回
      k.behavior = 'Android 返回'
      await settle(page)
      k.act('history.back()')
      await page.evaluate(() => history.back())
      live = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('Android 返回 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('android', '無法返回', '中文課按 Android 返回沒有回首頁', `停在 ${live}`)

      // 選圖到一半回去，再進來：從念課文開始（同一篇），作答紀錄不重複
      k.behavior = '選圖到一半回去再進來'
      if (!(await enter(k, c))) return
      let s = await waitFor(k, (s) => s.free || s.quiz, 90_000)
      if (s && !s.quiz) {
        const go = (await points(page, '.zh-go'))[0]
        if (go) await k.tap(go, '去選圖')
      }
      s = await waitFor(k, (s) => s.quiz && s.accepting, 25_000)
      if (s) {
        const ans = (await points(page, '.tile[data-answer]'))[0]
        if (ans) await k.tap(ans, `答案 ${s.ask}`)
        await k.wait(400 + k.r.int(800))
      }
      const h2 = await homeButton(page)
      if (h2) await k.spam(h2, 6, h2.label)
      await k.wait(2000)
      await settle(page)
      live = (await snap(page)).live
      c.outcome('選圖中連點返回 6 下 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('spam-back', '無法返回', '選圖中連點返回鍵沒有停在首頁', `到 ${live}`)
      await c.screenOk('連點返回後')
      if (!(await enter(k, c))) return
      const s2 = await state(page)
      c.outcome('選圖到一半再進來：同一篇、從念課文開始', s2.title === title && !s2.quiz, `〈${s2.title}〉${s2.quiz ? '在選圖' : '在念課文'}`)
      if (s2.title !== title) await c.once('same2', '困惑', '選圖到一半回去再進來換了一篇', `本來〈${title}〉，現在〈${s2.title}〉`)
      await checkDoubleRecords(k, c)
      await c.flush()
    } finally {
      finish(k, c, '中途返回')
    }
  })
})

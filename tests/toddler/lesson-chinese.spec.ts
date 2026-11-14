import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { attempts, boot, homeButton, settle, snap } from './lib/app'
import { Toddler, hashSeed, type Pt } from './lib/toddler'
import { Checker, alive, checkDoubleRecords, doorAt, ignoreNext, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'

/**
 * 中文課（src/lessons/chinese/）：親子共讀（2026-11-03 起 App 不出聲，大人念）。第一次有給大人的說明卡 → 念課文（一次亮一行，大人按「下一行」）
 * → 聊一聊 → 選圖（三選一）→ 下課。一天兩篇，一舊一新（T-136，course.ts）：第 4 次起先上 3 次前的舊篇短版（念課文 → 一題 → 找一樣的字，大人可以跳過），最後小複習。
 * 選圖之後最後一題是「找一樣的字」（T-117，.zh-glyph）：上面一個字，下面兩、三個字，點長得一模一樣的那個；最初幾堂手先示範。
 * 三歲孩子會做的事：大人還沒按「下一行」時亂點、連點紅字和圖、連點「下一行」「去選圖」和選項、兩根手指一起按、一進來就想回去、
 * 上到一半回首頁再進來（同一天要是同一篇、從第一行開始）。整堂課不能要任何中文音檔、不能用平板內建語音。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = (name: string) => !only.length || only.some((s) => s === 'lesson-chinese' || s === name)
const LIVE = 'lesson-chinese'
/** 後面的一篇（家長挑「今天上這篇」）：跟第 1 篇不一樣的課文長度、紅字 */
const LATE_DAY = 170

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string, lessonSticker?: boolean, autoNext = true) {
  const seed = hashSeed(BASE_SEED, 'lesson-chinese', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `中文課／${name}`
  await boot(page, seed, { to: 'home', lessonSticker, autoNext })
  await k.init()
  return { k, c }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`lesson-chinese-${name}`, { screen: `中文課 ${name}`, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
}

/** 寫一筆 kv（App 下次讀的時候就看得到） */
const putKV = (page: Page, key: string, value: unknown) =>
  page.evaluate(
    ({ key, value }) =>
      new Promise<void>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onerror = () => rej(rq.error)
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction('kv', 'readwrite')
          tx.objectStore('kv').put({ key, value })
          tx.oncomplete = () => {
            db.close()
            res()
          }
          tx.onerror = () => rej(tx.error)
        }
      }),
    { key, value },
  )

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 讀一筆 kv */
const getKV = <T,>(page: Page, key: string) =>
  page.evaluate(
    (key) =>
      new Promise<T | null>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction('kv').objectStore('kv').get(key)
          g.onsuccess = () => res((g.result?.value as T) ?? null)
          g.onerror = () => res(null)
        }
        rq.onerror = () => res(null)
      }),
    key,
  )

/**
 * 一天兩篇（T-136）：已經上過 3 次課（第 1、2、3 篇），今天第 4 次：先複習 3 次前的第 1 篇〈龜兔賽跑〉（舊篇短版），
 * 再上新的第 4 篇〈牛頓與蘋果〉，最後小複習前 1 次的第 3 篇〈吃香蕉〉（前 7 次還沒有）。
 */
const OLD_TITLE = '龜兔賽跑'
const NEW_TITLE = '牛頓與蘋果'
async function seedTwo(page: Page) {
  await putKV(page, 'zhLesson:introSeen', true)
  await putKV(page, 'zhLesson:done', [1, 2, 3])
  await putKV(page, 'zhLesson:course', { day: 3, runs: ['2026-01-03'] })
  await putKV(page, 'zhLesson:log', [
    { date: '2026-01-01', day: 1 },
    { date: '2026-01-02', day: 2 },
    { date: '2026-01-03', day: 3 },
  ])
}

/** 交付用的截圖（TODDLER_SHOTS=資料夾 時才拍） */
async function shot(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string) {
  const dir = process.env.TODDLER_SHOTS
  if (dir) await page.screenshot({ path: `${dir}/${info.project.name}-${name}.png` })
}

/** 家長區「今天上這篇」（src/lessons/chinese/progress.ts 的 zhLesson:pick）：那篇從第 1 次開始 */
const pickDay = (page: Page, day: number) => putKV(page, 'zhLesson:pick', { date: todayStr(), day })

/** 中文課現在的狀態 */
const state = (page: Page) =>
  page.evaluate(() => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    const top = [...root.querySelectorAll('.zh-read, .zh-quiz, .zh-intro')].pop()
    const read = root.querySelector<HTMLElement>('.zh-read')
    return {
      title: root.querySelector('.zh-title')?.textContent ?? null,
      intro: !!root.querySelector('.zh-intro'),
      /** 亮的那一行（data-at：第幾行，聊一聊時是 talk） */
      at: read?.dataset.at ?? null,
      lines: root.querySelectorAll('.zh-line').length,
      talk: !!root.querySelector('.zh-talk'),
      quiz: top?.classList.contains('zh-quiz') ?? false,
      ask: top?.querySelector('.zh-ask-word')?.textContent ?? top?.querySelector('.zh-glyph-target')?.getAttribute('data-char') ?? null,
      /** 找一樣的字（T-117）；dim：示範中（下面的字變淡） */
      glyph: top?.classList.contains('zh-glyph') ?? false,
      dim: !!top?.querySelector('.zh-glyph-options[data-dim]'),
      hand: !!top?.querySelector('.demo-hand'),
      accepting: top?.querySelector('.wait-shield')?.getAttribute('data-accepting') === 'true',
      cheer: !!document.querySelector('.cheer-scrim'),
    }
  })

/** 現在畫面上符合 sel 的東西（中心點） */
const points = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    return [...root.querySelectorAll(sel)]
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, label: e.getAttribute('aria-label') ?? e.textContent ?? '' }
      })
      .filter((p) => p.w > 0)
  }, sel)

/**
 * 中文課裡有沒有「播」任何中文（中文課文、中文數數、單字三明治的中文 mp3）、有沒有用平板內建語音（speechSynthesis）。
 * 看的是真的開始播的音檔（tests/ai-toddler/heard.js 記在 window.__heard），不是網路請求：
 * App 會在背景把全部語音補進離線快取（lib/audio-cache.ts，含單字三明治的中文），那不是播放。heard.js 要在 boot 之前注入。
 */
async function watchVoice(page: Page) {
  const t0 = await page.evaluate(() => performance.now())
  await page.evaluate(() => {
    const w = window as unknown as { __tts: number }
    w.__tts = 0
    if ('speechSynthesis' in window) {
      const orig = speechSynthesis.speak.bind(speechSynthesis)
      speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
        w.__tts++
        orig(u)
      }
    }
  })
  return () =>
    page.evaluate((t0) => {
      const w = window as unknown as { __tts: number; __heard?: { t: number; name: string }[] }
      return { zh: (w.__heard ?? []).filter((h) => h.t >= t0 && /^zh/.test(h.name)).map((h) => h.name), tts: w.__tts, hooked: !!w.__heard }
    }, t0)
}

const quizRows = async (page: Page) => (await attempts(page)).filter((a) => a.game === 'zh-lesson' && a.phase === 'quiz')
/** 找一樣的字的作答（示範過的記成 guided） */
const glyphRows = async (page: Page) => (await attempts(page)).filter((a) => a.game === 'zh-glyph')

async function waitFor(k: Toddler, pred: (s: Awaited<ReturnType<typeof state>>) => boolean, ms: number) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const s = await state(k.page)
    if (pred(s)) return s
    await k.wait(400)
  }
  return null
}

/** 從首頁點中文課的門，等說明卡或課本出來 */
async function enter(k: Toddler, c: Checker, spam = 1) {
  if (!(await toHome(k, c))) return false
  await settle(k.page)
  await k.wait(500)
  const p = (await doorAt(k.page, 'chinese'))!
  if (spam > 1) await k.spam(p, spam, '中文課文')
  else await k.tap(p, '中文課文')
  const live = await waitLive(k.page, (l) => l === LIVE, 6000)
  const s = await waitFor(k, (s) => s.title != null || s.intro, 8000)
  c.outcome('進中文課', live === LIVE && !!s, `到 ${live}`)
  if (live !== LIVE || !s) {
    await c.once('enter', '困惑', '點中文課的門沒有進到課本', `停在 ${live}`)
    return false
  }
  return true
}

/** 大人按一下（說明卡的「開始念」、下一行、去選圖）：等鎖過了再按 */
async function adult(k: Toddler, sel: string, label: string) {
  const b = (await points(k.page, sel))[0]
  if (!b) return false
  await k.tap(b, label)
  await k.wait(1000)
  return true
}

/** 大人把說明卡看完、整篇一行一行念完、聊完，按「去選圖」 */
async function readAll(k: Toddler, c: Checker) {
  if ((await state(k.page)).intro) await adult(k, '.zh-intro .zh-go', '開始念（大人）')
  for (let i = 0; i < 20; i++) {
    const s = await state(k.page)
    if (s.talk || s.quiz || s.cheer) break
    if (!(await adult(k, '.zh-next', '下一行（大人）'))) await k.wait(500)
  }
  const s = await waitFor(k, (s) => s.talk || s.quiz || s.cheer, 6000)
  c.outcome('大人按「下一行」念到最後 → 聊一聊', !!s?.talk || !!s?.quiz, s ? (s.talk ? '出現聊一聊' : '到選圖') : '沒有念完')
  if (!s) return void (await c.once('read-stuck', '卡死', '大人一直按「下一行」，課文念不完', ''))
  if (s.talk) {
    // T-126（盲測 0f3363f：大卡全是字，「好多字喔」就走了）：孩子看到一張大圖（點得到），給大人的字是小字條（不大於 20px）；
    // 往下走的按鈕一出來就看得到（淡淡的）
    await k.wait(500)
    const card = await k.page.evaluate(() => {
      const pic = document.querySelector('.zh-talk-pic')?.getBoundingClientRect()
      const ctl = document.querySelector('.zh-controls')
      const big = [...document.querySelectorAll('.zh-talk *')].filter(
        (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()) && parseFloat(getComputedStyle(e).fontSize) > 20,
      ).length
      return { pic: pic ? Math.round(Math.min(pic.width, pic.height)) : 0, go: !!ctl && !!document.querySelector('.zh-go-quiz') && +getComputedStyle(ctl).opacity > 0.3, big }
    })
    const cardOk = card.pic >= 140 && card.go && card.big === 0
    c.outcome('聊一聊：一張大圖、字是小字條、往下走的按鈕看得到', cardOk, `圖 ${card.pic}px、大字 ${card.big} 處、按鈕${card.go ? '看得到' : '看不到'}`)
    if (!cardOk) await c.once('talk-wordy', '困惑', '聊一聊卡片孩子看不懂（圖太小、大字太多或看不到往下走的按鈕）', `圖 ${card.pic}px、大於 20px 的字 ${card.big} 處、按鈕${card.go ? '看得到' : '看不到'}`)
    // 聊一聊剛出來：孩子點大人按鈕的位置（右下角）、點卡片，都不會跳過這一段（「去選圖」4 秒後才按得動，T-102）
    const corner = (await points(k.page, '.zh-controls'))[0]
    if (corner) await k.spam(corner, 3, '聊一聊時點右下角（孩子）')
    await k.wait(400)
    const still = await state(k.page)
    c.outcome('聊一聊剛出來時孩子亂點，不會跳過', still.talk && !still.quiz, still.talk ? '還在聊一聊' : '被跳過了')
    if (!still.talk) await c.once('talk-skip', '困惑', '聊一聊剛出來，孩子點右下角就跳過了', '')
    for (let i = 0; i < 20 && !(await points(k.page, '.zh-controls.on .zh-go-quiz')).length; i++) await k.wait(400)
    await adult(k, '.zh-controls.on .zh-go-quiz', '去選圖（大人）')
  }
  return true
}

/** 選圖：一題一題答對（每題連點答案幾下）直到下課 */
async function answerAll(k: Toddler, c: Checker, spam = 3) {
  for (let i = 0; i < 20; i++) {
    // 答完一題停著等「下一步」的大箭頭（T-118）：孩子點了箭頭（boot 的 autoNext）才換題；這時候不去點已經答對的那張
    if (await k.page.$('.next-step')) {
      await k.wait(800)
      continue
    }
    const s = await waitFor(k, (s) => s.cheer || (s.quiz && s.accepting), 25_000)
    if (!s) return false
    if (s.cheer) return true
    const ans = (await points(k.page, '.tile[data-answer]'))[0]
    if (ans) await k.spam(ans, spam, `答案 ${s.ask}`)
    await k.wait(900)
  }
  return !!(await waitFor(k, (s) => s.cheer, 15_000))
}

/** 右下角的大箭頭在哪裡（它不在換場景的那一層裡，points 找不到） */
const arrowAt = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('.next-step')?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null
  })

/** 有沒有一隻手指在下課（下一步）箭頭附近（T-142：預設提示指向下課） */
const handNearArrow = () => {
  const a = document.querySelector('.next-step')?.getBoundingClientRect()
  if (!a) return false
  return [...document.querySelectorAll('.demo-hand')].some((h) => {
    const r = h.getBoundingClientRect()
    return Math.hypot(r.left + r.width / 2 - (a.left + a.width / 2), r.top + r.height / 2 - (a.top + a.height / 2)) < 170
  })
}

/** 一直上到晚安道別（大箭頭、選圖、找字都自己點；autoNext 關著也可以） */
async function toBye(k: Toddler) {
  for (const end = Date.now() + 150_000; Date.now() < end; ) {
    if (await k.page.$('.lesson-bye')) return true
    const s = await state(k.page)
    const n = await arrowAt(k.page)
    if (n) {
      await k.wait(700)
      const m = await arrowAt(k.page)
      if (m) await k.tap(m, '大箭頭')
      await k.wait(900)
    } else if (s.quiz && s.accepting && !s.dim) {
      const a = (await points(k.page, '.tile[data-answer]'))[0]
      if (a) await k.tap(a, '答案')
      await k.wait(900)
    } else await k.wait(400)
  }
  return false
}

/** 一天兩篇（seedTwo）：進課、把舊篇上完（大箭頭自己點），停在選擇畫面（T-140）；到了回傳 true */
async function toChoice(k: Toddler, c: Checker) {
  await seedTwo(k.page)
  if (!(await enter(k, c))) return false
  if (!(await readAll(k, c))) return false
  for (const end = Date.now() + 150_000; Date.now() < end; ) {
    if (await k.page.$('.zh-between')) return true
    const s = await state(k.page)
    if (await k.page.$('.next-step')) {
      await k.wait(700)
      const n = await arrowAt(k.page)
      if (n && !(await k.page.$('.zh-between'))) await k.tap(n, '大箭頭')
      await k.wait(900)
    } else if (s.quiz && s.accepting && !s.dim) {
      const a = (await points(k.page, '.tile[data-answer]'))[0]
      if (a) await k.tap(a, '答案')
      await k.wait(900)
    } else await k.wait(400)
  }
  await c.once('choice-none', '困惑', '中文課舊篇上完沒有選擇畫面', '')
  return false
}

/** 一題一題答對（選圖、找一樣的字；答完的大箭頭 autoNext 會點），直到 done 成立；回傳到了沒、看過哪幾種題 */
async function answerUntil(k: Toddler, done: (s: Awaited<ReturnType<typeof state>>) => boolean, ms: number) {
  const kinds = new Set<string>()
  for (const end = Date.now() + ms; Date.now() < end; ) {
    const s = await state(k.page)
    if (done(s)) return { ok: true, kinds }
    // 複習上完（T-142）：孩子主動點旁邊的書「再一篇」——書 1.1 秒後才出現（之前點了不算），
    // 下課的大箭頭 1.2 秒出來、autoNext 再過 1.5 秒會點它，所以 1.4 秒時點書
    const more = (await points(k.page, '.zh-between .zh-offer'))[0]
    if (more) {
      await k.wait(1400)
      await k.tap(more, '再一篇（書）')
      await k.wait(1200)
      continue
    }
    if (await k.page.$('.next-step')) {
      await k.wait(800)
      continue
    }
    if (s.quiz && s.accepting && !s.dim) {
      kinds.add(s.glyph ? 'glyph' : 'quiz')
      const ans = (await points(k.page, '.tile[data-answer]'))[0]
      if (ans) await k.tap(ans, `答案 ${s.ask}`)
      await k.wait(1500)
    } else await k.wait(400)
  }
  return { ok: false, kinds }
}

/** 選圖一題一題答對，停在「找一樣的字」 */
async function toGlyph(k: Toddler, c: Checker) {
  for (let i = 0; i < 20; i++) {
    if (await k.page.$('.next-step')) {
      await k.wait(800)
      continue
    }
    const s = await waitFor(k, (s) => s.cheer || s.glyph || (s.quiz && s.accepting), 25_000)
    if (!s || s.cheer) break
    if (s.glyph) return true
    const ans = (await points(k.page, '.tile[data-answer]'))[0]
    if (ans) await k.tap(ans, `答案 ${s.ask}`)
    await k.wait(1800)
  }
  const s = await state(k.page)
  c.outcome('選圖之後有「找一樣的字」', s.glyph, s.cheer ? '直接下課了' : '沒有出現')
  if (!s.glyph) await c.once('no-glyph', '困惑', '選圖答完沒有出現「找一樣的字」', s.cheer ? '直接下課' : '')
  return false
}

test.describe('中文課', () => {

  test('選圖答對一題不點大箭頭（T-118）：亂點、連點、手掌壓、發呆 30 秒，不會自己換題、返回鍵點得到；點了才換', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-next'))
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '不點大箭頭', false, false)
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      if (!(await readAll(k, c))) return
      const cue = await page.waitForSelector('.zh-quiz .tile.cue', { timeout: 30_000 }).catch(() => null)
      if (!cue) return void (await c.once('next-cue', '卡死', '念完課文沒有出現選圖', ''))
      const ans = (await points(page, '.zh-quiz .tile[data-answer]'))[0]
      await k.tap(ans, '點對的那張')
      await ignoreNext(k, c, '選圖答對第一題', () => page.evaluate(() => document.querySelector('.zh-glyph') ? 'glyph' : (document.querySelector('.zh-ask-word')?.textContent ?? null)))
      await c.flush()
    } finally {
      finish(k, c, '不點大箭頭')
    }
  })

  test('選圖沒有大人帶（T-135，盲測 becf39a 中文 2）：一出來手就輪流點每一張、發呆 3 秒圖再跳、8 秒手指著答案（T-144）；照著手點對記成一起練', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-ask'))
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '沒人帶的選圖', false, false)
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      if (!(await readAll(k, c))) return
      const cue = await page.waitForSelector('.zh-quiz .tile.cue', { timeout: 30_000 }).catch(() => null)
      if (!cue) return void (await c.once('ask-cue', '卡死', '念完課文沒有出現選圖', ''))
      /** 手在第幾張（沒有手是 -1）、有沒有標出答案（錯兩次、發呆 30 秒的提示） */
      const look = () =>
        page.evaluate(() => {
          const tiles = [...document.querySelectorAll('.zh-quiz .zh-options .tile')]
          return {
            hand: tiles.findIndex((t) => t.querySelector('.demo-hand')),
            ans: tiles.findIndex((t) => t.hasAttribute('data-answer')),
            hint: tiles.some((t) => t.classList.contains('hint')),
            n: tiles.length,
            wake: Number(document.querySelector('.zh-quiz .zh-options')?.getAttribute('data-wake') ?? 0),
          }
        })
      /** ms 內手去過哪幾張 */
      const watch = async (ms: number) => {
        const seen = new Set<number>()
        let hint = false
        let wake = 0
        let n = 0
        let ans = -1
        for (const end = Date.now() + ms; Date.now() < end; ) {
          const x = await look()
          if (x.hand >= 0) seen.add(x.hand)
          hint ||= x.hint
          wake = Math.max(wake, x.wake)
          n = x.n
          ans = x.ans
          await page.waitForTimeout(120)
        }
        return { seen, hint, wake, n, ans }
      }
      // 一出來（大人還沒念題目、孩子不知道要做什麼）：3 秒內手輪流點過每一張，不是只點答案
      const a = await watch(3500)
      c.outcome('選圖一出來手輪流點每一張', a.seen.size === a.n && a.n >= 2, `手點過 ${a.seen.size}／${a.n} 張`)
      if (a.seen.size < a.n) await c.once('ask-first-hand', '困惑', '選圖一出來沒有人帶，畫面沒有手告訴他要點一張圖', `手點過 ${a.seen.size}／${a.n} 張`)
      c.outcome('手不洩露答案（沒有標出答案）', !a.hint, a.hint ? '答案被標出來了' : '')
      // 孩子發呆：3 秒圖再跳一下、8 秒手靜靜指著答案（T-144，PHASE-7；以前 6 秒手再輪流掃一次，會停在錯的那張）
      const b = await watch(9500)
      const onAns = b.seen.size === 1 && b.seen.has(b.ans)
      c.outcome('發呆幾秒：圖再跳一下、手指著答案（不去別張）', b.wake > 0 && onAns, `跳 ${b.wake} 次、手去過第 ${[...b.seen].map((i) => i + 1).join('、')} 張（答案第 ${b.ans + 1} 張）`)
      if (!(b.wake > 0 && onAns)) await c.once('ask-idle', '困惑', '選圖發呆好幾秒，沒有圖跳、或手沒有指著答案', `跳 ${b.wake} 次、手去過 ${[...b.seen].join(',')}（答案 ${b.ans}）`)
      c.outcome('發呆 13 秒還沒到 30 秒的提示（答案沒有標黃）', !b.hint, b.hint ? '答案被標出來了' : '')
      // 照著手點對：答案是看手的，記成一起練（guided，跟 30 秒的提示一樣，T-111），不算自己答的
      const ans = (await points(page, '.zh-quiz .tile[data-answer]'))[0]
      await k.tap(ans, '點對的那張')
      await k.wait(1200)
      const zh = (await attempts(page)).filter((r) => r.game === 'zh-lesson')
      const led = zh.filter((r) => r.phase === 'guided')
      c.outcome('照著手點對：記一筆一起練（不算自己答的）', led.length === 1 && !(await quizRows(page)).length, `作答 ${zh.map((r) => r.phase).join('、') || '沒有'}`)
      if (!(led.length === 1 && !(await quizRows(page)).length)) await c.once('ask-led', '誤記作答', '手指著答案以後點對，沒有記成一起練', zh.map((r) => r.phase).join('、'))
      await c.flush()
    } finally {
      finish(k, c, '沒人帶的選圖')
    }
  })

  test('選圖答對之後的下一步（T-139，盲測 ccf7ac7 中文 2：打勾後找不到下一步）：1 秒內出現大箭頭、手馬上點給他看', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-arrow'))
    test.setTimeout(4 * 60_000)
    // 不自動點大箭頭：看它自己什麼時候出來
    const { k, c } = await setup(page, info, '答對後的大箭頭', false, false)
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      if (!(await readAll(k, c))) return
      const cue = await page.waitForSelector('.zh-quiz .tile.cue', { timeout: 30_000 }).catch(() => null)
      if (!cue) return void (await c.once('arrow-quiz', '卡死', '念完課文沒有出現選圖', ''))
      const ans = (await points(page, '.zh-quiz .tile[data-answer]'))[0]
      await k.tap(ans, '點對的那張')
      const t0 = Date.now()
      let arrowAt = 0
      let handAt = 0
      while (Date.now() - t0 < 6000 && !handAt) {
        const x = await page.evaluate(() => ({ arrow: !!document.querySelector('.next-step'), hand: !!document.querySelector('.next-step .next-step-hand') }))
        if (x.arrow && !arrowAt) arrowAt = Date.now() - t0
        if (x.hand && !handAt) handAt = Date.now() - t0
        await page.waitForTimeout(80)
      }
      const ok = arrowAt > 0 && arrowAt <= 1100 && handAt > 0 && handAt <= 2000
      c.outcome('打勾後 1 秒內大箭頭出來、2 秒內手點給他看', ok, `大箭頭 ${(arrowAt / 1000).toFixed(1)} 秒、手 ${(handAt / 1000).toFixed(1)} 秒`)
      if (!ok) await c.once('arrow-slow', '困惑', '選圖答對打勾之後，大箭頭、手來得太慢，孩子看不出下一步', `大箭頭 ${(arrowAt / 1000).toFixed(1)} 秒、手 ${(handAt / 1000).toFixed(1)} 秒`)
      await c.flush()
    } finally {
      finish(k, c, '答對後的大箭頭')
    }
  })

  test('念課文時點亮的圖（T-139，盲測：「兔子都不動」「一直點都一樣」）：每點一下都留下看得到的改變，不只是一下就停的動畫', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-tap'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '點圖有變化')
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      /** 點完、動畫播完之後畫面上看得到的樣子：圖朝哪邊、旁邊有幾顆星星 */
      const look = () =>
        page.evaluate(() => {
          const p = document.querySelector('.zh-line.on .zh-pic')
          const face = p?.querySelector<HTMLElement>('.zh-pic-face')
          return `${face ? getComputedStyle(face).transform : 'none'}|${p?.querySelectorAll('.zh-pic-star').length ?? 0}`
        })
      // 課本剛換進來的那一下不收（轉場）：等它停好再點
      await page.waitForSelector('.zh-line.on .zh-pic', { timeout: 10_000 })
      await k.wait(1200)
      const states = [await look()]
      for (let i = 0; i < 3; i++) {
        const pic = (await points(page, '.zh-line.on .zh-pic'))[0]
        if (!pic) break
        await k.tap(pic, `亮的圖（第 ${i + 1} 下）`)
        await k.wait(1400)
        states.push(await look())
      }
      const changed = states.slice(1).every((x, i) => x !== states[i])
      c.outcome('每點一下，停下來之後的樣子都跟上一下不一樣', changed, states.join(' → '))
      if (!changed) await c.once('tap-same', '困惑', '念課文時點亮的圖，點了看起來都一樣（動畫一下就停）', states.join(' → '))
      await c.flush()
    } finally {
      finish(k, c, '點圖有變化')
    }
  })

  test('念課文時的躲貓貓（T-140，盲測 73d57c7：大人念的那一分鐘「好久喔，不知道要幹嘛」）：角色在課本外面探出頭，點了換地方冒出來，不蓋課文和大人的按鈕', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-peek'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, '躲貓貓')
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      await page.waitForSelector('.zh-peek', { timeout: 10_000 }).catch(() => null)
      await k.wait(1200)
      /** 探出頭的角色在哪裡、有沒有蓋到課本、大人的按鈕、陪玩小字、返回鍵，在不在畫面裡 */
      const where = () =>
        page.evaluate(() => {
          const p = document.querySelector('.zh-peek')
          if (!p) return null
          const r = p.getBoundingClientRect()
          const hit = (sel: string) =>
            [...document.querySelectorAll(sel)].some((e) => {
              const b = e.getBoundingClientRect()
              return b.width > 0 && r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom
            })
          return {
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
            w: Math.round(r.width),
            covers: ['.zh-page', '.zh-controls button', '.coplay-hint', '.back-btn, [data-back]', '.stage-host'].filter(hit),
            inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          }
        })
      const spots: string[] = []
      let bad = ''
      for (let i = 0; i < 4; i++) {
        const w = await where()
        if (!w) {
          bad = '沒有探出頭的角色'
          break
        }
        spots.push(`${w.x},${w.y}`)
        if (w.covers.length || !w.inside || w.w < 70) bad = `第 ${i + 1} 次 ${w.covers.join('、')}${w.inside ? '' : ' 超出畫面'}${w.w < 70 ? ` 太小 ${w.w}px` : ''}`
        await k.tap({ x: w.x, y: w.y }, `探出頭的角色（第 ${i + 1} 下）`)
        await k.wait(900)
      }
      c.outcome('念課文時有探出頭的角色、大小夠、不蓋課本和大人的按鈕', !bad, bad || spots.join(' → '))
      if (bad) await c.once('peek-bad', '困惑', '念課文時的躲貓貓角色沒有出現、太小，或蓋到課本、大人的按鈕', bad)
      const moved = spots.slice(1).every((x, i) => x !== spots[i])
      c.outcome('每點一下換一個地方冒出來', moved && spots.length === 4, spots.join(' → '))
      if (!moved) await c.once('peek-still', '困惑', '點了探出頭的角色，沒有換地方', spots.join(' → '))
      const s = await state(page)
      c.outcome('點躲貓貓不會跳行、不記作答', s.at === '0' && (await quizRows(page)).length === 0, `第 ${s.at} 行`)
      await c.flush()
    } finally {
      finish(k, c, '躲貓貓')
    }
  })

  /*
   * T-142（家長 2026-11-12，盲測 9231aa6：孩子舊篇撐得完，接著上新篇就離開，連兩版都這樣）：一天兩篇的第二篇改成「提議」。
   * 舊篇（複習）上完 → 慶祝 → 下課的大箭頭（手指著它）→ 晚安，這就算今天上完；旁邊一本小小的「再一篇」，不搶眼、沒有手，孩子主動點才上新篇。
   * 沒上新篇：新篇不消耗，下次進來直接上那篇新篇（不再複習同一篇），上完照常下課；再下一次才是下一次的複習。
   */
  test('T-142 複習上完：慶祝 → 手指著下課箭頭、旁邊一本不搶眼的書（沒有手）→ 下課、晚安；新篇不消耗；再進來直接上新篇、上完下課；隔天是下一次的複習', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-offer'))
    test.setTimeout(8 * 60_000)
    await page.addInitScript({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ai-toddler', 'heard.js') })
    const { k, c } = await setup(page, info, 'T142複習上完下課', false, false)
    try {
      if (!(await toChoice(k, c))) return
      // 慶祝：舊的書打勾；手來指右下角的下課箭頭（4.5 秒內），書沒有手、比舊的書小
      let handOnArrow = false
      for (const end = Date.now() + 4500; Date.now() < end && !handOnArrow; await page.waitForTimeout(150)) handOnArrow = await page.evaluate(handNearArrow)
      const b = await page.evaluate(() => {
        const r = (s: string) => document.querySelector(s)?.getBoundingClientRect() ?? null
        return {
          done: !!document.querySelector('.zh-between .zh-book.is-done[data-day="1"] .zh-book-check'),
          offer: !!document.querySelector('.zh-between .zh-offer[data-day="4"]'),
          offerHand: !!document.querySelector('.zh-offer .demo-hand'),
          small: (r('.zh-offer')?.width ?? 999) < (r('.zh-between .zh-book.is-done')?.width ?? 0),
          oldChoice: !!document.querySelector('.zh-choice-more, .zh-choice-home'),
          arrow: !!document.querySelector('.next-step'),
          hint: document.querySelector('.coplay-hint')?.textContent ?? '',
        }
      })
      const ok = b.done && b.offer && !b.offerHand && b.small && !b.oldChoice && b.arrow && handOnArrow
      c.outcome('慶祝：舊的書打勾、手指著下課箭頭；「再一篇」是一本小書、沒有手', ok, JSON.stringify({ ...b, handOnArrow, hint: undefined }))
      if (!ok) await c.once('t142-look', '困惑', '複習上完的畫面不是「手指下課、旁邊一本不搶眼的書」', JSON.stringify({ ...b, handOnArrow }))
      const hinted = /再點.*書/.test(b.hint)
      c.outcome('給大人的小字寫「他想聽再點書」', hinted, b.hint)
      if (!hinted) await c.once('t142-hint', '困惑', '複習上完的陪玩小字沒寫「他想聽再點書」', b.hint)
      await shot(page, info, 'T142-中文-複習上完')
      // 亂點空白、發呆：不會自己下課、不會自己上新篇
      k.behavior = '複習上完亂點、發呆'
      await k.spam({ x: 640, y: 150 }, 2, '空白')
      await k.wait(5000)
      const still = !!(await page.$('.zh-between')) && !(await page.$('.lesson-bye'))
      c.outcome('亂點、發呆不自己走', still, still ? '還在等' : '自己走了')
      if (!still) await c.once('t142-auto', '困惑', '複習上完的畫面自己走了', '')
      // 孩子跟著手點下課箭頭 → 晚安道別
      k.behavior = '點下課'
      const n = await arrowAt(page)
      if (n) await k.tap(n, '下課箭頭')
      const bye = await page.waitForSelector('.lesson-bye', { timeout: 8000 }).catch(() => null)
      c.outcome('點下課箭頭 → 晚安道別（今天上完）', !!bye, bye ? '' : '沒有晚安道別')
      if (!bye) return void (await c.once('t142-bye', '卡死', '複習上完點下課箭頭沒有到晚安道別', ''))
      await shot(page, info, 'T142-中文-下課')
      const kv = {
        log: await getKV<{ day: number }[]>(page, 'zhLesson:log'),
        course: await getKV<{ day: number }>(page, 'zhLesson:course'),
        done: await getKV<number[]>(page, 'zhLesson:done'),
        old: await getKV<{ day: number; skipped: boolean; for?: number }>(page, 'zhLesson:old'),
      }
      const kept = kv.log?.length === 3 && kv.course?.day === 3 && !kv.done?.includes(4) && kv.old?.day === 1 && kv.old.skipped === false && kv.old.for === 4
      c.outcome('新篇不消耗；複習記成這一次課做過了', kept, JSON.stringify({ log: kv.log?.map((x) => x.day), course: kv.course?.day, old: kv.old }))
      if (!kept) await c.once('t142-kept', '誤記作答', '只上複習，新篇被記成上過了（或複習沒記下來）', JSON.stringify(kv))
      const zh = await page.evaluate(() => ((window as unknown as { __heard?: { name: string }[] }).__heard ?? []).filter((h) => /^zh/.test(h.name)).length)
      c.outcome('不出聲', zh === 0, `${zh} 個`)

      // 同一天再進來：直接上新篇（不再複習）、上完下課
      k.behavior = '同一天再進來'
      if (!(await toHome(k, c))) return
      if (!(await enter(k, c))) return
      let s = await state(page)
      c.outcome('再進來直接上新篇、從第一行，沒有「跳過舊篇」', s.title === NEW_TITLE && s.at === '0' && !(await page.$('.zh-skip-old')), `〈${s.title}〉第 ${s.at} 行`)
      if (s.title !== NEW_TITLE) return void (await c.once('t142-again', '困惑', '複習上完再進來，又是複習', `〈${s.title}〉`))
      if (!(await readAll(k, c))) return
      const fin = await toBye(k)
      c.outcome('新篇上完 → 下課', fin, fin ? '' : '沒有下課')
      if (!fin) return void (await c.once('t142-new-done', '卡死', '複習之後的新篇上不完', ''))
      const log = await getKV<{ date: string; day: number }[]>(page, 'zhLesson:log')
      c.outcome('新篇上完才記一筆', log?.length === 4 && log[3].day === 4, JSON.stringify(log?.map((x) => x.day)))

      // 隔天（把今天的紀錄改成前一天）：是下一次課的複習（第 2 篇），不是又複習第 1 篇、也不是又上第 4 篇
      k.behavior = '隔天再進來'
      if (!(await toHome(k, c))) return
      if (log?.length === 4) await putKV(page, 'zhLesson:log', log.map((x, i) => (i === 3 ? { ...x, date: '2026-01-04' } : x)))
      await putKV(page, 'zhLesson:course', { day: 4, runs: ['2026-01-04'] })
      const o = await getKV<Record<string, unknown>>(page, 'zhLesson:old')
      if (o) await putKV(page, 'zhLesson:old', { ...o, date: '2026-01-04' })
      if (!(await enter(k, c))) return
      s = await state(page)
      const next = s.title !== OLD_TITLE && s.title !== NEW_TITLE && !!(await page.$('.zh-skip-old'))
      c.outcome('隔天：下一次課的複習（第 2 篇）', next, `〈${s.title}〉`)
      if (!next) await c.once('t142-next-day', '困惑', '隔天不是下一次課的複習（跳篇或重複）', `〈${s.title}〉`)
      await c.flush()
    } finally {
      finish(k, c, 'T142複習上完下課')
    }
  })

  test('T-142 進度不卡住：複習上完按返回再進來是新篇；新篇上到一半離開，隔天再進來還是那篇新篇（不再複習、不跳篇）', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-home'))
    test.setTimeout(7 * 60_000)
    const { k, c } = await setup(page, info, 'T142進度不卡住', false, false)
    try {
      if (!(await toChoice(k, c))) return
      await k.wait(1500)
      // 複習上完的畫面按返回 → 首頁；再進來直接上新篇
      k.behavior = '複習上完按返回'
      const h = await homeButton(page)
      if (h) await pressBack(k, h, `複習上完：${h.label}`)
      const live = await waitLive(page, (l) => l === 'home', 6000)
      c.outcome('按返回 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') return void (await c.once('t142-back', '無法返回', '複習上完按返回沒有回首頁', `停在 ${live}`))
      const old = await getKV<{ day: number; for?: number }>(page, 'zhLesson:old')
      c.outcome('複習記下來了（新篇第 4 篇的這一次）', old?.day === 1 && old.for === 4, JSON.stringify(old))
      if (!(await enter(k, c))) return
      let s = await state(page)
      c.outcome('再進來：新篇', s.title === NEW_TITLE && s.at === '0', `〈${s.title}〉第 ${s.at} 行`)
      if (s.title !== NEW_TITLE) await c.once('t142-back-again', '困惑', '複習上完按返回再進來，又是複習', `〈${s.title}〉`)
      // 新篇上到一半離開 → 隔天（複習的紀錄改成前一天）再進來：還是那篇新篇，從第一行
      k.behavior = '新篇上到一半離開、隔天再進來'
      await adult(k, '.zh-next', '下一行（大人）')
      if (!(await toHome(k, c))) return
      const o = await getKV<Record<string, unknown>>(page, 'zhLesson:old')
      if (o) await putKV(page, 'zhLesson:old', { ...o, date: '2026-01-03' })
      if (!(await enter(k, c))) return
      s = await state(page)
      c.outcome('隔天再進來：還是那篇新篇（不再複習同一篇）', s.title === NEW_TITLE && s.at === '0' && !(await page.$('.zh-skip-old')), `〈${s.title}〉第 ${s.at} 行`)
      if (s.title !== NEW_TITLE) await c.once('t142-next-day-new', '困惑', '沒上新篇，隔天又先複習同一篇', `〈${s.title}〉`)
      const log = await getKV<{ day: number }[]>(page, 'zhLesson:log')
      c.outcome('還沒上完新篇：紀錄沒有多', log?.length === 3, JSON.stringify(log?.map((x) => x.day)))
      await c.flush()
    } finally {
      finish(k, c, 'T142進度不卡住')
    }
  })

  test('親子共讀走完一堂：說明卡、大人還沒按下一行時亂點、連點下一行、聊一聊、連點選項，下課', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-play'))
    test.setTimeout(8 * 60_000)
    // 記下開始播的音檔（要在 boot 之前注入）
    await page.addInitScript({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ai-toddler', 'heard.js') })
    const { k, c } = await setup(page, info, '共讀走完')
    try {
      const voice = await watchVoice(page)
      await pickDay(page, LATE_DAY)
      k.behavior = '連點中文課的門'
      if (!(await enter(k, c, 5 + k.r.int(4)))) return
      let s = await state(page)
      c.outcome('第一次進來有給大人的說明卡', s.intro, s.intro ? '說明卡' : '直接進課本')
      if (!s.intro) await c.once('no-intro', '困惑', '第一次進中文課沒有給大人的說明卡', '')
      await c.screenOk('說明卡')
      await adult(k, '.zh-intro .zh-go', '開始念（大人）')
      s = (await waitFor(k, (s) => s.at != null, 5000)) ?? s
      c.outcome('開始念 → 第一行亮', s.at === '0', `亮第 ${s.at} 行`)

      // 大人還沒按「下一行」，孩子亂點：不會自己往下走、不會跑去別的地方、不記作答
      k.behavior = '大人還沒按下一行時亂點'
      for (let i = 0; i < 12; i++) {
        if ((await snap(page)).live !== LIVE) break
        await toddlerStep(k, c)
      }
      await c.flush()
      const live = (await snap(page)).live
      if (live !== LIVE) {
        k.act(`亂點離開了中文課（到 ${live}），再進來`)
        if (!(await enter(k, c))) return
      }
      c.outcome('亂點不記作答', !(await quizRows(page)).length, `作答 ${(await quizRows(page)).length} 筆`)
      if ((await quizRows(page)).length) await c.once('read-rows', '誤記作答', '念課文的時候亂點，記了選圖的作答', '')

      // 孩子連點「下一行」6 下：一下只走一行（大人的按鈕連點只算一下）
      k.behavior = '連點下一行'
      s = await state(page)
      const at0 = s.at
      const nx = (await points(page, '.zh-next'))[0]
      if (nx && s.at != null && s.at !== 'talk') {
        await k.spam(nx, 6, '下一行')
        await k.wait(400)
        const s1 = await state(page)
        // 最後一行按一下就到聊一聊：也算一行
        const moved = (s1.talk ? s.lines : Number(s1.at)) - Number(at0)
        c.outcome('連點下一行只走一行', moved <= 1, `從第 ${at0} 行到 ${s1.at}`)
        if (moved > 1) await c.once('next-spam', '困惑', '連點「下一行」一次跳了好幾行', `從第 ${at0} 行到 ${s1.at}`)
      }

      // 大人念完、聊完 → 選圖：念題目的時候搶著點不算作答、兩根手指只算一下、連點答案到下課
      k.behavior = '大人念完'
      if (!(await readAll(k, c))) return
      k.behavior = '題目出來時搶著點'
      s = (await waitFor(k, (s) => s.quiz, 8000)) ?? s
      const tiles = await points(page, '.tile')
      if (s.quiz && tiles.length && !(await state(page)).accepting) {
        for (const t of tiles) await k.tap(t, '搶著點選項')
        const n = (await quizRows(page)).length
        // T-108 之後卡片一出來（0.5 秒）就收作答；擋板只剩剛出來的 0.5 秒（上一題連點的手指）：那時候點的不能記成作答
        c.outcome('題目剛出來、還不收的時候點選項不算作答', n === 0, `作答 ${n} 筆`)
        if (n) await c.once('grab', '誤記作答', '題目剛出來、還不收的時候點選項，記了作答', `${n} 筆`)
      }
      k.behavior = '兩根手指一起按'
      s = (await waitFor(k, (s) => s.quiz && s.accepting, 20_000)) ?? s
      const two = (await points(page, '.tile')).slice(0, 2)
      if (s.quiz && s.accepting && two.length === 2) {
        const n0 = (await quizRows(page)).length
        await k.palm(two as Pt[], 250)
        await k.wait(2500)
        const n1 = (await quizRows(page)).length
        c.outcome('兩指同時按兩張只算一下', n1 - n0 <= 1, `多了 ${n1 - n0} 筆`)
        if (n1 - n0 > 1) await c.once('two', '誤記作答', '兩指同時按兩個選項，多記了作答', `多了 ${n1 - n0} 筆`)
      }
      k.behavior = '連點答案到下課'
      const done = await answerAll(k, c, 4)
      c.outcome('上完一堂有下課畫面', done, done ? '下課' : '沒有走到下課')
      if (!done) await alive(k, c, '選圖')
      const d = await checkDoubleRecords(k, c)
      c.outcome('連點不重複記作答', d.dup === 0, `作答 ${d.rows} 筆、重複 ${d.dup}`)
      const v = await voice()
      c.outcome('沒有中文聲音', v.hooked && !v.zh.length && !v.tts, `${v.hooked ? '' : '（沒有記到播放，heard.js 沒注入）'}播了中文音檔 ${v.zh.length} 段、平板內建語音 ${v.tts} 次`)
      if (v.zh.length || v.tts) await c.once('zh-voice', '困惑', '中文課還在要中文音檔或用平板內建語音', `${v.zh.slice(0, 3).join('、')}；內建語音 ${v.tts} 次`)
      await c.flush()
    } finally {
      finish(k, c, '共讀走完')
    }
  })

  test('大人一直沒按下一行：孩子亂點紅字和圖、發呆，課不會卡住，大人回來照樣念得下去', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-red'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '大人沒按')
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      await k.wait(1200)
      k.behavior = '亂點紅字、圖'
      for (let i = 0; i < 14; i++) {
        if ((await snap(page)).live !== LIVE) break
        const reds = await points(page, '.zh-line.seen .zh-red, .zh-line.seen .zh-pic')
        const r = reds.length ? k.r.pick(reds) : null
        if (r && k.r.chance(0.7)) {
          if (k.r.chance(0.4)) await k.spam(r, 2 + k.r.int(4), `紅字 ${r.label}`)
          else await k.tap(r, `紅字 ${r.label}`)
        } else await toddlerStep(k, c)
        await k.wait(200 + k.r.int(900))
      }
      await c.flush()
      if ((await snap(page)).live !== LIVE) {
        k.act('亂點離開了中文課，再進來')
        if (!(await enter(k, c))) return
      }
      // 發呆 20 秒：沒有大人就停在這一行（不會自己往下、不會跳走）
      k.behavior = '發呆'
      const before = await state(page)
      await k.wait(20_000)
      const after = await state(page)
      c.outcome('沒人按下一行就停在這一行', after.at === before.at && (await snap(page)).live === LIVE, `第 ${before.at} 行 → 第 ${after.at} 行`)
      const n = (await quizRows(page)).length
      c.outcome('點紅字、點圖不記作答', n === 0, `作答 ${n} 筆`)
      if (n) await c.once('red-rows', '誤記作答', '點紅字記了選圖的作答', `${n} 筆`)
      // 大人回來：照樣一行一行念到聊一聊
      k.behavior = '大人回來念'
      const ok = await readAll(k, c)
      c.outcome('大人回來照樣念得下去', !!ok, ok ? '念完' : '念不下去')
      await c.flush()
    } finally {
      finish(k, c, '大人沒按')
    }
  })

  test('中途返回再進來：同一天還是同一篇、從第一行開始；返回鍵、Android 返回、連點返回', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-back'))
    test.setTimeout(8 * 60_000)
    const { k, c } = await setup(page, info, '中途返回')
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      const title = (await state(page)).title
      await adult(k, '.zh-next', '下一行（大人）')
      await adult(k, '.zh-next', '下一行（大人）')

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

      // 再進來：同一篇、從第一行開始
      k.behavior = '再進來'
      if (!(await enter(k, c))) return
      const s1 = await state(page)
      c.outcome('再進來還是同一篇、從第一行開始', s1.title === title && s1.at === '0', `〈${s1.title}〉第 ${s1.at} 行`)
      if (s1.title !== title) await c.once('same', '困惑', '同一天再進中文課換了一篇', `本來〈${title}〉，現在〈${s1.title}〉`)

      // Android 返回
      k.behavior = 'Android 返回'
      await settle(page)
      k.act('history.back()')
      await page.evaluate(() => history.back())
      live = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('Android 返回 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('android', '無法返回', '中文課按 Android 返回沒有回首頁', `停在 ${live}`)

      // 聊一聊、選圖到一半回去，再進來：同一篇、從念課文開始，作答紀錄不重複
      k.behavior = '選圖到一半回去再進來'
      if (!(await enter(k, c))) return
      if (!(await readAll(k, c))) return
      const s = await waitFor(k, (s) => s.quiz && s.accepting, 25_000)
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
      c.outcome('選圖到一半再進來：同一篇、從念課文開始', s2.title === title && !s2.quiz && s2.at === '0', `〈${s2.title}〉${s2.quiz ? '在選圖' : `第 ${s2.at} 行`}`)
      if (s2.title !== title) await c.once('same2', '困惑', '選圖到一半回去再進來換了一篇', `本來〈${title}〉，現在〈${s2.title}〉`)
      await checkDoubleRecords(k, c)
      await c.flush()
    } finally {
      finish(k, c, '中途返回')
    }
  })

  test('一天兩篇（T-136）：舊篇跟原本的課一樣走得完、舊篇時亂點、返回再進來、舊篇上完離開再回來直接上新篇、最後小複習', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-two'))
    test.setTimeout(10 * 60_000)
    const { k, c } = await setup(page, info, '一天兩篇')
    try {
      await seedTwo(page)
      if (!(await enter(k, c))) return
      let s = await state(page)
      c.outcome('先上舊篇（3 次前上的〈龜兔賽跑〉）', s.title === OLD_TITLE, `〈${s.title}〉`)
      if (s.title !== OLD_TITLE) return void (await c.once('two-old', '困惑', '第 4 次課沒有先上 3 次前上的舊篇', `〈${s.title}〉`))
      c.outcome('舊篇時大人看得到「跳過舊篇」', !!(await page.$('.zh-skip-old')), '')
      await c.screenOk('舊篇・念課文')
      await shot(page, info, '中文課-舊篇-念課文')

      // 舊篇時亂點：連點亮的圖、課本空白、手掌壓；不會跳過舊篇。
      // T-144 起複習篇亮了 3 秒以後孩子點圖會翻一行（翻了重新算 3 秒），所以一陣亂點最多翻一兩行，不會翻到聊一聊、不會離開舊篇
      k.behavior = '舊篇時亂點'
      const pic = (await points(page, '.zh-line.on .zh-pic'))[0]
      if (pic) await k.spam(pic, 4, '亮的圖')
      const book = (await points(page, '.zh-page'))[0]
      if (book) {
        await k.palm([{ x: book.x - 60, y: book.y }, { x: book.x, y: book.y + 40 }, { x: book.x + 60, y: book.y }], 250)
        await k.spam({ x: book.x + k.r.range(-120, 120), y: book.y + k.r.range(-60, 60) }, 3, '課本')
      }
      await k.wait(800)
      s = await state(page)
      c.outcome('舊篇時亂點不跳過舊篇、不會一下翻好幾行', s.title === OLD_TITLE && !s.talk && Number(s.at) <= 2, `〈${s.title}〉第 ${s.at} 行`)
      if (s.title !== OLD_TITLE) await c.once('two-tap-skip', '困惑', '舊篇時孩子亂點就跳過了舊篇', `〈${s.title}〉`)

      // 舊篇念到一半按返回 → 首頁；再進來還是舊篇、從第一行開始
      k.behavior = '舊篇念到一半返回'
      await adult(k, '.zh-next', '下一行（大人）')
      if (!(await toHome(k, c))) return
      if (!(await enter(k, c))) return
      s = await state(page)
      c.outcome('舊篇返回再進來：還是舊篇、從第一行', s.title === OLD_TITLE && s.at === '0', `〈${s.title}〉第 ${s.at} 行`)

      // 舊篇跟原本的課一樣（家長 2026-11-11）：念課文 → 聊一聊 → 每個紅字一題 → 找一樣的字，再接新篇
      k.behavior = '舊篇跟原本的課一樣上完'
      const oldAt = Date.now()
      if (!(await readAll(k, c))) return
      const o = await answerUntil(k, (s) => s.title === NEW_TITLE, 120_000)
      c.outcome('舊篇有選圖、找一樣的字（跟原本的課一樣）', o.kinds.has('quiz') && o.kinds.has('glyph'), [...o.kinds].join('、'))
      if (!o.kinds.has('glyph')) await c.once('two-old-glyph', '困惑', '舊篇沒有找一樣的字', [...o.kinds].join('、'))
      const oldSec = Math.round((Date.now() - oldAt) / 1000)
      const fresh = await waitFor(k, (s) => s.title === NEW_TITLE, 5000)
      c.outcome('舊篇上完 → 新篇〈牛頓與蘋果〉', !!fresh, fresh ? '新篇' : `停在〈${(await state(page)).title}〉`)
      if (!fresh) return void (await c.once('two-new', '卡死', '舊篇上完沒有接新篇', ''))
      const old = await getKV<{ day: number; skipped: boolean }>(page, 'zhLesson:old')
      c.outcome('舊篇記成上完（沒跳過）', old?.day === 1 && old.skipped === false, JSON.stringify(old))
      c.outcome('新篇沒有「跳過舊篇」', !(await page.$('.zh-skip-old')), '')

      // 新篇念到一半離開、再回來：直接上新篇（舊篇今天上完了），從第一行
      k.behavior = '新篇念到一半離開再回來'
      await adult(k, '.zh-next', '下一行（大人）')
      if (!(await toHome(k, c))) return
      if (!(await enter(k, c))) return
      s = await state(page)
      c.outcome('離開再回來直接上新篇', s.title === NEW_TITLE && s.at === '0', `〈${s.title}〉第 ${s.at} 行`)
      if (s.title !== NEW_TITLE) await c.once('two-resume', '困惑', '舊篇上完離開再回來，又從舊篇開始', `〈${s.title}〉`)

      // 新篇完整：念課文 → 聊一聊 → 選圖 → 找一樣的字 → 最後小複習（前 1 次上的〈吃香蕉〉）→ 下課
      const newAt = Date.now()
      if (!(await readAll(k, c))) return
      const done = await answerAll(k, c, 2)
      const newSec = Math.round((Date.now() - newAt) / 1000)
      // 給 PM：舊篇＋新篇一次上完要多久（測試裡大人一按完就按下一行，真的念會再久一點）
      c.outcome('時間：舊篇、新篇＋小複習', true, `舊篇 ${oldSec} 秒、新篇＋小複習 ${newSec} 秒，共 ${((oldSec + newSec) / 60).toFixed(1)} 分`)
      console.log(`[T-136 時間] ${info.project.name} 舊篇 ${oldSec} 秒、新篇＋小複習 ${newSec} 秒`)
      c.outcome('新篇、小複習答完下課', done, done ? '下課' : '沒有下課')
      if (!done) return void (await c.once('two-done', '卡死', '一天兩篇上不完', ''))
      const rows = await quizRows(page)
      const days = [...new Set(rows.map((r) => r.itemId.split(':')[0]))]
      const review = days.includes('3') || (await glyphRows(page)).length >= 3
      c.outcome('作答有舊篇、新篇、小複習', days.includes('1') && days.includes('4') && review, `選圖的篇：${days.join('、')}`)
      if (!review) await c.once('two-review', '困惑', '最後沒有小複習（前 1 次上的那篇）', `選圖的篇：${days.join('、')}`)
      const log = await getKV<{ day: number }[]>(page, 'zhLesson:log')
      c.outcome('上課紀錄多一筆新篇', log?.length === 4 && log[3].day === 4, JSON.stringify(log?.map((x) => x.day)))
      await c.flush()
    } finally {
      finish(k, c, '一天兩篇')
    }
  })

  test('跳過舊篇（T-136）：大人按右上「跳過舊篇」直接上新篇、連點只算一下；離開再回來不會又出舊篇', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-skip'))
    test.setTimeout(5 * 60_000)
    const { k, c } = await setup(page, info, '跳過舊篇')
    try {
      await seedTwo(page)
      if (!(await enter(k, c))) return
      let s = await state(page)
      if (s.title !== OLD_TITLE) return void (await c.once('skip-old', '困惑', '第 4 次課沒有先上舊篇', `〈${s.title}〉`))
      // 選圖時也看得到：念完舊篇、到選圖再跳
      k.behavior = '舊篇選圖時大人跳過'
      if (!(await readAll(k, c))) return
      const q = await waitFor(k, (s) => s.quiz, 8000)
      c.outcome('舊篇選圖時也有「跳過舊篇」', !!q && !!(await page.$('.zh-skip-old')), '')
      const b = (await points(page, '.zh-skip-old'))[0]
      if (!b) return void (await c.once('skip-none', '卡死', '舊篇時找不到「跳過舊篇」', ''))
      await k.spam(b, 3, '跳過舊篇（大人連點）')
      const fresh = await waitFor(k, (s) => s.title === NEW_TITLE, 8000)
      c.outcome('跳過舊篇 → 新篇', !!fresh, fresh ? '新篇' : `停在〈${(await state(page)).title}〉`)
      if (!fresh) return void (await c.once('skip-stuck', '卡死', '按了跳過舊篇沒有到新篇', ''))
      await k.wait(800)
      s = await state(page)
      c.outcome('連點跳過只算一下（新篇從第一行）', s.title === NEW_TITLE && s.at === '0', `〈${s.title}〉第 ${s.at} 行`)
      const old = await getKV<{ day: number; skipped: boolean }>(page, 'zhLesson:old')
      c.outcome('舊篇記成跳過', old?.day === 1 && old.skipped === true, JSON.stringify(old))
      const n = (await quizRows(page)).length
      c.outcome('跳過不記作答', n === 0, `作答 ${n} 筆`)
      if (n) await c.once('skip-record', '誤記作答', '按跳過舊篇記了作答', `${n} 筆`)
      if (!(await toHome(k, c))) return
      if (!(await enter(k, c))) return
      s = await state(page)
      c.outcome('跳過之後離開再回來：直接上新篇', s.title === NEW_TITLE, `〈${s.title}〉`)
      if (s.title !== NEW_TITLE) await c.once('skip-again', '困惑', '跳過舊篇之後離開再回來，又出現舊篇', `〈${s.title}〉`)
      await c.flush()
    } finally {
      finish(k, c, '跳過舊篇')
    }
  })

  test('找一樣的字（T-117）：示範時亂點、搶著點、兩指、發呆、連點答案；返回再進來', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-glyph'))
    test.setTimeout(8 * 60_000)
    const { k, c } = await setup(page, info, '找一樣的字')
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      if (!(await readAll(k, c))) return
      if (!(await toGlyph(k, c))) return
      // 第一次：手先示範，下面的字變淡（PHASE-1）
      let s = await state(page)
      c.outcome('第一次有示範（下面的字變淡）', s.dim, s.dim ? '變淡' : '沒有變淡')
      if (!s.dim) await c.once('glyph-demo', '困惑', '第一次「找一樣的字」沒有示範', '')
      await c.screenOk('找一樣的字・示範')
      // 示範時點上面的字、點空白：不記作答
      k.behavior = '示範時點上面的字、亂點空白'
      const top = (await points(page, '.zh-glyph-target'))[0]
      if (top) await k.spam(top, 3, '上面的字')
      await k.wait(300)
      const pair = (await points(page, '.zh-glyph-slot'))[0]
      if (pair) await k.tap({ x: pair.x + pair.w, y: pair.y }, '空白處')
      await k.wait(600)
      let n = (await glyphRows(page)).length
      c.outcome('點上面的字、空白不記作答', n === 0, `作答 ${n} 筆`)
      if (n) await c.once('glyph-blank', '誤記作答', '點上面的字或空白，記了找一樣的字的作答', `${n} 筆`)
      s = await state(page)
      c.outcome('示範時點空白：示範收掉、輪到他', !s.dim && !s.hand, s.dim ? '還在示範' : '輪到他')
      // 兩根手指同時按兩個字：只算一下
      k.behavior = '兩根手指一起按'
      const two = (await points(page, '.zh-glyph-options .tile')).slice(0, 2)
      if (two.length === 2) {
        await k.palm(two as Pt[], 250)
        await k.wait(1600)
        n = (await glyphRows(page)).length
        c.outcome('兩指同時按兩個字：最多記一筆', n <= 1, `作答 ${n} 筆`)
        if (n > 1) await c.once('glyph-two', '誤記作答', '兩指同時按兩個字，記了好幾筆', `${n} 筆`)
      }
      s = await state(page)
      if (s.glyph && !s.cheer) {
        // 還沒答對（兩指先碰到錯的那個）：發呆到手出來指答案（精簡版不發呆）
        if (!info.project.metadata?.lite) {
          k.behavior = '發呆'
          const t0 = Date.now()
          let hinted = false
          while (Date.now() - t0 < 36_000 && !hinted) {
            await k.wait(1000)
            hinted = !!(await points(page, '.zh-glyph-options .tile.hint')).length
          }
          c.outcome('發呆：手出來指答案', hinted, hinted ? `${Math.round((Date.now() - t0) / 1000)} 秒` : '36 秒內沒有提示')
          if (!hinted) await c.once('glyph-idle', '卡死', '「找一樣的字」發呆 36 秒都沒有提示', '')
        }
        k.behavior = '連點答案'
        const ans = (await points(page, '.zh-glyph-options .tile[data-answer]'))[0]
        if (ans) await k.spam(ans, 5, '答案')
      }
      const end = await waitFor(k, (s) => s.cheer, 6000)
      c.outcome('答對 → 下課', !!end, end ? '下課' : '沒有下課')
      if (!end) await alive(k, c, '找一樣的字')
      const rows = await glyphRows(page)
      c.outcome('找一樣的字只記一筆、示範過的記成一起練', rows.length === 1 && rows[0].phase === 'guided', rows.map((r) => `${r.phase}${r.ok ? '一次就對' : '錯過'}`).join('、'))
      if (rows.length !== 1) await c.once('glyph-rows', '誤記作答', '找一樣的字記了不只一筆', `${rows.length} 筆`)
      await checkDoubleRecords(k, c)
      await c.flush()

      // 第 2 堂（隔天）不再示範：直接讓他點；中途按返回 → 首頁，再進來從念課文開始
      k.behavior = '找一樣的字到一半按返回'
      await putKV(page, 'zhLesson:glyph', { level: 2, recent: [], demos: 1, learned: true })
      if (!(await toHome(k, c))) return
      if (!(await enter(k, c))) return
      if (!(await readAll(k, c))) return
      if (!(await toGlyph(k, c))) return
      s = await state(page)
      const three = (await points(page, '.zh-glyph-options .tile')).length
      c.outcome('學會以後不示範；第 2 級 3 選 1', !s.dim && three === 3, `${s.dim ? '還在示範' : '沒示範'}、${three} 個字`)
      const wrong = (await points(page, '.zh-glyph-options .tile:not([data-answer])'))[0]
      if (wrong) await k.spam(wrong, 3, '錯的字')
      await k.wait(500)
      const h = await homeButton(page)
      if (!h) return void (await c.once('glyph-noback', '無法返回', '找一樣的字沒有返回鍵', ''))
      await pressBack(k, h)
      const live = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('找一樣的字按返回 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('glyph-back', '無法返回', '找一樣的字按返回鍵沒有回首頁', `停在 ${live}`)
      await k.wait(1200)
      if (!(await enter(k, c))) return
      const s2 = await state(page)
      c.outcome('再進來從念課文開始', !s2.quiz && s2.at === '0', s2.quiz ? '在答題' : `第 ${s2.at} 行`)
      await checkDoubleRecords(k, c)
      await c.flush()
    } finally {
      finish(k, c, '找一樣的字')
    }
  })

  /**
   * T-145（盲測 fb621aa 中文 zh-run 7 第 12 步、zh-run 8 第 11 步）：學會以後不示範的「找一樣的字」，手點完一輪字卡就收走，
   * 下一輪要等發呆 6 秒，中間畫面上沒有手，孩子「不知道要點哪個」。現在一出現就有手，一直到他點下去或提示出來，手都在畫面上；
   * 手可以停在上面的字（看這個），不能停在答案上（不洩題）。孩子照著手點上面的字，手就帶他去點下面的字卡。
   */
  test('T-145 找一樣的字一出現就有手：發呆時手一直在、不停在答案上；照手點上面的字，手去點下面的字卡', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-glyph-hand'))
    test.setTimeout(5 * 60_000)
    const { k, c } = await setup(page, info, '找一樣的字有手')
    /** 手的指尖在哪裡：上面的字 top、下面的字卡（答案 ans、別的 tile）、都不是 air；沒有手 null */
    const handOn = () =>
      page.evaluate(() => {
        const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
        const g = root.querySelector('.zh-glyph')
        const h = g?.querySelector(':scope > .demo-hand')
        if (!g || !h) return null
        const r = h.getBoundingClientRect()
        const x = r.left + r.width * 0.34
        const y = r.top + r.height * 0.07
        const inside = (e: Element | null) => {
          if (!e) return false
          const b = e.getBoundingClientRect()
          return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom
        }
        if (inside(g.querySelector('.zh-glyph-target'))) return 'top'
        for (const t of g.querySelectorAll('.zh-glyph-options .tile')) if (inside(t)) return t.hasAttribute('data-answer') ? 'ans' : 'tile'
        return 'air'
      })
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      await putKV(page, 'zhLesson:glyph', { level: 1, recent: [], demos: 1, learned: true })
      if (!(await enter(k, c))) return
      if (!(await readAll(k, c))) return
      if (!(await toGlyph(k, c))) return
      const on = await waitFor(k, (s) => s.glyph && s.accepting, 5000)
      c.outcome('找一樣的字出來、可以點（不示範）', !!on && !on.dim, on ? (on.dim ? '在示範' : '可以點') : '沒有收作答')
      if (!on || on.dim) return
      // 發呆 11 秒（12 秒手才指答案）：每 0.2 秒看一次手
      k.behavior = '發呆，看手在哪'
      const t0 = Date.now()
      let none = 0
      let firstNone = -1
      /** 手連續停在答案上多久（毫秒） */
      let ansFrom = -1
      let ansMax = 0
      while (Date.now() - t0 < 11_000) {
        const at = await handOn()
        const t = (Date.now() - t0) / 1000
        if (!at && t > 1.2) {
          none++
          if (firstNone < 0) firstNone = t
        }
        const now = Date.now()
        if (at !== 'ans') ansFrom = -1
        else if (ansFrom < 0) ansFrom = now
        else ansMax = Math.max(ansMax, now - ansFrom)
        await page.waitForTimeout(200)
      }
      c.outcome('一出現到 11 秒，手一直在畫面上', none === 0, none ? `${firstNone.toFixed(1)} 秒起沒有手（${none} 次看不到）` : '一直有手')
      if (none) await c.once('glyph-nohand', '困惑', '「找一樣的字」出來以後有一段時間畫面上沒有手', `${firstNone.toFixed(1)} 秒起`)
      // 輪流點的時候每張停 1 秒左右（最後一張 1.35 秒）；連續停 2 秒以上就是停在答案上了
      c.outcome('手不會停在答案上（12 秒提示前）', ansMax < 2000, `在答案上最久連續 ${(ansMax / 1000).toFixed(1)} 秒`)
      if (ansMax >= 2000) await c.once('glyph-handans', '困惑', '「找一樣的字」發呆時手停在答案上', `${(ansMax / 1000).toFixed(1)} 秒`)
      // 照著手點上面的字：手去點下面的字卡
      k.behavior = '照著手點上面的字'
      const top = (await points(page, '.zh-glyph-target'))[0]
      if (top) await k.tap(top, '上面的字')
      let toTiles = false
      for (const end = Date.now() + 4000; Date.now() < end && !toTiles; ) {
        const at = await handOn()
        toTiles = at === 'tile' || at === 'ans'
        await page.waitForTimeout(150)
      }
      c.outcome('點上面的字：手去點下面的字卡', toTiles, toTiles ? '有' : '4 秒內手沒去字卡')
      if (!toTiles) await c.once('glyph-toptap', '困惑', '照著手點上面的字，手沒有帶他去點下面的字卡', '')
      const rows = await glyphRows(page)
      c.outcome('看手、點上面的字都不記作答', rows.length === 0, `${rows.length} 筆`)
      if (rows.length) await c.once('glyph-hand-rows', '誤記作答', '點上面的字記了找一樣的字的作答', `${rows.length} 筆`)
      await c.flush()
    } finally {
      finish(k, c, '找一樣的字有手')
    }
  })

  test('下課挑貼紙（T-90）：點一下手馬上示範「再點一下」；收進貼紙本後停在那一頁，點大箭頭去晚安道別、點房子才回首頁', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-sticker'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '挑貼紙', true)
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      if (!(await readAll(k, c))) return
      k.behavior = '答完選圖'
      const done = await answerAll(k, c, 1)
      if (!done) return void (await c.once('st-end', '卡死', '選圖答完沒有走到下課', ''))
      const pk = async () =>
        page.evaluate(() => ({
          picker: !!document.querySelector('.picker'),
          opts: document.querySelectorAll('.pk-opt').length,
          choose: !!document.querySelector('.pk-side'),
          hand: [...document.querySelectorAll('.pk-opt')].findIndex((e) => !!e.querySelector('.pk-hand')),
          sel: [...document.querySelectorAll('.pk-opt')].findIndex((e) => e.classList.contains('is-sel')),
          book: !!document.querySelector('.pk-book'),
          home: !!document.querySelector('.pk-home'),
          homeHand: !!document.querySelector('.pk-home-hand'),
        }))
      const until = async (pred: (s: Awaited<ReturnType<typeof pk>>) => boolean, ms: number) => {
        const end = Date.now() + ms
        while (Date.now() < end) {
          const s = await pk()
          if (pred(s)) return s
          await k.wait(150)
        }
        return null
      }
      let s = await until((s) => s.choose && s.opts >= 6, 12_000)
      c.outcome('下課出現挑貼紙', !!s, s ? `${s.opts} 張` : '沒有出現')
      if (!s) return void (await c.once('st-none', '困惑', '這一堂指定有貼紙，卻沒有出現挑貼紙', ''))
      // 等攤開時的示範手做完，點第 3 張一下
      await k.wait(3500)
      const opt = (await points(page, '.pk-opt'))[2]
      await k.tap(opt, '點一張貼紙')
      const t0 = Date.now()
      s = await until((s) => s.hand === 2, 2500)
      const ms = Date.now() - t0
      c.outcome('點一下：手馬上在那一張示範再點一下', !!s, s ? `${(ms / 1000).toFixed(1)} 秒內出現` : '2.5 秒內沒有出現')
      if (!s) await c.once('st-hand', '困惑', '點了一張貼紙，手沒有馬上示範「再點一下」', '')
      // 再點同一張：收下 → 貼紙本那一頁，右下角「下一步」的大箭頭（T-118：不再 20 秒自己回首頁）
      await k.wait(1200)
      await k.tap(opt, '再點同一張')
      const arrow = await page.waitForSelector('.next-step', { timeout: 10_000 }).catch(() => null)
      s = await pk()
      c.outcome('收進貼紙本以後：停在那一頁，出現大箭頭', !!arrow && s.book, arrow ? (s.book ? '' : '貼紙本不見了') : '10 秒內沒有出現大箭頭')
      if (!arrow) return void (await c.once('st-next', '卡死', '貼紙收進本子以後沒有出現「下一步」的大箭頭', ''))
      // 孩子點大箭頭（boot 的 autoNext）→ 晚安道別；點恐龍 → 睡著 → 房子 → 首頁
      let live = (await snap(page)).live
      const bye = await page.waitForSelector('.lesson-bye', { timeout: 8000 }).catch(() => null)
      c.outcome('點大箭頭 → 晚安道別', !!bye, bye ? '' : `停在 ${live}`)
      if (!bye) return void (await c.once('st-bye', '卡死', '貼紙本點了大箭頭沒有到晚安道別', ''))
      await k.wait(1500)
      const dino = (await points(page, '.lb-host'))[0]
      if (dino) await k.tap(dino, '恐龍')
      const house = await page.waitForSelector('.lb-home', { timeout: 8000 }).catch(() => null)
      c.outcome('點恐龍：睡著、房子出來', !!house, house ? '' : '房子沒有出來')
      await k.wait(1200)
      const h = (await points(page, '.lb-home'))[0]
      if (h) await k.tap(h, '房子')
      live = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('點房子 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('st-home-tap', '無法返回', '晚安道別點房子沒有回首頁', `停在 ${live}`)
      await c.flush()
    } finally {
      finish(k, c, '挑貼紙')
    }
  })

  /*
   * T-141（AI 小男生盲測 c9bb003 中文 1、2）：兩輪都把舊篇上完、跟著手點「再一篇」，新篇念故事時一直點亮起來的圖，
   * 「點了好多次都一樣／沒有變，好久喔」，累計 3:49、4:22 就離開。照孩子的順序走一次：
   * 舊篇上完 → 選擇畫面（手要兩邊都指，不只指再一篇）→ 點再一篇 → 先喘口氣（新的書打開來）→ 新篇念故事：
   * 上面的進度從空的開始，每一行他點了亮的圖，就有一顆星飛上去（看得到進度）。全程不出聲。
   */
  test('T-141 一天兩篇：點再一篇先喘口氣、新篇念故事時點亮的圖會換到進度的星星（進度從空的開始）、不出聲', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-t141'))
    test.setTimeout(7 * 60_000)
    await page.addInitScript({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ai-toddler', 'heard.js') })
    const { k, c } = await setup(page, info, 'T141新篇有事做', false, false)
    try {
      if (!(await toChoice(k, c))) return
      await k.wait(1500)
      // 孩子主動點旁邊的書「再一篇」（T-142 起是提議）→ 先喘口氣：新的書打開來，一下下才開始念；這時候亂點不會跳過、不會卡住
      k.behavior = '點再一篇'
      const m = (await points(page, '.zh-between .zh-offer'))[0]
      if (m) await k.tap(m, '再一篇')
      let breath = false
      for (let i = 0; i < 25 && !breath; i++) {
        breath = !!(await page.$('.zh-breath[data-breath]'))
        if (!breath) await page.waitForTimeout(100)
      }
      c.outcome('點再一篇 → 先喘口氣（新的書打開來），不是馬上念', breath, breath ? '有' : '馬上開始念')
      if (!breath) await c.once('t141-breath', '困惑', '慶祝完點再一篇，新篇馬上開始念，中間沒有喘口氣', '')
      else {
        await shot(page, info, 'T141-中文-喘口氣')
        await k.spam({ x: 640, y: 420 }, 2, '喘口氣時亂點')
      }
      const fresh = await waitFor(k, (s) => s.title === NEW_TITLE && s.at === '0', 8000)
      if (!fresh) return void (await c.once('t141-new', '卡死', '點再一篇沒有開始新篇', ''))
      await k.wait(900)

      // 上面的進度：新篇從空的開始（以前是舊篇的星星留著，一開始就幾乎滿了，點了也看不出進度）
      const stars = () => page.evaluate(() => document.querySelectorAll('.progress i.star').length)
      const s0 = await stars()
      c.outcome('新篇的進度從空的開始', s0 === 0, `${s0} 顆星`)
      if (s0 !== 0) await c.once('t141-progress', '困惑', '新篇開始時上面的進度已經有舊篇的星星，看不出新篇的進度', `${s0} 顆`)

      // 盲測的孩子：每一行都點亮起來的圖（點 2 下），大人念完按下一行
      k.behavior = '新篇念故事時一直點亮的圖'
      const per: number[] = []
      for (let i = 0; i < fresh.lines; i++) {
        const before = await stars()
        const p = (await points(page, '.zh-line.on .zh-pic'))[0]
        if (p) await k.spam(p, 2, `第 ${i + 1} 行亮的圖`)
        await k.wait(1500)
        per.push((await stars()) - before)
        if (i === 1) await shot(page, info, 'T141-中文-新篇點圖換星星')
        if (i < fresh.lines - 1) await adult(k, '.zh-next', '下一行（大人）')
      }
      const ok = per.length > 0 && per.every((d) => d === 1)
      c.outcome('每一行點了亮的圖，上面就多一顆星（看得到進度）', ok, per.join(','))
      if (!ok) await c.once('t141-star', '困惑', '新篇念故事時點了亮的圖，上面的進度沒有變', per.join(','))
      const zh = await page.evaluate(() => ((window as unknown as { __heard?: { name: string }[] }).__heard ?? []).filter((h) => /^zh/.test(h.name)).length)
      c.outcome('全程不出聲（沒有中文音檔）', zh === 0, `${zh} 個`)
      if (zh) await c.once('t141-voice', '困惑', '中文課出聲了', `${zh} 個`)
      await c.flush()
    } finally {
      finish(k, c, 'T141新篇有事做')
    }
  })

  /*
   * T-144 A 案（家長 2026-11-13，盲測 c9bb003、9231aa6、112cb8d：連三版都在複習篇離開，念課文時孩子點亮的圖不會往下走）：
   * 複習篇（舊篇）一行亮了 3 秒以後，孩子點亮的圖、探頭的角色或課本空白處就翻到下一行；最後一行點了到聊一聊。
   * 3 秒內點照舊（動一下、星星）；連點、多指只翻一行；大人的「下一行／上一行」照舊；亂點不會跳過聊一聊。
   */
  test('T-144 複習篇孩子翻行：亮了 3 秒後點亮的圖翻一行、3 秒內不翻、連點多指只翻一行、探頭也算、大人按鈕照常、亂點不跳過聊一聊', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-turn'))
    test.setTimeout(5 * 60_000)
    const { k, c } = await setup(page, info, 'T144複習篇翻行')
    try {
      await seedTwo(page)
      if (!(await enter(k, c))) return
      let s = await state(page)
      if (s.title !== OLD_TITLE) return void (await c.once('turn-old', '困惑', '第 4 次課沒有先上舊篇', `〈${s.title}〉`))
      await page.waitForSelector('.zh-line.on .zh-pic', { timeout: 10_000 })
      const at = async () => (await state(page)).at
      /** 等這一行亮滿 3.5 秒（從 since 算） */
      const ripe = async (since: number) => {
        const left = since + 3500 - Date.now()
        if (left > 0) await k.wait(left)
      }
      const litPic = async () => (await points(page, '.zh-line.on .zh-pic'))[0]

      // 課本剛換進來的那一下不收（轉場）：等它停好，大人再按下一行 → 第 1 行（從這裡開始計時）
      await k.wait(1200)
      await adult(k, '.zh-next', '下一行（大人）')
      let t = Date.now() - 1000
      c.outcome('大人的「下一行」照常（第 0 → 1 行）', (await at()) === '1', `第 ${await at()} 行`)

      // 3 秒內：點亮的圖、點課本空白，照舊不翻
      k.behavior = '亮了 3 秒內點'
      let p = await litPic()
      if (p) await k.tap(p, '亮的圖（3 秒內）')
      const book = (await points(page, '.zh-page'))[0]
      if (book) await k.tap({ x: book.x + 40, y: book.y + book.w * 0.02 }, '課本空白（3 秒內）')
      await k.wait(300)
      const early = await at()
      const earlyOk = early === '1' && Date.now() - t < 3000
      c.outcome('亮了 3 秒內點圖、點空白不翻行', early === '1', `第 ${early} 行（${((Date.now() - t) / 1000).toFixed(1)} 秒）`)
      if (!earlyOk && early !== '1') await c.once('turn-early', '困惑', '複習篇一行剛亮（3 秒內）孩子點圖就翻走了，大人還沒念完', `第 ${early} 行`)

      // 3 秒後：點一下亮的圖 → 翻到第 2 行
      k.behavior = '亮了 3 秒後點'
      await ripe(t)
      p = await litPic()
      if (p) await k.tap(p, '亮的圖（3 秒後）')
      await k.wait(400)
      const one = await at()
      c.outcome('亮了 3 秒後點亮的圖翻一行（1 → 2）', one === '2', `第 ${one} 行`)
      if (one !== '2') await c.once('turn-none', '困惑', '複習篇孩子點亮的圖（亮了 3 秒以後）沒有翻到下一行', `第 ${one} 行`)

      // 大人退回：上一行照常
      k.behavior = '大人退回'
      await adult(k, '.zh-prev', '上一行（大人）')
      t = Date.now() - 1000
      const back = await at()
      c.outcome('大人的「上一行」照常（2 → 1）', back === '1', `第 ${back} 行`)

      // 連點 6 下：只翻一行
      k.behavior = '連點亮的圖'
      await ripe(t)
      p = await litPic()
      if (p) await k.spam(p, 6, '亮的圖（連點）')
      await k.wait(500)
      const spam = await at()
      t = Date.now() - 500
      c.outcome('連點亮的圖只翻一行（1 → 2）', spam === '2', `第 ${spam} 行`)
      if (spam !== '2') await c.once('turn-spam', '困惑', '複習篇連點亮的圖，翻了不只一行（或沒翻）', `第 ${spam} 行`)

      // 手掌壓（三根手指，第一根在亮的圖上，另外兩根壓在旁邊）：只翻一行
      k.behavior = '手掌壓亮的圖'
      await ripe(t)
      p = await litPic()
      if (p) await k.palm([{ x: p.x, y: p.y }, { x: p.x - 70, y: p.y + 10 }, { x: p.x + 10, y: p.y + 60 }], 250)
      await k.wait(500)
      const palm = await at()
      c.outcome('多指壓課本只翻一行（2 → 3）', palm === '3', `第 ${palm} 行`)
      if (palm !== '3') await c.once('turn-palm', '困惑', '複習篇手掌壓課本，翻了不只一行（或沒翻）', `第 ${palm} 行`)

      // 探頭的角色也算
      k.behavior = '點探頭的角色'
      await adult(k, '.zh-prev', '上一行（大人）')
      t = Date.now() - 1000
      await ripe(t)
      const peek = (await points(page, '.zh-peek'))[0]
      if (peek) await k.tap(peek, '探頭的角色（3 秒後）')
      await k.wait(500)
      const pk = await at()
      c.outcome('亮了 3 秒後點探頭的角色也翻一行（2 → 3）', pk === '3', `第 ${pk} 行`)

      // 最後一行：大人按上一行、下一行照常；3 秒後孩子連點 → 到聊一聊；接著亂點不會跳過聊一聊
      k.behavior = '最後一行連點、聊一聊亂點'
      await adult(k, '.zh-prev', '上一行（大人）')
      await adult(k, '.zh-next', '下一行（大人）')
      t = Date.now() - 1000
      const adultOk = (await at()) === '3'
      c.outcome('大人的上一行、下一行照常（3 → 2 → 3）', adultOk, `第 ${await at()} 行`)
      if (!adultOk) await c.once('turn-adult', '困惑', '複習篇大人的上一行／下一行按了沒有照常走', `第 ${await at()} 行`)
      await ripe(t)
      p = await litPic()
      if (p) await k.spam(p, 6, '最後一行亮的圖（連點）')
      await k.wait(500)
      s = await state(page)
      c.outcome('最後一行亮了 3 秒後點圖 → 聊一聊', s.talk && !s.quiz, s.talk ? '聊一聊' : s.quiz ? '跳到選圖' : `第 ${s.at} 行`)
      if (!s.talk) await c.once('turn-talk', '困惑', '複習篇最後一行點了亮的圖，沒有到聊一聊', s.quiz ? '跳過聊一聊直接選圖' : `第 ${s.at} 行`)
      // 翻到聊一聊的那一陣連點還沒停：點右下角（往下走的按鈕還按不動）、原來圖的地方、課本
      const corner = (await points(page, '.zh-controls'))[0]
      if (corner) await k.spam(corner, 3, '亂點右下角')
      for (let i = 0; i < 3; i++) {
        if (p) await k.spam(p, 2, '亂點（原來圖的地方）')
        if (book) await k.tap({ x: book.x + k.r.range(-120, 120), y: book.y + k.r.range(-60, 60) }, '亂點課本')
        await k.wait(300)
      }
      s = await state(page)
      c.outcome('聊一聊時亂點不會跳過聊一聊', s.talk && !s.quiz, s.talk ? '還在聊一聊' : '被跳過了')
      if (!s.talk) await c.once('turn-skip-talk', '困惑', '複習篇翻到聊一聊之後，孩子亂點就跳過了聊一聊', '')
      const n = (await quizRows(page)).length
      c.outcome('翻行不記作答', n === 0, `作答 ${n} 筆`)
      if (n) await c.once('turn-rows', '誤記作答', '複習篇孩子翻行記了選圖的作答', `${n} 筆`)
      await c.flush()
    } finally {
      finish(k, c, 'T144複習篇翻行')
    }
  })

  /** 新篇不受影響：亮了 3 秒以後點亮的圖，照舊不翻（只有大人按下一行） */
  test('T-144 新篇照舊：亮了 3 秒後孩子點亮的圖不翻行', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-turn'))
    test.setTimeout(3 * 60_000)
    const { k, c } = await setup(page, info, 'T144新篇不翻')
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      if (!(await enter(k, c))) return
      await page.waitForSelector('.zh-line.on .zh-pic', { timeout: 10_000 })
      await k.wait(3800)
      const p = (await points(page, '.zh-line.on .zh-pic'))[0]
      if (p) await k.spam(p, 3, '亮的圖（3 秒後）')
      await k.wait(500)
      const s = await state(page)
      c.outcome('新篇亮了 3 秒後點圖不翻行（大人念）', s.at === '0', `第 ${s.at} 行`)
      if (s.at !== '0') await c.once('turn-new', '困惑', '新篇孩子點亮的圖就翻行了（新篇應該由大人按下一行）', `第 ${s.at} 行`)
      await c.flush()
    } finally {
      finish(k, c, 'T144新篇不翻')
    }
  })

  /*
   * T-144 A 案（PHASE-7：發呆 8 秒，手靜靜指著答案；盲測 9231aa6、112cb8d：以前 6 秒手輪流掃三張，截圖上停在錯的那張，孩子照著點錯）：
   * 第一題一出來的輪流點照舊；輪流點完發呆 8 秒，手停在答案上不動（不再去別張）。新篇、舊篇都一樣。
   */
  for (const part of ['新篇', '舊篇'] as const) {
    test(`T-144 選圖發呆 8 秒手指著答案（${part}）：輪流點完、發呆 8±1 秒手出現在答案上、停著不去別張`, async ({ page }, info) => {
      test.skip(!want('lesson-chinese-point'))
      test.setTimeout(5 * 60_000)
      const { k, c } = await setup(page, info, `T144發呆手指答案-${part}`, false, false)
      try {
        if (part === '舊篇') await seedTwo(page)
        else await putKV(page, 'zhLesson:introSeen', true)
        if (!(await enter(k, c))) return
        const title = (await state(page)).title
        if (part === '舊篇' && title !== OLD_TITLE) return void (await c.once('point-old', '困惑', '第 4 次課沒有先上舊篇', `〈${title}〉`))
        if (!(await readAll(k, c))) return
        const cue = await page.waitForSelector('.zh-quiz .tile.cue', { timeout: 30_000 }).catch(() => null)
        if (!cue) return void (await c.once('point-quiz', '卡死', '念完課文沒有出現選圖', ''))
        /** 手在第幾張（沒有手是 -1）、答案是第幾張 */
        const look = () =>
          page.evaluate(() => {
            const tiles = [...document.querySelectorAll('.zh-quiz .zh-options .tile')]
            return { hand: tiles.findIndex((t) => t.querySelector('.demo-hand')), ans: tiles.findIndex((t) => t.hasAttribute('data-answer')), n: tiles.length }
          })
        // 第一題一出來：手輪流點過每一張（照舊），點完收走
        const seen = new Set<number>()
        let sweptAt = 0
        for (const end = Date.now() + 8000; Date.now() < end; ) {
          const x = await look()
          if (x.hand >= 0) seen.add(x.hand)
          else if (seen.size && seen.size >= x.n) {
            sweptAt = Date.now()
            break
          }
          await page.waitForTimeout(60)
        }
        const n = (await look()).n
        c.outcome('第一題一出來手輪流點每一張（照舊）', seen.size === n && !!sweptAt, `手點過 ${seen.size}／${n} 張`)
        if (!sweptAt) return void (await c.once('point-sweep', '困惑', '選圖第一題一出來，手沒有輪流點每一張', `手點過 ${seen.size}／${n} 張`))
        // 發呆：手什麼時候再出來、出來在哪一張
        let came = 0
        let where = -1
        let ans = -1
        for (const end = sweptAt + 12_000; Date.now() < end; ) {
          const x = await look()
          if (x.hand >= 0) {
            came = Date.now() - sweptAt
            where = x.hand
            ans = x.ans
            break
          }
          await page.waitForTimeout(60)
        }
        const okTime = came >= 7000 && came <= 9000
        c.outcome('發呆 8±1 秒手出現在答案上', okTime && where === ans, came ? `${(came / 1000).toFixed(1)} 秒，在第 ${where + 1} 張（答案第 ${ans + 1} 張）` : '12 秒內沒有手')
        if (!(okTime && where === ans)) await c.once('point-answer', '困惑', `${part}選圖發呆時，手沒有在 8 秒左右指著答案`, came ? `${(came / 1000).toFixed(1)} 秒、第 ${where + 1} 張（答案第 ${ans + 1} 張）` : '沒有手')
        // 手停著：接下來 2.5 秒只在答案上（不輪流掃別張）
        const after = new Set<number>()
        for (const end = Date.now() + 2500; Date.now() < end; ) {
          after.add((await look()).hand)
          await page.waitForTimeout(100)
        }
        const stay = after.size === 1 && after.has(ans)
        c.outcome('手靜靜停在答案上，不去別張', stay, [...after].map((i) => (i < 0 ? '沒有' : `第 ${i + 1} 張`)).join('、'))
        if (!stay) await c.once('point-stay', '困惑', `${part}選圖發呆時手沒有停在答案上（去了別張或不見了）`, [...after].join(','))
        await c.flush()
      } finally {
        finish(k, c, `T144發呆手指答案-${part}`)
      }
    })
  }
})

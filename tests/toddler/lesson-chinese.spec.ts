import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { attempts, boot, homeButton, settle, snap } from './lib/app'
import { Toddler, hashSeed, type Pt } from './lib/toddler'
import { Checker, alive, checkDoubleRecords, doorAt, ignoreNext, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'

/**
 * 中文課（src/lessons/chinese/）：親子共讀（2026-11-03 起 App 不出聲，大人念）。第一次有給大人的說明卡 → 念課文（一次亮一行，大人按「下一行」）
 * → 聊一聊 → 選圖（三選一）→ 下課。每篇連上 3 次（course.ts），第 2 次每行最後一個紅字框起來、標「停」。
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

/** 家長區「今天上這篇」（src/lessons/chinese/progress.ts 的 zhLesson:pick）：那篇從第 1 次開始 */
const pickDay = (page: Page, day: number) => putKV(page, 'zhLesson:pick', { date: todayStr(), day })

/** 中文課現在的狀態 */
const state = (page: Page) =>
  page.evaluate(() => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document
    const top = [...root.querySelectorAll('.zh-read, .zh-quiz, .zh-intro, .zh-order')].pop()
    const read = root.querySelector<HTMLElement>('.zh-read')
    return {
      title: root.querySelector('.zh-title')?.textContent ?? null,
      intro: !!root.querySelector('.zh-intro'),
      /** 亮的那一行（data-at：第幾行，聊一聊時是 talk） */
      at: read?.dataset.at ?? null,
      lines: root.querySelectorAll('.zh-line').length,
      talk: !!root.querySelector('.zh-talk'),
      run: Number(read?.dataset.run ?? 0),
      gap: root.querySelector('.zh-line.on .zh-red.gap')?.getAttribute('data-word') ?? null,
      gapTag: !!root.querySelector('.zh-line.on .zh-gap-tag'),
      quiz: top?.classList.contains('zh-quiz') ?? false,
      ask: top?.querySelector('.zh-ask-word')?.textContent ?? top?.querySelector('.zh-glyph-target')?.getAttribute('data-char') ?? null,
      /** 找一樣的字（T-117）；dim：示範中（下面的字變淡） */
      glyph: top?.classList.contains('zh-glyph') ?? false,
      dim: !!top?.querySelector('.zh-glyph-options[data-dim]'),
      hand: !!top?.querySelector('.demo-hand'),
      accepting: top?.querySelector('.wait-shield')?.getAttribute('data-accepting') === 'true',
      cheer: !!document.querySelector('.cheer-scrim'),
      /** 課本上面亮的那個「第幾次」小圖示（T-127） */
      runMark: Number(read?.querySelector<HTMLElement>('.zh-run.now')?.dataset.i ?? 0),
      /** 第 2 次：亮的那一行要接話的圖、有沒有小泡泡、同一行安靜的圖幾張、接過話沒 */
      say: root.querySelector('.zh-line.on .zh-pic.say')?.getAttribute('data-word') ?? null,
      bubble: !!root.querySelector('.zh-line.on .zh-say'),
      hush: root.querySelectorAll('.zh-line.on .zh-pic.hush').length,
      said: !!root.querySelector('.zh-line.on .zh-red.gap.said'),
      /** 第 3 次：故事題（挖空的那一句）、空格填上了沒、排順序 */
      story: !!top?.querySelector('.zh-ask-story'),
      filled: !!top?.querySelector('.zh-ask-blank.filled'),
      order: top?.classList.contains('zh-order') ?? false,
      /** 排順序：兩張圖各在哪（tray、0、1）、排好了沒 */
      spots: [...(top?.querySelectorAll<HTMLElement>('.zh-order-card') ?? [])].map((e) => `${e.dataset.order}:${e.dataset.spot}`).sort().join(','),
      solved: !!top?.hasAttribute('data-solved'),
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

/** 排順序（第 3 次，T-127）：先點該放 1 號格的、再點 2 號的（每張連點幾下） */
async function solveOrder(k: Toddler, spam = 1) {
  for (const n of [1, 2]) {
    const c = (await points(k.page, `.zh-order-card[data-order="${n}"][data-spot="tray"]`))[0]
    if (c) await (spam > 1 ? k.spam(c, spam, `排順序第 ${n} 張`) : k.tap(c, `排順序第 ${n} 張`))
    await k.wait(700)
  }
  await k.wait(1200)
}

/** 選圖：一題一題答對（每題連點答案幾下）直到下課 */
async function answerAll(k: Toddler, c: Checker, spam = 3) {
  for (let i = 0; i < 20; i++) {
    // 答完一題停著等「下一步」的大箭頭（T-118）：孩子點了箭頭（boot 的 autoNext）才換題；這時候不去點已經答對的那張
    if (await k.page.$('.next-step')) {
      await k.wait(800)
      continue
    }
    const s = await waitFor(k, (s) => s.cheer || (s.quiz && s.accepting) || (s.order && s.accepting && !s.solved), 25_000)
    if (!s) return false
    if (s.cheer) return true
    if (s.order) {
      await solveOrder(k, spam)
      continue
    }
    const ans = (await points(k.page, '.tile[data-answer]'))[0]
    if (ans) await k.spam(ans, spam, `答案 ${s.ask}`)
    await k.wait(900)
  }
  return !!(await waitFor(k, (s) => s.cheer, 15_000))
}

/** 選圖一題一題答對，停在「找一樣的字」 */
async function toGlyph(k: Toddler, c: Checker) {
  for (let i = 0; i < 20; i++) {
    if (await k.page.$('.next-step')) {
      await k.wait(800)
      continue
    }
    const s = await waitFor(k, (s) => s.cheer || s.glyph || (s.quiz && s.accepting) || (s.order && s.accepting && !s.solved), 25_000)
    if (!s || s.cheer) break
    if (s.glyph) return true
    if (s.order) {
      await solveOrder(k, 1)
      continue
    }
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

  test('第 2 次上同一篇：每行最後一個紅字框起來、標「停」提醒大人；要接的圖有小泡泡、點了看得出接到了；照樣念得完', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-gap'))
    test.setTimeout(6 * 60_000)
    const { k, c } = await setup(page, info, '第2次停一下')
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      // 第 1 篇上過 1 次（很久以前）→ 今天是第 1 篇第 2 次（course.ts 的 Course）
      await putKV(page, 'zhLesson:course', { day: 1, runs: ['2026-01-01'] })
      if (!(await enter(k, c))) return
      let s = await state(page)
      c.outcome('第 2 次', s.run === 2, `data-run=${s.run}`)
      if (s.run !== 2) return void (await c.once('run2', '困惑', '排了第 2 次，課本卻不是第 2 次', `data-run=${s.run}`))
      // 每一行：有紅字的行，最後一個紅字框起來、有「停」；孩子點那個框照樣看圖、不會跳行
      c.outcome('課本上面亮第 2 個小圖示', s.runMark === 2, `亮第 ${s.runMark} 個`)
      if (s.runMark !== 2) await c.once('run2-mark', '困惑', '第 2 次課本上面的小圖示沒有亮第 2 個', `亮第 ${s.runMark} 個`)
      let marked = 0
      let sayLines = 0
      for (let i = 0; i < s.lines; i++) {
        s = await state(page)
        if (s.talk) break
        if (s.gap) {
          marked++
          c.outcome(`第 ${s.at} 行標「停」`, s.gapTag, `「${s.gap}」`)
          // T-127：要接的那個詞有圖的話，那張圖有小泡泡、同一行其他的圖安靜；點了圖：泡泡收起來、框裡的詞填滿
          if (s.say) {
            sayLines++
            c.outcome(`第 ${s.at} 行要接的圖有小泡泡`, s.bubble && s.say === s.gap, `「${s.say}」${s.bubble ? '有泡泡' : '沒有泡泡'}、同一行安靜的圖 ${s.hush} 張`)
            const pic = (await points(page, '.zh-line.on .zh-pic.say'))[0]
            if (pic) await k.spam(pic, 3, `接話的圖 ${s.say}`)
            await k.wait(500)
            const s3 = await state(page)
            c.outcome('點了接話的圖：泡泡收起來、框裡的詞填滿', !s3.bubble && s3.said, `${s3.bubble ? '泡泡還在' : '泡泡收了'}、${s3.said ? '填滿' : '沒有填滿'}`)
            if (s3.bubble || !s3.said) await c.once('say-tap', '困惑', '第 2 次點了要接話的圖，看不出接到了', `「${s.say}」`)
          }
          const g = (await points(page, '.zh-line.on .zh-red.gap'))[0]
          if (g) await k.spam(g, 2, `框起來的 ${s.gap}`)
          await k.wait(600)
          const s2 = await state(page)
          c.outcome('點框起來的詞不會跳行', s2.at === s.at, `第 ${s.at} 行 → 第 ${s2.at} 行`)
        }
        await adult(k, '.zh-next', '下一行（大人）')
      }
      c.outcome('有紅字的行都標了「停」', marked > 0, `${marked} 行`)
      c.outcome('第 2 次有接話的圖（小泡泡）', sayLines > 0, `${sayLines} 行`)
      if (!sayLines) await c.once('no-say', '困惑', '第 2 次沒有任何一行有接話的圖', '')
      if (!marked) await c.once('no-gap', '困惑', '第 2 次沒有任何一行標「停」', '')
      const t = await waitFor(k, (s) => s.talk, 6000)
      c.outcome('第 2 次也念得完 → 聊一聊', !!t, t ? '聊一聊' : '沒有念完')
      if (!t) await c.once('gap-stuck', '卡死', '第 2 次念不完', '')
      const n = (await quizRows(page)).length
      c.outcome('點框起來的詞不記作答', n === 0, `作答 ${n} 筆`)
      await c.flush()
    } finally {
      finish(k, c, '第2次停一下')
    }
  })
  test('第 3 次（T-127）：故事題搶點、兩指、點錯；排順序示範時搶點、拖到一半放手、手掌、發呆、拖進格子、連點；返回再進來', async ({ page }, info) => {
    test.skip(!want('lesson-chinese-run3'))
    test.setTimeout(9 * 60_000)
    const { k, c } = await setup(page, info, '第3次')
    try {
      await putKV(page, 'zhLesson:introSeen', true)
      // 第 1 篇（龜兔賽跑）上過 2 次 → 今天第 3 次
      await putKV(page, 'zhLesson:course', { day: 1, runs: ['2026-01-01', '2026-01-02'] })
      if (!(await enter(k, c))) return
      let s = await state(page)
      c.outcome('第 3 次、課本上面亮第 3 個小圖示', s.run === 3 && s.runMark === 3, `data-run=${s.run}、亮第 ${s.runMark} 個`)
      if (s.run !== 3 || s.runMark !== 3) return void (await c.once('run3', '困惑', '排了第 3 次，課本不是第 3 次的樣子', `data-run=${s.run}、亮第 ${s.runMark} 個`))
      if (!(await readAll(k, c))) return

      // 選圖答到故事題出來
      k.behavior = '答選圖到故事題'
      for (let i = 0; i < 8; i++) {
        if (await page.$('.next-step')) {
          await k.wait(800)
          continue
        }
        s = (await waitFor(k, (s) => (s.quiz && s.accepting) || s.order || s.glyph || s.cheer, 25_000)) ?? s
        if (!s.quiz || s.story) break
        const ans = (await points(page, '.tile[data-answer]'))[0]
        if (ans) await k.tap(ans, `答案 ${s.ask}`)
        await k.wait(1800)
      }
      s = (await waitFor(k, (s) => s.story, 6000)) ?? (await state(page))
      c.outcome('第 3 次選圖之後有故事題（挖空的一句）', s.story, s.story ? '故事題' : s.order ? '直接排順序' : '沒有')
      if (!s.story) return void (await c.once('no-story', '困惑', '第 3 次沒有故事題', ''))
      await c.screenOk('故事題')
      const storyRows = async () => (await attempts(page)).filter((a) => a.itemId.includes(':story:'))
      // 題目剛出來搶著點、兩根手指一起按兩張：最多一筆
      k.behavior = '故事題搶點、兩指'
      const tiles = await points(page, '.zh-quiz .tile')
      if (tiles.length >= 2) {
        await k.palm(tiles.slice(0, 2) as Pt[], 250)
        await k.wait(2200)
        const n = (await storyRows()).length
        c.outcome('故事題兩指同時按兩張：最多一筆', n <= 1, `${n} 筆`)
        if (n > 1) await c.once('story-two', '誤記作答', '故事題兩指按兩張，記了好幾筆', `${n} 筆`)
      }
      s = await state(page)
      if (s.story && !s.filled) {
        k.behavior = '故事題點錯再連點答案'
        const wrong = (await points(page, '.zh-quiz .tile:not([data-answer])'))[0]
        if (wrong) await k.tap(wrong, '錯的圖')
        await k.wait(900)
        const ans = (await points(page, '.zh-quiz .tile[data-answer]'))[0]
        if (ans) await k.spam(ans, 4, '答案')
      }
      const f = await waitFor(k, (s) => s.filled || s.order, 5000)
      c.outcome('故事題答對：空格填上那個詞', !!f?.filled || !!f?.order, f?.filled ? '填上了' : f?.order ? '已經換到排順序' : '沒有填上')
      const sr = await storyRows()
      c.outcome('故事題只記一筆', sr.length === 1, `${sr.length} 筆`)
      if (sr.length !== 1) await c.once('story-rows', '誤記作答', '故事題記了不只一筆', `${sr.length} 筆`)

      // 排順序：大箭頭點了（boot 的 autoNext）就換過來
      s = (await waitFor(k, (s) => s.order, 20_000)) ?? (await state(page))
      c.outcome('故事題之後有排順序', s.order, s.order ? '排順序' : '沒有')
      if (!s.order) return void (await c.once('no-order', '困惑', '第 3 次故事題之後沒有排順序', ''))
      const orderRows = async () => (await attempts(page)).filter((a) => a.itemId.includes(':order:'))
      await k.wait(700)
      // 示範的手出來的時候搶著點「後」的那張：不放進去、搖一搖，不記作答
      k.behavior = '示範時搶點'
      s = await state(page)
      const demoOn = !!(await page.$('.zh-order .demo-hand'))
      c.outcome('一進來手示範一次', demoOn || s.hand, demoOn ? '有示範' : '沒看到示範')
      const later = (await points(page, '.zh-order-card[data-order="2"]'))[0]
      if (later) await k.tap(later, '搶著點「後」的那張')
      await k.wait(900)
      s = await state(page)
      c.outcome('示範時點錯的那張：不放進去、示範收掉', s.spots === '1:tray,2:tray' && !(await page.$('.zh-order .demo-hand')), `${s.spots}`)
      if (s.spots !== '1:tray,2:tray') await c.once('order-grab', '困惑', '排順序先點「後」的那張，被放進格子了', s.spots)
      // 拖到一半放手、拖到一半被系統手勢搶走：回到下面，不算作答
      k.behavior = '拖到一半放手'
      const first = (await points(page, '.zh-order-card[data-order="1"]'))[0]
      const slot1 = (await points(page, '.zh-order-slot[data-slot="1"]'))[0]
      if (first && slot1) {
        await k.drag([first, { x: first.x + (slot1.x - first.x) * 0.3, y: first.y + (slot1.y - first.y) * 0.3 }], { label: '拖一點點就放手' })
        await k.wait(800)
        await k.drag([first, { x: (first.x + slot1.x) / 2, y: (first.y + slot1.y) / 2 + 40 }], { cancel: true, label: '拖到一半被搶走' })
        await k.wait(900)
        s = await state(page)
        c.outcome('拖到一半放手：回到下面、不算作答', s.spots === '1:tray,2:tray' && !(await orderRows()).length, s.spots)
        if (s.spots !== '1:tray,2:tray') await c.once('order-half', '困惑', '排順序拖到一半放手，圖沒有回到下面', s.spots)
      }
      // 手掌壓在兩張圖上：只算第一根手指，兩張不會一起進格子
      k.behavior = '手掌壓兩張'
      const both = await points(page, '.zh-order-card[data-spot="tray"]')
      if (both.length === 2) {
        await k.palm(both as Pt[], 300)
        await k.wait(1200)
        s = await state(page)
        const inSlots = s.spots.split(',').filter((x) => !x.endsWith(':tray')).length
        c.outcome('手掌壓兩張：最多一張進格子、還沒排好', inSlots <= 1 && !s.solved, s.spots)
        if (inSlots > 1) await c.once('order-palm', '誤記作答', '手掌壓兩張，兩張一起進了格子', s.spots)
      }
      // 發呆：手指出該放的那張（精簡版不發呆）
      s = await state(page)
      if (!info.project.metadata?.lite && !s.solved) {
        k.behavior = '發呆'
        const t0 = Date.now()
        let hinted = false
        while (Date.now() - t0 < 36_000 && !hinted) {
          await k.wait(1000)
          hinted = !!(await points(page, '.zh-order-card.hint')).length
        }
        c.outcome('發呆：手出來指該放的那張', hinted, hinted ? `${Math.round((Date.now() - t0) / 1000)} 秒` : '36 秒內沒有提示')
        if (!hinted) await c.once('order-idle', '卡死', '排順序發呆 36 秒都沒有提示', '')
      }
      // 拖「先」的那張進 1 號格（還在下面的話），再連點「後」的那張
      k.behavior = '拖進格子、連點'
      const f1 = (await points(page, '.zh-order-card[data-order="1"][data-spot="tray"]'))[0]
      const s1 = (await points(page, '.zh-order-slot[data-slot="1"]'))[0]
      if (f1 && s1) {
        await k.drag([f1, { x: (f1.x + s1.x) / 2, y: (f1.y + s1.y) / 2 }, s1], { label: '拖「先」的那張進 1 號格' })
        await k.wait(900)
      }
      s = await state(page)
      c.outcome('拖進 1 號格：放進去了', s.spots.startsWith('1:0'), s.spots)
      if (!s.spots.startsWith('1:0')) await c.once('order-drag', '困惑', '把「先」的那張拖進 1 號格，沒有放進去', s.spots)
      const t2 = (await points(page, '.zh-order-card[data-order="2"][data-spot="tray"]'))[0]
      if (t2) await k.spam(t2, 4, '連點「後」的那張')
      const done = await waitFor(k, (s) => s.solved || s.glyph || s.cheer, 5000)
      c.outcome('兩張都放好：排好了', !!done, done ? '排好了' : '沒有排好')
      if (!done) await alive(k, c, '排順序')
      await k.wait(1500)
      const or = await orderRows()
      c.outcome('排順序只記一筆', or.length === 1, `${or.length} 筆`)
      if (or.length !== 1) await c.once('order-rows', '誤記作答', '排順序記了不只一筆', `${or.length} 筆`)
      // 接著找一樣的字、下課
      const end = await answerAll(k, c, 2)
      c.outcome('第 3 次上得完 → 下課', end, end ? '下課' : '沒有下課')
      if (!end) await alive(k, c, '第 3 次')
      await checkDoubleRecords(k, c)
      await c.flush()

      // 換一篇的第 3 次：排順序到一半按返回 → 首頁；再進來從念課文開始，作答不重複
      k.behavior = '排順序到一半按返回'
      await putKV(page, 'zhLesson:course', { day: 2, runs: ['2026-01-01', '2026-01-02'] })
      if (!(await toHome(k, c))) return
      if (!(await enter(k, c))) return
      if (!(await readAll(k, c))) return
      for (let i = 0; i < 12; i++) {
        if (await page.$('.next-step')) {
          await k.wait(800)
          continue
        }
        s = (await waitFor(k, (s) => (s.quiz && s.accepting) || s.order || s.glyph || s.cheer, 25_000)) ?? s
        if (!s.quiz) break
        const ans = (await points(page, '.tile[data-answer]'))[0]
        if (ans) await k.tap(ans, `答案 ${s.ask}`)
        await k.wait(1800)
      }
      s = (await waitFor(k, (s) => s.order, 15_000)) ?? (await state(page))
      if (!s.order) return void (await c.once('no-order2', '困惑', '第 2 篇第 3 次沒有排順序', ''))
      const c1 = (await points(page, '.zh-order-card[data-order="1"]'))[0]
      if (c1) await k.tap(c1, '放一張')
      await k.wait(600)
      const h = await homeButton(page)
      if (!h) return void (await c.once('order-noback', '無法返回', '排順序沒有返回鍵', ''))
      await pressBack(k, h)
      const live = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('排順序按返回 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('order-back', '無法返回', '排順序按返回鍵沒有回首頁', `停在 ${live}`)
      await k.wait(1200)
      if (!(await enter(k, c))) return
      const s2 = await state(page)
      c.outcome('再進來從念課文開始、還是第 3 次', !s2.order && s2.at === '0' && s2.run === 3, s2.order ? '在排順序' : `第 ${s2.at} 行、第 ${s2.run} 次`)
      await checkDoubleRecords(k, c)
      await c.flush()
    } finally {
      finish(k, c, '第3次')
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
})

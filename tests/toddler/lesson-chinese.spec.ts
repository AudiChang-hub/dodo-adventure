import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { attempts, boot, homeButton, settle, snap } from './lib/app'
import { Toddler, hashSeed, type Pt } from './lib/toddler'
import { Checker, alive, checkDoubleRecords, doorAt, pressBack, toHome, toddlerStep, waitLive } from './lib/flows'

/**
 * 中文課（src/lessons/chinese/）：親子共讀（2026-11-03 起 App 不出聲，大人念）。第一次有給大人的說明卡 → 念課文（一次亮一行，大人按「下一行」）
 * → 聊一聊 → 選圖（三選一）→ 下課。每篇連上 3 次（course.ts），第 2 次每行最後一個紅字框起來、標「停」。
 * 三歲孩子會做的事：大人還沒按「下一行」時亂點、連點紅字和圖、連點「下一行」「去選圖」和選項、兩根手指一起按、一進來就想回去、
 * 上到一半回首頁再進來（同一天要是同一篇、從第一行開始）。整堂課不能要任何中文音檔、不能用平板內建語音。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = (name: string) => !only.length || only.some((s) => s === 'lesson-chinese' || s === name)
const LIVE = 'lesson-chinese'
/** 後面的一篇（家長挑「今天上這篇」）：跟第 1 篇不一樣的課文長度、紅字 */
const LATE_DAY = 170

async function setup(page: Page, info: Parameters<Parameters<typeof test>[2]>[1], name: string, lessonSticker?: boolean) {
  const seed = hashSeed(BASE_SEED, 'lesson-chinese', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `中文課／${name}`
  await boot(page, seed, { to: 'home', lessonSticker })
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
    const top = [...root.querySelectorAll('.zh-read, .zh-quiz, .zh-intro')].pop()
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
      ask: top?.querySelector('.zh-ask-word')?.textContent ?? null,
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
    // 聊一聊剛出來：孩子點大人按鈕的位置（右下角）、點卡片，都不會跳過這一段（「去選圖」4 秒後才出現，T-102）
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

  test('第 2 次上同一篇：每行最後一個紅字框起來、標「停」提醒大人；照樣念得完', async ({ page }, info) => {
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
      let marked = 0
      for (let i = 0; i < s.lines; i++) {
        s = await state(page)
        if (s.talk) break
        if (s.gap) {
          marked++
          c.outcome(`第 ${s.at} 行標「停」`, s.gapTag, `「${s.gap}」`)
          const g = (await points(page, '.zh-line.on .zh-red.gap'))[0]
          if (g) await k.spam(g, 2, `框起來的 ${s.gap}`)
          await k.wait(600)
          const s2 = await state(page)
          c.outcome('點框起來的詞不會跳行', s2.at === s.at, `第 ${s.at} 行 → 第 ${s2.at} 行`)
        }
        await adult(k, '.zh-next', '下一行（大人）')
      }
      c.outcome('有紅字的行都標了「停」', marked > 0, `${marked} 行`)
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
  test('下課挑貼紙（T-90）：點一下手馬上示範「再點一下」；收進貼紙本後停在那一頁，點房子才回首頁', async ({ page }, info) => {
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
      // 再點同一張：收下 → 貼紙本那一頁 → 房子
      await k.wait(1200)
      await k.tap(opt, '再點同一張')
      s = await until((s) => s.home, 10_000)
      c.outcome('收進貼紙本以後出現房子', !!s, s ? '房子' : '10 秒內沒有出現')
      if (!s) return void (await c.once('st-home', '卡死', '貼紙收進本子以後沒有出現回首頁的房子', ''))
      await k.wait(2000)
      let live = (await snap(page)).live
      s = await pk()
      c.outcome('停在貼紙本那一頁，沒有自己跑回首頁', live !== 'home' && s.book, `在 ${live}、${s.book ? '看得到貼紙本' : '貼紙本不見了'}`)
      if (live === 'home') await c.once('st-fast', '困惑', '貼紙收進本子以後很快就自己回首頁', '')
      s = await until((s) => s.homeHand, 4000)
      c.outcome('沒點房子：手在房子上示範', !!s, s ? '手出現' : '沒有出現')
      const h = (await points(page, '.pk-home'))[0]
      if (h) await k.tap(h, '房子')
      live = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('點房子 → 首頁', live === 'home', `到 ${live}`)
      if (live !== 'home') await c.once('st-home-tap', '無法返回', '點貼紙本旁邊的房子沒有回首頁', `停在 ${live}`)
      await c.flush()
    } finally {
      finish(k, c, '挑貼紙')
    }
  })
})

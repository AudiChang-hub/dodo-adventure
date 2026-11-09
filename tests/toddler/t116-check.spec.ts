// T-116 定點檢查（只給這次開發用，不在三歲測試的清單裡）：
//   rm -rf test-results/t116/dist && node node_modules/vite/bin/vite.js build --outDir test-results/t116/dist && TODDLER_PORT=4678 npx playwright test -c tests/toddler/t116.config.ts
//   改前：T116_DIST=test-results/t116/dist-main T116_LABEL=main
// 1. 英文課今天上完了、複習到一半離開：同一天回來從離開的那一段接著複習（回歸測試：盲測 69bfad5 英文 seed 3 第 2～4 次回來都從 Let's practice 重來）
// 2. 英文課第一次上到一半離開：回來接著上（T-95 守門）
// 3. 中文故事頁：照同一個「媽媽」的節奏量整頁花幾秒、按幾下（只量不判；縮短的做法等家長選定才改，T-116）
// 4. 英文大小 S 點錯：大手留在答案上、答案亮起來跳一下、等他點；點空白也再跳一下
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import { boot } from './lib/app'

const LABEL = process.env.T116_LABEL ?? 'run'
const OUT = `test-results/t116/${LABEL}.json`
const SHOTS = `test-results/t116/shots-${LABEL}`
const result: Record<string, unknown> = {}
test.afterAll(() => {
  fs.mkdirSync('test-results/t116', { recursive: true })
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {}
  fs.writeFileSync(OUT, JSON.stringify({ ...prev, ...result }, null, 1))
})
/** 改前的打包只量、不判 */
const before = LABEL === 'main'
const want = (ok: boolean, msg: string) => {
  if (!before) expect(ok, msg).toBe(true)
}
const SEQ = 'SABCDEFGHIJKLMNOPQRTUVWXYZ'

const today = (page: Page) =>
  page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
const put = (page: Page, store: string, row: Record<string, unknown>) =>
  page.evaluate(
    ({ store, row }) =>
      new Promise<void>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const tx = rq.result.transaction(store, 'readwrite')
          tx.objectStore(store).put(row)
          tx.oncomplete = () => (rq.result.close(), res())
          tx.onerror = () => rej(tx.error)
        }
      }),
    { store, row },
  )
const kv = (page: Page, key: string) =>
  page.evaluate(
    (key) =>
      new Promise<unknown>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction('kv').objectStore('kv').get(key)
          g.onsuccess = () => (rq.result.close(), res((g.result as { value?: unknown } | undefined)?.value ?? null))
          g.onerror = () => rej(g.error)
        }
      }),
    key,
  )
const center = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].pop()
    const r = e?.getBoundingClientRect()
    return r && r.width > 2 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null
  }, sel)
async function touch(cdp: CDPSession, pts: { x: number; y: number }[], holdMs = 90) {
  const tp = (p: { x: number; y: number }) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 0, radiusX: 11, radiusY: 11, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) })
  for (const p of pts.slice(1)) {
    await new Promise((r) => setTimeout(r, 16))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) })
  }
  await new Promise((r) => setTimeout(r, holdMs))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
const voices = (page: Page) =>
  page.evaluate(() => [...window.__toddler.voices.map((v) => ({ t: v.t, s: v.text })), ...window.__toddler.tts.map((v) => ({ t: v.t, s: v.text }))].filter((v) => v.s).sort((a, b) => a.t - b.t).map((v) => v.s!))
async function door(page: Page, cdp: CDPSession, name: string) {
  await page.reload()
  await page.waitForSelector('.scene')
  const d = (await center(page, `.door[data-door="${name}"], .side-door[data-door="${name}"]`))!
  await touch(cdp, [d])
}
const phase = (page: Page) => page.evaluate(() => document.querySelector('.en-lesson')?.getAttribute('data-phase') ?? null)
/** 按返回鍵回首頁（孩子離開） */
async function leave(page: Page, cdp: CDPSession) {
  await touch(cdp, [(await center(page, '.back-btn'))!])
  await page.waitForFunction(() => !document.querySelector('.en-lesson'), null, { timeout: 10_000 })
}

for (const [name, seed, done] of [
  ['英文課今天上完了、複習到一半離開：回來接著複習，不從 Let\'s practice 重來', 161, true],
  ['英文課第一次上到一半離開：回來接著上（T-95）', 162, false],
] as const) {
  test(name, async ({ page }) => {
    test.setTimeout(3 * 60_000)
    await boot(page, seed, { to: 'home' })
    const cdp = await page.context().newCDPSession(page)
    const d = await today(page)
    if (done) await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: SEQ, date: d, done: true, good: true } })
    else await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: SEQ, date: d, done: false, good: false } })
    await door(page, cdp, 'english')
    await page.waitForSelector('.en-lesson[data-phase="trace"]', { timeout: 60_000 })
    await page.waitForTimeout(1200)
    const v1 = await voices(page)
    const saved = await kv(page, 'lesson.english')
    await leave(page, cdp)
    await door(page, cdp, 'english')
    await page.waitForSelector('.en-lesson', { timeout: 20_000 })
    await page.waitForTimeout(4000)
    const at = await phase(page)
    const v2 = await voices(page)
    const after = (await kv(page, 'lesson.english')) as Record<string, unknown>
    const row = {
      第一次進來: v1.slice(0, 2).join(' / '),
      走到描字時記下的進度: saved,
      回來時在哪一段: at,
      回來聽到: v2.slice(0, 3).join(' / '),
      回來後的進度: after,
    }
    result[done ? 'reviewResume' : 'firstResume'] = row
    console.log(JSON.stringify(row, null, 1))
    want(at === 'trace', `回來要接著描字（實際：${at}）`)
    want(!v2.some((s) => /Let's practice|Today's letter/.test(s)), `回來不能從認識字母重來（聽到：${v2.slice(0, 3).join(' / ')}）`)
    if (done) want(after.done === true && after.good === true, '複習不能把「今天上完了」蓋掉')
  })
}

/**
 * 同一個「媽媽」照同樣的節奏念完故事頁，量花幾秒（改前改後用同一套，所以比得出差多少）：
 * - 亮幾行就念幾行：一秒 3 個字（指著字、念給 3 歲聽的速度）；念的時候孩子把亮的圖各點一下。
 * - 念完看一下孩子（0.6 秒）再按「下一行／下一段／念完了」。
 * - 聊一聊：問問題 2 秒、孩子用指的回答、大人把答案說成一句 1.5 秒，等「去選圖」出來就按。
 */
const READ_CPS = 3
test('中文故事頁：大人按幾下念完、整頁花幾秒（只量）', async ({ page }) => {
  test.setTimeout(4 * 60_000)
  fs.mkdirSync(SHOTS, { recursive: true })
  await boot(page, 163, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  await door(page, cdp, 'chinese')
  await page.waitForSelector('.zh-read, .zh-intro', { timeout: 20_000 })
  for (let i = 0; i < 15 && !(await page.$('.zh-read')); i++) {
    const go = await center(page, '.zh-intro .zh-go')
    if (go) await touch(cdp, [go])
    await page.waitForTimeout(800)
  }
  await page.waitForSelector('.zh-line.on .zh-pic', { timeout: 20_000 })
  const t0 = Date.now()
  const steps: { lines: number; chars: number; pics: number; ms: number }[] = []
  let presses = 0
  let blankAlt: string[] = []
  let litFirst = 0
  while (!(await page.$('.zh-talk')) && presses < 10) {
    const s0 = Date.now()
    const lit = await page.evaluate(() => ({
      lines: document.querySelectorAll('.zh-line.on').length,
      text: [...document.querySelectorAll('.zh-line.on .zh-text')].map((e) => e.textContent ?? '').join(''),
    }))
    if (!steps.length) {
      litFirst = await page.evaluate(() => document.querySelectorAll('.zh-line.on .zh-pic').length)
      await page.screenshot({ path: `${SHOTS}/1-第一段.png` })
      // 點空白處（標題右邊）三下：亮的圖輪流有反應
      for (let k = 0; k < 3; k++) {
        const r = await page.evaluate(() => {
          const pg = document.querySelector('.zh-page')!.getBoundingClientRect()
          const h = document.querySelector('.zh-title')!.getBoundingClientRect()
          return { x: pg.right - 40, y: h.top + h.height / 2 }
        })
        await touch(cdp, [r])
        await page.waitForTimeout(450)
      }
      // 點到過的圖會收起「點我」的黃框（.cue）
      blankAlt = await page.evaluate(() => [...document.querySelectorAll('.zh-line.on .zh-pic:not(.cue)')].map((e) => `${e.closest('.zh-line')?.getAttribute('data-line')}:${e.getAttribute('data-word')}`))
    }
    const chars = lit.text.replace(/[，。！？、「」：；…\s]/g, '').length
    const readMs = (chars / READ_CPS) * 1000
    const picPts = await page.evaluate(() => [...document.querySelectorAll('.zh-line.on .zh-pic')].map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }))
    const gap = readMs / (picPts.length + 1)
    for (const p of picPts) {
      await page.waitForTimeout(gap)
      await touch(cdp, [p])
    }
    const rest = readMs - (Date.now() - s0)
    if (rest > 0) await page.waitForTimeout(rest)
    await page.waitForTimeout(600)
    await touch(cdp, [(await center(page, '.zh-next'))!])
    presses++
    steps.push({ lines: lit.lines, chars, pics: picPts.length, ms: Date.now() - s0 })
    await page.waitForTimeout(950)
  }
  const tPage = Date.now() - t0
  await page.waitForSelector('.zh-talk', { timeout: 10_000 })
  // 聊一聊
  await page.waitForTimeout(2000)
  const tp = await center(page, '.zh-talk-pic')
  if (tp) await touch(cdp, [tp])
  await page.waitForTimeout(1500)
  await page.waitForSelector('.zh-controls.on .zh-go-quiz', { timeout: 15_000 })
  await touch(cdp, [(await center(page, '.zh-controls.on .zh-go-quiz'))!])
  await page.waitForSelector('.zh-quiz', { timeout: 15_000 })
  const tAll = Date.now() - t0
  const row = {
    每一下亮幾行: steps.map((s) => s.lines),
    大人按幾下才念完: presses,
    每一下花的毫秒: steps.map((s) => s.ms),
    念課文到聊一聊_秒: +(tPage / 1000).toFixed(1),
    念課文到選圖_秒: +(tAll / 1000).toFixed(1),
    // AI 小男生測試的媽媽一步做一件事（念一段、按下一段、問聊一聊、按去選圖），一步大約 10 秒
    AI測試員媽媽要幾步: 1 + presses + 2,
    第一段亮的圖: litFirst,
    點空白三下點到的圖: blankAlt,
  }
  result.zhRead = row
  console.log(JSON.stringify(row, null, 1))
})

test('英文大小 S 點錯：大手留在答案上、答案亮起來跳一下、等他點', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  fs.mkdirSync(SHOTS, { recursive: true })
  await boot(page, 164, { to: 'home' })
  const cdp = await page.context().newCDPSession(page)
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 0, seq: SEQ, date: await today(page), done: false, good: false, stage: 'quiz', round: 0 } })
  await door(page, cdp, 'english')
  await page.waitForSelector('.en-opt.is-cue', { timeout: 60_000 })
  // 問大 S，點小 s
  const look = () =>
    page.evaluate(() => {
      const big = document.querySelector<HTMLElement>('.en-quiz > .demo-hand')
      const ans = document.querySelector<HTMLElement>('.en-opt.is-upper')!
      return {
        bigHand: big ? Math.round(big.getBoundingClientRect().width) : 0,
        smallHand: !!document.querySelector('.en-opt-hand'),
        beckon: ans.classList.contains('is-beckon'),
        glow: getComputedStyle(ans).boxShadow.includes('255, 214, 120'),
        moving: ans.getAnimations().length,
        ripples: document.querySelectorAll('.en-quiz > .demo-hand .demo-ripple').length,
      }
    })
  await touch(cdp, [(await center(page, '.en-opt.is-lower'))!])
  const t0 = Date.now()
  const trace: (Awaited<ReturnType<typeof look>> & { t: number })[] = []
  let shot = false
  while (Date.now() - t0 < 9500) {
    trace.push({ t: Date.now() - t0, ...(await look()) })
    if (!shot && Date.now() - t0 > 6000) {
      shot = true
      await page.screenshot({ path: `${SHOTS}/4-點錯之後.png` })
    }
    await page.waitForTimeout(150)
  }
  // 說明念完以後（3.5 秒起）：大手、亮、有沒有再跳
  const waiting = trace.filter((r) => r.t > 3500)
  const hops = trace.filter((r, k) => k > 0 && r.moving > 0 && trace[k - 1].moving === 0 && r.t > 3500).length
  // 點空白（離選項很遠）：再跳一下
  const far = await page.evaluate(() => {
    const r = document.querySelector('.en-quiz')!.getBoundingClientRect()
    return { x: r.left + r.width * 0.5, y: r.top + 30 }
  })
  await touch(cdp, [far])
  await page.waitForTimeout(120)
  const afterBlank = await look()
  await touch(cdp, [(await center(page, '.en-opt.is-upper'))!])
  await page.waitForTimeout(700)
  const solved = await look()
  const row = {
    說明念完後_大手寬: Math.max(...waiting.map((r) => r.bigHand)),
    說明念完後_大手一直在: waiting.every((r) => r.bigHand > 0),
    說明念完後_只剩卡片裡的小手: waiting.some((r) => r.smallHand && !r.bigHand),
    答案亮暖黃光: waiting.some((r) => r.glow),
    說明念完後自己再跳幾次_9秒內: hops,
    點空白處_答案跳: afterBlank.moving > 0,
    點對以後_大手收起來: solved.bigHand === 0,
  }
  result.enBeckon = row
  console.log(JSON.stringify(row, null, 1))
  want(row.說明念完後_大手一直在, '說明念完，大手要留在答案上')
  want(row.答案亮暖黃光, '答案要亮起來')
  want(hops >= 1, '等他點的時候答案要再跳')
  want(row.點空白處_答案跳, '點空白處，答案要再跳一下')
  want(row.點對以後_大手收起來, '點對以後大手收起來')
})

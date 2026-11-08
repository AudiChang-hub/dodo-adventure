// T-109 聽完才答的定點檢查（只給這次開發用，不在三歲測試的清單裡）：
//   npx vite build --outDir test-results/t109/dist && TODDLER_PORT=4392 npx playwright test -c tests/toddler/t109.config.ts
// 1. 英文選擇題：選項在題目關鍵字（Big D!）開始念的時候才出來；一出來就點對 → 記成沒聽完（heard: false），稱讚後再念一次 Big D!；
//    下一題等念完、輪到他再點 → 記成聽完（heard: true）。
// 2. 數學比多少：More! 念完才點 → 聽完；下一題的選項在 More! 開始念的那一刻才點得到。
import { expect, test, type Page } from '@playwright/test'
import { boot } from './lib/app'
import { Toddler } from './lib/toddler'

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
          const db = rq.result
          const tx = db.transaction(store, 'readwrite')
          tx.objectStore(store).put(row)
          tx.oncomplete = () => (db.close(), res())
          tx.onerror = () => rej(tx.error)
        }
      }),
    { store, row },
  )

const center = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, sel)

const attempts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ game: string; skill: string; phase: string; ok: boolean; heard?: boolean; ts: number }[]>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction('attempts').objectStore('attempts').getAll()
          g.onsuccess = () =>
            res(
              (g.result as { game: string; skill: string; phase: string; firstTryCorrect: boolean; heard?: boolean; ts: number }[])
                .map((a) => ({ game: a.game, skill: a.skill, phase: a.phase, ok: a.firstTryCorrect, heard: a.heard, ts: a.ts }))
                .sort((a, b) => a.ts - b.ts),
            )
        }
      }),
  )

const voicesSince = (page: Page, t: number) => page.evaluate((t) => window.__toddler.voices.filter((v) => v.t >= t && v.text).map((v) => v.text), t)
/** 某一刻（performance.now）正在念的那一句（probe 在開始播 0.12 秒後才從字幕記下文字） */
const speakingAt = (page: Page, t: number) => page.evaluate((t) => [...window.__toddler.voices].reverse().find((v) => v.t <= t + 30)?.text ?? null, t)
/** 手指按下的時間、前後的語音（相對於 t 的毫秒），看點下去的時候念到哪裡 */
const timeline = (page: Page, t: number) =>
  page.evaluate((t) => ({ down: Math.round((window as unknown as { __pd?: number }).__pd! - t), voices: window.__toddler.voices.filter((v) => v.t > t - 3000).map((v) => `${Math.round(v.t - t)}:${v.text}`) }), t)
const markDown = (page: Page) => page.evaluate(() => document.addEventListener('pointerdown', () => ((window as unknown as { __pd?: number }).__pd = performance.now()), true))
/** 等作答紀錄多一筆（數學課答對後稱讚完才寫） */
async function waitAttempt(page: Page, game: string, before: number) {
  for (let i = 0; i < 40; i++) {
    const xs = (await attempts(page)).filter((a) => a.game === game)
    if (xs.length > before) return xs
    await page.waitForTimeout(250)
  }
  return (await attempts(page)).filter((a) => a.game === game)
}

test('英文：選項跟著 Big D! 出來；一出來就點對 → 沒聽完、稱讚後再念一次；聽完才點 → 聽完', async ({ page }, info) => {
  test.setTimeout(3 * 60_000)
  const k = new Toddler(page, info, 109, info.project.name)
  await boot(page, 109, { to: 'home' })
  await k.init()
  // 今天的字母 D（第 4 個），從選擇題接著上（回來接著上的第一題會先示範：示範那一題記成一起練）。
  // 為了直接測「沒示範的題目」，從第 2 題（小寫 d）開始，第 1 題當作答過了
  await put(page, 'kv', { key: 'lesson.english', value: { idx: 3, seq: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', date: await today(page), done: false, good: false, stage: 'quiz', round: 1, answers: [{ kind: 'big', first: true, heard: true }] } })
  // 題型都會了：不示範
  await put(page, 'kv', { key: 'lesson-format-solo', value: { 'en-big': 5, 'en-little': 5, 'en-word': 5, 'ma-find': 5, 'ma-howmany': 5 } })
  await page.reload()
  await page.waitForSelector('.scene')
  const door = (await center(page, '.door[data-door="english"], .side-door[data-door="english"]'))!
  await k.tap(door, '英文門')
  await page.waitForSelector('.en-quiz', { timeout: 20_000 })
  await markDown(page)
  // 第 2 題（Little d!）：選項一出來就點 d
  const hidden0 = await page.evaluate(() => [...document.querySelectorAll('.en-opt')].every((e) => e.classList.contains('is-wait')))
  await page.waitForFunction(() => document.querySelector('.en-opt') && ![...document.querySelectorAll('.en-opt')].some((e) => e.classList.contains('is-wait')), null, { timeout: 10_000 })
  const shownAt = await page.evaluate(() => performance.now())
  const t1 = await page.evaluate(() => performance.now())
  console.log('選項：', await page.evaluate(() => [...document.querySelectorAll('.en-options')].map((b) => `${b.className}: ${[...b.querySelectorAll('.en-opt')].map((e) => e.getAttribute('aria-label')).join('/')}`)))
  // 接著上的那一題（大寫 D 或小寫 d，接著上會先示範）：選項一出來就點答案
  const big = await page.evaluate(() => !!document.querySelector('.en-options.is-big'))
  const d = (await center(page, `.en-opt[aria-label="${big ? 'D' : 'd'}"]`))!
  await k.tap(d, '一出來就點答案')
  await page.waitForTimeout(300)
  const saying = await speakingAt(page, shownAt)
  console.log('題目剛出來選項藏著：', hidden0, '；選項出來時正在念：', saying, JSON.stringify(await timeline(page, shownAt)))
  expect(hidden0).toBe(true)
  expect(saying).toMatch(big ? /Big/ : /Little/)
  await page.waitForFunction(() => !!document.querySelector('.en-opt.is-yes'), null, { timeout: 5000 })
  await page.waitForTimeout(3500)
  const fb = await voicesSince(page, t1)
  console.log('猜對之後聽到：', fb.join('、'))
  // 猜對：稱讚後把關鍵字再念一次（Yes! Big D!）
  expect(fb.join(' ')).toMatch(big ? /Yes!.*Big/ : /Yes!.*Little/)
  const all = await attempts(page)
  console.log('作答紀錄：', JSON.stringify(all))
  expect(all.at(-1)).toMatchObject({ skill: big ? 'letter:D' : 'letter:d', ok: true, heard: false })
  // 開頭的圖：等念完、黃框出來才點
  await page.waitForSelector('.en-options.is-word .en-opt.is-cue', { timeout: 20_000 })
  const opts = await page.evaluate(() => [...document.querySelectorAll('.en-options.is-word .en-opt')].map((e) => e.getAttribute('aria-label')))
  // 點每一個直到答對（只看第一次點的 heard）
  const box = (await center(page, '.en-options.is-word .en-opt'))!
  await k.tap(box, '聽完才點')
  await page.waitForTimeout(1500)
  const last = (await attempts(page)).filter((a) => a.skill.startsWith('phonics:'))
  console.log('選項：', opts.join('/'), '；開頭音那一題：', JSON.stringify(last))
  if (last.length) expect(last.at(-1)!.heard).toBe(true)
  else {
    // 第一下點錯了：再點到對為止，紀錄的 heard 還是看第一下
    for (let i = 0; i < 4 && !(await attempts(page)).some((a) => a.skill.startsWith('phonics:')); i++) {
      const hint = await center(page, '.en-options.is-word .en-opt.is-hint')
      if (hint) await k.tap(hint, '點答案')
      await page.waitForTimeout(2500)
    }
    const r = (await attempts(page)).filter((a) => a.skill.startsWith('phonics:'))
    console.log('開頭音那一題（點錯過）：', JSON.stringify(r))
    expect(r.at(-1)!.heard).toBe(true)
  }
})

test('數學比多少：More! 念完才點 → 聽完；下一題的選項跟著 More! 出來', async ({ page }, info) => {
  test.setTimeout(3 * 60_000)
  const k = new Toddler(page, info, 110, info.project.name)
  await boot(page, 110, { to: 'home' })
  await k.init()
  await put(page, 'kv', { key: 'lesson:math', value: { next: 4, firm: false, day: await today(page), n: 4, mode: 'new', max: 4, part: 2, asked: 0, missed: 0 } })
  // 「多」教過了：不上教學卡
  await put(page, 'skills', { key: 'compare:more', box: 1, seen: 1, firstTry: 1, streak: 1, lastTs: 1 })
  await page.reload()
  await page.waitForSelector('.scene')
  // 重新載入後 adaptive 才讀得到技能
  const door = (await center(page, '.door[data-door="math"], .side-door[data-door="math"]'))!
  await k.tap(door, '數學門')
  await page.waitForSelector('.ma-quiz', { timeout: 20_000 })
  await markDown(page)
  // 第 1 題：等黃框（念完 More! Which side?）再點對的那一邊
  await page.waitForSelector('.ma-tile.cue', { timeout: 15_000 })
  const pick = async () => {
    const xs = await page.evaluate(() =>
      [...document.querySelectorAll('.ma-quiz .ma-tile')].map((e) => {
        const r = e.getBoundingClientRect()
        return { n: e.querySelectorAll('svg, img').length, x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }),
    )
    return xs.sort((a, b) => b.n - a.n)[0]
  }
  await k.tap(await pick(), '聽完才點多的那邊')
  // 第 2 題：選項在 More! 開始念的時候才出來（題目剛出來的 0.5 秒點了不算、More! 只有 0.46 秒，比多少幾乎不可能沒聽完就答）。
  // 用 MutationObserver 記下新的選項什麼時候放進畫面（點不到）、什麼時候變成點得到
  const logP = page.evaluate(
    () =>
      new Promise<{ add: number; open: number; voice: number | null }>((res) => {
        const seen = new WeakSet<Element>()
        let add = 0
        const mo = new MutationObserver(() => {
          const q = [...document.querySelectorAll('.ma-quiz')].pop()
          const t = q?.querySelector<HTMLElement>('.ma-tile')
          if (!t || q!.querySelector('.ma-tile.correct') || q!.querySelector('.ma-tile.cue')) return
          if (!seen.has(t)) (seen.add(t), (add = performance.now()))
          if (add && t.style.pointerEvents !== 'none') {
            mo.disconnect()
            const open = performance.now()
            setTimeout(() => res({ add, open, voice: window.__toddler.voices.filter((v) => v.t >= add - 50).map((v) => v.t)[0] ?? null }), 200)
          }
        })
        mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] })
      }),
  )
  let all = await waitAttempt(page, 'm-compare', 0)
  console.log('第 1 題：', JSON.stringify(all))
  expect(all.at(-1)?.heard).toBe(true)
  const log = await logP
  console.log('第 2 題：選項放進畫面 → 點得到', Math.round(log.open - log.add), 'ms；More! 在點得到之前', log.voice == null ? '?' : Math.round(log.open - log.voice), 'ms 開始念')
  expect(log.voice).not.toBeNull()
  expect(Math.abs(log.open - log.voice!)).toBeLessThan(150)
})

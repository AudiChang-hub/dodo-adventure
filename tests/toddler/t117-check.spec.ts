// T-117 找一樣的字的定點檢查（只給這次開發用，不在三歲測試的清單裡）：
//   rm -rf test-results/t117/dist && node node_modules/vite/bin/vite.js build --outDir test-results/t117/dist && TODDLER_PORT=4697 npx playwright test -c tests/toddler/t117.config.ts
//   截圖放 T117_SHOTS（預設 test-results/t117/shots）
// 1. 第一次：手先示範（下面的字變淡、手點上面的字、再點一樣的那個、飛上去配成一對），做完答案換位置，才輪到他；點對 → 並排、打勾 → 下課；記成一起練
// 2. 第 2 級（3 選 1）：點錯的字飛上去跟答案並排一下、退回、變淡；再點對；記成自己答、第一次沒對
// 3. 示範一開始就搶著點錯的：示範收掉、照常判錯
// 4. 發呆：先是上面的字跳一下，再久一點手指著答案點一下；點了記成一起練、不算熟練
// 5. 排版：平板 1200×786、1280×800、手機直式 390×844，上面的字、空格、選項都在畫面裡、不重疊、字在卡片中間；說明卡放得下
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { boot } from './lib/app'

const SHOTS = process.env.T117_SHOTS ?? 'test-results/t117/shots'
fs.mkdirSync(SHOTS, { recursive: true })
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })

const put = (page: Page, key: string, value: unknown) =>
  page.evaluate(
    ({ key, value }) =>
      new Promise<void>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const tx = rq.result.transaction('kv', 'readwrite')
          tx.objectStore('kv').put({ key, value })
          tx.oncomplete = () => (rq.result.close(), res())
          tx.onerror = () => rej(tx.error)
        }
      }),
    { key, value },
  )
const all = (page: Page, store: string) =>
  page.evaluate(
    (store) =>
      new Promise<Record<string, unknown>[]>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const g = rq.result.transaction(store).objectStore(store).getAll()
          g.onsuccess = () => (rq.result.close(), res(g.result))
          g.onerror = () => rej(g.error)
        }
      }),
    store,
  )
const kv = async (page: Page, key: string) => (await all(page, 'kv')).find((r) => r.key === key)?.value as Record<string, unknown> | undefined
const center = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].pop()
    const r = e?.getBoundingClientRect()
    return r && r.width > 2 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null
  }, sel)
async function touch(cdp: CDPSession, p: { x: number; y: number }) {
  const tp = [{ x: Math.round(p.x), y: Math.round(p.y), id: 0, radiusX: 11, radiusY: 11, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp })
  await new Promise((r) => setTimeout(r, 90))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** 從首頁進中文課，念完、聊完、選圖答完，停在找一樣的字 */
async function toGlyph(page: Page, cdp: CDPSession) {
  await page.reload()
  await page.waitForSelector('.scene')
  await page.waitForTimeout(800)
  await touch(cdp, (await center(page, '.door[data-door="chinese"], .side-door[data-door="chinese"]'))!)
  await page.waitForSelector('.zh-read, .zh-intro', { timeout: 20_000 })
  for (let i = 0; i < 40 && !(await page.$('.zh-glyph')); i++) {
    const go = (await center(page, '.zh-intro .zh-go')) ?? (await center(page, '.zh-controls.on .zh-go-quiz'))
    const quiz = await page.$('.zh-quiz:not(.zh-glyph) .tile.cue')
    if (quiz) {
      await page.evaluate(() => {
        const w = window as unknown as { __quizRight?: number; __quizLeft?: number }
        for (const e of document.querySelectorAll('.zh-quiz:not(.zh-glyph) .tile, .zh-quiz:not(.zh-glyph) .zh-ask')) {
          const r = e.getBoundingClientRect()
          w.__quizRight = Math.max(w.__quizRight ?? 0, r.right)
          w.__quizLeft = Math.min(w.__quizLeft ?? 1e9, r.left)
        }
      })
      await touch(cdp, (await center(page, '.zh-quiz:not(.zh-glyph) .tile[data-answer]'))!)
      await page.waitForTimeout(1900)
      continue
    }
    const nx = await center(page, '.zh-next')
    if (go) await touch(cdp, go)
    else if (nx) await touch(cdp, nx)
    await page.waitForTimeout(1100)
  }
  await page.waitForSelector('.zh-glyph', { timeout: 10_000 })
}

const look = (page: Page) =>
  page.evaluate(() => {
    const g = document.querySelector('.zh-glyph')
    const tiles = [...document.querySelectorAll<HTMLElement>('.zh-glyph-options .tile')]
    return {
      dim: !!g?.querySelector('.zh-glyph-options[data-dim]'),
      hand: !!g?.querySelector('.demo-hand'),
      pair: !!g?.querySelector('.zh-glyph-pair.is-pair'),
      solved: !!g?.querySelector('.zh-glyph-pair.is-solved'),
      fly: g?.querySelector('.zh-glyph-fly')?.className ?? null,
      answerAt: tiles.findIndex((t) => t.dataset.answer),
      chars: tiles.map((t) => t.dataset.char).join(''),
      target: g?.querySelector<HTMLElement>('.zh-glyph-target')?.dataset.char,
      accepting: g?.querySelector('.wait-shield')?.getAttribute('data-accepting') === 'true',
      end: !!document.querySelector('.cheer-scrim'),
      hint: document.querySelector('.shell-hint, [class*="hint-text"], .hint-text')?.textContent ?? '',
    }
  })

test('第一次：手先示範、做完換位置；點對並排打勾 → 下課，記成一起練', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await boot(page, 1171, { to: 'home' })
  await put(page, 'zhLesson:introSeen', true)
  const cdp = await page.context().newCDPSession(page)
  await toGlyph(page, cdp)
  const s0 = await look(page)
  console.log('進來：', JSON.stringify(s0))
  expect(s0.dim, '示範中下面的字要變淡').toBe(true)
  await page.waitForSelector('.zh-glyph .demo-hand', { timeout: 3000 })
  await page.waitForTimeout(500)
  await shot(page, '1-示範手點上面的字')
  await page.waitForSelector('.zh-glyph-pair.is-pair', { timeout: 5000 })
  await page.waitForTimeout(300)
  await shot(page, '2-示範配成一對')
  const before = (await look(page)).answerAt
  await page.waitForFunction(() => !document.querySelector('.zh-glyph-options[data-dim]'), null, { timeout: 6000 })
  await page.waitForTimeout(700)
  const s1 = await look(page)
  console.log('示範完：', JSON.stringify(s1))
  expect(s1.answerAt, '示範完答案要換位置').not.toBe(before)
  expect(s1.hand || s1.pair, '示範完手和配對收掉').toBe(false)
  await shot(page, '3-輪到他')
  await touch(cdp, (await center(page, '.zh-glyph .tile[data-answer]'))!)
  await page.waitForTimeout(120)
  const s2 = await look(page)
  expect(s2.fly, '點對 0.5 秒內字就飛上去').toContain('zh-glyph-fly')
  await page.waitForSelector('.zh-glyph-pair.is-solved', { timeout: 1500 })
  await page.waitForTimeout(250)
  await shot(page, '4-點對並排打勾')
  await page.waitForSelector('.cheer-scrim', { timeout: 10_000 })
  const rows = (await all(page, 'attempts')).filter((a) => a.game === 'zh-glyph')
  console.log('作答：', JSON.stringify(rows.map((r) => ({ skill: r.skill, phase: r.phase, first: r.firstTryCorrect, level: r.level, options: r.options }))))
  expect(rows.length).toBe(1)
  expect(rows[0].phase).toBe('guided')
  const st = await kv(page, 'zhLesson:glyph')
  console.log('分級：', JSON.stringify(st))
  expect(st?.learned).toBe(true)
  expect(st?.demos).toBe(1)
})

test('第 2 級：點錯的字飛上去並排、退回變淡；再點對', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await boot(page, 1172, { to: 'home' })
  await put(page, 'zhLesson:introSeen', true)
  await put(page, 'zhLesson:glyph', { level: 2, recent: [], demos: 1, learned: true })
  const cdp = await page.context().newCDPSession(page)
  await toGlyph(page, cdp)
  await page.waitForTimeout(900)
  const s0 = await look(page)
  console.log('第 2 級：', JSON.stringify(s0))
  expect(s0.dim).toBe(false)
  expect(s0.chars.length).toBe(3)
  await shot(page, '5-第2級三選一')
  const picked = await page.evaluate(() => document.querySelector<HTMLElement>('.zh-glyph .tile:not([data-answer])')!.dataset.char!)
  await touch(cdp, (await center(page, `.zh-glyph .tile[data-char="${picked}"]`))!)
  await page.waitForTimeout(500)
  const over = await page.evaluate(() => {
    const f = document.querySelector('.zh-glyph-fly.is-wrong')?.getBoundingClientRect()
    const s = document.querySelector('.zh-glyph-slot')?.getBoundingClientRect()
    return f && s ? Math.abs(f.left - s.left) + Math.abs(f.top - s.top) : null
  })
  await shot(page, '6-點錯並排')
  expect(over, '點錯的字要停在空格（跟答案並排）').not.toBeNull()
  expect(over!).toBeLessThan(30)
  await page.waitForTimeout(1200)
  const s1 = await look(page)
  const op = await page.evaluate((ch) => Number(getComputedStyle(document.querySelector(`.zh-glyph .tile[data-char="${ch}"]`)!).opacity), picked)
  console.log('點錯之後：', JSON.stringify(s1), '錯的字 opacity', op)
  expect(s1.fly).toBeNull()
  expect(s1.solved).toBe(false)
  expect(op).toBeLessThan(0.6)
  await shot(page, '7-點錯退回變淡')
  await touch(cdp, (await center(page, '.zh-glyph .tile[data-answer]'))!)
  await page.waitForSelector('.cheer-scrim', { timeout: 10_000 })
  const rows = (await all(page, 'attempts')).filter((a) => a.game === 'zh-glyph')
  expect(rows.length).toBe(1)
  expect(rows[0].phase).toBe('quiz')
  expect(rows[0].firstTryCorrect).toBe(false)
  const st = await kv(page, 'zhLesson:glyph')
  console.log('分級：', JSON.stringify(st))
  expect((st?.recent as { ok: boolean }[]).map((r) => r.ok)).toEqual([false])
})

test('示範一開始就搶著點錯的：示範收掉、照常判錯', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await boot(page, 1173, { to: 'home' })
  await put(page, 'zhLesson:introSeen', true)
  const cdp = await page.context().newCDPSession(page)
  await toGlyph(page, cdp)
  await page.waitForFunction(() => document.querySelector('.zh-glyph .wait-shield')?.getAttribute('data-accepting') === 'true', null, { timeout: 3000 })
  await touch(cdp, (await center(page, '.zh-glyph .tile:not([data-answer])'))!)
  await page.waitForTimeout(250)
  const s = await look(page)
  console.log('搶點：', JSON.stringify(s))
  expect(s.dim || s.hand).toBe(false)
  expect(s.fly).toContain('is-wrong')
  await page.waitForTimeout(1400)
  await touch(cdp, (await center(page, '.zh-glyph .tile[data-answer]'))!)
  await page.waitForSelector('.cheer-scrim', { timeout: 10_000 })
  const rows = (await all(page, 'attempts')).filter((a) => a.game === 'zh-glyph')
  expect(rows.map((r) => `${r.phase}:${r.firstTryCorrect}`)).toEqual(['guided:false'])
})

test('發呆：手先指一次字卡、6 秒再指一次，12 秒手指著答案點一下；點了照常算', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await boot(page, 1175, { to: 'home' })
  await put(page, 'zhLesson:introSeen', true)
  await put(page, 'zhLesson:glyph', { level: 1, recent: [], demos: 1, learned: true })
  const cdp = await page.context().newCDPSession(page)
  await toGlyph(page, cdp)
  const t0 = Date.now()
  let hintAt = 0
  while (Date.now() - t0 < 40_000 && !hintAt) {
    await page.waitForTimeout(500)
    if (await page.$('.zh-glyph .tile.hint .demo-hand')) hintAt = Date.now() - t0
  }
  console.log('發呆', Math.round(hintAt / 1000), '秒手出來')
  await shot(page, '10-發呆手指答案')
  expect(hintAt, '發呆 40 秒內手要出來指答案').toBeGreaterThan(0)
  await touch(cdp, (await center(page, '.zh-glyph .tile[data-answer]'))!)
  await page.waitForSelector('.cheer-scrim', { timeout: 10_000 })
  const rows = (await all(page, 'attempts')).filter((a) => a.game === 'zh-glyph')
  console.log('作答：', JSON.stringify(rows.map((r) => ({ phase: r.phase, hint: r.hintUsed, first: r.firstTryCorrect }))))
  expect(rows.map((r) => `${r.phase}:${r.hintUsed}`)).toEqual(['guided:true'])
  const st = await kv(page, 'zhLesson:glyph')
  expect((st?.recent as unknown[]).length, '手指著答案才點的不算熟練').toBe(0)
})

test('T-124：不示範時一進來手就指下面的字卡、點空白再指一次；配對成功下面整排收掉', async ({ page }) => {
  test.setTimeout(3 * 60_000)
  await boot(page, 1176, { to: 'home' })
  await put(page, 'zhLesson:introSeen', true)
  await put(page, 'zhLesson:glyph', { level: 2, recent: [], demos: 1, learned: true })
  const cdp = await page.context().newCDPSession(page)
  await toGlyph(page, cdp)
  // 一進來 3 秒內：手出現、下面每一張字卡都跳過一下（不是只指答案）
  const t0 = Date.now()
  let hand = false
  const hopped = new Set<string>()
  while (Date.now() - t0 < 5000) {
    const st = await page.evaluate(() => ({
      hand: !!document.querySelector('.zh-glyph .demo-hand'),
      hops: [...document.querySelectorAll<HTMLElement>('.zh-glyph-options .tile')].filter((t) => t.querySelector('.tile-in.turn-hop')).map((t) => t.dataset.char!),
    }))
    hand ||= st.hand
    st.hops.forEach((h) => hopped.add(h))
    await page.waitForTimeout(150)
  }
  const n = await page.evaluate(() => document.querySelectorAll('.zh-glyph-options .tile').length)
  console.log('進來', hand ? '手出現' : '沒有手', '跳過的字卡', [...hopped].join(''), `／${n} 張`)
  await shot(page, '11-T124-手指字卡')
  expect(hand, '一進來手要出現').toBe(true)
  expect(hopped.size, '每一張字卡都要被指到').toBe(n)
  let rows = (await all(page, 'attempts')).filter((a) => a.game === 'zh-glyph')
  expect(rows.length, '手指字卡不算作答').toBe(0)
  // 點空白處：手再指一次
  await page.waitForTimeout(800)
  await touch(cdp, { x: 1000, y: 160 })
  const again = await page.waitForSelector('.zh-glyph .demo-hand', { timeout: 2500 }).then(() => true).catch(() => false)
  expect(again, '點空白處手要再指一次').toBe(true)
  // 點答案：配對成功，下面整排淡出
  await page.waitForTimeout(600)
  await touch(cdp, (await center(page, '.zh-glyph .tile[data-answer]'))!)
  await page.waitForTimeout(1500)
  const ops = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.zh-glyph-options .tile')].map((t) => Number(getComputedStyle(t).opacity)))
  const yes = await page.evaluate(() => { const r = document.querySelector('.zh-glyph-yes')?.getBoundingClientRect(); return r ? r.width : 0 })
  const arrow = !!(await page.$('.next-step'))
  console.log('配對成功', '下面字卡 opacity', ops.join(','), '打勾寬', Math.round(yes), '大箭頭', arrow)
  await shot(page, '12-T124-配對成功整排收掉')
  expect(Math.max(...ops), '下面字卡要淡出').toBeLessThan(0.05)
  expect(yes, '打勾要看得到').toBeGreaterThan(40)
  rows = (await all(page, 'attempts')).filter((a) => a.game === 'zh-glyph')
  expect(rows.map((r) => r.phase), '手只指字卡、沒有指答案：記成自己答').toEqual(['quiz'])
})

for (const vp of [
  { name: '平板1200x786', width: 1200, height: 786 },
  { name: '平板1280x800', width: 1280, height: 800 },
  { name: '手機390x844', width: 390, height: 844 },
]) {
  test(`排版 ${vp.name}：上面的字、空格、選項都在畫面裡、不重疊、字在卡片中間；說明卡放得下`, async ({ page }) => {
    test.setTimeout(3 * 60_000)
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await boot(page, 1174, { to: 'home' })
    // 說明卡（第一次進中文課）
    await page.reload()
    await page.waitForSelector('.scene')
    await page.waitForTimeout(800)
    const cdp = await page.context().newCDPSession(page)
    await touch(cdp, (await center(page, '.door[data-door="chinese"], .side-door[data-door="chinese"]'))!)
    await page.waitForSelector('.zh-intro', { timeout: 20_000 })
    await page.waitForTimeout(900)
    const intro = await page.evaluate(() => {
      const r = document.querySelector('.zh-intro')!.getBoundingClientRect()
      const go = document.querySelector('.zh-intro .zh-go')!.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, goBottom: go.bottom, scroll: document.querySelector('.zh-intro')!.scrollHeight - document.querySelector('.zh-intro')!.clientHeight }
    })
    // 對照：改之前的說明卡（最後一項換回舊的字）捲不捲
    const old = await page.evaluate(() => {
      const li = [...document.querySelectorAll('.zh-intro li')].pop()!
      const keep = li.innerHTML
      li.innerHTML = '<b>最後選圖</b>：你念「哪個是〇〇？」，讓他自己點。'
      const e = document.querySelector('.zh-intro')!
      const n = e.scrollHeight - e.clientHeight
      li.innerHTML = keep
      return n
    })
    console.log(vp.name, '說明卡改之前要捲', old, 'px')
    await shot(page, `8-說明卡-${vp.name}`)
    console.log(vp.name, '說明卡', JSON.stringify(intro))
    expect(intro.top).toBeGreaterThanOrEqual(0)
    // 平板：「開始念」不用捲就看得到；手機直式改之前就要捲一點（只要求不壞版）：不能比改之前更要捲
    if (vp.width > 800) expect(intro.goBottom, '「開始念」要看得到（不用捲）').toBeLessThanOrEqual(Math.min(vp.height, intro.bottom))
    else expect(intro.scroll, '說明卡不能比改之前更要捲').toBeLessThanOrEqual(old)
    expect(intro.right).toBeLessThanOrEqual(vp.width)
    // 找一樣的字（第 3 級：3 個選項，最寬）
    await put(page, 'zhLesson:introSeen', true)
    await put(page, 'zhLesson:glyph', { level: 3, recent: [], demos: 3, learned: true })
    await toGlyph(page, cdp)
    await page.waitForTimeout(1200)
    const m = await page.evaluate(() => {
      const box = (e: Element) => {
        const r = e.getBoundingClientRect()
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }
      }
      const cards = [document.querySelector('.zh-glyph-target')!, document.querySelector('.zh-glyph-slot')!, ...document.querySelectorAll('.zh-glyph-options .tile')]
      const bs = cards.map(box)
      // 字的墨（文字本身的框）在卡片中間
      const ink = cards
        .filter((c) => c.querySelector('.zh-glyph-char'))
        .map((c) => {
          const rg = document.createRange()
          rg.selectNodeContents(c.querySelector('.zh-glyph-char')!)
          const a = rg.getBoundingClientRect()
          const b = c.getBoundingClientRect()
          return { dx: Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) / b.width, inside: a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1, size: a.height / b.height }
        })
      const chain = [] as string[]
      for (let e: Element | null = document.querySelector('.zh-glyph'); e && chain.length < 8; e = e.parentElement) {
        const r = e.getBoundingClientRect()
        chain.push(`${e.className.toString().slice(0, 30)} ${Math.round(r.left)},${Math.round(r.width)} ${getComputedStyle(e).containerType}`)
      }
      const host = document.querySelector('.stage-host')
      return { bs, ink, host: host ? box(host) : null, chain }
    })
    await shot(page, `9-找一樣的字-${vp.name}`)
    console.log(vp.name, JSON.stringify(m))
    const overlap = (a: (typeof m.bs)[0], b: (typeof m.bs)[0]) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1
    for (const [i, a] of m.bs.entries()) {
      expect(a.l, `第 ${i} 張卡超出左邊`).toBeGreaterThanOrEqual(0)
      // 手機直式也要全部在畫面裡（T-123：舞台比螢幕寬，以前選項會超出右邊）
      expect(a.r, `第 ${i} 張卡超出右邊`).toBeLessThanOrEqual(vp.width)
      expect(a.b, `第 ${i} 張卡超出下面`).toBeLessThanOrEqual(vp.height)
      for (const [j, b] of m.bs.entries()) if (j > i) expect(overlap(a, b), `第 ${i}、${j} 張卡重疊`).toBe(false)
      // 可點目標 ≥ 2 cm（準則 TOUCH-1）：平板約 76 px（11 吋 1200 寬約 4.6 px/mm 以上）；手機只要求不壞版
      if (vp.width > 800) expect(Math.min(a.w, a.h), `第 ${i} 張卡太小`).toBeGreaterThanOrEqual(100)
    }
    // 選圖那一頁（題目卡、三張圖）也在畫面裡
    const qr = await page.evaluate(() => {
      const w = window as unknown as { __quizRight?: number; __quizLeft?: number }
      return { __quizRight: w.__quizRight, __quizLeft: w.__quizLeft }
    })
    expect(qr.__quizRight, '經過選圖頁時有量到').toBeDefined()
    console.log(vp.name, '選圖頁', JSON.stringify({ left: qr.__quizLeft, right: qr.__quizRight }))
    expect(qr.__quizRight ?? 0, '選圖的卡超出右邊').toBeLessThanOrEqual(vp.width)
    expect(qr.__quizLeft ?? 0, '選圖的卡超出左邊').toBeGreaterThanOrEqual(0)
    for (const k of m.ink) {
      expect(k.inside, '字超出卡片').toBe(true)
      expect(k.dx, '字沒有在卡片中間').toBeLessThan(0.08)
    }
  })
}

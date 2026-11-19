import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { boot, homeButton, now, settle, snap } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, centerOf, doorAt, linesSince, pressBack, toHome, waitLive } from './lib/flows'

/**
 * 首頁的遊戲角（T-152 P2，src/screens/Home.tsx 的 PlayCorner、src/lib/play-gate.ts）：畫畫、邏輯遊戲兩扇圓窗＋三盞門燈。
 * 三堂課今天各上完一次才開（家長區設成「上完今天的三堂課才開」的時候）；預設一直開著。
 * 三歲孩子會做的事：鎖住時亂點、連點、多指點窗和門燈 → 停在首頁、還沒上的那扇門亮著、手指指著、那一隻恐龍說
 * Let's visit Momo first!（T-169）、8 秒內只說一次、恐龍不一直跳、手指不疊；
 * 點完馬上點課門 → 正常進課、那句話不帶進課裡；三盞都亮的那一刻窗簾拉開、只說一次；進去畫畫、邏輯遊戲都 1 步回首頁。
 * 共用 helper（lib/app.ts 的 boot）預設把遊戲角設成一直開著；鎖住的情境在這裡自己把它關掉（freePlay: 'after'）。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261116)
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = () => !only.length || only.some((s) => s === 'screens' || s === 'home' || s === 'home-corner')

// defaultsV: 4：boot 寫的設定沒有版本號，不寫的話重新整理時會被當成舊裝置，一直開著的預設蓋掉（lib/settings.ts 的 migrateSettings）
const LOCKED = { freePlay: 'after', defaultsV: 4 }
/** 點了鎖住的遊戲角，下一堂課的恐龍說的那一句（T-169，content/lines-home-corner.ts） */
const NEXT = { english: "Let's visit Dodo first!", chinese: "Let's visit Momo first!", math: "Let's visit Bobo first!" } as const
const ANY_NEXT = 'first!'
/** 門亮著、手指指著多久（Home.tsx 的 NUDGE_GLOW_MS） */
const GLOW_MS = 6000
const OPEN = 'Play corner is open!'
/** 截圖（給 PM 看）：test-results/t152；PM 收到後放到主 repo 的 docs/T-152-截圖/ */
const SHOTS = path.resolve('test-results', 't152')

type Info = Parameters<Parameters<typeof test>[2]>[1]

async function setup(page: Page, info: Info, name: string, settings: Record<string, unknown> = {}) {
  const seed = hashSeed(BASE_SEED, 'home-corner', name, info.project.name)
  const k = new Toddler(page, info, seed, info.project.name)
  const c = new Checker(k, page)
  k.where = `遊戲角／${name}`
  await boot(page, seed, { to: 'home', settings })
  await k.init()
  return { k, c }
}

function finish(k: Toddler, c: Checker, name: string) {
  k.save(`home-corner-${name}`, { screen: name, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
  const serious = k.findings.filter((f) => f.severity === '卡死' || f.severity === '無法返回' || f.severity === '誤記作答')
  expect.soft(serious.map((f) => `${f.severity}：${f.title}`), '嚴重問題').toEqual([])
  expect.soft(k.findings.length, `全部問題：${k.findings.map((f) => f.title).join(' | ')}`).toBe(0)
  expect.soft(c.outcomes.filter((o) => !o.ok).map((o) => `${o.behavior}：${o.note}`), '沒過的項目').toEqual([])
}

// ── 這台平板的 kv（IndexedDB dodo-adventure 的 kv 表）────────────────
const putKV = (page: Page, key: string, value: unknown) =>
  page.evaluate(
    ({ key, value }) =>
      new Promise<void>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onerror = () => rej(rq.error)
        rq.onsuccess = () => {
          const tx = rq.result.transaction('kv', 'readwrite')
          tx.objectStore('kv').put({ key, value })
          tx.oncomplete = () => {
            rq.result.close()
            res()
          }
          tx.onerror = () => rej(tx.error)
        }
      }),
    { key, value },
  )
/** 平板上的日期（YYYY-MM-DD），往前後推幾天 */
const pageDay = (page: Page, add = 0) =>
  page.evaluate((add) => {
    const d = new Date(Date.now() + add * 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, add)
/** 今天上完了這幾堂（lesson.log：課叫了 onDone 才有 done） */
async function lessonsDone(page: Page, subjects: string[], opts: { unfinished?: string[] } = {}) {
  const date = await pageDay(page)
  const t = Date.now() - 3600_000
  const rows = [
    ...subjects.map((subject, i) => ({ subject, date, start: t + i * 300_000, done: t + i * 300_000 + 200_000 })),
    ...(opts.unfinished ?? []).map((subject, i) => ({ subject, date, start: t + 2000_000 + i * 1000 })),
  ]
  await putKV(page, 'lesson.log', rows)
}

/** 遊戲角現在的樣子 */
const corner = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('.screen.home .play-corner')
    if (!el) return null
    const lamps = Object.fromEntries([...el.querySelectorAll<HTMLElement>('[data-lamp]')].map((l) => [l.dataset.lamp!, l.dataset.lit === '1']))
    return {
      state: el.getAttribute('data-corner'),
      lamps,
      point: el.querySelector<HTMLElement>('[data-point="1"]')?.dataset.lamp ?? null,
      named: [...document.querySelectorAll<HTMLElement>('.screen.home .door[data-named="1"], .screen.home .door[data-point="1"]')].map((d) => d.dataset.door),
      /** 門頂的手指在哪幾扇門（T-169）：同時最多一隻 */
      hands: [...document.querySelectorAll<HTMLElement>('.screen.home [data-door-point]')].map((h) => h.closest<HTMLElement>('[data-door]')?.dataset.door),
      /** 門燈上寫的還差幾堂 */
      left: Number(el.querySelector<HTMLElement>('[data-corner-lamps]')?.dataset.left ?? -1),
      /** 窗簾上還在跑的動畫（窗簾不晃，T-169） */
      anims: document.getAnimations().filter((a) => a.playState === 'running' && !!((a.effect as KeyframeEffect | null)?.target as Element | null)?.closest?.('.curtains') && el.contains((a.effect as KeyframeEffect | null)?.target as Node | null)).length,
      hint: !!document.querySelector('.screen.home [data-corner-hint]'),
    }
  })

/** 首頁（重新掛上，從課回來一樣）：去貼紙本再回來（孩子的一步、一步） */
async function viaStickers(k: Toddler, c: Checker, between?: () => Promise<void>) {
  const page = k.page
  await settle(page)
  await k.tap((await doorAt(page, 'stickers'))!, '貼紙板')
  await waitLive(page, (l) => l === 'stickers', 5000)
  await settle(page)
  if (between) await between()
  const h = await homeButton(page)
  if (h) await pressBack(k, h)
  await waitLive(page, (l) => l === 'home', 5000)
  await settle(page)
}

/** 點一扇窗、1 步回首頁 */
async function enterAndBack(k: Toddler, c: Checker, door: 'draw' | 'logic', name: string) {
  const page = k.page
  await settle(page)
  k.behavior = `進「${name}」再回來`
  await k.tap((await doorAt(page, door))!, name)
  const live = await waitLive(page, (l) => l === door, 5000)
  c.outcome(`開著的時候點「${name}」進得去`, live === door, `到 ${live}`)
  await c.screenOk(`進「${name}」`)
  await settle(page)
  await k.wait(800)
  const h = await homeButton(page)
  if (h) await pressBack(k, h)
  const back = await waitLive(page, (l) => l === 'home', 4000)
  c.outcome(`「${name}」1 步回首頁`, back === 'home', `到 ${back}`)
  if (back !== 'home') await toHome(k, c)
}

const said = async (page: Page, t0: number, text: string) => (await linesSince(page, t0)).filter((l) => l.text?.includes(text)).length

/** 記下門口哪幾隻恐龍跳過（data-hop 變了就記那扇門；同 home.spec.ts） */
const watchHops = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __cornerHops: string[]; __cornerHopObs?: MutationObserver }
    w.__cornerHops = []
    w.__cornerHopObs?.disconnect()
    w.__cornerHopObs = new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as HTMLElement
        if (el.getAttribute('data-hop')) w.__cornerHops.push(el.closest('[data-door]')?.getAttribute('data-door') ?? '?')
      }
    })
    w.__cornerHopObs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-hop'] })
  })
const hops = (page: Page) => page.evaluate(() => (window as unknown as { __cornerHops?: string[] }).__cornerHops ?? [])

test.describe('遊戲角', () => {
  test('鎖住：亂點、連點、多指點窗和門燈，點完馬上點課門', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(5 * 60_000)
    const { k, c } = await setup(page, info, '鎖住', LOCKED)
    try {
      // 英文上完了、中文中途離開（不算）
      await lessonsDone(page, ['english'], { unfinished: ['chinese'] })
      await viaStickers(k, c)
      k.behavior = '鎖住的樣子'
      let s = await corner(page)
      c.outcome('鎖住：窗簾拉上、陪玩小字在', s?.state === 'locked' && s.hint, JSON.stringify(s))
      c.outcome('門燈：英文亮、中文（中途離開）和數學不亮、還差 2 堂', !!s && s.lamps.english && !s.lamps.chinese && !s.lamps.math && s.left === 2, JSON.stringify(s))

      // 點一下鎖住的畫畫窗（T-169）：0.3 秒內有反應——還沒上的第一扇（中文）亮、門頂手指指著、中文那盞門燈亮外框、莫莫跳一下；窗簾不晃
      k.behavior = '點鎖住的畫畫窗'
      await watchHops(page)
      let t0 = await now(page)
      await k.tap((await doorAt(page, 'draw'))!, '畫畫（鎖住）')
      await k.wait(300)
      s = await corner(page)
      c.outcome('點了 0.3 秒內：中文的門亮、手指指著中文的門、中文那盞門燈亮外框', !!s && s.named.join() === 'chinese' && s.hands.join() === 'chinese' && s.point === 'chinese', JSON.stringify(s))
      c.outcome('窗簾不晃（不像搖頭說不行）', !!s && s.anims === 0, `窗簾上在跑的動畫 ${s?.anims}`)
      await k.wait(2400)
      c.outcome('停在首頁', (await snap(page)).live === 'home', `${(await snap(page)).live}`)
      c.outcome("莫莫說 Let's visit Momo first!（說出下一堂的恐龍，不說不行）", (await said(page, t0, NEXT.chinese)) === 1, JSON.stringify((await linesSince(page, t0)).map((l) => l.text)))
      s = await corner(page)
      c.outcome('快 3 秒（話說完了）門還亮著、手指還在：三歲孩子轉頭找得到', !!s && s.named.join() === 'chinese' && s.hands.join() === 'chinese', JSON.stringify(s))

      // 還亮著的時候亂點、連點、多指（8 秒內）：還在首頁，那句話只說了一次、莫莫只跳了一次、手指只有一隻
      k.behavior = '鎖住時亂點、連點、多指'
      const draw = (await doorAt(page, 'draw'))!
      const logic = (await doorAt(page, 'logic'))!
      const lamps = (await centerOf(page, '[data-corner-lamps]'))!
      await k.spam(logic, 6, '邏輯遊戲（鎖住）連點')
      await k.spam(lamps, 4, '門燈連點')
      await k.palm([draw, logic], 300)
      for (let i = 0; i < 6; i++) {
        const p = k.r.pick([draw, logic, lamps])
        await k.tap({ x: p.x + k.r.range(-30, 30), y: p.y + k.r.range(-20, 20) }, '遊戲角亂點')
        await k.wait(150 + k.r.int(300))
      }
      await k.wait(1500)
      const live = (await snap(page)).live
      c.outcome('鎖住時亂點、連點、多指：停在首頁、不換畫面', live === 'home', `${live}`)
      if (live !== 'home') await c.once('corner-leak', '困惑', '鎖住的遊戲角點了跑去別的畫面', `${live}`)
      const n = await said(page, t0, ANY_NEXT)
      c.outcome("8 秒內只說一次 Let's visit Momo first!", n === 1, `說了 ${n} 次`)
      const hs = await hops(page)
      c.outcome('連點時莫莫只跳一次、別的恐龍不跳（不疊動畫）', hs.length === 1 && hs[0] === 'chinese', JSON.stringify(hs))
      s = await corner(page)
      c.outcome('連點時手指只有一隻、還指著中文的門', !!s && s.hands.join() === 'chinese', JSON.stringify(s))
      // 不再點：最後一下的 6 秒後熄掉
      await k.wait(GLOW_MS + 500)
      s = await corner(page)
      c.outcome('不再點：6 秒後門的光、手指、門燈外框都收起來', !!s && !s.named.length && !s.hands.length && !s.point, JSON.stringify(s))
      await c.flush()

      // 8 秒後再點：再說一次（不會永遠不說話）；說完馬上點英文門 → 正常進課，那句話被切掉、不帶進課裡
      k.behavior = '點完馬上點課門'
      await k.wait(1500)
      t0 = await now(page)
      await k.tap((await doorAt(page, 'draw'))!, '畫畫（鎖住）')
      await k.wait(250)
      await k.tap((await doorAt(page, 'math'))!, '數學門')
      const l2 = await waitLive(page, (l) => l === 'lesson-math', 5000)
      c.outcome('點完馬上點數學門：進得去', l2 === 'lesson-math', `到 ${l2}`)
      await k.wait(2500)
      const vs = await page.evaluate(({ t0, text }) => window.__toddler.voices.filter((v) => v.t > t0 && v.text?.includes(text)), { t0, text: NEXT.chinese })
      const cut = vs.every((v) => v.stopped != null && v.stopped - v.t < 1500)
      c.outcome('那句話不帶進課裡（換畫面就停）', vs.length <= 1 && cut, JSON.stringify(vs.map((v) => ({ dur: v.dur, stopped: v.stopped && Math.round(v.stopped - v.t) }))))
      const h = await homeButton(page)
      if (h) await pressBack(k, h)
      const back = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('數學課 1 步回首頁', back === 'home', `到 ${back}`)
      if (back !== 'home') await toHome(k, c)
      await c.flush()
    } finally {
      finish(k, c, '鎖住')
    }
  })

  test('三盞都亮的那一刻：窗簾拉開、只說一次', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '三盞都亮', LOCKED)
    try {
      await lessonsDone(page, ['english', 'chinese'])
      await viaStickers(k, c)
      let s = await corner(page)
      c.outcome('兩堂上完：還鎖著，兩盞亮、還差 1 堂', s?.state === 'locked' && !!s && s.lamps.english && s.lamps.chinese && !s.lamps.math && s.left === 1, JSON.stringify(s))
      // 點鎖住的窗：亮的是數學的門（還沒上的第一扇），波波說；減少動態效果時手指只淡入、不往下落
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const tb = await now(page)
      await k.tap((await doorAt(page, 'logic'))!, '邏輯遊戲（鎖住）')
      await k.wait(300)
      s = await corner(page)
      c.outcome('兩堂上完時點：亮的是數學的門、手指指著數學的門', !!s && s.named.join() === 'math' && s.hands.join() === 'math', JSON.stringify(s))
      const anim = await page.evaluate(() => {
        const h = document.querySelector('[data-door-point]')
        return h ? getComputedStyle(h).animationName : null
      })
      c.outcome('減少動態效果：手指只淡入（不移動）', anim === 'door-point-fade', `${anim}`)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await k.wait(2500)
      c.outcome("波波說 Let's visit Bobo first!", (await said(page, tb, NEXT.math)) === 1, JSON.stringify((await linesSince(page, tb)).map((l) => l.text)))
      fs.mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-鎖住-點了指向數學.png`) })
      await k.wait(GLOW_MS)

      // 數學上完（在別的畫面時寫進 lesson.log，像上完數學課回首頁）
      k.behavior = '上完第三堂回首頁'
      const t0 = await now(page)
      await viaStickers(k, c, () => lessonsDone(page, ['english', 'chinese', 'math']))
      await k.wait(2500)
      s = await corner(page)
      c.outcome('三盞都亮：窗簾拉開、陪玩小字收起來', s?.state === 'open' && !!s && s.lamps.english && s.lamps.chinese && s.lamps.math && !s.hint, JSON.stringify(s))
      const n = await said(page, t0, OPEN)
      c.outcome('說一次 Play corner is open!', n === 1, `說了 ${n} 次`)
      const cheer = (await snap(page)).cheer
      c.outcome('不慶祝', !cheer, `cheer ${cheer}`)
      await k.tap((await doorAt(page, 'stickers'))!, '貼紙板')
      await waitLive(page, (l) => l === 'stickers', 5000)
      await settle(page)
      await k.wait(1000)
      // 同一天再回首頁：開著、不再說
      const t1 = await now(page)
      const h = await homeButton(page)
      if (h) await pressBack(k, h)
      await waitLive(page, (l) => l === 'home', 4000)
      await settle(page)
      await k.wait(2000)
      s = await corner(page)
      const n2 = await said(page, t1, OPEN)
      c.outcome('同一天再回首頁：開著、不再說', s?.state === 'open' && n2 === 0, `${s?.state}、說了 ${n2} 次`)
      // 點了畫面以後 App 進全螢幕（lib/lock.ts），不能改視窗大小：照這個專案的大小截圖；1200×786 的截圖在最後一項
      fs.mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-三盞都亮-打開.png`) })

      // 開著：畫畫、邏輯遊戲都進得去、1 步回首頁
      await enterAndBack(k, c, 'draw', '畫畫')
      await enterAndBack(k, c, 'logic', '邏輯遊戲')
      await c.flush()
    } finally {
      finish(k, c, '三盞都亮')
    }
  })

  test('家長區：今天先打開、一直開著', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '家長區設定', LOCKED)
    try {
      // 今天先打開放的是昨天 → 隔天自動失效，還鎖著
      await putKV(page, 'home.unlockToday', { date: await pageDay(page, -1) })
      await viaStickers(k, c)
      let s = await corner(page)
      c.outcome('今天先打開是昨天按的：鎖著', s?.state === 'locked', JSON.stringify(s))
      fs.mkdirSync(SHOTS, { recursive: true })

      // 大人進家長區按「今天先打開」
      k.behavior = '家長按今天先打開'
      const vp = page.viewportSize()!
      await k.hold({ x: vp.width - 30, y: 30, nav: true }, 3300, '右上角')
      await page.waitForSelector('.gate', { timeout: 3000 })
      const q = await page.$eval('.gate .q', (e) => e.textContent ?? '')
      const m = q.match(/(\d+)\s*\+\s*(\d+)/)!
      for (const ch of String(Number(m[1]) + Number(m[2]))) await page.click(`.gate .keypad button[aria-label="${ch}"]`)
      await page.click('.gate .keypad button:has-text("確定")')
      await waitLive(page, (l) => l === 'parent')
      await settle(page)
      await page.click('button:has-text("設定與同步")')
      const sel = await page.waitForSelector('select[data-setting="freePlay"]', { timeout: 5000 })
      c.outcome('家長區：畫畫和邏輯遊戲是「上完今天的三堂課才開」', (await sel.inputValue()) === 'after', await sel.inputValue())
      await page.click('[data-unlock-today="off"]')
      const on = await page.waitForSelector('[data-unlock-today="on"]', { timeout: 3000 }).catch(() => null)
      c.outcome('按了顯示「今天已打開，明天自動恢復」', !!on, on ? ((await on.textContent()) ?? '') : '沒有')
      await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-家長區-今天先打開.png`) })
      await page.click('button:has-text("回到孩子模式")')
      await waitLive(page, (l) => l === 'home', 3000)
      await settle(page)
      await k.wait(1500)
      s = await corner(page)
      c.outcome('今天先打開：首頁的遊戲角開著、不說 Play corner is open!', s?.state === 'open', JSON.stringify(s))
      await enterAndBack(k, c, 'draw', '畫畫')

      // 再進家長區：取消今天先打開 → 鎖回去；改成一直開著 → 開
      k.behavior = '家長取消、改一直開著'
      await k.hold({ x: vp.width - 30, y: 30, nav: true }, 3300, '右上角')
      await page.waitForSelector('.gate', { timeout: 3000 })
      const q2 = await page.$eval('.gate .q', (e) => e.textContent ?? '')
      const m2 = q2.match(/(\d+)\s*\+\s*(\d+)/)!
      for (const ch of String(Number(m2[1]) + Number(m2[2]))) await page.click(`.gate .keypad button[aria-label="${ch}"]`)
      await page.click('.gate .keypad button:has-text("確定")')
      await waitLive(page, (l) => l === 'parent')
      await settle(page)
      await page.click('button:has-text("設定與同步")')
      await page.click('[data-unlock-today="on"] button')
      await page.click('button:has-text("回到孩子模式")')
      await waitLive(page, (l) => l === 'home', 3000)
      await settle(page)
      await k.wait(800)
      s = await corner(page)
      c.outcome('取消今天先打開：鎖回去', s?.state === 'locked', JSON.stringify(s))

      await k.hold({ x: vp.width - 30, y: 30, nav: true }, 3300, '右上角')
      await page.waitForSelector('.gate', { timeout: 3000 })
      const q3 = await page.$eval('.gate .q', (e) => e.textContent ?? '')
      const m3 = q3.match(/(\d+)\s*\+\s*(\d+)/)!
      for (const ch of String(Number(m3[1]) + Number(m3[2]))) await page.click(`.gate .keypad button[aria-label="${ch}"]`)
      await page.click('.gate .keypad button:has-text("確定")')
      await waitLive(page, (l) => l === 'parent')
      await settle(page)
      await page.click('button:has-text("設定與同步")')
      await page.selectOption('select[data-setting="freePlay"]', 'always')
      await page.click('button:has-text("回到孩子模式")')
      await waitLive(page, (l) => l === 'home', 3000)
      await settle(page)
      await k.wait(800)
      s = await corner(page)
      c.outcome('一直開著：開、沒有陪玩小字', s?.state === 'open' && !s.hint, JSON.stringify(s))
      await enterAndBack(k, c, 'logic', '邏輯遊戲')
      await c.flush()
    } finally {
      finish(k, c, '家長區設定')
    }
  })

  test('一直開著（預設）：點了就進去；手機直式不跑版', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(4 * 60_000)
    // boot 預設就是一直開著（freePlay: 'always'）
    const { k, c } = await setup(page, info, '一直開著')
    try {
      await lessonsDone(page, ['math'])
      await viaStickers(k, c)
      let s = await corner(page)
      c.outcome('一直開著：窗簾開、沒有陪玩小字，門燈照實際上完的亮', s?.state === 'open' && !s.hint && !!s.lamps.math && !s.lamps.english, JSON.stringify(s))
      const t0 = await now(page)
      await k.tap((await centerOf(page, '[data-corner-lamps]'))!, '門燈')
      await k.wait(1500)
      s = await corner(page)
      c.outcome('開著的時候點門燈：停在首頁、不說話、門不亮、沒有手指', (await snap(page)).live === 'home' && (await said(page, t0, ANY_NEXT)) === 0 && !!s && !s.named.length && !s.hands.length, `${(await snap(page)).live} ${JSON.stringify(s)}`)
      await enterAndBack(k, c, 'draw', '畫畫')
      await enterAndBack(k, c, 'logic', '邏輯遊戲')

      // 版面：平板橫向、手機直式（鎖住、打開），不出現水平捲動、遊戲角整個看得到
      k.behavior = '遊戲角版面'
      fs.mkdirSync(SHOTS, { recursive: true })
      const vp0 = page.viewportSize()!
      for (const [lock, label] of [
        [false, '打開'],
        [true, '鎖住'],
      ] as const) {
        await page.evaluate(async (lock) => {
          const rq = indexedDB.open('dodo-adventure')
          await new Promise<void>((res) => {
            rq.onsuccess = () => {
              const tx = rq.result.transaction('kv', 'readwrite')
              const st = tx.objectStore('kv')
              const g = st.get('settings')
              g.onsuccess = () => st.put({ key: 'settings', value: { ...g.result.value, freePlay: lock ? 'after' : 'always', defaultsV: 4 } })
              tx.oncomplete = () => {
                rq.result.close()
                res()
              }
            }
          })
        }, lock)
        await page.reload()
        await page.waitForSelector('.screen.home', { timeout: 20_000 })
        await settle(page)
        for (const [name, vp] of [
          ['平板橫向', { width: 1200, height: 786 }],
          ['手機直式', { width: 375, height: 812 }],
        ] as const) {
          await page.setViewportSize(vp)
          await k.wait(600)
          await settle(page)
          const m = await page.evaluate(() => {
            const W = innerWidth
            const H = innerHeight
            const box = (sel: string) => {
              const e = document.querySelector(sel)
              if (!e) return null
              const r = e.getBoundingClientRect()
              return { l: r.left, t: r.top, r: r.right, b: r.bottom }
            }
            const parts = ['.play-corner .corner-lamps', '.play-corner [data-door="draw"] .side-window', '.play-corner [data-door="logic"] .side-window', '.play-corner [data-door="draw"] .door-label', '.play-corner [data-door="logic"] .door-label', '.sticker-board .sbd-paper', '.sticker-board .door-label', '.door[data-door="chinese"] .door-arch', '.door[data-door="math"] .door-arch']
            const bs = parts.map((p) => ({ p, b: box(p) }))
            const out = bs.filter(({ b }) => !b || b.l < -1 || b.t < -1 || b.r > W + 1 || b.b > H + 1).map(({ p }) => p)
            const hint = box('[data-corner-hint]')
            const hit = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => !!a && !!b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1
            const overlap = bs.flatMap((x, i) => bs.slice(i + 1).filter((y) => hit(x.b, y.b)).map((y) => `${x.p}×${y.p}`))
            if (hint) bs.forEach((x) => hit(hint, x.b) && overlap.push(`陪玩小字×${x.p}`))
            const win = box('.play-corner [data-door="draw"] .side-window')
            return { out, overlap, scroll: document.documentElement.scrollWidth > W + 1, win: win ? Math.round(win.r - win.l) : 0 }
          })
          const ok = !m.out.length && !m.overlap.length && !m.scroll
          c.outcome(`遊戲角版面（${label}、${name} ${vp.width}×${vp.height}）`, ok, `超出：${m.out.join('、') || '無'}；重疊：${m.overlap.join('、') || '無'}；水平捲動：${m.scroll ? '有' : '無'}；圓窗 ${m.win}px`)
          if (!ok) await c.once(`corner-layout:${label}:${name}`, '小問題', `遊戲角跑版（${label}、${name}）`, JSON.stringify(m))
          await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}-${label}.png`) })
        }
      }
      await page.setViewportSize(vp0)
      await settle(page)
      s = await corner(page)
      c.outcome('重新整理後照設定：鎖住', s?.state === 'locked', JSON.stringify(s))
      await c.flush()
    } finally {
      finish(k, c, '一直開著')
    }
  })
})

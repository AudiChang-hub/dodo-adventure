import type { Page } from '@playwright/test'
import { attempts, drain, homeButton, settle, snap, targets, type Target } from './app'
import type { Pt, Severity, Toddler } from './toddler'
import { STATIONS, type GameDef } from '../catalog'

/** 一段行為的結果，報告的結果表用 */
export interface Outcome {
  behavior: string
  ok: boolean
  note: string
}

const pageNow = (page: Page) => page.evaluate(() => Date.now())

/**
 * 每段行為之後的共同檢查：逐幀異常、語音重疊、缺音檔、錯誤、白畫面、畫面疊在一起。
 * 同一種問題在同一個遊戲只開一筆，之後的次數累加在 detail。
 */
export class Checker {
  private seen = new Map<string, { n: number; f: Toddler['findings'][number] }>()
  readonly consoleErrors: string[] = []
  readonly outcomes: Outcome[] = []
  readonly stats = { zoomMin: 1, zoomMax: 1, cardZoomMin: 1, cardZoomMax: 1, blankMin: 1, flips: 0, overlaps: 0, transitions: 0 }

  constructor(
    readonly k: Toddler,
    readonly page: Page,
  ) {
    page.on('console', (m) => {
      if (m.type() === 'error') this.consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => this.consoleErrors.push('pageerror: ' + e.message))
  }

  outcome(behavior: string, ok: boolean, note = '') {
    this.outcomes.push({ behavior, ok, note })
  }

  /** 幼兒設計準則（docs/幼兒設計準則.md）的一條檢查；不算進問題清單，報告另外列表 */
  readonly rules: { id: string; ok: boolean; note: string; where: string }[] = []
  rule(id: string, ok: boolean, note = '') {
    this.rules.push({ id, ok, note, where: this.k.where })
  }

  async once(key: string, severity: Severity, title: string, detail: string, shot = true) {
    const s = this.seen.get(key)
    if (s) {
      s.n++
      s.f.detail = s.f.detail.replace(/（同一種共 \d+ 次）$/, '') + `（同一種共 ${s.n} 次）`
      return
    }
    await this.k.report(severity, title, detail, { shot })
    this.seen.set(key, { n: 1, f: this.k.findings[this.k.findings.length - 1] })
  }

  /** 讀探針、記問題 */
  async flush() {
    const d = await drain(this.page)
    for (const e of d.episodes) {
      const ms = Math.round(e.last - e.t)
      if (e.kind === 'zoom') {
        this.stats.zoomMin = Math.min(this.stats.zoomMin, e.at.scale)
        this.stats.zoomMax = Math.max(this.stats.zoomMax, e.at.scale)
        if (e.worst < 0.95)
          await this.once(`zoom:${e.key.replace(/:.*/, '').replace(/^(play|st)-.*/, '$1')}:${e.key.split(':')[1]}`, '閃動縮放', `整頁畫面縮放到 ${e.at.scale}（應在 0.97～1.0）`, `圖層 ${e.key}，持續 ${ms}ms／${e.frames} 幀。當時畫面：${e.route}`, false)
      } else if (e.kind === 'card-zoom') {
        this.stats.cardZoomMin = Math.min(this.stats.cardZoomMin, e.at.scale)
        this.stats.cardZoomMax = Math.max(this.stats.cardZoomMax, e.at.scale)
        if (e.worst < 0.95) await this.once('card-zoom', '閃動縮放', `題目層（教學卡背後）縮放到 ${e.at.scale}`, `教學卡出現／收起時，題目推近又拉遠，持續 ${ms}ms`, false)
      } else if (e.kind === 'blank') {
        this.stats.blankMin = Math.min(this.stats.blankMin, e.worst)
        await this.once(`blank:${e.at.where}`, '閃動縮放', `轉場露出空白底色（覆蓋率 ${e.worst}）`, `位置 ${e.at.where?.map((v: number) => Math.round(v * 100) + '%').join(',')}，持續 ${ms}ms／${e.frames} 幀。圖層：${e.at.layers}`, false)
      } else if (e.kind === 'opacity-flip') {
        this.stats.flips++
        await this.once(`flip:${e.key.replace(/scene (play|st)-.*/, 'scene $1')}`, '閃動縮放', `透明度來回跳（${e.key}）`, `同一段轉場裡透明度變化方向反轉：${(e.at.path ?? []).join(' → ')}。當時畫面：${e.route}`, false)
      } else if (e.kind === 'multi') {
        this.stats.transitions++
        if (ms > 4000) await this.once(`multi:${e.at.layers}`, '閃動縮放', '兩個畫面疊在一起超過 4 秒', `圖層：${e.at.layers ?? e.route}，持續 ${ms}ms`)
      } else if (e.kind === 'no-scene') {
        await this.once('no-scene', '卡死', '白畫面：App 根節點是空的', `持續 ${ms}ms`)
      }
    }
    for (const o of d.overlaps) {
      this.stats.overlaps++
      await this.once(`overlap:${o.b.text}`, '小問題', '兩句語音疊在一起播', `正在播「${o.a.join('／')}」時又開始「${o.b.text}」`, false)
    }
    for (const t of d.tts) await this.once(`tts:${t.text}`, '小問題', '音檔缺漏，改用平板內建語音', `「${t.text}」`, false)
    for (const e of d.errors) await this.once(`err:${e.msg.slice(0, 80)}`, '小問題', '頁面錯誤', e.msg.slice(0, 400), false)
    while (this.consoleErrors.length) {
      const m = this.consoleErrors.shift()!
      await this.once(`console:${m.slice(0, 80)}`, '小問題', '主控台錯誤', m.slice(0, 400), false)
    }
  }

  /** 畫面還在：沒有白畫面、沒有疊著兩層 */
  async screenOk(ctx: string) {
    const s = await snap(this.page)
    if (s.rootEmpty || s.bootFail) {
      await this.once(`white:${ctx}`, '卡死', `白畫面或錯誤畫面（${ctx}）`, JSON.stringify(s.scenes))
      return false
    }
    if (!s.scenes.length) {
      await this.once(`noscene:${ctx}`, '卡死', `沒有任何畫面（${ctx}）`, '')
      return false
    }
    if (s.scenes.length > 1) {
      const ok = await settle(this.page, 5000)
      if (!ok) {
        const s2 = await snap(this.page)
        await this.once(`stack:${ctx}`, '閃動縮放', `轉場 5 秒後還疊著兩個畫面（${ctx}）`, s2.scenes.map((x) => `${x.id}:${x.role}`).join(' '))
        return false
      }
    }
    return true
  }
}

// ── 移動到某個畫面 ─────────────────────────────────────────

async function centerOf(page: Page, sel: string): Promise<Pt | null> {
  return page.evaluate((sel) => {
    const scenes = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert)
    const root: ParentNode = scenes.pop() ?? document
    const el = root.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, sel)
}

export async function waitLive(page: Page, pred: (live: string | null) => boolean, ms = 6000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const s = await snap(page)
    if (pred(s.live)) return s.live
    await page.waitForTimeout(120)
  }
  return (await snap(page)).live
}

/** 從任何畫面回到地圖（不算在測試的行為裡，用來換場） */
export async function toMap(k: Toddler, c: Checker) {
  const page = k.page
  for (let i = 0; i < 4; i++) {
    await settle(page, 4000)
    const s = await snap(page)
    if (s.live === 'map') return true
    if (s.cheer) {
      await k.tap({ x: 600, y: 400 }, '跳過慶祝')
      await k.wait(1500)
      continue
    }
    if (s.live === 'home') {
      const p = await centerOf(page, '.home-dock [aria-label="地圖"]')
      if (p) await k.tap(p, '地圖')
    } else {
      const h = await homeButton(page)
      if (h) await pressBack(k, h)
      else await k.tap({ x: 600, y: 400 })
    }
    await waitLive(page, (l) => l === 'map' || l === 'home', 5000)
  }
  const ok = (await snap(page)).live === 'map'
  if (!ok) await c.once('tomap', '無法返回', '找不到回地圖的路', JSON.stringify(await snap(page)))
  return ok
}

/** 地圖 → 站點 → 遊戲；spam=true 時站牌、遊戲卡都連點 */
export async function enterGame(k: Toddler, c: Checker, g: GameDef, opts: { spam?: boolean } = {}) {
  const page = k.page
  if (!(await toMap(k, c))) return false
  const stop = await centerOf(page, `.map-stop[aria-label="${STATIONS[g.station]}"]`)
  if (!stop) return false
  if (opts.spam) await k.spam(stop, 5 + k.r.int(4), '站牌')
  else await k.tap(stop, '站牌')
  let st = await waitLive(page, (l) => l === `st-${g.station}`)
  if (opts.spam) {
    // 連點的後面幾下可能落到站點畫面同一個位置的東西上
    await k.wait(1200)
    st = (await snap(page)).live
    if (st !== `st-${g.station}` && (st ?? '').startsWith('play-')) {
      await c.once('spam-stop', '困惑', `連點站牌直接掉進遊戲「${st!.slice(5)}」`, `在地圖連點「${STATIONS[g.station]}」站牌：站點畫面出現後，後面幾下點到同一個位置的遊戲卡，孩子沒有選就被帶進遊戲`)
      return enterGame(k, c, g, { spam: false })
    }
  }
  if (st !== `st-${g.station}`) {
    await c.once(`enter-st:${g.station}`, '卡死', `點站牌沒有進到站點（停在 ${st}）`, '')
    return false
  }
  await settle(page)
  await k.wait(300)
  const tile = await centerOf(page, `.game-tile[aria-label="${g.title}"]`)
  if (!tile) {
    await c.once('no-tile', '小問題', `站點裡找不到「${g.title}」`, '')
    return false
  }
  if (opts.spam) await k.spam(tile, 5 + k.r.int(5), '遊戲卡')
  else await k.tap(tile, '遊戲卡')
  const live = await waitLive(page, (l) => l === `play-${g.id}`)
  if (live !== `play-${g.id}` && (live ?? '').startsWith('play-')) {
    await c.once('spam-tile', '困惑', `連點遊戲卡進錯遊戲「${live!.slice(5)}」`, '')
    return enterGame(k, c, g, { spam: false })
  }
  if (live !== `play-${g.id}`) {
    await c.once('enter-game', '卡死', `點遊戲卡沒有進到遊戲（停在 ${live}）`, '')
    return false
  }
  return true
}

/** 按返回鍵：新版（[data-back]）點一下，舊版按住 */
export async function pressBack(k: Toddler, h: Pt & { label: string; tap?: boolean }, label = h.label) {
  if (h.tap) await k.tap(h, label)
  else await k.hold(h, h.label.includes('回地圖') ? 900 : 1500, label)
}

/** 按返回鍵（舊版：按住回首頁）；回傳有沒有回到上一層或首頁 */
export async function holdHome(k: Toddler, c: Checker, ctx: string, opts: { second?: Pt[] } = {}) {
  const page = k.page
  const h = (await homeButton(page)) ?? { x: 64, y: 57, label: '（找不到，按左上角）', tap: false }
  const before = (await snap(page)).live
  const t = Date.now()
  if (opts.second) await k.twoFinger(opts.second, h, h.tap ? 120 : 1500)
  else await pressBack(k, h)
  // 舊版：遊戲→首頁、站點→地圖；新版：回上一層（遊戲→站點→地圖→首頁）
  const want = h.tap ? null : h.label.includes('回地圖') ? 'map' : 'home'
  const up = (l: string | null) => (want ? l === want || l === 'home' : !!l && l !== before && !(before?.startsWith('play-') && l.startsWith('play-')))
  const live = await waitLive(page, up, 4000)
  const ok = up(live)
  if (!ok) await c.once(`home:${ctx}`, '無法返回', `${ctx}：${h.tap ? '點返回鍵' : '按住回首頁 1.5 秒'}沒有回去`, `按鈕「${h.label}」，之後畫面停在 ${live}`)
  else await c.screenOk(`${ctx} 回首頁後`)
  c.outcome(ctx, ok, ok ? `${((Date.now() - t) / 1000).toFixed(1)} 秒回到 ${live}` : `停在 ${live}`)
  return ok
}

// ── 孩子的動作 ────────────────────────────────────────────

const randomPoint = (k: Toddler, page: Page): Pt => {
  const vp = page.viewportSize()!
  // 三成點在邊緣（裝飾、角落）
  if (k.r.chance(0.3)) {
    const edge = k.r.int(4)
    const t = k.r.next()
    return edge === 0 ? { x: 3 + k.r.next() * 30, y: t * vp.height } : edge === 1 ? { x: vp.width - 3 - k.r.next() * 30, y: t * vp.height } : edge === 2 ? { x: t * vp.width, y: 3 + k.r.next() * 30 } : { x: t * vp.width, y: vp.height - 3 - k.r.next() * 30 }
  }
  return { x: k.r.range(10, vp.width - 10), y: k.r.range(10, vp.height - 10) }
}
const inside = (t: Target, k: Toddler): Pt => ({ x: t.x + (k.r.next() - 0.5) * t.w * 0.6, y: t.y + (k.r.next() - 0.5) * t.h * 0.6 })

/** 在畫布上亂畫一筆：回傳經過的點 */
function scribble(k: Toddler, cv: Target, page: Page, from: 'inside' | 'outside' = 'inside'): Pt[] {
  const pts: Pt[] = []
  const n = 4 + k.r.int(5)
  if (from === 'outside') {
    const vp = page.viewportSize()!
    pts.push({ x: Math.max(2, cv.x - cv.w / 2 - 40), y: Math.min(vp.height - 2, Math.max(2, cv.y + k.r.range(-0.3, 0.3) * cv.h)) })
  }
  for (let i = 0; i < n; i++) pts.push({ x: cv.x + k.r.range(-0.45, 0.45) * cv.w, y: cv.y + k.r.range(-0.45, 0.45) * cv.h })
  return pts
}

/** 每個點附近有沒有墨（每點一個數字：不透明像素的數量） */
const inkPts = (page: Page, pts: Pt[]) =>
  page.evaluate((pts) => {
    const cs = [...document.querySelectorAll('canvas')]
    return pts.map((p) => {
      let total = 0
      for (const c of cs) {
        const r = c.getBoundingClientRect()
        if (!r.width || !r.height || p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) continue
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) continue
        const x = Math.round((p.x - r.left) * (c.width / r.width))
        const y = Math.round((p.y - r.top) * (c.height / r.height))
        try {
          const d = ctx.getImageData(Math.max(0, x - 4), Math.max(0, y - 4), 9, 9).data
          for (let i = 3; i < d.length; i += 4) if (d[i] > 40) total++
        } catch {
          /* */
        }
      }
      // 用 SVG 畫的孩子墨跡（連點成圖、圈圈看）：[data-ink="child"] 底下的線，看那一點附近有沒有被線蓋到
      for (const el of document.querySelectorAll<SVGGraphicsElement>('[data-ink="child"]')) {
        const paths = el instanceof SVGPathElement ? [el] : [...el.querySelectorAll('path')]
        for (const path of paths) {
          if (Number(getComputedStyle(path).opacity) < 0.05) continue
          const m = path.getScreenCTM()
          if (!m) continue
          const inv = m.inverse()
          for (const [dx, dy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
            const q = new DOMPoint(p.x + dx, p.y + dy).matrixTransform(inv)
            if (path.isPointInFill(q) || path.isPointInStroke(q)) total += 6
          }
        }
      }
      return total
    })
  }, pts)

/** 線段中間補點：檢查墨跡時沿著整條線看 */
function along(pts: Pt[], step = 24): Pt[] {
  const out: Pt[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let j = 1; j < n; j++) out.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n })
  }
  return out
}

/** 畫一筆，回傳（只看畫布內的點）有多少比例留下了新墨跡 */
export async function drawAndMeasure(k: Toddler, pts: Pt[], cv: Target, opts: { fast?: boolean } = {}) {
  const page = k.page
  const probe = along(pts).filter((p) => Math.abs(p.x - cv.x) < cv.w / 2 - 6 && Math.abs(p.y - cv.y) < cv.h / 2 - 6)
  const before = await inkPts(page, probe)
  await k.drag(pts, { stepMs: opts.fast ? 4 : 14, label: '畫' })
  await k.wait(250)
  const after = await inkPts(page, probe)
  const got = probe.filter((_, i) => after[i] > before[i] + 2).length
  return { n: probe.length, got, ratio: probe.length ? got / probe.length : 1 }
}

/** 一個隨機的三歲動作 */
export async function toddlerStep(k: Toddler, c: Checker, opts: { drawing?: boolean; free?: boolean } = {}) {
  const page = k.page
  const ts = await targets(page)
  const btns = ts.filter((t) => t.kind === 'btn' || t.kind === 'svg')
  const drags = ts.filter((t) => t.kind === 'drag')
  const canvases = ts.filter((t) => t.kind === 'canvas')
  const roll = k.r.next()
  if (canvases.length && (opts.drawing ? roll < 0.45 : roll < 0.12)) {
    const cv = k.r.pick(canvases)
    const from = k.r.chance(0.3) ? 'outside' : 'inside'
    const s = await snap(page)
    const m = await drawAndMeasure(k, scribble(k, cv, page, from), cv, { fast: k.r.chance(0.5) })
    if (!s.teaching && opts.free && m.n >= 4) c.rule('DRAW-1', m.ratio >= 0.9, `${from === 'outside' ? '從畫布外畫進來' : '亂畫'}：${m.n} 個檢查點有墨 ${m.got}（${Math.round(m.ratio * 100)}%）`)
    if (!s.teaching && opts.drawing && m.n >= 4 && m.ratio < 0.5)
      await c.once(`ink:${from}`, '困惑', `畫了卻只有 ${Math.round(m.ratio * 100)}% 的地方出現墨跡`, `${from === 'outside' ? '從畫布外畫進來' : '在畫布內亂畫'}，經過 ${m.n} 個檢查點只有 ${m.got} 個有墨（畫布 ${Math.round(cv.w)}×${Math.round(cv.h)}）`)
    return
  }
  if (roll < 0.35 && btns.length) return k.tap(inside(k.r.pick(btns), k), k.r.pick(btns).label)
  if (roll < 0.5) return k.tap(randomPoint(k, page), '亂點')
  if (roll < 0.6 && btns.length) {
    const b = k.r.pick(btns)
    return k.spam(inside(b, k), 5 + k.r.int(6), b.label)
  }
  if (roll < 0.78 && (drags.length || btns.length)) {
    const src = k.r.pick(drags.length ? drags : btns)
    const vp = page.viewportSize()!
    const dest = k.r.chance(0.3) ? { x: k.r.chance(0.5) ? -20 : vp.width + 20, y: k.r.range(0, vp.height) } : randomPoint(k, page)
    const mid = { x: (src.x + dest.x) / 2 + k.r.range(-60, 60), y: (src.y + dest.y) / 2 + k.r.range(-60, 60) }
    const clamp = (p: Pt) => ({ x: Math.min(vp.width - 1, Math.max(0, p.x)), y: Math.min(vp.height - 1, Math.max(0, p.y)) })
    return k.drag([inside(src, k), clamp(mid), clamp(dest)], { cancel: k.r.chance(0.35), label: src.label })
  }
  if (roll < 0.88) {
    const vp = page.viewportSize()!
    const base = { x: k.r.range(150, vp.width - 150), y: k.r.range(200, vp.height - 50) }
    const n = 2 + k.r.int(2)
    return k.palm(Array.from({ length: n }, () => ({ x: base.x + k.r.range(-90, 90), y: base.y + k.r.range(-50, 50) })), 300 + k.r.int(500))
  }
  return k.wait(800 + k.r.int(2500), '發呆一下')
}

/** 能不能繼續：一段時間內畫面有變化、或點了東西之後有反應 */
export async function alive(k: Toddler, c: Checker, ctx: string, budget = 45_000) {
  const page = k.page
  const s0 = await snap(page)
  const end = Date.now() + budget
  let last = s0
  while (Date.now() < end) {
    await k.wait(2000)
    const s = await snap(page)
    if (s.live !== s0.live || s.mut !== last.mut || s.voices !== last.voices) return true
    last = s
    const ts = (await targets(page)).filter((t) => t.kind !== 'canvas')
    if (ts.length) {
      const t = k.r.pick(ts)
      await k.tap({ x: t.x, y: t.y }, `試試看 ${t.label}`)
    } else await k.tap({ x: k.r.range(200, 1000), y: k.r.range(200, 700) }, '試試看（沒有可點的東西）')
    await k.wait(600)
    const s2 = await snap(page)
    if (s2.live !== s0.live || s2.mut !== last.mut || s2.voices !== last.voices) return true
  }
  await c.once(`stuck:${ctx}`, '卡死', `${ctx}之後 ${Math.round(budget / 1000)} 秒畫面沒有任何變化`, `一直點畫面上的東西都沒有反應。畫面 ${s0.live}，教學狀態 ${s0.teaching}`)
  return false
}

// ── 測試的行為 ────────────────────────────────────────────

/** 教學卡、示範還在進行時就搶著點、拖、畫 */
export async function grabDuringTeach(k: Toddler, c: Checker, g: GameDef) {
  const page = k.page
  k.behavior = '搶著操作'
  const before = new Set((await attempts(page)).map((a) => a.id))
  const tapsAt: { t: number; kind: string }[] = []
  const end = Date.now() + 30_000
  let saw = false
  let quiet = 0
  let inkDuringDemo = 0
  let inkTries = 0
  let touches = 0
  let silent = 0
  while (Date.now() < end) {
    const s = await snap(page)
    if (!s.teaching || s.teaching === 'teach-card-ready') {
      // 教學卡念完、在等孩子點：這時候點是正常的，換別的動作
      quiet++
      if ((saw && quiet > 12) || (!saw && quiet > 30)) break
      if (s.teaching === 'teach-card-ready') {
        saw = true
        const ts = await targets(page)
        const card = ts.find((t) => t.label === '再聽一次')
        if (card) await k.tap(card, '點教學卡')
      }
      await k.wait(250)
      continue
    }
    saw = true
    quiet = 0
    const t = await pageNow(page)
    const ts = await targets(page)
    const canv = ts.filter((x) => x.kind === 'canvas')
    if (canv.length && k.r.chance(0.5)) {
      const cv = k.r.pick(canv)
      const m = await drawAndMeasure(k, scribble(k, cv, page), cv, { fast: true })
      inkTries++
      if (m.got >= 3) inkDuringDemo++
    } else {
      const btns = ts.filter((x) => x.kind !== 'canvas')
      const p = btns.length && k.r.chance(0.7) ? inside(k.r.pick(btns), k) : randomPoint(k, page)
      if (k.r.chance(0.3)) await k.spam(p, 4, `示範中 ${s.teaching}`)
      else {
        const b = await page.evaluate(() => ({ r: window.__toddler.resp, s: window.__toddler.sfx, v: window.__toddler.voices.length }))
        await k.tap(p, `示範中 ${s.teaching}`)
        await k.wait(300)
        const a = await page.evaluate(() => ({ r: window.__toddler.resp, s: window.__toddler.sfx, v: window.__toddler.voices.length }))
        touches++
        if (a.r === b.r && a.s === b.s && a.v === b.v) silent++
      }
    }
    tapsAt.push({ t, kind: s.teaching })
  }
  await k.wait(1500)
  const after = (await attempts(page)).filter((a) => !before.has(a.id))
  // 示範中點了之後 1.5 秒內出現的「自己答」（教學卡、筆的示範時連「一起練」也不該有）
  const bad = after.filter((a) => {
    const near = tapsAt.filter((x) => a.ts >= x.t && a.ts - x.t < 1500)
    if (!near.length) return false
    if (a.phase === 'quiz') return true
    return a.phase === 'guided' && near.some((x) => x.kind !== 'hand')
  })
  const quizBad = bad.filter((a) => a.phase === 'quiz')
  const guidedBad = bad.filter((a) => a.phase !== 'quiz')
  if (quizBad.length)
    await c.once('teach-record', '誤記作答', `示範中亂點被記成作答（${quizBad.length} 筆）`, quizBad.map((a) => `${a.phase} ${a.itemId} ${a.ok ? '答對' : '答錯'} 點了 ${a.taps} 下`).join('；'))
  if (guidedBad.length)
    await c.once('teach-guided', '困惑', `教學卡還在收起時亂點，就被算成「一起練」作答（${guidedBad.length} 筆）`, `${guidedBad.map((a) => `${a.phase} ${a.itemId} ${a.ok ? '答對' : '答錯'}`).join('；')}。孩子還沒聽到「Here it is! Tap it!」，手就已經點到後面發光的答案；一起練不計分，但這一步等於被跳過`)
  if (inkDuringDemo)
    await c.once('teach-ink', '困惑', `示範還沒結束就能畫（${inkDuringDemo}/${inkTries} 筆留下墨跡）`, '筆或手還在示範時，孩子在畫布上畫的線條會留下來')
  const note = !saw ? '沒有遇到教學或示範' : `示範中操作 ${tapsAt.length} 次（${[...new Set(tapsAt.map((x) => x.kind))].join('、')}），誤記 ${bad.length} 筆${inkTries ? `，畫 ${inkTries} 筆留下墨 ${inkDuringDemo}` : ''}`
  c.outcome('搶著操作', !bad.length && !inkDuringDemo, note)
  if (saw) c.rule('PHASE-2', !bad.length && !inkDuringDemo, note)
  if (touches) c.rule('TOUCH-6', !silent, `示範中點一下 ${touches} 次，300ms 內沒有任何回應 ${silent} 次`)
  await c.flush()
  return saw
}

/** 一直選錯：挑沒有發光提示的選項 */
export async function wrongMany(k: Toddler, c: Checker, ms = 35_000) {
  const page = k.page
  k.behavior = '答錯很多次'
  const before = new Set((await attempts(page)).map((a) => a.id))
  const p0 = await page.evaluate(() => performance.now())
  const end = Date.now() + ms
  let taps = 0
  let twoDone = false
  while (Date.now() < end) {
    const s = await snap(page)
    if (!(s.live ?? '').startsWith('play-')) break
    const tiles = await page.evaluate(() => {
      const scenes = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert)
      const root = scenes.pop() ?? document
      return [...root.querySelectorAll<HTMLElement>('.tile, .options button, [class*="opt"] button')]
        .filter((e) => !/\b(correct|hint|guide)\b/.test(e.className))
        .map((e) => {
          const r = e.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
        })
        .filter((r) => r.w > 10 && document.elementFromPoint(r.x, r.y))
    })
    if (s.teaching === 'teach-card-ready') {
      const card = (await targets(page)).find((t) => t.label === '再聽一次')
      if (card) await k.tap(card, '點教學卡')
    } else if (tiles.length >= 2 && !twoDone && s.teaching !== 'teach-card') {
      // TOUCH-3：兩根手指同時按兩個選項
      twoDone = true
      const a0 = (await attempts(page)).length
      const t1 = await pageNow(page)
      await k.palm([tiles[0], tiles[1]], 120)
      await k.wait(2500)
      const rows = (await attempts(page)).filter((x) => x.ts >= t1)
      const multi = rows.length > 1 || rows.some((x) => x.taps > 1)
      c.rule('TOUCH-3', !multi, `兩指同時按兩個選項：新增 ${rows.length} 筆（點擊數 ${rows.map((x) => x.taps).join('、') || 0}），作答紀錄 ${a0}→${a0 + rows.length}`)
    } else if (tiles.length) {
      await k.tap(k.r.pick(tiles), '選錯的')
      taps++
    } else await toddlerStep(k, c)
    await k.wait(900 + k.r.int(900))
  }
  const rows = (await attempts(page)).filter((a) => !before.has(a.id))
  const voices = await linesSince(page, p0)
  const wrong = rows.filter((a) => !a.ok).length
  const retaught = rows.filter((a) => a.retaught).length
  const ok = await alive(k, c, '連續答錯')
  // 同一句回饋一直重複：孩子會覺得被罵
  const counts = new Map<string, number>()
  for (const v of voices) if (v.text) counts.set(v.text, (counts.get(v.text) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top && top[1] >= 8) await c.once('wrong-repeat', '小問題', `一直答錯時同一句回饋重複 ${top[1]} 次`, `「${top[0]}」在 ${Math.round(ms / 1000)} 秒內說了 ${top[1]} 次`, false)
  c.outcome('答錯很多次', ok, `點錯 ${taps} 次，紀錄 ${rows.length} 筆（答錯 ${wrong}、重教 ${retaught}）${top ? `，最常聽到「${top[0]}」×${top[1]}` : ''}`)
  await c.flush()
}

/** 完全不動 */
export async function idle(k: Toddler, c: Checker, ms = 75_000) {
  const page = k.page
  k.behavior = '發呆'
  // 等上一段的回饋說完、安靜 2 秒才開始算
  for (let i = 0; i < 40; i++) {
    const quiet = await page.evaluate(() => {
      const n = performance.now()
      return !window.__toddler.voices.some((v) => v.stopped == null ? v.end > n - 2000 : v.stopped > n - 2000)
    })
    if (quiet) break
    await k.wait(250)
  }
  const t0 = await page.evaluate(() => performance.now())
  await k.wait(ms, '完全不動')
  const vs = (await linesSince(page, t0)).map((v) => ({ t: Math.round((v.t - t0) / 1000), text: v.text }))
  const late = vs.filter((v) => v.t > 45)
  const counts = new Map<string, number>()
  for (const v of vs) counts.set(v.text ?? '?', (counts.get(v.text ?? '?') ?? 0) + 1)
  const rep = [...counts.entries()].filter(([, n]) => n >= 3)
  if (rep.length) await c.once('idle-repeat', '困惑', `發呆時同一句一直重複（${rep.map(([t, n]) => `「${t}」×${n}`).join('、')}）`, vs.map((v) => `${v.t}s ${v.text}`).join('；'))
  else if (late.length >= 2) await c.once('idle-late', '小問題', '發呆 45 秒之後還在一直說話', late.map((v) => `${v.t}s ${v.text}`).join('；'))
  const s = await snap(page)
  const first = vs[0]?.t
  c.rule('PHASE-7', first != null && first >= 13 && first <= 17 && vs.length <= 2, `發呆時的語音：${vs.map((v) => `${v.t}s`).join(' ') || '無'}（準則：15 秒重念、30 秒手、45 秒一起做）；${s.teaching === 'hand' ? '有示範手' : '沒有示範手'}`)
  c.rule('FB-5', (s.live ?? '').startsWith('play-') || s.cheer, `不操作 ${Math.round(ms / 1000)} 秒後畫面 ${s.live}`)
  const ok = await alive(k, c, '發呆')
  c.rule('NAV-5', ok, ok ? '發呆後仍可繼續' : '發呆後卡住')
  c.outcome('發呆', ok && !rep.length, `${Math.round(ms / 1000)} 秒內說了 ${vs.length} 句${vs.length ? `（${vs.map((v) => `${v.t}s ${v.text ?? ''}`).join('／')}）` : '（完全沒有提示）'}；之後${ok ? '點了有反應' : '沒反應'}；狀態 ${s.teaching ?? s.phase ?? ''}`)
  // 看得到的提示：發光的答案、輕輕點的手
  const glow = await k.page.evaluate(() => !!document.querySelector('.hint, .guide, .nudge, .glow, .demo-hand, [data-demo-hand]'))
  if (!vs.length && (s.live ?? '').startsWith('play-') && !glow && !s.teaching)
    await c.once('idle-silent', '困惑', `發呆 ${Math.round(ms / 1000)} 秒完全沒有提示`, `畫面 ${s.live}：沒有語音、沒有發光或手的提示`)
  await c.flush()
}

/** 切到背景再回來 */
export async function background(k: Toddler, c: Checker) {
  const page = k.page
  k.behavior = '中途離開'
  const cdp = await page.context().newCDPSession(page)
  k.act('切到背景 4 秒')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }).catch(() => {})
  await k.wait(4000)
  await cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {})
  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>).visibilityState
    delete (document as unknown as Record<string, unknown>).hidden
    document.dispatchEvent(new Event('visibilitychange'))
  })
  k.act('回到前景')
  await k.wait(1500)
  const ok1 = await c.screenOk('切回前景')
  const ok = ok1 && (await alive(k, c, '切回前景'))
  c.outcome('切到背景再回來', ok, ok ? '可以繼續' : '回來後卡住')
  await c.flush()
  await cdp.detach().catch(() => {})
}

/** 重新整理 */
export async function reload(k: Toddler, c: Checker) {
  const page = k.page
  k.behavior = '重新整理'
  const before = (await attempts(page)).length
  k.act('重新整理頁面')
  await page.reload()
  const t = Date.now()
  let live: string | null = null
  try {
    await page.waitForSelector('.scene', { timeout: 15_000 })
    live = await waitLive(page, (l) => !!l, 5000)
  } catch {
    /* */
  }
  const after = (await attempts(page)).length
  const ok = !!live && (await c.screenOk('重新整理後'))
  if (!live) await c.once('reload', '卡死', '重新整理後 15 秒還沒出現畫面', '')
  if (after < before) await c.once('reload-loss', '誤記作答', `重新整理後作答紀錄少了 ${before - after} 筆`, '')
  c.outcome('重新整理', ok && after >= before, `${((Date.now() - t) / 1000).toFixed(1)} 秒回到 ${live}，紀錄 ${before}→${after}`)
  await c.flush()
}

/** 連點時的作答紀錄：同一題在 1.5 秒內被記兩次 */
export async function checkDoubleRecords(k: Toddler, c: Checker) {
  const rows = (await attempts(k.page)).filter((a) => a.phase !== 'teach')
  const dup: string[] = []
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    if (a.game === b.game && a.itemId === b.itemId && a.phase === b.phase && b.ts - a.ts < 1500) dup.push(`${b.phase} ${b.itemId}（相隔 ${b.ts - a.ts}ms）`)
  }
  if (dup.length) await c.once('dup', '誤記作答', `連點讓同一題被記了兩次（${dup.length} 處）`, dup.join('；'), false)
  return { rows: rows.length, dup: dup.length }
}

// ── 幼兒設計準則的畫面檢查 ─────────────────────────────────

/** 在目前畫面量 NAV-1、NAV-3、NAV-7、TOUCH-1、MOTION-2／3 */
export async function audit(k: Toddler, c: Checker, ctx: string) {
  const r = await k.page.evaluate(async () => {
    const root = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop() ?? document.body
    const rect = (e: Element) => e.getBoundingClientRect()
    const vis = (e: Element) => {
      const b = rect(e)
      const cs = getComputedStyle(e)
      return b.width > 4 && b.height > 4 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.2 && b.right > 0 && b.bottom > 0 && b.left < innerWidth && b.top < innerHeight
    }
    const label = (e: Element) => e.getAttribute('aria-label') || (e.className && typeof e.className === 'string' ? e.className.split(' ')[0] : e.tagName)
    // NAV-1：左上 200×200 內有「回…」鍵，≥ 90px、沒被蓋住
    const back = [...root.querySelectorAll('[aria-label*="回"]')].find((e) => vis(e) && rect(e).left < 200 && rect(e).top < 200)
    let nav1 = '沒有返回鍵'
    let nav1ok = false
    if (back) {
      const b = rect(back)
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      nav1ok = b.width >= 90 && b.height >= 90 && !!hit && back.contains(hit)
      nav1 = `「${label(back)}」${Math.round(b.width)}×${Math.round(b.height)}${hit && back.contains(hit) ? '' : '，被蓋住'}`
    }
    // NAV-3：孩子畫面不該有「按住」的按鈕
    const holds = [...root.querySelectorAll('[aria-label*="按住"]')].filter(vis).map(label)
    // TOUCH-1：可點目標 ≥ 90，彼此間距 ≥ 28
    const els = [...root.querySelectorAll('button, [role=button], .tile, .option, [data-crayon]')].filter((e) => vis(e) && !e.closest('[aria-hidden="true"]') && !e.closest('.parent-corner'))
    const small = els.filter((e) => rect(e).width < 90 || rect(e).height < 90).map((e) => `${label(e)} ${Math.round(rect(e).width)}×${Math.round(rect(e).height)}`)
    const close: string[] = []
    for (let i = 0; i < els.length; i++)
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i]
        const b = els[j]
        if (a.contains(b) || b.contains(a)) continue
        const A = rect(a)
        const B = rect(b)
        const gx = Math.max(0, A.left - B.right, B.left - A.right)
        const gy = Math.max(0, A.top - B.bottom, B.top - A.bottom)
        const d = gx && gy ? Math.hypot(gx, gy) : Math.max(gx, gy)
        if (d < 28) close.push(`${label(a)}↔${label(b)} ${Math.round(d)}px`)
      }
    // NAV-7：整頁圖層的 z-index ≤ 10；家長角落、字幕在最上層
    const zs = [...document.querySelectorAll<HTMLElement>('.scene')].map((e) => Number(e.style.zIndex || 0))
    const pc = document.querySelector('.parent-corner')
    let cornerTop = true
    if (pc) {
      const b = rect(pc)
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      cornerTop = !!hit && pc.contains(hit)
    }
    const sub = document.querySelector('.sub-pill')
    let subTop: boolean | null = null
    if (sub && vis(sub)) {
      const b = rect(sub)
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      subTop = !!hit && !!hit.closest('.subtitle')
    }
    // MOTION-2／3：靜止時一直循環的動畫（CSS／WAAPI），以及 1 秒內 transform／opacity 還在變的元素（motion 的 JS 動畫）
    const anims = document.getAnimations().filter((a) => a.playState === 'running')
    const loops = anims.filter((a) => a.effect?.getTiming().iterations === Infinity)
    const fades = anims.filter((a) => {
      const it = a.effect?.getTiming().iterations ?? 1
      const kf = (a.effect as KeyframeEffect | null)?.getKeyframes?.() ?? []
      return it > 1 && kf.some((f) => 'opacity' in f)
    })
    const all = [...root.querySelectorAll<HTMLElement | SVGElement>('*')].slice(0, 4000)
    const s0 = all.map((e) => {
      const cs = getComputedStyle(e)
      return cs.transform + cs.opacity
    })
    await new Promise((r) => setTimeout(r, 1000))
    const moving = all.filter((e, i) => {
      const cs = getComputedStyle(e)
      return vis(e) && cs.transform + cs.opacity !== s0[i]
    })
    // 只算最外層在動的
    const top = moving.filter((e) => !moving.some((m) => m !== e && m.contains(e)))
    return {
      nav1ok,
      nav1,
      holds,
      small: small.slice(0, 12),
      nSmall: small.length,
      close: close.slice(0, 8),
      nClose: close.length,
      zmax: Math.max(0, ...zs),
      cornerTop,
      subTop,
      loops: loops.map((a) => (a as CSSAnimation).animationName || label((a.effect as KeyframeEffect).target as Element)).slice(0, 8),
      fades: fades.map((a) => (a as CSSAnimation).animationName || 'waapi').slice(0, 8),
      moving: top.map(label).slice(0, 8),
      nMoving: top.length,
    }
  })
  c.rule('NAV-1', r.nav1ok, `${ctx}：${r.nav1}`)
  c.rule('NAV-3', !r.holds.length, `${ctx}：${r.holds.length ? `按住的按鈕：${r.holds.join('、')}` : '沒有按住的按鈕'}`)
  c.rule('TOUCH-1', !r.nSmall && !r.nClose, `${ctx}：小於 90px 的 ${r.nSmall} 個（${r.small.join('、')}）；間距 < 28px 的 ${r.nClose} 對（${r.close.join('、')}）`)
  c.rule('NAV-7', r.zmax <= 10 && r.cornerTop && r.subTop !== false, `${ctx}：圖層 z-index 最大 ${r.zmax}、家長角落${r.cornerTop ? '在最上層' : '被蓋住'}、字幕${r.subTop === null ? '沒顯示' : r.subTop ? '在最上層' : '被蓋住'}`)
  const n = r.loops.length + r.nMoving
  c.rule('MOTION-2', r.loops.length + r.nMoving <= 1, `${ctx}：靜止時還在動的 ${n} 個（循環動畫：${r.loops.join('、') || '無'}；1 秒內還在變的：${r.moving.join('、') || '無'}）`)
  c.rule('MOTION-3', !r.fades.length, `${ctx}：透明度反覆變化的動畫 ${r.fades.length} 個${r.fades.length ? `（${r.fades.join('、')}）` : ''}`)
  return r
}

export const attemptsSince = async (page: Page, t: number) => (await attempts(page)).filter((a) => a.ts >= t)

/**
 * 從 t0（performance.now）之後說過的句子。一句台詞可能分成幾段音檔（感嘆詞、鋪陳、目標字），
 * 每段都會記一筆、字幕一樣：相同字幕、間隔 4 秒內的合成一句。
 */
export async function linesSince(page: Page, t0: number) {
  const vs = await page.evaluate((t0) => window.__toddler.voices.filter((v) => v.t > t0).map((v) => ({ t: v.t, end: v.stopped ?? v.end, text: v.text })), t0)
  const out: { t: number; text: string | null }[] = []
  let last: { t: number; end: number; text: string | null } | null = null
  for (const v of vs) {
    if (last && v.text === last.text && v.t - last.end < 4000) {
      last.end = v.end
      continue
    }
    last = { ...v }
    out.push({ t: v.t, text: v.text })
  }
  return out
}

import { expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pt } from './toddler'

export const PORT = Number(process.env.TODDLER_PORT || 4527)
export const BASE = `http://localhost:${PORT}/dodo-adventure/`
const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'probe.js')

/** 開 App、解鎖地圖（自由探索），進到地圖 */
export async function boot(page: Page, seed: number, opts: { to?: 'map' | 'home'; settings?: Record<string, unknown> } = {}) {
  await page.addInitScript((seed) => {
    if (!sessionStorage.getItem('toddler.seed')) sessionStorage.setItem('toddler.seed', String(seed))
  }, seed)
  await page.addInitScript({ path: PROBE })
  await page.goto(BASE)
  await page.waitForSelector('.scene', { timeout: 20_000 })
  // 清資料、寫設定之前確認是自己開的那個 port（同一台機器上可能有別人的 preview）
  const port = await page.evaluate(() => location.port)
  expect(port).toBe(String(PORT))
  await page.evaluate(
    async ({ extra, to }) => {
      await new Promise<void>((res, rej) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onerror = () => rej(rq.error)
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction('kv', 'readwrite')
          const st = tx.objectStore('kv')
          const g = st.get('settings')
          g.onsuccess = () => st.put({ key: 'settings', value: { ...(g.result?.value ?? {}), freePlay: 'always', eyeBreakEvery: 60, dailyMinutes: 120, ...extra } })
          tx.oncomplete = () => {
            db.close()
            res()
          }
          tx.onerror = () => rej(tx.error)
        }
      })
      sessionStorage.setItem('dodo.resume', to)
    },
    { extra: opts.settings ?? {}, to: opts.to ?? 'map' },
  )
  await page.reload()
  await page.waitForSelector(opts.to === 'home' ? '.screen.home' : '.screen.map', { timeout: 20_000 })
  await settle(page)
}

export interface Snap {
  scenes: { id: string; role: string; inert: boolean }[]
  live: string | null
  teaching: string | null
  phase: string | null
  mut: number
  lastMut: number
  voices: number
  speaking: boolean
  cheer: boolean
  overlay: boolean
  bootFail: boolean
  rootEmpty: boolean
  now: number
}

export const snap = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    const T = window.__toddler
    const scenes = [...document.querySelectorAll<HTMLElement>('.scene')].map((e) => ({ id: e.dataset.scene ?? '', role: e.dataset.role ?? '', inert: e.inert }))
    const live = scenes.filter((s) => !s.inert).pop()?.id ?? null
    const n = performance.now()
    return {
      scenes,
      live,
      teaching: T.teaching(),
      phase: T.phase(),
      mut: T.mut,
      lastMut: T.lastMut,
      voices: T.voices.length,
      speaking: T.voices.some((v) => v.stopped == null && v.end > n),
      cheer: !!document.querySelector('.cheer'),
      overlay: !!document.querySelector('.overlay-layer, .gate-backdrop'),
      bootFail: !!document.querySelector('#boot.boot-failed, .boot-failed'),
      rootEmpty: (document.getElementById('root')?.childElementCount ?? 0) === 0,
      now: n,
    }
  })

/** 等轉場結束：只剩一層畫面、而且 0.3 秒內沒有變動層數 */
export async function settle(page: Page, max = 6000) {
  const end = Date.now() + max
  let stable = 0
  while (Date.now() < end) {
    // 今日冒險裡面還有一疊自己的 .scene：兩層都只剩一張才算轉場結束
    const n = await page.evaluate(() => {
      const all = [...document.querySelectorAll('.scene')]
      const groups = new Map<Element | null, number>()
      for (const e of all) {
        const k = e.parentElement
        groups.set(k, (groups.get(k) ?? 0) + 1)
      }
      return Math.max(0, ...groups.values())
    })
    stable = n === 1 ? stable + 1 : 0
    if (stable >= 3) return true
    await page.waitForTimeout(100)
  }
  return false
}

export interface Target {
  kind: 'btn' | 'drag' | 'canvas' | 'svg'
  x: number
  y: number
  w: number
  h: number
  label: string
}

/** 現在這一層畫面裡孩子點得到的東西（排除回首頁鈕、家長角落） */
export const targets = (page: Page): Promise<Target[]> =>
  page.evaluate(() => {
    const scenes = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert)
    const root: ParentNode = scenes.pop() ?? document
    const out: Target[] = []
    const seen = new Set<Element>()
    const W = innerWidth
    const H = innerHeight
    const add = (el: Element, kind: Target['kind']) => {
      if (seen.has(el)) return
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8 || r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) return
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') return
      const label = (el.getAttribute('aria-label') ?? '') + ''
      if (/回首頁|回地圖|回到孩子模式/.test(label) || el.closest('[data-back]')) return
      const x = Math.min(W - 4, Math.max(4, r.left + r.width / 2))
      const y = Math.min(H - 4, Math.max(4, r.top + r.height / 2))
      const hit = document.elementFromPoint(x, y)
      if (!hit || (hit !== el && !el.contains(hit) && kind !== 'canvas')) return
      if (hit.closest('.parent-corner')) return
      seen.add(el)
      out.push({ kind, x, y, w: r.width, h: r.height, label: label || (el as HTMLElement).className?.toString().split(' ')[0] || el.tagName })
    }
    root.querySelectorAll('canvas').forEach((e) => add(e, 'canvas'))
    root.querySelectorAll('button, [role=button], .tile, .game-tile, .map-stop').forEach((e) => add(e, 'btn'))
    root.querySelectorAll('*').forEach((e) => {
      if (seen.has(e) || !(e instanceof HTMLElement || e instanceof SVGElement)) return
      const cs = getComputedStyle(e)
      if (cs.touchAction === 'none' && e.tagName !== 'CANVAS' && !e.classList.contains('scene') && !e.classList.contains('stage')) add(e, 'drag')
      else if (cs.cursor === 'pointer' && e instanceof SVGElement) add(e, 'svg')
    })
    return out
  })

/** 回首頁鈕（遊戲裡要按住 1.2 秒，地圖、站點、貼紙本 0.6 秒） */
export async function homeButton(page: Page): Promise<(Pt & { label: string; tap: boolean }) | null> {
  return page.evaluate(() => {
    const scenes = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert)
    const root: ParentNode = scenes.pop() ?? document
    // 2026-10-29 起（main c843c88）返回鍵是 [data-back]，點一下回上一層；之前是要按住的「回首頁（按住）」
    const nb = root.querySelector('[data-back]')
    const b = nb ?? root.querySelector('[aria-label*="回首頁"], [aria-label*="回地圖"]')
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.getAttribute('aria-label') ?? '', tap: !!nb }
  })
}

export const attempts = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ id: string; ts: number; game: string; itemId: string; phase: string; ok: boolean; tries: number; taps: number; ms: number; retaught: boolean }[]>((res) => {
        const rq = indexedDB.open('dodo-adventure')
        rq.onsuccess = () => {
          const db = rq.result
          const g = db.transaction('attempts').objectStore('attempts').getAll()
          g.onsuccess = () => {
            db.close()
            res(
              (g.result as any[])
                .map((a) => ({ id: a.id, ts: a.ts, game: a.game, itemId: a.itemId, phase: a.phase ?? 'quiz', ok: a.firstTryCorrect, tries: a.attempts, taps: a.taps?.length ?? 0, ms: a.responseMs, retaught: !!a.metrics?.retaught }))
                .sort((a, b) => a.ts - b.ts),
            )
          }
          g.onerror = () => res([])
        }
        rq.onerror = () => res([])
      }),
  )

/** 畫布上某些點附近有多少墨（不透明的像素） */
export const inkAt = (page: Page, pts: Pt[]) =>
  page.evaluate((pts) => {
    let total = 0
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) continue
      const sx = c.width / r.width
      const sy = c.height / r.height
      for (const p of pts) {
        if (p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) continue
        const x = Math.round((p.x - r.left) * sx)
        const y = Math.round((p.y - r.top) * sy)
        try {
          const d = ctx.getImageData(Math.max(0, x - 3), Math.max(0, y - 3), 7, 7).data
          for (let i = 3; i < d.length; i += 4) if (d[i] > 40) total++
        } catch {
          /* 被污染的畫布 */
        }
      }
    }
    return total
  }, pts)

/** 讀探針累積的資料，讀完清空（下一段行為重新累積） */
export const drain = (page: Page) =>
  page.evaluate(() => {
    const T = window.__toddler
    const out = { episodes: T.episodes.splice(0), overlaps: T.overlaps.splice(0), tts: T.tts.splice(0), errors: T.errors.splice(0), voices: T.voices.map((v) => ({ ...v })) }
    return out
  })

export async function voicesSince(page: Page, t: number) {
  return page.evaluate((t) => window.__toddler.voices.filter((v) => v.t >= t).map((v) => ({ t: v.t, text: v.text, dur: v.dur })), t)
}

export const now = (page: Page) => page.evaluate(() => performance.now())


declare global {
  interface Window {
    __toddler: {
      episodes: any[]
      voices: { t: number; end: number; dur: number; text: string | null; stopped: number | null }[]
      overlaps: any[]
      tts: any[]
      errors: { t: number; msg: string }[]
      mut: number
      lastMut: number
      resp: number
      sfx: number
      frames: number
      teaching: () => string | null
      phase: () => string | null
      /** 每一下按下：Date.now() 和那一刻的 teaching() */
      taps: { t: number; kind: string | null }[]
      /** 最後一次放開手指的 Date.now() */
      lastUp: number
    }
  }
}

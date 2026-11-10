// 自由畫畫的魔法筆和印章（T-127 B 案）：每天一支魔法筆，在 4 種之間輪流，連續兩天不一樣。
// 只有自由畫畫用：Ink.tsx 的 brush／paint 是選用參數，英文描字、數學寫數字都不給，照舊是一般的筆。
//
// 筆畫的 brush 欄位記這一筆是什麼筆（存進作品的筆跡裡，換大小重畫時也照這個畫）：
//   rainbow            彩虹筆：一筆畫下去顏色慢慢變
//   mirror             對稱筆：左邊畫、右邊同時畫出鏡像（以畫紙正中間為軸）
//   trail:ewe,cow      蓋印筆：沿著筆跡蓋出一串今天的小圖（冒號後面是 Fluent Emoji 的名字）
//   dots               點點筆：畫出一顆一顆的點
//   stamp:ewe          印章：手指放開的地方蓋一個今天的角色（拖著走的時候印章跟著手指）
import { EMOJI } from '../../art/emoji.generated'
import type { Pt, Stroke } from './Ink'

export const BRUSHES = ['rainbow', 'mirror', 'trail', 'dots'] as const
export type BrushId = (typeof BRUSHES)[number]

/** 輪換紀錄（lib/variety.ts）裡魔法筆的名字 */
export const BRUSH_VARIETY = 'draw.brush'

/** 今天能用的魔法筆：沒有今天的世界時，蓋印筆沒有小圖可以蓋，不放進來 */
export const brushPool = (hasWorld: boolean): readonly BrushId[] => (hasWorld ? BRUSHES : BRUSHES.filter((b) => b !== 'trail'))

/**
 * 輪換紀錄還沒讀出來（或讀不到）時先用的筆：照日期輪流（第幾天 mod 種數），連續兩天一定不一樣、不用存任何東西。
 * 真正用哪一支由 lib/variety.ts 的 pickVariety 決定（最近用過的都不挑，隔幾天沒玩也不會跟上次一樣）。
 */
export function brushOfDay(day: number, pool: readonly BrushId[] = BRUSHES): BrushId {
  const n = pool.length
  return pool[((day % n) + n) % n]
}

// ── 小圖（Fluent Emoji）畫到 canvas 上 ─────────────────────

const imgs = new Map<string, HTMLImageElement>()
/** emoji 的圖（第一次叫的時候開始載入；data URL，通常下一個 frame 就好了） */
export function emojiImage(name: string): HTMLImageElement | null {
  const e = EMOJI[name]
  if (!e || typeof Image === 'undefined') return null
  let img = imgs.get(name)
  if (!img) {
    img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${e.w} ${e.h}" width="256" height="256">${e.b}</svg>`)}`
    imgs.set(name, img)
  }
  return img
}
/** 先把今天會用到的小圖載好（進畫畫就叫，孩子點下去的時候已經可以畫） */
export function preloadEmoji(names: readonly string[]): Promise<void> {
  return Promise.all(names.map((n) => emojiImage(n)?.decode().catch(() => {}))).then(() => {})
}

function drawEmoji(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number) {
  const img = emojiImage(name)
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x - size / 2, y - size / 2, size, size)
  else {
    // 還沒載好（幾乎不會發生）：先畫一個淡淡的圓，不會整個沒反應
    ctx.fillStyle = '#E6DCCB'
    ctx.beginPath()
    ctx.arc(x, y, size * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ── 沿著筆跡走 ────────────────────────────────────────────

/** 沿著筆跡每隔 gap 取一個點（第一個點一定有：點一下也有東西） */
export function along(pts: readonly Pt[], gap: number): Pt[] {
  if (!pts.length) return []
  const out: Pt[] = [pts[0]]
  /** 上一個取的點到目前這一段起點的距離 */
  let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (!seg) continue
    let d = gap - carry
    for (; d <= seg; d += gap) out.push({ x: a.x + ((b.x - a.x) * d) / seg, y: a.y + ((b.y - a.y) * d) / seg, p: b.p })
    carry = seg - (d - gap)
  }
  return out
}

/** 彩虹筆的顏色（跟調色盤同一組柔和的顏色，紙感螢幕上不刺眼），沿著筆跡每 RAINBOW_LEN 走完一輪 */
export const RAINBOW = ['#E58A7B', '#F0B072', '#EFD27A', '#8FCBAA', '#86B6DE', '#B4A3DC']
const RAINBOW_LEN = 720

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
/** 彩虹上第 f 圈的位置（0～1 一輪）的顏色，兩色之間慢慢變 */
export function rainbowAt(f: number): string {
  const n = RAINBOW.length
  const x = (((f % 1) + 1) % 1) * n
  const i = Math.floor(x)
  const a = hex(RAINBOW[i % n])
  const b = hex(RAINBOW[(i + 1) % n])
  const t = x - i
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`
}

/** 蓋印筆、點點筆的間距（邏輯座標） */
const TRAIL_GAP = 78
const TRAIL_SIZE = 64
/** 印章的大小（邏輯座標，畫紙 1000 寬）：1200×786 上大約 140 px */
export const STAMP_SIZE = 150

/**
 * 給 Ink 的 paint：有 brush 的筆畫怎麼畫。回 false 就照一般的筆畫。
 * w：畫紙的邏輯寬度（對稱筆以正中間為軸）。plain：Ink 一般的筆（perfect-freehand）。
 */
export function makePaint(w: number) {
  return (ctx: CanvasRenderingContext2D, s: Stroke, _last: boolean, plain: (s: Stroke) => void): boolean => {
    const [kind, arg = ''] = (s.brush ?? '').split(':')
    switch (kind) {
      case 'rainbow': {
        // 一段一段畫，每段的顏色看它在整筆的第幾個長度：畫得越長顏色變越多，點一下就是一個圓點
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.lineWidth = s.size
        if (s.pts.length < 2) {
          ctx.fillStyle = rainbowAt(0)
          ctx.beginPath()
          ctx.arc(s.pts[0].x, s.pts[0].y, s.size / 2, 0, Math.PI * 2)
          ctx.fill()
          return true
        }
        let len = 0
        for (let i = 1; i < s.pts.length; i++) {
          const a = s.pts[i - 1]
          const b = s.pts[i]
          len += Math.hypot(b.x - a.x, b.y - a.y)
          ctx.strokeStyle = rainbowAt(len / RAINBOW_LEN)
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
        return true
      }
      case 'mirror':
        plain(s)
        plain({ ...s, pts: s.pts.map((p) => ({ ...p, x: w - p.x })) })
        return true
      case 'dots': {
        const r = Math.max(10, s.size * 0.62)
        ctx.fillStyle = s.color
        for (const p of along(s.pts, r * 2.9)) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fill()
        }
        return true
      }
      case 'trail': {
        const names = arg.split(',').filter(Boolean)
        if (!names.length) return false
        along(s.pts, TRAIL_GAP).forEach((p, i) => drawEmoji(ctx, names[i % names.length], p.x, p.y, TRAIL_SIZE))
        return true
      }
      case 'stamp': {
        const p = s.pts[s.pts.length - 1]
        if (!arg || !p) return false
        drawEmoji(ctx, arg, p.x, p.y, STAMP_SIZE)
        return true
      }
      default:
        return false
    }
  }
}

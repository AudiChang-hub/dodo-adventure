import './press.css'

/**
 * 手指一按下就看得到反應（T-112，家長：「小朋友明明已經點了，但都沒反應」）。
 *
 * 量測（tests/toddler/t112-tap.spec.ts，修正前）：英文選擇題用 click 收答案，要放開才有反應；
 * 手指按著滑一點點（三歲很常見）click 就被瀏覽器取消，完全沒反應、也不算作答。題目剛出來 0.5 秒、答對稱讚中點的只有很輕的一聲，
 * 點在選項外一點點（15 px）英文、數學都毫無動靜。紙感螢幕更新慢，淡淡的變化也看不出來。
 *
 * 這裡在整個 App 掛一個 pointerdown（capture，在 React 之前、同步改 DOM，不等重新渲染）：
 * - 按到按鈕、選項（PRESSABLE）：馬上加 data-pressed，樣子是「被壓下去」（縮一點、深色外框，press.css），放開後至少留 0.14 秒；
 * - 按下的地方浮出一圈小波紋（一次就停，不循環），不管這一下算不算作答：「有碰到」。
 *   不能答的時候，各課照舊再加「看這裡」的圈圈（games/NotYet 的 ping，會把這一圈波紋收掉，不疊兩圈）。
 * 畫畫、描字的畫布不加（墨水本身就是反應）。
 */
const PRESSABLE = 'button, [role="button"], [data-press]'
/** 這些地方不出波紋：畫布（墨水就是反應）、自己會處理的地方 */
const SKIP = 'canvas, [data-paper], [data-no-ripple]'
/** 壓下去的樣子最少留多久（紙感螢幕要來得及畫出來） */
const MIN_PRESS_MS = 140
/** 波紋多久消失（跟 press.css 的動畫一樣長） */
const RIPPLE_MS = 450

let layer: HTMLDivElement | null = null
let lastRipple: HTMLElement | null = null
const pressed = new Map<HTMLElement, number>()

function getLayer() {
  if (layer?.isConnected) return layer
  layer = document.createElement('div')
  layer.className = 'tap-layer'
  layer.setAttribute('aria-hidden', 'true')
  document.body.appendChild(layer)
  return layer
}

function ripple(x: number, y: number) {
  const r = document.createElement('span')
  r.className = 'tap-ripple'
  r.style.left = `${x}px`
  r.style.top = `${y}px`
  getLayer().appendChild(r)
  lastRipple = r
  window.setTimeout(() => r.remove(), RIPPLE_MS + 50)
}

/** 這一下由各課自己給「看這裡」的圈圈：剛出來的波紋收掉，不疊兩圈 */
export function cancelRipple() {
  lastRipple?.remove()
  lastRipple = null
}

function release(el: HTMLElement) {
  const at = pressed.get(el)
  if (at == null) return
  pressed.delete(el)
  const left = MIN_PRESS_MS - (performance.now() - at)
  const off = () => {
    if (!pressed.has(el)) delete el.dataset.pressed
  }
  if (left > 0) window.setTimeout(off, left)
  else off()
}

let installed = false
export function installPress() {
  if (installed || typeof window === 'undefined') return
  installed = true
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const t = e.target
      if (!(t instanceof Element) || t.closest(SKIP)) return
      const el = t.closest<HTMLElement>(PRESSABLE)
      if (el && !el.hasAttribute('disabled')) {
        el.dataset.pressed = ''
        pressed.set(el, performance.now())
      }
      ripple(e.clientX, e.clientY)
    },
    { capture: true, passive: true },
  )
  const up = () => [...pressed.keys()].forEach(release)
  addEventListener('pointerup', up, { capture: true, passive: true })
  addEventListener('pointercancel', up, { capture: true, passive: true })
}

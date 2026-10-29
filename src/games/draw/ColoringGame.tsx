import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion, type TargetAndTransition } from 'motion/react'
import { Shell, type GameProps } from '../Shell'
import { CheckButton } from './Palette'
import { CrayonBox, CRAYONS, ERASER } from './CrayonBox'
import { BG, CrayonStroke, RegionMap, clearCanvas, setupCanvas, type CrayonPt } from './crayon'
import { PICTURES, type Picture } from './pictures'
import { svgThumb, saveDrawing } from './save'
import { HandArt, Hand, easeInOut, tween } from '../Demo'
import { game as gameDef } from '../../content/games'
import { markPlayed, pickPreferred, plays } from '../../lib/adaptive'
import { themeNow } from '../../lib/theme-play'
import { getSettings } from '../../lib/settings'
import { logAttempt, logTeach } from '../../lib/record'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../lines'
import { useIdle } from '../idle'
import { DUR, EASE, ms } from '../../ui/motion'

const W = 1000
const H = 600
const PAPER = '#FBF8F2'
const INK = '#2E2A25'
/** 塗了線稿面積的這個比例以上，完成鍵才出現（再加上要按住 0.6 秒），畫到一半誤按也不會結束 */
const READY = 0.15
/** 筆離開螢幕後這段時間內的手指觸碰當成手掌，忽略 */
const PALM_MS = 800

// 筆在附近嗎（接觸、懸停或剛離開）：用筆塗的時候，手掌碰到畫紙不會畫出一筆
let penAt = -Infinity
let penDown = false
if (typeof window !== 'undefined')
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover'])
    window.addEventListener(
      t,
      (e) => {
        const pe = e as PointerEvent
        if (pe.pointerType !== 'pen') return
        penAt = performance.now()
        if (pe.type === 'pointerdown') penDown = true
        else if (pe.type === 'pointerup' || pe.type === 'pointercancel') penDown = false
      },
      { capture: true, passive: true },
    )
const penNear = () => penDown || performance.now() - penAt < PALM_MS

/** 完成後讓圖「活起來」一下：車子往前開一點、豆豆跳一下、魚游一下…都只動一次、慢慢停 */
const ALIVE: Record<string, TargetAndTransition> = {
  car: { x: ['0%', '7%'], y: ['0%', '-0.6%', '0%', '-0.6%', '0%'], transition: { duration: 1.6, ease: EASE.inOut } },
  bus: { x: ['0%', '7%'], y: ['0%', '-0.6%', '0%', '-0.6%', '0%'], transition: { duration: 1.6, ease: EASE.inOut } },
  firetruck: { x: ['0%', '7%'], y: ['0%', '-0.6%', '0%', '-0.6%', '0%'], transition: { duration: 1.6, ease: EASE.inOut } },
  dodo: { y: ['0%', '-4%', '0%'], transition: { duration: 0.9, ease: EASE.out, delay: 0.5 } },
  fish: { x: ['0%', '-3%', '0%'], rotate: [0, -3, 0], transition: { duration: 1.6, ease: EASE.inOut } },
  balloons: { y: ['0%', '-5%'], transition: { duration: 2, ease: EASE.out } },
  umbrella: { rotate: [0, -4, 3, 0], transition: { duration: 1.8, ease: EASE.inOut } },
  house: { scale: [1, 1.03, 1], transition: { duration: 1.2, ease: EASE.inOut } },
}
const ORIGIN: Record<string, string> = { umbrella: '50% 92%', house: '50% 90%' }
const VEHICLES = new Set(['car', 'bus', 'firetruck'])

interface StrokeLog {
  c: string
  /** 下筆的那一塊（'bg' 是線稿外的紙） */
  r: string
  pen: number
  p: number[][]
}

/**
 * 蠟筆著色：孩子用手指或筆在線稿上真的塗（不是點一下就填滿）。
 * - 預設「幫忙不塗出線」（家長區設定）：一筆被限制在下筆的那一塊，怎麼亂塗都好看；關掉就完全自由。
 * - 線稿的黑線永遠在最上層；右邊是 8 支蠟筆和橡皮擦。
 * - 沒有對錯。塗了夠多（READY）完成鍵才出現，而且要按住，畫到一半誤碰不會結束。
 * - 第一次玩先示範：手拿起一支蠟筆，在一塊區域裡來回塗（真的蠟筆筆觸），再換孩子。
 * - 完成後圖活起來一下，存進作品集（縮圖是孩子塗的筆觸＋線稿）。
 * 主題式冒險塗主題的圖（公車旅行塗公車）。
 */
export function ColoringGame({ gameId, onDone, onExit }: GameProps) {
  const def = gameDef(gameId)
  const [pic] = useState<Picture>(() => pickPreferred(PICTURES.filter((p) => p.id === themeNow()?.coloring), PICTURES, (p) => `coloring:${p.id}`))
  const regions = useMemo(() => new RegionMap(pic, W, H), [pic])
  const [tool, setTool] = useState<string>(CRAYONS[0].hex)
  const [ready, setReady] = useState(false)
  const [handOn, setHandOn] = useState(false)
  const [demoFade, setDemoFade] = useState(false)
  const [hint, setHint] = useState<{ x: number; y: number } | null>(null)
  const [alive, setAlive] = useState(false)

  const layer = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLCanvasElement>(null)
  const live = useRef<HTMLCanvasElement>(null)
  const demoCv = useRef<HTMLCanvasElement>(null)
  const fig = useRef<HTMLCanvasElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const handEl = useRef<HTMLDivElement>(null)

  const cur = useRef<CrayonStroke | null>(null)
  const active = useRef<{ id: number; type: string; region: string } | null>(null)
  const log = useRef<StrokeLog[]>([])
  const toolRef = useRef(tool)
  toolRef.current = tool
  const busy = useRef(true)
  const live_ = useRef(true)
  const finishing = useRef(false)
  const readySaid = useRef(false)
  const t0 = useRef(performance.now())
  const firstPlay = useRef(plays(def.id) === 0)
  const idle = useIdle()

  // ── 畫布：固定 1000 × 600 的邏輯座標；解析度照畫紙在螢幕上的大小（最多 2 倍），之後縮放不用重畫 ──
  useEffect(() => {
    const el = paper.current
    if (!el) return
    // clientWidth 不受 transform 影響（換畫面的縮放中量也是最後的大小）
    const res = Math.max(1, Math.min(2, (el.clientWidth * (devicePixelRatio || 1)) / W))
    for (const c of [base.current, live.current, demoCv.current, fig.current]) if (c) setupCanvas(c, W, H, res)
  }, [])

  /**
   * 螢幕座標 → 疊加層（整個遊戲區）裡的 left／top。換畫面時整個畫面會從 0.6 倍長到 1 倍（ui/motion.ts），
   * getBoundingClientRect 量到的是縮放後的大小，所以要除以疊加層當下的縮放（量到的寬 ÷ offsetWidth）。
   */
  const screenToLayer = (sx: number, sy: number) => {
    const el = layer.current!
    const l = el.getBoundingClientRect()
    const k = l.width / (el.offsetWidth || l.width || 1)
    return { x: (sx - l.left) / k, y: (sy - l.top) / k }
  }
  /** 邏輯座標 → 疊加層裡的位置：示範的手用 */
  const toLayer = (x: number, y: number) => {
    const r = paper.current!.getBoundingClientRect()
    return screenToLayer(r.left + (x / W) * r.width, r.top + (y / H) * r.height)
  }
  const placeHand = (p: { x: number; y: number }) => {
    const h = handEl.current
    if (!h) return
    h.style.left = `${p.x}px`
    h.style.top = `${p.y}px`
  }
  const tapHand = () => handEl.current?.firstElementChild?.animate([{ transform: 'scale(1)' }, { transform: 'translateY(6%) scale(0.88)' }, { transform: 'scale(1)' }], { duration: 340 })

  /** 示範：手拿起一支蠟筆，在最大的那一塊裡來回塗（真的蠟筆筆觸，限制在那一塊裡），再換孩子 */
  const showMe = async () => {
    const s = performance.now()
    await say('teach.watch.dodo')
    if (!live_.current) return
    const pickHex = CRAYONS.find((c) => c.id === (VEHICLES.has(pic.id) ? 'blue' : 'green'))!.hex
    const el = box.current?.querySelector<HTMLElement>(`[data-crayon="${pickHex}"]`)
    const er = el?.getBoundingClientRect()
    const at = er ? screenToLayer(er.left + er.width * 0.22, er.top + er.height * 0.55) : toLayer(W * 0.9, H * 0.5)
    placeHand({ x: at.x + 30, y: at.y + 60 })
    setHandOn(true)
    await tween(520, (f) => placeHand({ x: at.x + 30 * (1 - f), y: at.y + 60 * (1 - f) }), () => live_.current, easeInOut)
    if (!live_.current) return
    tapHand()
    sfx.pop()
    setTool(pickHex)
    await wait(420)
    if (!live_.current) return

    // 在那一塊的中間來回塗：一列一列往下，像孩子塗顏色一樣
    const id = regions.biggest()
    const b = regions.bounds(id) ?? { x: 400, y: 200, w: 200, h: 200 }
    const ix = b.x + b.w * 0.22
    const iw = b.w * 0.56
    const iy = b.y + b.h * 0.3
    const ih = b.h * 0.4
    const rows = 4
    const zig: { x: number; y: number }[] = []
    for (let k = 0; k <= rows; k++) {
      const y = iy + (ih * k) / rows
      zig.push(k % 2 ? { x: ix + iw, y } : { x: ix, y }, k % 2 ? { x: ix, y: y + ih / rows / 2 } : { x: ix + iw, y: y + ih / rows / 2 })
    }
    const from = toLayer(zig[0].x, zig[0].y)
    await tween(620, (f) => placeHand({ x: at.x + (from.x - at.x) * f, y: at.y + (from.y - at.y) * f }), () => live_.current, easeInOut)
    if (!live_.current) return
    const ctx = demoCv.current!.getContext('2d')!
    const stroke = new CrayonStroke(ctx, { color: pickHex, clip: (c) => regions.clip(c, id) }, { ...zig[0], p: 0.5 })
    void say('d.color.demo')
    // 折線上等速走：先算每一段的長度
    const segs = zig.slice(1).map((p, i) => Math.hypot(p.x - zig[i].x, p.y - zig[i].y))
    const total = segs.reduce((a, c) => a + c, 0)
    await tween(
      2600,
      (f) => {
        let d = f * total
        let i = 0
        while (i < segs.length - 1 && d > segs[i]) d -= segs[i++]
        const t = Math.min(1, d / segs[i])
        const p = { x: zig[i].x + (zig[i + 1].x - zig[i].x) * t, y: zig[i].y + (zig[i + 1].y - zig[i].y) * t }
        stroke.to({ ...p, p: 0.5 })
        placeHand(toLayer(p.x, p.y))
      },
      () => live_.current,
    )
    if (!live_.current) return
    await wait(300)
    setHandOn(false)
    // 示範的那幾筆慢慢淡掉，畫紙還給孩子
    setDemoFade(true)
    await say('teach.turn.dodo')
    if (!live_.current) return
    void logTeach({ station: 'draw', game: def.id, itemId: pic.id, skill: `coloring:${pic.id}`, level: 1, ms: Math.round(performance.now() - s) })
  }

  const start = async () => {
    busy.current = firstPlay.current
    await say(def.intro)
    if (!live_.current) return
    if (firstPlay.current) {
      await showMe()
      if (!live_.current) return
      busy.current = false
    }
    t0.current = performance.now()
    // 閒置：15 秒再唸一次 → 再 15 秒一隻手在最大的那一塊上輕輕點 → 之後安靜
    idle.start({
      repeat: () => void say(def.intro),
      hint: () => {
        const b = regions.bounds(regions.biggest())
        if (b) setHint({ x: ((b.x + b.w / 2) / W) * 100, y: ((b.y + b.h / 2) / H) * 100 })
      },
    })
  }

  useEffect(() => {
    live_.current = true
    // 延到下一輪才開始：StrictMode 開發模式會先掛載、卸載再掛載一次，避免兩條流程同時跑
    const boot = window.setTimeout(() => {
      markPlayed(def.id)
      void start()
    }, 0)
    return () => {
      live_.current = false
      clearTimeout(boot)
      idle.stop()
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 塗 ────────────────────────────────────────────────────────
  /**
   * 手指 → 畫紙的邏輯座標。每一個事件都重新量畫紙「當下」在螢幕上的位置和大小（含換畫面時的縮放），
   * 所以畫面還在淡入（帶一點點推近）的時候就開始塗，筆觸也落在手指底下；下筆在哪一塊（clip）也用這個座標判斷。
   * 畫布本身是固定的 1000 × 600 邏輯座標、用 CSS 撐滿畫紙，縮放只影響顯示，不用重量、不用重畫。
   */
  const toPt = (e: PointerEvent | React.PointerEvent): CrayonPt => {
    const r = paper.current!.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
      p: e.pointerType === 'pen' ? Math.max(0.05, Math.min(1, e.pressure || 0.5)) : 0.5,
    }
  }

  const drop = () => {
    cur.current = null
    active.current = null
    if (live.current) clearCanvas(live.current)
  }

  const down = (e: React.PointerEvent) => {
    if (busy.current) return
    if (e.pointerType === 'touch' && penNear() && !active.current) return
    // 手掌先碰到、筆才下來：筆優先，丟掉手掌那一筆（還在 live 層，沒有留下來）
    if (active.current && e.pointerType === 'pen' && active.current.type !== 'pen' && toolRef.current !== ERASER) drop()
    if (active.current) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 指標已經消失時拿不到 capture，照樣可以畫 */
    }
    const p = toPt(e)
    const eraser = toolRef.current === ERASER
    // 下筆的那一塊：「幫忙不塗出線」開著才拿來 clip；關著也記下來（作答紀錄看孩子塗了哪幾塊）
    const region = regions.at(p.x, p.y)
    const clip = getSettings().coloringHelp
    active.current = { id: e.pointerId, type: e.pointerType, region }
    // 蠟筆先畫在 live 層，放開才併進 base；橡皮擦直接擦 base
    const ctx = (eraser ? base.current! : live.current!).getContext('2d')!
    cur.current = new CrayonStroke(ctx, { color: eraser ? '#000' : toolRef.current, eraser, pen: e.pointerType === 'pen', clip: clip ? (c) => regions.clip(c, region) : null }, p)
    setHint(null)
    idle.poke()
  }

  const move = (e: React.PointerEvent) => {
    if (!active.current || e.pointerId !== active.current.id || !cur.current) return
    const n = e.nativeEvent
    const evs = n.getCoalescedEvents?.() ?? []
    for (const ev of evs.length ? evs : [n]) cur.current.to(toPt(ev))
  }

  const up = (e: React.PointerEvent) => {
    const a = active.current
    const s = cur.current
    if (!a || e.pointerId !== a.id || !s) return
    if (!s.opts.eraser) {
      base.current!.getContext('2d')!.drawImage(live.current!, 0, 0, W, H)
      clearCanvas(live.current!)
    }
    // 存下來的筆畫：每隔 5 單位取一點，作品集同步到雲端時不會太大
    const pts: number[][] = []
    let last: CrayonPt | null = null
    for (const p of s.pts)
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 5 || p === s.pts[s.pts.length - 1]) {
        pts.push([Math.round(p.x), Math.round(p.y), Math.round(p.p * 100) / 100])
        last = p
      }
    log.current.push({ c: s.opts.eraser ? ERASER : s.opts.color, r: a.region, pen: a.type === 'pen' ? 1 : 0, p: pts })
    cur.current = null
    active.current = null
    idle.poke()
    const cov = regions.coverage(base.current!)
    const ok = cov.any >= READY
    if (ok !== ready) setReady(ok)
    if (ok && !readySaid.current) {
      readySaid.current = true
      void say('d.color.ready')
    }
  }

  // ── 完成 ──────────────────────────────────────────────────────
  const finish = async () => {
    if (finishing.current || busy.current) return
    finishing.current = true
    busy.current = true
    idle.stop()
    setHint(null)
    sfx.done()
    const cov = regions.coverage(base.current!)
    const thumb = svg.current ? await svgThumb(svg.current, 480, PAPER, base.current!) : ''
    const strokes = log.current
    const help = getSettings().coloringHelp
    await saveDrawing(def.id, `著色：${pic.title}`, thumb, { picture: pic.id, help, strokes })
    const colors = new Set(strokes.filter((s) => s.c !== ERASER).map((s) => s.c))
    void logAttempt({
      station: 'draw',
      game: def.id,
      itemId: pic.id,
      skill: `coloring:${pic.id}`,
      phase: 'quiz',
      level: 1,
      options: [],
      answer: '',
      taps: [],
      // 塗鴉沒有對錯
      firstTryCorrect: true,
      attempts: 1,
      responseMs: Math.round(performance.now() - t0.current),
      hintUsed: false,
      metrics: {
        regions: pic.regions.length,
        regionsTouched: new Set(strokes.map((s) => s.r).filter((r) => r && r !== BG)).size,
        coverage: Math.round(cov.inside * 100) / 100,
        strokes: strokes.length,
        colorsUsed: colors.size,
        erases: strokes.filter((s) => s.c === ERASER).length,
        penStrokes: strokes.filter((s) => s.pen).length,
        help: help ? 1 : 0,
      },
    })
    if (!live_.current) return
    // 圖活起來：把塗在線稿裡的筆觸搬到會動的那一層，紙上（線稿外）的留在原地
    const f = fig.current!
    const fx = f.getContext('2d')!
    fx.save()
    for (const a of regions.areas) fx.fill(a.path)
    fx.globalCompositeOperation = 'source-in'
    fx.drawImage(base.current!, 0, 0, W, H)
    fx.restore()
    const bx = base.current!.getContext('2d')!
    bx.save()
    bx.globalCompositeOperation = 'destination-out'
    for (const a of regions.areas) bx.fill(a.path)
    bx.restore()
    // 線稿裡的空白處是紙色（車子開走時，後面露出的是乾淨的紙，不是半透明的筆觸）
    fx.save()
    fx.globalCompositeOperation = 'destination-over'
    fx.fillStyle = PAPER
    for (const a of regions.areas) fx.fill(a.path)
    fx.restore()
    setAlive(true)
    await Promise.all([say(...(VEHICLES.has(pic.id) ? ['d.color.beep'] : []), 'd.color.done'), wait(1800)])
    await wait(ms(DUR.arm))
    if (live_.current) onDone({ items: 1, firstTry: 1 })
  }

  const full: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' }
  const eyes = new Set(pic.ink ?? [])
  const uid = 'cg' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <Shell station="draw" mood="idle" onExit={onExit} hideHost demo={handOn}>
      <div ref={layer} style={{ position: 'absolute', inset: 0 }}>
        <div style={{ position: 'absolute', inset: '0 16% 4% 3%', containerType: 'size' }}>
          <div
            ref={paper}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              translate: '-50% -50%',
              width: 'min(100cqw, 166.6cqh)',
              aspectRatio: `${W} / ${H}`,
              borderRadius: 30,
              background: PAPER,
              boxShadow: '0 8px 0 rgba(46,42,37,.08)',
              overflow: 'hidden',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              cursor: 'crosshair',
            }}
          >
            <canvas ref={base} style={{ ...full, pointerEvents: 'none' }} />
            <canvas ref={live} style={{ ...full, pointerEvents: 'none' }} />
            <motion.canvas
              ref={demoCv}
              style={{ ...full, pointerEvents: 'none' }}
              initial={false}
              animate={{ opacity: demoFade ? 0 : 1 }}
              transition={{ duration: 0.6, ease: EASE.in }}
            />
            {/* 會動的那一層：完成後線稿＋線稿裡的筆觸一起活起來 */}
            <motion.div
              style={{ ...full, pointerEvents: 'none', transformOrigin: ORIGIN[pic.id] ?? '50% 50%' }}
              initial={false}
              animate={alive ? (ALIVE[pic.id] ?? { scale: [1, 1.03, 1], transition: { duration: 1.2, ease: EASE.inOut } }) : {}}
            >
              <canvas ref={fig} style={full} />
              <svg ref={svg} viewBox={`0 0 ${W} ${H}`} style={full} aria-hidden="true">
                <g transform={pic.transform} fill="none" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
                  {/* 後畫的區域蓋在前面的上面（肚子在身體上、輪子在車身上）：前面區域的線被後面的區域遮住的那一段不畫，
                      跟以前整塊塗滿紙色時看起來一樣，但不用填色，底下的蠟筆看得到 */}
                  <defs>
                    {pic.regions.slice(0, -1).map((rg, i) => (
                      <mask key={rg.id} id={`${uid}-m${i}`} maskUnits="userSpaceOnUse" x={-1000} y={-1000} width={4000} height={4000}>
                        <rect x={-1000} y={-1000} width={4000} height={4000} fill="#fff" stroke="none" />
                        {pic.regions.slice(i + 1).map((o) => (
                          <path key={o.id} d={o.d} fill="#000" stroke="none" />
                        ))}
                      </mask>
                    ))}
                  </defs>
                  {pic.regions.map((rg, i) => (
                    <path key={rg.id} d={rg.d} data-region={rg.id} mask={i < pic.regions.length - 1 ? `url(#${uid}-m${i})` : undefined} />
                  ))}
                  {pic.deco.map((d, i) =>
                    eyes.has(i) ? (
                      <motion.path
                        key={i}
                        d={d}
                        fill={INK}
                        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                        initial={false}
                        animate={alive ? { scaleY: [1, 0.12, 1, 1, 0.12, 1] } : {}}
                        transition={{ duration: 1.4, times: [0, 0.1, 0.2, 0.6, 0.7, 0.8], ease: 'easeInOut' }}
                      />
                    ) : (
                      <path key={i} d={d} />
                    ),
                  )}
                </g>
              </svg>
            </motion.div>
            <AnimatePresence>{hint && <Hand key="hint" x={hint.x} y={hint.y} beckon size="11cqmin" />}</AnimatePresence>
          </div>
        </div>
        <CrayonBox
          ref={box}
          value={tool}
          onChange={(v) => {
            if (busy.current) return
            setTool(v)
          }}
          done={ready && !alive ? <CheckButton onPress={() => void finish()} /> : null}
        />
        {/* 示範的手：位置每一幀直接改 style（跟著蠟筆走，不能有彈簧的延遲） */}
        <motion.div
          ref={handEl}
          className="demo-hand"
          style={{ width: '9cqmin', left: 0, top: 0 }}
          initial={false}
          animate={{ opacity: handOn ? 1 : 0 }}
          transition={{ duration: handOn ? DUR.opaque : DUR.exitFade, ease: 'easeOut' }}
        >
          <svg viewBox="0 0 64 84" width="100%" style={{ display: 'block', overflow: 'visible', transformOrigin: '34% 8%' }} aria-hidden="true">
            <HandArt />
          </svg>
        </motion.div>
      </div>
    </Shell>
  )
}

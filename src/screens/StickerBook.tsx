import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from 'react'
import { AnimatePresence, motion, type TargetAndTransition } from 'motion/react'
import { Dino } from '../art/Dino'
import { BackButton } from '../ui/Back'
import { HomeIcon } from '../games/Shell'
import { Hand } from '../games/Demo'
import { ArtSticker, Sticker } from '../ui/StickerArt'
import { useTaps } from '../ui/tap'
import { album, onAchieve, type OwnedSticker } from '../lib/achievements'
import { hasLine } from '../content/lines'
import { stickerBridge, stickerZh } from '../content/lines-stickers'
import { artOf } from '../content/sticker-art'
import { zhClipReady } from '../lib/words'
import { say, sfx } from '../lib/audio'
import { BOARD_PEEK, newestFirst, reactionOf, tiltOf, type Move, type Reaction } from './sticker-book'
import './stickers.css'

/**
 * 貼紙本（T-132，2026-11-11 家長：「要有貼紙本，這樣才可以回頭去看現在自己有哪些貼紙了」）。
 * 首頁牆上的貼紙板點進去。只看不改：只讀 lib/achievements 的 album()，不挑貼紙、不寫任何資料（連「看過了」都不記）。
 * - 他拿到的每一張都在，最新的在最前面（左上角），一張張大大的，像貼在一本有活頁圈的本子上。
 * - 點一張：每一類有自己的小動作（恐龍踩踩、車子開、動物跳…），豆豆念它的名字，有中文音檔的詞念單字三明治（獅子 → Lion.）。
 *   同一張再點換一個反應：轉一圈＋狀聲詞（Vroom, vroom!），再點是不說話的亮晶晶（T-139，sticker-book.ts 的 reactionOf）。
 * - 還沒有貼紙：本子上是三張虛線的剪影（等著被貼上去的位置），沒有字；豆豆說「Your stickers will go here!」，接著帶他去玩：
 *   小房子（返回鍵）亮一圈、豆豆的腳印從他腳下一路走到小房子。點灰貼紙、點本子空白處、點豆豆都有回應（T-135，
 *   AI 小男生盲測 becf39a：空的貼紙本點了都沒反應，32 秒就走了、沒再回來）：貼紙晃一下、豆豆跳一下、腳印再走一次、說一句「去玩」。
 * - 一進來（T-140，AI 小男生盲測 73d57c7：點了 8 次還是「不知道要做什麼」）：豆豆說「Look! Your stickers! Tap one!」，
 *   最新的那張亮起來，說完示範的手指過來點它一下（它就照第一下的樣子動、念名字）。孩子一碰本子示範就收起來；亮光留到他自己點了一張。
 * - 返回鍵點一下回首頁（NAV-1）。
 */

// 貼紙本的內容只在拿到新貼紙時才變：快照存起來給 useSyncExternalStore（每次 render 都 new 陣列會一直重畫）
let snap: OwnedSticker[] | null = null
onAchieve(() => {
  snap = null
})
const read = () => (snap ??= newestFirst(album()))

/** 他有的貼紙，最新的在最前面 */
export const useStickers = () => useSyncExternalStore(onAchieve, read)

/** 還沒有貼紙時的剪影：三種孩子最熟的主角（只是外框，不代表他會拿到哪一張） */
const GHOSTS = [
  { art: 't-rex', seed: 11, tilt: -7 },
  { art: 'sauropod', seed: 23, tilt: 4 },
  { art: 'dragon', seed: 37, tilt: -2 },
]

/** 空的貼紙本：說過一句之後這段時間內再點，只動畫面不重講（連點、手掌壓不會一直打斷豆豆） */
const POKE_TALK_MS = 2600
/** 開場示範（T-140）：介紹句說完多久手指出現、出現後多久點下去、點完多久收起來 */
const DEMO_IN_MS = 250
const DEMO_TAP_MS = 750
const DEMO_OUT_MS = 1200
/** 從豆豆腳下走到小房子的腳印數 */
const STEPS = 5

export function StickerBook() {
  const list = useStickers()
  const empty = !list.length
  // 空的貼紙本被點了：n 是第幾下（每一下動畫重播一次），g 是點到哪一張灰貼紙（-1：空白處或豆豆，三張一起跳）
  const [poke, setPoke] = useState({ n: 0, g: -1 })
  const talked = useRef(-Infinity)
  const tap = useTaps()

  // 有貼紙時的開場示範（T-140）：hand 0 沒有手、1 手指過來、2 點下去；demo 每加 1，最新那張就照第一下的樣子動一次
  const [hand, setHand] = useState(0)
  const [demo, setDemo] = useState(0)
  // 孩子碰過本子了：示範收起來、不再出現；亮光留到他自己點了一張貼紙（tapped）
  const touched = useRef(false)
  const [tapped, setTapped] = useState(false)

  useEffect(() => {
    let alive = true
    const timers: number[] = []
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && !touched.current && fn(), ms))
    if (list.length)
      // 介紹那一句說完，手指才過來（不跟豆豆搶）
      void say('stk.book.hi').then(() => {
        later(DEMO_IN_MS, () => setHand(1))
        later(DEMO_IN_MS + DEMO_TAP_MS, () => {
          setHand(2)
          setDemo((d) => d + 1)
        })
        later(DEMO_IN_MS + DEMO_TAP_MS + DEMO_OUT_MS, () => setHand(0))
      })
    else void say('stk.book.empty', 'stk.book.go')
    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
    // 進來說一次就好
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 孩子碰了本子（點、捲、手掌壓都算）：示範的手指馬上收起來 */
  const grab = () => {
    touched.current = true
    setHand(0)
  }

  /** 空的貼紙本：點哪裡都有回應（動一下＋豆豆說「去玩」，小房子再亮一次）。只看不改：不寫任何資料 */
  const nudge = (g: number) => {
    sfx.pop()
    setPoke((p) => ({ n: p.n + 1, g }))
    const now = performance.now()
    if (now - talked.current < POKE_TALK_MS) return
    talked.current = now
    void say(`stk.book.poke.${poke.n % 2}`)
  }

  return (
    <div className={`screen sticker-book${empty ? ' is-empty' : ''}`}>
      <div className="sb-back" data-hint={empty ? '' : undefined}>
        {/* 空的時候：小房子外面一圈暖光一直留著（一進來呼吸三下，stickers.css），被點一下就再往外亮一圈（帶他回去玩） */}
        {empty && <span className="sb-halo" aria-hidden="true" />}
        {empty && poke.n > 0 && <motion.span key={poke.n} className="sb-pulse" aria-hidden="true" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: [0.95, 1.4], opacity: [0, 0.9, 0] }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }} />}
        <BackButton label="回首頁">
          <HomeIcon />
        </BackButton>
      </div>

      {/* 空的時候：豆豆的腳印從他腳下一路走到小房子（下 → 上），淡淡地留著；被點一下就再走一次 */}
      {empty && (
        <div className="sb-trail" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <motion.span
              key={`${poke.n}-${i}`}
              className="sb-step"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0, 0.9, 0.32], scale: [0.6, 1.1, 1] }}
              transition={{ duration: 0.9, delay: (poke.n ? 0.1 : 2.2) + i * 0.16, ease: 'easeOut' }}
            >
              <Foot />
            </motion.span>
          ))}
        </div>
      )}

      <motion.div
        key={empty ? poke.n : 0}
        className="sb-host"
        aria-hidden="true"
        animate={empty && poke.n ? { y: [0, -26, 0, -8, 0], rotate: [0, -6, 0] } : {}}
        transition={{ duration: 0.75, ease: 'easeOut' }}
        {...(empty ? tap('dodo', () => nudge(-1)) : {})}
      >
        <Dino who="dodo" mood="happy" size="100%" />
      </motion.div>

      <motion.section className="sb-album" aria-label="貼紙本" initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 20 }}>
        <span className="sb-rings" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
        {list.length ? (
          <>
            {/* 給大人看的小字：孩子看貼紙就好 */}
            <p className="sb-count" aria-hidden="true">
              貼紙本<b>{list.length}</b>張
            </p>
            <div className="sb-scroll" onPointerDownCapture={grab}>
              <ul className="sb-grid">
                {list.map((s, i) =>
                  i ? (
                    <Item key={s.key} s={s} i={i} onTap={() => setTapped(true)} />
                  ) : (
                    <Item key={s.key} s={s} i={i} onTap={() => setTapped(true)} glow={!tapped} hand={hand} demo={demo} />
                  ),
                )}
              </ul>
            </div>
          </>
        ) : (
          <EmptyPage poke={poke} onPoke={nudge} />
        )}
      </motion.section>
    </div>
  )
}

/**
 * 還沒有貼紙的那一頁：三張灰色剪影。整頁都收點（點在剪影上或空白處都算），按下去那一下記住是哪一張剪影：
 * 點到的那一張晃一下＋一圈暖光；點空白處（或點豆豆）三張依序跳一下。
 */
function EmptyPage({ poke, onPoke }: { poke: { n: number; g: number }; onPoke: (g: number) => void }) {
  const tap = useTaps()
  const hit = useRef(-1)
  const h = tap('page', () => onPoke(hit.current))
  return (
    <div
      className="sb-empty"
      data-empty=""
      data-nudge={poke.n}
      {...h}
      onPointerDown={(e: PointerEvent) => {
        hit.current = Number((e.target as Element).closest<HTMLElement>('[data-ghost]')?.dataset.ghost ?? -1)
        h.onPointerDown(e)
      }}
    >
      {GHOSTS.map((g, i) => {
        const me = poke.n > 0 && (poke.g === i || poke.g < 0)
        return (
          <motion.span
            key={g.art}
            className="sb-ghost"
            data-ghost={i}
            style={{ rotate: `${g.tilt}deg` }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.2 + i * 0.12 }}
          >
            {me && poke.g === i && <motion.span key={`r${poke.n}`} className="sb-ring" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: [0.7, 1.28], opacity: [0, 0.8, 0] }} transition={{ duration: 0.65, ease: 'easeOut' }} />}
            <motion.span
              key={me ? poke.n : 0}
              className="sb-ghost-art"
              animate={me ? (poke.g === i ? { rotate: [0, -12, 10, -6, 3, 0], scale: [1, 1.1, 1] } : { y: [0, -18, 0, -5, 0] }) : {}}
              transition={{ duration: poke.g === i ? 0.7 : 0.6, ease: 'easeInOut', delay: me && poke.g < 0 ? i * 0.09 : 0 }}
            >
              <ArtSticker art={g.art} seed={g.seed} ghost />
            </motion.span>
          </motion.span>
        )
      })}
    </div>
  )
}

/** 豆豆的腳印（三趾）：顏色跟紙上的線一樣淡 */
function Foot() {
  return (
    <svg viewBox="0 0 40 44" width="100%" aria-hidden="true">
      <ellipse cx="20" cy="30" rx="11" ry="12" fill="currentColor" />
      <ellipse cx="8" cy="12" rx="4.6" ry="6.5" transform="rotate(-22 8 12)" fill="currentColor" />
      <ellipse cx="20" cy="7" rx="4.6" ry="6.5" fill="currentColor" />
      <ellipse cx="32" cy="12" rx="4.6" ry="6.5" transform="rotate(22 32 12)" fill="currentColor" />
    </svg>
  )
}

/** 每一種動作（sticker-book.ts 的 Move）：只動貼紙本身，動完回到原位 */
const MOVES: Record<Move, { a: TargetAndTransition; dur: number }> = {
  stomp: { a: { y: [0, -16, 0, -10, 0], scaleY: [1, 1.06, 0.88, 1.04, 1], scaleX: [1, 0.96, 1.1, 0.98, 1], rotate: [0, -4, 4, -2, 0] }, dur: 0.8 },
  drive: { a: { x: [0, -10, 30, 30, 0], rotate: [0, -3, 2, 2, 0], y: [0, 0, -3, 0, 0] }, dur: 0.95 },
  hop: { a: { y: [0, -30, 0, -18, 0, -7, 0], scaleY: [1, 1.05, 0.92, 1.03, 0.96, 1, 1] }, dur: 0.95 },
  swim: { a: { x: [0, 12, -12, 8, 0], y: [0, -6, 0, -4, 0], rotate: [0, 10, -10, 6, 0] }, dur: 1.05 },
  flutter: { a: { rotate: [0, -12, 12, -12, 12, -5, 0], y: [0, -10, -6, -12, -4, 0, 0], scale: [1, 1.05, 1, 1.05, 1, 1, 1] }, dur: 0.85 },
  squish: { a: { scaleX: [1, 1.22, 0.88, 1.08, 0.97, 1], scaleY: [1, 0.8, 1.14, 0.94, 1.03, 1] }, dur: 0.75 },
  float: { a: { y: [0, -34, -28, -34, 0], rotate: [0, -5, 5, -3, 0] }, dur: 1.3 },
  wobble: { a: { rotate: [0, -14, 12, -9, 6, -3, 0] }, dur: 0.9 },
  bounce: { a: { scale: [1, 1.2, 0.95, 1.04, 1], rotate: [0, -9, 7, -3, 0], y: [0, -14, 0, -3, 0] }, dur: 0.7 },
  twirl: { a: { rotate: [0, 360], scale: [1, 1.18, 1], y: [0, -10, 0] }, dur: 0.85 },
  sparkle: { a: { scale: [1, 1.1, 0.97, 1] }, dur: 0.6 },
}

/** 每一種動作配的聲音（都是溫和的短音，lib/audio.ts 的 sfx） */
const MOVE_SFX: Record<Move, () => void> = {
  stomp: () => sfx.clack(),
  drive: () => sfx.toot(),
  hop: () => sfx.boing(),
  swim: () => sfx.whoosh(),
  flutter: () => sfx.tap(),
  squish: () => sfx.pop(),
  float: () => sfx.star(),
  wobble: () => sfx.boing(),
  bounce: () => sfx.pop(),
  twirl: () => sfx.whoosh(),
  sparkle: () => [0, 2, 4].forEach((i, k) => setTimeout(() => sfx.chime(i), k * 110)),
}

/** 亮晶晶：六顆小星星從貼紙中間往外飄 */
const SPARKS = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 - Math.PI / 2
  return { x: Math.cos(a) * 96, y: Math.sin(a) * 96, d: i * 0.03 }
})

/** 一張貼紙點了要念的台詞：名字（有中文音檔的詞加單字三明治）、那一類的狀聲詞、或不說話 */
function voiceOf(s: OwnedSticker, r: Reaction): string[] {
  if (r.voice === 'none') return []
  const art = s.def.art
  if (r.voice === 'act') {
    const cat = art ? artOf(art)?.cat : undefined
    return cat && hasLine(`stk.act.${cat}`) ? [`stk.act.${cat}`] : []
  }
  const keys = s.def.lines.filter(hasLine)
  const zh = stickerZh(art)
  if (art && zh && keys.length && hasLine(stickerBridge(art)) && zhClipReady(zh)) keys.push(stickerBridge(art))
  return keys
}

/** 一張貼紙：點了照 reactionOf 換著動、念名字或狀聲詞。手指按下、放開就算（ui/tap.ts），滑動捲本子不算點 */
interface ItemProps {
  s: OwnedSticker
  i: number
  /** 孩子自己點了（不是示範） */
  onTap: () => void
  /** 最新的那張：亮起來（T-140），孩子自己點了一張就收 */
  glow?: boolean
  /** 開場示範的手指：0 沒有、1 過來、2 點下去 */
  hand?: number
  /** 開場示範點了幾下：每加 1 就照第一下的樣子動、念名字一次（不算進孩子自己的三下一輪） */
  demo?: number
}

function Item({ s, i, onTap, glow, hand = 0, demo = 0 }: ItemProps) {
  // 孩子自己點了幾下（三下一輪，sticker-book.ts 的 reactionOf）
  const [n, setN] = useState(0)
  // 正在播的反應：k 每次加 1 重播一次（孩子點的、示範點的都算）
  const [play, setPlay] = useState<{ k: number; r: Reaction | null }>({ k: 0, r: null })
  const tap = useTaps()
  const art = s.def.art
  const cat = art ? artOf(art)?.cat : undefined
  const now = play.r
  const react = (r: Reaction) => {
    MOVE_SFX[r.move]()
    setPlay((p) => ({ k: p.k + 1, r }))
    const keys = voiceOf(s, r)
    if (keys.length) void say(...keys)
  }
  const pop = () => {
    onTap()
    react(reactionOf(cat, n))
    setN((x) => x + 1)
  }
  // 示範的手指點下去：照孩子點第一下的樣子動、念名字（他跟著點，會得到一樣的回應）
  useEffect(() => {
    if (demo) react(reactionOf(cat, 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo])
  return (
    <li className="sb-slot" style={{ '--tilt': `${tiltOf(s.key)}deg` } as CSSProperties}>
      {glow && <span className="sb-new" aria-hidden="true" />}
      <motion.button
        className="sb-item"
        data-sticker={s.key}
        data-ts={s.ts}
        data-move={now?.move}
        data-demo={demo || undefined}
        aria-label={s.def.zh}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.15 + Math.min(i, 15) * 0.03 }}
        {...tap(s.key, pop)}
      >
        {play.k > 0 && <motion.span key={`r${play.k}`} className="sb-ring" aria-hidden="true" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: [0.7, 1.32], opacity: [0, 0.8, 0] }} transition={{ duration: 0.65, ease: 'easeOut' }} />}
        {now?.move === 'sparkle' &&
          SPARKS.map((p, k) => (
            <motion.span
              key={`${play.k}-${k}`}
              className="sb-spark"
              aria-hidden="true"
              initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
              animate={{ x: p.x, y: p.y, scale: [0.3, 1, 0.6], opacity: [0, 1, 0], rotate: 90 }}
              transition={{ duration: 0.8, delay: p.d, ease: 'easeOut' }}
            />
          ))}
        <motion.span
          key={play.k}
          className="sb-sticker"
          animate={now ? MOVES[now.move].a : {}}
          transition={{ duration: now ? MOVES[now.move].dur : 0, ease: 'easeInOut' }}
        >
          <Sticker def={s.def} />
        </motion.span>
      </motion.button>
      <AnimatePresence>
        {hand > 0 && (
          <span className="sb-hand" aria-hidden="true">
            <Hand x={54} y={50} tap={hand - 1} size="54%" cuff="#F2C9A8" />
          </span>
        )}
      </AnimatePresence>
    </li>
  )
}

/** 首頁牆上的貼紙板裡面：最新的幾張貼紙疊成一小把（最新的在中間、最上面；還沒有就是一張虛線的剪影） */
export function BoardStickers() {
  const list = useStickers()
  const peek = list.slice(0, BOARD_PEEK)
  if (!peek.length)
    return (
      <span className="sbd-stk is-ghost">
        <ArtSticker art={GHOSTS[0].art} seed={GHOSTS[0].seed} ghost />
      </span>
    )
  return (
    <>
      {peek.map((s, i) => (
        <span key={s.key} className="sbd-stk" style={{ '--tilt': `${tiltOf(s.key) * 1.6}deg`, zIndex: BOARD_PEEK - i, order: i === 0 ? 1 : i === 1 ? 0 : 2 } as CSSProperties}>
          <Sticker def={s.def} />
        </span>
      ))}
    </>
  )
}

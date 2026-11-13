import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from 'react'
import { AnimatePresence, motion, type TargetAndTransition } from 'motion/react'
import { Dino } from '../art/Dino'
import { BackButton } from '../ui/Back'
import { Hand } from '../games/Demo'
import { ArtSticker, Sticker } from '../ui/StickerArt'
import { useTaps } from '../ui/tap'
import { album, onAchieve, type OwnedSticker } from '../lib/achievements'
import { go } from '../lib/nav'
import { LESSONS, SUBJECTS, type Subject } from '../lessons'
import { hasLine } from '../content/lines'
import type { Speaker } from '../content/lines'
import { stickerBridge, stickerZh } from '../content/lines-stickers'
import { artOf } from '../content/sticker-art'
import { zhClipReady } from '../lib/words'
import { say, sfx } from '../lib/audio'
import { HomeIcon } from '../games/Shell'
import { BOARD_PEEK, nextToShow, newestFirst, reactionOf, tiltOf, trayOf, type Move, type Reaction } from './sticker-book'
import './stickers.css'

/**
 * 貼紙本（T-132，2026-11-11 家長：「要有貼紙本，這樣才可以回頭去看現在自己有哪些貼紙了」）。
 * 首頁牆上的貼紙板點進去。只看不改：只讀 lib/achievements 的 album()，不挑貼紙、不寫任何資料（連「看過了」都不記）。
 * - 他拿到的每一張都在，最新的在最前面（左上角），一張張大大的，像貼在一本有活頁圈的本子上。
 * - 點一張：每一類有自己的小動作（恐龍踩踩、車子開、動物跳…），豆豆念它的名字，有中文音檔的詞念單字三明治（獅子 → Lion.）。
 *   同一張再點換一個反應：轉一圈＋狀聲詞（Vroom, vroom!），再點是不說話的亮晶晶（T-139，sticker-book.ts 的 reactionOf）。
 * - 還沒有貼紙：本子上是三張虛線的剪影（等著被貼上去的位置），沒有字；豆豆說「Your stickers will go here!」，接著帶他去玩：
 *   剪影下面就是三堂課的門（跟首頁一樣的恐龍、一樣的顏色），豆豆的腳印從他腳下走到門前，示範的手指指著豆豆的門，點了一步就進課
 *   （T-141，AI 小男生盲測 c9bb003：以前是叫他點亮起來的小房子＝返回鍵，回首頁還要再找門，看起來就是「按返回離開」）。
 *   返回鍵不亮，就只是返回。點灰貼紙、點本子空白處、點豆豆都有回應（T-135）：貼紙晃一下、門跳一下、腳印再走一次、說一句「去玩」。
 * - 一進來（T-140）：豆豆說「Look! Your stickers! Tap one!」，最新的那張亮起來，說完示範的手指過來點它一下（它就照第一下的樣子動、念名字）。
 * - 點下去有累積（T-141，盲測 c9bb003：第一張發光他點了別張，後來「點了好多次都一樣」就走了）：
 *   這一趟點過的貼紙角上有一顆小星星（只在畫面上，不寫資料）；亮光跟著他走，永遠在下一張還沒點過的上面。
 *   同一張點到第二輪，豆豆也跟著跳。
 * - 帶他去點亮的那張、看得到累積（T-143，盲測 9231aa6：亮的那張他一直沒點，點了 10 下說「一直點都不知道要幹嘛」）：
 *   亮的那一張自己隔幾秒輕輕彈一下；示範完手指不走，一直輕輕點著它；他點了別張，手指 2.5 秒後回到亮的那張等他（不說話）；
 *   他照著點過兩次就不再回來。照著點了亮的那張，噴出一圈大星星（跟點別張不一樣）。
 *   豆豆頭上有星星盒：每點一張新的，一顆星星從貼紙飛進去、叮一聲一格比一格高；5 格滿了大家一起跳、豆豆說 Hooray，清空再來一輪。
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
/** 示範（T-140、T-141）：手指出現後多久點下去、點完多久變成輕輕點著等他 */
const DEMO_TAP_MS = 750
const DEMO_OUT_MS = 1200
/** 空的貼紙本：門上的手指等多久收起來 */
const DEMO_WAIT_MS = 5000
/** 介紹句說完多久手指出現 */
const DEMO_IN_MS = 250
/**
 * T-143（盲測 9231aa6：亮的那張他一直沒去點，點了 10 下說「一直點都不知道要幹嘛」）：
 * 他點了別張，手指過這麼久就回到亮的那一張、一直輕輕點著等他（不說話，不蓋過他點的那張）；
 * 他照著點了亮的那一張這麼多次，就是懂了，手指不再回來（亮光和晃動還在）
 */
const LEAD_BACK_MS = 2500
const LEAD_UNTIL = 2
/** 從豆豆腳下走到門前的腳印數 */
const STEPS = 4
/** 星星從貼紙飛進星星盒要多久（毫秒） */
const FLY_MS = 650

/** 三堂課的門的顏色（跟首頁 screens/Home.tsx 的 TINT 一樣） */
const TINT: Record<Speaker, { door: string; deep: string; glass: string }> = {
  dodo: { door: '#8FCBAA', deep: '#5FA883', glass: '#E3F2E9' },
  momo: { door: '#A3C4E4', deep: '#6F9CC8', glass: '#E6EFF8' },
  bobo: { door: '#F0B088', deep: '#D38A5E', glass: '#FBE8DA' },
}

/** 示範的手指：0 沒有、1 過來、2 點下去、3 輕輕點著等他（不算示範中） */
type HandPhase = 0 | 1 | 2 | 3

/** 飛進星星盒的星星：從那一張貼紙的中間飛到第 slot 格（座標是貼紙本畫面裡的） */
interface Flight {
  id: number
  from: { x: number; y: number }
  to: { x: number; y: number }
}

export function StickerBook() {
  const list = useStickers()
  const empty = !list.length
  // 空的貼紙本被點了：n 是第幾下（每一下動畫重播一次），g 是點到哪一張灰貼紙（-1：空白處或豆豆，三張一起跳）
  const [poke, setPoke] = useState({ n: 0, g: -1 })
  const talked = useRef(-Infinity)
  const tap = useTaps()
  const root = useRef<HTMLDivElement>(null)

  // 這一趟點過的貼紙（只在畫面上，不寫資料）；亮光、示範都跟著「下一張還沒點過的」
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set())
  const target = nextToShow(list, seen)
  // 星星盒（T-143）：每點一張新的亮一格，滿了慶祝、清空再來一輪；cleared 是清空時點過幾張
  const [cleared, setCleared] = useState(-1)
  const tray = trayOf(seen.size, list.length, cleared)
  const [flights, setFlights] = useState<Flight[]>([])
  // 示範的手指在哪一張、第幾個動作；demo.n 每加 1，那一張就照第一下的樣子動一次
  const [hand, setHand] = useState<{ key: string | null; p: HandPhase }>({ key: null, p: 0 })
  const [demo, setDemo] = useState<{ key: string | null; n: number }>({ key: null, n: 0 })
  // 豆豆跳一下（星星盒滿了、同一張點到第二輪）；cheer：星星盒滿了，大家一起跳
  const [hop, setHop] = useState(0)
  const [cheer, setCheer] = useState(0)
  // 空的貼紙本：示範的手指指著豆豆的門
  const [goHand, setGoHand] = useState(0)

  const touched = useRef(false)
  const followed = useRef(0)
  const timers = useRef<number[]>([])
  const targetRef = useRef(target)
  targetRef.current = target
  const handRef = useRef(hand)
  handRef.current = hand

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms))
  // 點貼紙的回饋（星星飛、歡呼、叮叮）：他碰本子也不收，離開畫面才收
  const fxTimers = useRef<number[]>([])
  const fx = (ms: number, fn: () => void) => fxTimers.current.push(window.setTimeout(fn, ms))
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  /** 一進來示範一次：手指過來 → 點下去（那一張動、念名字）→ 一直輕輕點著等他（他一碰本子才收） */
  const runDemo = () => {
    const key = targetRef.current
    if (!key) return
    clearTimers()
    setHand({ key, p: 1 })
    later(DEMO_TAP_MS, () => {
      setHand({ key, p: 2 })
      setDemo((d) => ({ key, n: d.n + 1 }))
    })
    later(DEMO_TAP_MS + DEMO_OUT_MS, () => setHand({ key, p: 3 }))
  }

  useEffect(() => {
    let alive = true
    if (list.length)
      // 介紹那一句說完，手指才過來（不跟豆豆搶）；他已經自己點了就不示範，手指等一下會自己回到亮的那張
      void say('stk.book.hi').then(() => {
        if (alive && !touched.current) later(DEMO_IN_MS, runDemo)
      })
    else
      void say('stk.book.empty', 'stk.book.go').then(() => {
        if (!alive) return
        setGoHand(1)
        later(DEMO_TAP_MS, () => setGoHand(2))
        later(DEMO_TAP_MS + DEMO_OUT_MS + DEMO_WAIT_MS, () => setGoHand(0))
      })
    return () => {
      alive = false
      clearTimers()
      fxTimers.current.forEach(clearTimeout)
    }
    // 進來說一次就好
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 孩子碰了本子（點、捲、手掌壓都算）：示範的手指馬上收起來；過一下手指回到（那時候）亮的那一張，輕輕點著等他，不說話。
   * 他照著點過亮的那張 LEAD_UNTIL 次就不再回來
   */
  const grab = () => {
    touched.current = true
    clearTimers()
    if (handRef.current.p) setHand({ key: null, p: 0 })
    later(LEAD_BACK_MS, () => {
      const key = targetRef.current
      if (key && followed.current < LEAD_UNTIL) setHand({ key, p: 3 })
    })
  }

  /**
   * 孩子自己點了一張（n：這一張他點過幾下；lit：點的是亮的那一張）：記號、亮光往下走；
   * 新的一張：一顆星星從它飛進星星盒，叮一聲一格比一格高；星星盒滿了大家一起跳、豆豆說 Hooray，再清空來一輪。
   * 同一張點到第二輪豆豆也跟著跳
   */
  const onTap = (key: string, n: number, lit: boolean) => {
    if (lit) followed.current++
    if (n >= 3) setHop((h) => h + 1)
    if (seen.has(key)) return
    const next = new Set(seen).add(key)
    setSeen(next)
    const t = trayOf(next.size, list.length, cleared)
    // 星星從貼紙飛進那一格
    const box = root.current?.getBoundingClientRect()
    const from = root.current?.querySelector(`[data-sticker="${CSS.escape(key)}"]`)?.getBoundingClientRect()
    const to = root.current?.querySelectorAll('.sb-tray-slot')[t.filled - 1]?.getBoundingClientRect()
    // 手機直式沒有星星盒（藏起來了）：不飛
    if (box && from && to?.width) {
      const id = performance.now()
      const mid = (r: DOMRect) => ({ x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top })
      setFlights((f) => [...f, { id, from: mid(from), to: mid(to) }])
      fx(FLY_MS + 50, () => setFlights((f) => f.filter((x) => x.id !== id)))
    }
    fx(FLY_MS, () => sfx.chime(Math.min(9, t.filled * 2)))
    if (t.full) {
      // 讓這一張自己的名字先念完再歡呼，歡呼完星星盒清空（全部都點過了就留著滿滿的）
      fx(1600, () => {
        setCheer((c) => c + 1)
        setHop((h) => h + 1)
        sfx.milestone()
        void say('stk.book.all')
      })
      if (next.size < list.length) fx(4200, () => setCleared(next.size))
    }
  }

  /** 空的貼紙本：點哪裡都有回應（動一下＋豆豆說「去玩」，門跳一下）。只看不改：不寫任何資料 */
  const nudge = (g: number) => {
    sfx.pop()
    setPoke((p) => ({ n: p.n + 1, g }))
    const now = performance.now()
    if (now - talked.current < POKE_TALK_MS) return
    talked.current = now
    void say(`stk.book.poke.${poke.n % 2}`)
  }

  const hostMove = empty ? (poke.n ? { k: poke.n, a: { y: [0, -26, 0, -8, 0], rotate: [0, -6, 0] } } : null) : hop ? { k: hop, a: { y: [0, -30, 0, -10, 0], rotate: [0, -5, 4, 0] } } : null

  return (
    <div ref={root} className={`screen sticker-book${empty ? ' is-empty' : ''}`} data-cheer={cheer || undefined}>
      <div className="sb-back">
        <BackButton label="回首頁">
          <HomeIcon />
        </BackButton>
      </div>

      <motion.div
        key={hostMove?.k ?? 0}
        className="sb-host"
        aria-hidden="true"
        data-hop={hop || undefined}
        animate={hostMove ? hostMove.a : {}}
        transition={{ duration: 0.75, ease: 'easeOut' }}
        {...(empty ? tap('dodo', () => nudge(-1)) : {})}
      >
        <Dino who="dodo" mood={cheer ? 'cheer' : 'happy'} size="100%" />
      </motion.div>

      {/* 星星盒（T-143）：豆豆頭上一排格子，每點一張新的貼紙飛進一顆星（從下往上），滿了慶祝、清空再來 */}
      {!empty && tray.size > 0 && (
        <div className={`sb-tray${tray.full ? ' is-full' : ''}`} data-round={tray.round} aria-hidden="true">
          {Array.from({ length: tray.size }, (_, i) => (
            <span key={`${tray.round}-${i}`} className={`sb-tray-slot${i < tray.filled ? ' is-on' : ''}`}>
              <AnimatePresence>
                {i < tray.filled && (
                  <motion.span
                    className="sb-tray-star"
                    initial={{ scale: 0, rotate: -60 }}
                    animate={tray.full ? { scale: [1, 1.3, 1], rotate: [0, 15, 0] } : { scale: 1, rotate: 0 }}
                    transition={tray.full ? { duration: 0.7, delay: 1.6 + i * 0.08 } : { type: 'spring', stiffness: 380, damping: 13, delay: FLY_MS / 1000 - 0.08 }}
                  >
                    <StarIcon />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          ))}
        </div>
      )}
      {flights.map((f) => (
        <motion.span
          key={f.id}
          className="sb-fly"
          aria-hidden="true"
          initial={{ x: f.from.x, y: f.from.y, scale: 0.4, opacity: 0 }}
          animate={{ x: [f.from.x, (f.from.x + f.to.x) / 2, f.to.x], y: [f.from.y, Math.min(f.from.y, f.to.y) - 90, f.to.y], scale: [0.4, 1.5, 1], opacity: [0, 1, 1] }}
          transition={{ duration: FLY_MS / 1000, ease: 'easeInOut' }}
        >
          <StarIcon />
        </motion.span>
      ))}

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
                {list.map((s, i) => (
                  <Item
                    key={s.key}
                    s={s}
                    i={i}
                    onTap={(n, lit) => onTap(s.key, n, lit)}
                    seen={seen.has(s.key)}
                    glow={s.key === target}
                    hand={hand.key === s.key ? hand.p : 0}
                    demo={demo.key === s.key ? demo.n : 0}
                    cheer={cheer}
                  />
                ))}
              </ul>
            </div>
          </>
        ) : (
          <EmptyPage poke={poke} onPoke={nudge} hand={goHand} />
        )}
      </motion.section>
    </div>
  )
}

/**
 * 還沒有貼紙的那一頁：上面三張灰色剪影，下面三堂課的門。
 * 剪影那一層整頁都收點（點在剪影上或空白處都算），按下去那一下記住是哪一張剪影：
 * 點到的那一張晃一下＋一圈暖光；點空白處（或點豆豆）三張依序跳一下，門也跟著跳。
 * 門在剪影那一層的旁邊（不是裡面）：點門不會被當成點空白處。
 */
function EmptyPage({ poke, onPoke, hand }: { poke: { n: number; g: number }; onPoke: (g: number) => void; hand: number }) {
  const tap = useTaps()
  const hit = useRef(-1)
  const h = tap('page', () => onPoke(hit.current))
  const open = (s: Subject) => {
    sfx.pop()
    go({ name: 'lesson', subject: s })
  }
  return (
    <div className="sb-empty" data-empty="" data-nudge={poke.n}>
      <div
        className="sb-page"
        {...h}
        onPointerDown={(e: PointerEvent) => {
          hit.current = Number((e.target as Element).closest<HTMLElement>('[data-ghost]')?.dataset.ghost ?? -1)
          h.onPointerDown(e)
        }}
      >
        <div className="sb-ghosts">
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
      </div>

      {/* 去玩：豆豆的腳印從他腳下一路走到門前（左 → 右），接著是三堂課的門；被點一下腳印再走一次、門跳一下 */}
      <div className="sb-go">
        <span className="sb-trail" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <motion.span
              key={`${poke.n}-${i}`}
              className="sb-step"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0, 0.95, 0.4], scale: [0.6, 1.1, 1] }}
              transition={{ duration: 0.9, delay: (poke.n ? 0.1 : 2.2) + i * 0.16, ease: 'easeOut' }}
            >
              <Foot />
            </motion.span>
          ))}
        </span>
        <div className="sb-go-row">
          {SUBJECTS.map((s, i) => {
            const d = LESSONS[s]
            const t = TINT[d.host]
            return (
              <motion.button
                key={s}
                className="sb-door"
                data-go={s}
                aria-label={d.title}
                style={{ '--door': t.door, '--door-deep': t.deep, '--glass': t.glass } as CSSProperties}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 160, damping: 17, delay: 0.5 + i * 0.1 }}
                {...tap(`go-${s}`, () => open(s))}
              >
                <motion.span
                  key={poke.n}
                  className="sb-door-arch"
                  animate={poke.n ? { y: [0, -16, 0, -5, 0] } : {}}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.35 + i * 0.09 }}
                >
                  <span className="sb-door-glass">
                    <Dino who={d.host} mood="idle" size="100%" flip={i === 2} />
                  </span>
                </motion.span>
                {/* 示範的手指指著豆豆的門（說話的是豆豆） */}
                <AnimatePresence>
                  {i === 0 && hand > 0 && (
                    <span className="sb-hand" aria-hidden="true">
                      <Hand x={58} y={58} tap={hand - 1} beckon={hand > 1} size="46%" cuff="#F2C9A8" />
                    </span>
                  )}
                </AnimatePresence>
              </motion.button>
            )
          })}
        </div>
      </div>
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

/** 照著點了亮的那一張：十顆大一點的星星噴得更遠（T-143） */
const BURST = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2
  return { x: Math.cos(a) * 140, y: Math.sin(a) * 140, d: (i % 2) * 0.05 }
})

/** 星星（星星盒、飛進去的那一顆） */
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="100%" aria-hidden="true">
      <path d="M12 2.6l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.4l-5.4 2.9 1.1-6.1L3.2 9l6.1-.8z" fill="currentColor" strokeLinejoin="round" />
    </svg>
  )
}

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
  /** 孩子自己點了（不是示範）；n 是點這一下之前他點過這一張幾下，lit 是點的時候它是亮的那一張 */
  onTap: (n: number, lit: boolean) => void
  /** 這一趟點過了：角上一顆小星星（T-141） */
  seen?: boolean
  /** 下一張還沒點過的：亮起來（T-140、T-141），點了就換下一張亮 */
  glow?: boolean
  /** 示範的手指：0 沒有、1 過來、2 點下去、3 輕輕點著等他 */
  hand?: number
  /** 示範點了幾下：每加 1 就照第一下的樣子動、念名字一次（不算進孩子自己的三下一輪） */
  demo?: number
  /** 全部點過一次的慶祝：每加 1 大家依序跳一下（不說話，豆豆說 Hooray） */
  cheer?: number
}

function Item({ s, i, onTap, seen, glow, hand = 0, demo = 0, cheer = 0 }: ItemProps) {
  // 孩子自己點了幾下（三下一輪，sticker-book.ts 的 reactionOf）
  const [n, setN] = useState(0)
  // 正在播的反應：k 每次加 1 重播一次（孩子點的、示範點的都算）
  const [play, setPlay] = useState<{ k: number; r: Reaction | null; delay?: number }>({ k: 0, r: null })
  // 照著點了亮的那一張（T-143）：多一圈大星星往外噴，跟點別張不一樣
  const [popN, setPopN] = useState(0)
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
    onTap(n, !!glow)
    if (glow) setPopN((x) => x + 1)
    react(reactionOf(cat, n))
    setN((x) => x + 1)
  }
  // 示範的手指點下去：照孩子點第一下的樣子動、念名字（他跟著點，會得到一樣的回應）
  useEffect(() => {
    if (demo) react(reactionOf(cat, 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo])
  // 慶祝：從第一張開始依序跳一下（跳的聲音由貼紙本統一放一次）
  useEffect(() => {
    if (cheer) setPlay((p) => ({ k: p.k + 1, r: { move: 'bounce', voice: 'none' }, delay: Math.min(i, 15) * 0.06 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cheer])
  return (
    <li className={`sb-slot${seen ? ' is-seen' : ''}${glow ? ' is-target' : ''}`} style={{ '--tilt': `${tiltOf(s.key)}deg` } as CSSProperties}>
      {glow && <span className="sb-new" aria-hidden="true" />}
      <motion.button
        className="sb-item"
        data-sticker={s.key}
        data-ts={s.ts}
        data-move={now?.move}
        // 示範中只標手指過來、點下去那一下（T-141：以前示範完還一直標著，探針把整段都當成示範中）
        data-demo={hand === 1 || hand === 2 ? '1' : undefined}
        data-demos={demo || undefined}
        data-pop={popN || undefined}
        aria-label={s.def.zh}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.15 + Math.min(i, 15) * 0.03 }}
        {...tap(s.key, pop)}
      >
        {play.k > 0 && <motion.span key={`r${play.k}`} className="sb-ring" aria-hidden="true" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: [0.7, 1.32], opacity: [0, 0.8, 0] }} transition={{ duration: 0.65, ease: 'easeOut', delay: play.delay ?? 0 }} />}
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
        {popN > 0 &&
          BURST.map((p, k) => (
            <motion.span
              key={`p${popN}-${k}`}
              className="sb-spark is-big"
              aria-hidden="true"
              initial={{ x: 0, y: 0, scale: 0.3, opacity: 0 }}
              animate={{ x: p.x, y: p.y, scale: [0.3, 1.3, 0.7], opacity: [0, 1, 0], rotate: 120 }}
              transition={{ duration: 0.9, delay: p.d, ease: 'easeOut' }}
            />
          ))}
        <motion.span
          key={play.k}
          className="sb-sticker"
          animate={now ? MOVES[now.move].a : {}}
          transition={{ duration: now ? MOVES[now.move].dur : 0, ease: 'easeInOut', delay: play.delay ?? 0 }}
        >
          <Sticker def={s.def} />
        </motion.span>
      </motion.button>
      {/* 這一趟點過了：角上一顆小星星（只在畫面上，不寫資料） */}
      <AnimatePresence>
        {seen && (
          <motion.span className="sb-seen" aria-hidden="true" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 14, delay: 0.25 }}>
            <svg viewBox="0 0 24 24" width="100%">
              <path d="M12 2.6l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.4l-5.4 2.9 1.1-6.1L3.2 9l6.1-.8z" fill="currentColor" strokeLinejoin="round" />
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {hand > 0 && (
          <span className="sb-hand" aria-hidden="true">
            <Hand x={54} y={50} tap={hand === 1 ? 0 : 1} beckon={hand === 3} size="54%" cuff="#F2C9A8" />
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

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Dino } from '../art/Dino'
import { Emoji } from '../art/Emoji'
import { ArtSticker } from './StickerArt'
import { AlbumPage, PER_PAGE } from './Album'
import { album, nextPick, pickOptions, placeSticker, type OwnedSticker } from '../lib/achievements'
import type { Stk } from '../lib/sticker-pick'
import { say, sfx, hushSpeech, stopSpeech } from '../lib/audio'
import { wait } from '../games/lines'
import { FADE, overlay } from './motion'
import './sticker-ui.css'

/**
 * 挑貼紙（2026-10-28 家長：「跳出很多的樣式讓他選，然後歸戶到貼紙本上」）。
 * 1. 蓋著的那一張翻開（集滿的卡片上就是它）→ 2. 攤開 6 張隨機的貼紙 → 3. 點一下聽名字、再點一下（或按打勾）收下
 * → 4. 貼紙飛到中間，貼紙本的那一頁滑上來，貼紙「啪」地貼上去。還有沒挑的就再來一次。
 * - 「再看別的」：換一批隨機的 6 張。
 * - 「等一下再選」：留著這一張，貼紙本、今日回顧都可以再挑；不會卡住流程。
 * - 很久沒選：20 秒、40 秒豆豆溫和地鼓勵，**不會替他選**；90 秒都沒碰畫面（可能走開了）才安靜地收起來，留到下次再選。
 */
const IDLE_1_MS = 20_000
const IDLE_2_MS = 40_000
const IDLE_CLOSE_MS = 90_000
/** 一張張攤開的間隔 */
const DEAL_S = 0.07

type Phase = 'reveal' | 'choose' | 'place'

const keyOf = (s: Stk) => `${s.art}:${s.seed}`
/** 每個位置固定一點點歪，像攤在桌上 */
const TILT = [-4, 3, -2, 4, -3, 2]

export function StickerPicker({ onDone }: { onDone: () => void }) {
  const [pick, setPick] = useState(nextPick)
  const [phase, setPhase] = useState<Phase>('reveal')
  const [batch, setBatch] = useState<Stk[]>([])
  const [deal, setDeal] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [placed, setPlaced] = useState<{ stk: Stk; page: OwnedSticker[]; key: string } | null>(null)
  const [nudge, setNudge] = useState(0)
  const seenArts = useRef(new Set<string>())
  const toldAgain = useRef(false)
  const first = useRef(true)
  const live = useRef(true)
  const lastTouch = useRef(performance.now())
  const done = useRef(false)
  const finish = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  useEffect(
    () => () => {
      live.current = false
      stopSpeech()
    },
    [],
  )

  // 沒有待選的貼紙（例如從別的地方挑完了）：直接收起來
  useEffect(() => {
    if (!pick) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick])

  const newBatch = (feature?: Stk) => {
    const b = pickOptions(seenArts.current, feature)
    b.forEach((s) => seenArts.current.add(s.art))
    setBatch(b)
    setDeal((d) => d + 1)
    setSel(null)
  }

  // 1. 翻開蓋著的那一張，2. 攤開 6 張
  useEffect(() => {
    if (phase !== 'reveal' || !pick) return
    let alive = true
    ;(async () => {
      sfx.pop()
      void say(first.current ? 'stk.pick.hi' : 'stk.pick.another')
      first.current = false
      await wait(1150)
      if (!alive || !live.current) return
      newBatch(pick.feature)
      setPhase('choose')
      lastTouch.current = performance.now()
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pick])

  // 很久沒選：溫和地鼓勵兩次，不替他選；很久很久都沒碰才收起來（留著下次再選）
  useEffect(() => {
    if (phase !== 'choose') return
    const said = new Set<number>()
    const t = window.setInterval(() => {
      const idle = performance.now() - lastTouch.current
      if (idle > IDLE_CLOSE_MS) {
        clearInterval(t)
        void say('stk.pick.later').then(finish)
      } else if (idle > IDLE_2_MS && !said.has(2)) {
        said.add(2)
        setNudge((n) => n + 1)
        void say('stk.pick.idle.1')
      } else if (idle > IDLE_1_MS && !said.has(1)) {
        said.add(1)
        setNudge((n) => n + 1)
        void say('stk.pick.idle.0')
      } else if (idle < IDLE_1_MS) said.clear()
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const tapOption = (i: number) => {
    if (phase !== 'choose') return
    if (sel === i) return keep()
    sfx.tap()
    setSel(i)
    hushSpeech()
    const name = `stk.art.${batch[i].art}`
    void say(...(toldAgain.current ? [name] : [name, 'stk.pick.again']))
    toldAgain.current = true
  }

  const more = () => {
    if (phase !== 'choose') return
    sfx.whoosh()
    hushSpeech()
    newBatch()
    void say('stk.pick.more')
  }

  const later = () => {
    if (phase !== 'choose') return
    sfx.tap()
    hushSpeech()
    setPhase('place')
    void say('stk.pick.later').then(finish)
  }

  // 3–4. 收下：貼紙飛到中間 → 貼紙本的那一頁滑上來 → 啪地貼上去
  const keep = async () => {
    if (sel == null || phase !== 'choose') return
    const stk = batch[sel]
    hushSpeech()
    sfx.correct()
    const m = placeSticker(stk)
    if (!m) return finish()
    const all = album()
    const idx = all.findIndex((x) => x.key === m.id)
    const page = all.slice(Math.floor(idx / PER_PAGE) * PER_PAGE, Math.floor(idx / PER_PAGE) * PER_PAGE + PER_PAGE)
    setPhase('place')
    setPlaced({ stk, page, key: m.id })
    await say(`stk.art.${stk.art}`, 'stk.pick.keep')
    await wait(600)
    if (!live.current) return
    const next = nextPick()
    if (next) {
      setPlaced(null)
      seenArts.current = new Set()
      setBatch([])
      setPick(next)
      setPhase('reveal')
      return
    }
    finish()
  }

  if (!pick) return null
  return (
    // 疊加層：整個挑貼紙的畫面一次淡入、一次淡出（ui/motion.ts 的 overlay）
    <motion.div
      className="picker"
      variants={overlay}
      initial="initial"
      animate="enter"
      exit="exit"
      onPointerDown={() => (lastTouch.current = performance.now())}
    >
      <div className="pk-glow" aria-hidden="true" />

      {/* 1. 蓋著的那一張翻開 */}
      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div key={`rv${keyOf(pick.feature)}`} className="pk-reveal" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0, transition: { duration: 0.3 } }}>
            <motion.div className="pk-flip" initial={{ rotateY: 0 }} animate={{ rotateY: 180 }} transition={{ delay: 0.35, duration: 0.6, ease: [0.45, 0, 0.25, 1] }}>
              <span className="pk-face is-back">
                <ArtSticker art={pick.feature.art} seed={pick.feature.seed} ghost />
              </span>
              <span className="pk-face is-front">
                <ArtSticker art={pick.feature.art} seed={pick.feature.seed} />
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. 攤開的 6 張 */}
      {batch.length > 0 && (
        <div className={`pk-grid${sel != null ? ' has-sel' : ''}${phase === 'place' ? ' is-placing' : ''}`}>
          <AnimatePresence mode="popLayout">
            {batch.map((s, i) => (
              <motion.button
                key={`${deal}:${keyOf(s)}`}
                className={`pk-opt${sel === i ? ' is-sel' : ''}`}
                aria-label={`貼紙 ${i + 1}`}
                style={{ '--tilt': `${TILT[i]}deg` } as CSSProperties}
                initial={{ scale: 0.3, opacity: 0, y: 40, rotate: TILT[i] * 4 }}
                animate={
                  phase === 'place'
                    ? sel === i
                      ? { scale: 0, opacity: 0, transition: { duration: 0.25 } }
                      : { scale: 0.8, opacity: 0, transition: { duration: 0.25 } }
                    : { scale: sel === i ? 1.12 : sel != null ? 0.92 : 1, opacity: sel != null && sel !== i ? 0.5 : 1, y: sel === i ? -10 : 0, rotate: sel === i ? 0 : TILT[i] }
                }
                exit={{ scale: 0.4, opacity: 0, y: -20, transition: { duration: 0.22, delay: i * 0.03 } }}
                transition={{ type: 'spring', stiffness: 280, damping: 20, delay: sel == null && phase === 'choose' ? i * DEAL_S : 0, opacity: FADE }}
                onClick={() => tapOption(i)}
              >
                {sel === i && <span className="pk-halo" aria-hidden="true" />}
                <ArtSticker art={s.art} seed={s.seed} />
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 4. 收進貼紙本：那一頁滑上來，新的那張啪地貼上 */}
      <AnimatePresence>
        {placed && (
          <motion.div key="place" className="pk-place" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="pk-hero" initial={{ scale: 1.2, y: 0, opacity: 1 }} animate={{ scale: [1.2, 1.35, 0.5], y: ['0vh', '-4vh', '18vh'], opacity: [1, 1, 0] }} transition={{ duration: 0.9, times: [0, 0.45, 1], ease: 'easeInOut' }}>
              <ArtSticker art={placed.stk.art} seed={placed.stk.seed} />
            </motion.div>
            <motion.div className="pk-book" initial={{ y: '70vh', rotate: 3 }} animate={{ y: 0, rotate: -1 }} transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.35 }}>
              <AlbumPage items={placed.page} landing={placed.key} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 右邊一排按鈕：收下（選了才出現）、再看別的、等一下再選 */}
      {phase === 'choose' && (
        <div className="pk-side">
          <AnimatePresence>
            {sel != null && (
              <motion.button key="ok" className="pk-btn is-ok" aria-label="就選這張" initial={{ scale: 0 }} animate={{ scale: [1, 1.06, 1] }} exit={{ scale: 0 }} transition={{ scale: { duration: 0.9, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' } }} onClick={() => void keep()}>
                <svg viewBox="0 0 48 48" width="52%" aria-hidden="true">
                  <path d="M11 25 L20 34 L37 15" fill="none" stroke="#FBF8F2" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.button>
            )}
          </AnimatePresence>
          <motion.button className="pk-btn" aria-label="再看別的貼紙" whileTap={{ scale: 0.92 }} onClick={more}>
            <span className="pk-btn-pic">
              <Emoji name="counterclockwise-arrows-button" />
            </span>
          </motion.button>
          <motion.button key={`later${nudge}`} className="pk-btn is-later" aria-label="等一下再選" whileTap={{ scale: 0.92 }} animate={nudge > 1 ? { scale: [1, 1.1, 1] } : {}} transition={{ duration: 0.8 }} onClick={later}>
            <svg viewBox="0 0 48 48" width="46%" aria-hidden="true">
              <path d="M17 11 L31 24 L17 37" fill="none" stroke="#FBF8F2" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        </div>
      )}

      <div className="pk-host">
        <Dino who="dodo" mood={phase === 'place' ? 'cheer' : 'happy'} size="100%" />
      </div>
      <p className="coplay-hint pk-hint" aria-hidden="true">
        <span className="coplay-tag">陪玩</span>
        讓他自己挑：點一下聽名字，再點一下（或按打勾）就收進貼紙本。繞圈的箭頭換一批；最下面的箭頭是等一下再選（貼紙會留著）。
      </p>
    </motion.div>
  )
}

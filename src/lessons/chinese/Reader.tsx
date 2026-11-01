import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sayClip, sfx } from '../../lib/audio'
import { wait } from '../../games/lines'
import { firstFinger } from '../../games/NotYet'
import { EASE } from '../../ui/motion'
import { hasClip, pieces, plain, zhClip, type ZhText } from './data'
import { Pic } from './Pic'
import type { HostTap } from './Lesson'

/** 課文行與行之間停多久（gen_zh_breezy.py 的試聽全文也是 0.6 秒） */
const LINE_GAP_MS = 600
/** 第一次念完、第二次開始前 */
const PASS_GAP_MS = 1400
/** 一開始：畫面淡入、孩子看到課本，再開始念 */
const START_MS = 900
/** 念完兩次以後，孩子沒有再點什麼，多久自動去選圖 */
const AUTO_NEXT_MS = 9000
/** 這一句沒有聲音（還沒產生、沒通過檢查）：照樣一行一行亮，一個字約 0.27 秒（課文平均每秒 3～4 字） */
const silentSec = (text: string) => Math.max(1.4, (text.match(/\p{Script=Han}/gu)?.length ?? 0) * 0.27)

type Mode = 'reading' | 'free'

/**
 * 念課文：課本一頁，課文一行一行大字，紅字是重點字詞。
 * - 莫莫念到哪一行，那一行底下亮一條藍色的帶子，跟著聲音從左往右走（唸到哪裡）；唸過的行，紅字旁邊的圖淡入。
 * - 點紅字（或它的圖）：莫莫單獨再念一次那個詞，圖輕輕跳一下；正在念課文的話，念完那個詞再接著念這一行。
 * - 一開始念兩次；之後出現「再聽一次」和「去選圖」，孩子沒動作也會自己去選圖。
 * - 沒有聲音的句子不出聲（不用平板內建語音），帶子照樣走，課文照樣看得到。
 */
export function Reader({ t, ready, host, onNext }: { t: ZhText; ready: Set<string>; host: HostTap; onNext: (ms: number) => void }) {
  const still = useReducedMotion()
  const [mode, setMode] = useState<Mode>('reading')
  const [cur, setCur] = useState(-1)
  const [seen, setSeen] = useState<Set<number>>(() => new Set())
  const [sweep, setSweep] = useState({ k: 0, dur: 1 })
  const [pop, setPop] = useState<{ w: string; k: number } | null>(null)
  const run = useRef(0)
  const pos = useRef({ line: 0, passes: 2 })
  const modeRef = useRef<Mode>('reading')
  const auto = useRef(0)
  const startedAt = useRef(performance.now())
  const left = useRef(false)

  const setM = (m: Mode) => {
    modeRef.current = m
    setMode(m)
  }

  const go = () => {
    if (left.current) return
    left.current = true
    run.current++
    clearTimeout(auto.current)
    onNext(Math.round(performance.now() - startedAt.current))
  }

  /** 念完了：等一下孩子沒動作就自己去選圖（點紅字、再聽一次都會重新計時） */
  const armAuto = () => {
    clearTimeout(auto.current)
    auto.current = window.setTimeout(go, AUTO_NEXT_MS)
  }

  /** 一行：有聲音就播（帶子跟著聲音的長度走），沒有就照字數亮一段時間 */
  const readLine = async (i: number, my: number) => {
    setCur(i)
    setSeen((s) => (s.has(i) ? s : new Set(s).add(i)))
    const text = plain(t.lines[i])
    let played = false
    if (hasClip(ready, 'text', text))
      played = await sayClip(zhClip('text', text), 'momo', (dur) => {
        setSweep({ k: performance.now(), dur })
      })
    if (my !== run.current) return
    if (!played) {
      const dur = silentSec(text)
      setSweep({ k: performance.now(), dur })
      await wait(dur * 1000)
    }
  }

  /** 從第 from 行念到最後，總共念 passes 次（第二次從第一行開始） */
  const read = async (from: number, passes: number) => {
    const my = ++run.current
    clearTimeout(auto.current)
    setM('reading')
    for (let p = 0; p < passes; p++) {
      for (let i = p === 0 ? from : 0; i < t.lines.length; i++) {
        if (my !== run.current) return
        pos.current = { line: i, passes: passes - p }
        await readLine(i, my)
        if (my !== run.current) return
        if (i < t.lines.length - 1) await wait(LINE_GAP_MS)
      }
      if (p < passes - 1) {
        setCur(-1)
        await wait(PASS_GAP_MS)
      }
    }
    if (my !== run.current) return
    setCur(-1)
    setM('free')
    armAuto()
  }

  useEffect(() => {
    const my = run.current
    const k = window.setTimeout(() => {
      if (my === run.current) void read(0, 2)
    }, START_MS)
    return () => {
      clearTimeout(k)
      clearTimeout(auto.current)
      run.current++
    }
    // 只在進來時開始念一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 點紅字、點圖：單獨念那個詞；正在念課文就念完詞再從這一行接著念 */
  const tapWord = async (w: string, line: number) => {
    if (left.current) return
    const resume = modeRef.current === 'reading' ? { ...pos.current } : null
    const my = ++run.current
    clearTimeout(auto.current)
    setPop({ w, k: performance.now() })
    setSeen((s) => (s.has(line) ? s : new Set(s).add(line)))
    let played = false
    if (hasClip(ready, 'word', w)) played = await sayClip(zhClip('word', w), 'momo')
    else sfx.pop()
    if (my !== run.current) return
    if (!played) await wait(700)
    if (my !== run.current) return
    if (resume) {
      await wait(350)
      if (my === run.current) void read(resume.line, resume.passes)
    } else armAuto()
  }

  /** 念完以後點一行（紅字以外的地方）：從那一行念到最後一次 */
  const tapLine = (i: number) => {
    if (modeRef.current !== 'free' || left.current) return
    void read(i, 1)
  }

  const again = () => {
    if (left.current) return
    sfx.tap()
    void read(0, 1)
  }

  // 點莫莫：念完以後再念一次；正在念就不打斷
  useEffect(() => {
    host.current = () => {
      if (modeRef.current === 'free') again()
    }
    return () => {
      host.current = null
    }
  })

  const chars = Math.max(...t.lines.map((l) => plain(l).length))
  const reds = (l: string) => pieces(l).filter((p) => p.red && t.emoji[p.text])
  return (
    <div className="zh-read" style={{ '--chars': chars } as CSSProperties}>
      <motion.article className="zh-page" initial={still ? false : { y: 14 }} animate={{ y: 0 }} transition={{ duration: 0.5, ease: EASE.out }}>
        <h2 className="zh-title">{t.title}</h2>
        <div className="zh-lines">
          {t.lines.map((l, i) => {
            const on = cur === i
            return (
              <div key={i} className={`zh-line${on ? ' on' : ''}${seen.has(i) ? ' seen' : ''}`} data-line={i} onPointerDown={() => tapLine(i)}>
                {on && (
                  <motion.span className="zh-band" layoutId={still ? undefined : 'zh-band'} transition={{ duration: 0.35, ease: EASE.inOut }} aria-hidden="true">
                    <motion.i key={sweep.k} className="zh-sweep" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: still ? 0 : sweep.dur, ease: 'linear' }} />
                  </motion.span>
                )}
                <span className="zh-text">
                  {pieces(l).map((p, j) =>
                    p.red ? (
                      <button
                        key={j}
                        type="button"
                        className={`zh-red${pop?.w === p.text ? ' pop' : ''}`}
                        data-word={p.text}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          if (firstFinger(e.nativeEvent)) void tapWord(p.text, i)
                        }}
                      >
                        {p.text}
                      </button>
                    ) : (
                      <span key={j}>{p.text}</span>
                    ),
                  )}
                </span>
                <span className="zh-pics">
                  {reds(l).map((p) => (
                    <motion.button
                      key={p.text}
                      type="button"
                      className="zh-pic"
                      aria-label={p.text}
                      initial={false}
                      animate={
                        seen.has(i)
                          ? { opacity: 1, scale: pop?.w === p.text ? [1, 1.18, 1] : 1, y: 0 }
                          : { opacity: 0, scale: 0.7, y: 6 }
                      }
                      transition={{ duration: still ? 0 : 0.45, ease: EASE.out }}
                      style={{ pointerEvents: seen.has(i) ? 'auto' : 'none' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        if (firstFinger(e.nativeEvent)) void tapWord(p.text, i)
                      }}
                    >
                      <motion.span key={pop?.w === p.text ? pop.k : 0} className="zh-pic-in">
                        <Pic name={t.emoji[p.text]!} />
                      </motion.span>
                    </motion.button>
                  ))}
                </span>
              </div>
            )
          })}
        </div>
      </motion.article>
      <div className={`zh-controls${mode === 'free' ? ' on' : ''}`} aria-hidden={mode !== 'free'}>
        <motion.button
          type="button"
          className="zh-again round-btn"
          aria-label="再聽一次"
          initial={false}
          animate={{ opacity: mode === 'free' ? 1 : 0, scale: mode === 'free' ? 1 : 0.8 }}
          transition={{ duration: 0.4, ease: EASE.out }}
          onPointerDown={again}
          tabIndex={mode === 'free' ? 0 : -1}
        >
          <EarIcon />
        </motion.button>
        <motion.button
          type="button"
          className="zh-go"
          aria-label="去選圖"
          initial={false}
          animate={{ opacity: mode === 'free' ? 1 : 0, scale: mode === 'free' ? 1 : 0.8 }}
          transition={{ duration: 0.4, ease: EASE.out, delay: mode === 'free' ? 0.15 : 0 }}
          onPointerDown={() => {
            sfx.tap()
            go()
          }}
          tabIndex={mode === 'free' ? 0 : -1}
        >
          <GoIcon />
        </motion.button>
      </div>
    </div>
  )
}

/** 再聽一次：一隻耳朵和兩道聲波 */
function EarIcon() {
  return (
    <svg viewBox="0 0 48 48" width={44} aria-hidden="true">
      <path d="M15 20 Q15 8 25 8 Q35 8 35 19 Q35 26 29 30 Q26 32 26 36 Q26 41 21 41 Q17 41 16 37" fill="#A3C4E4" stroke="#2E2A25" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 20 Q21 14 25 14 Q29 14 29 19 Q29 23 25 24" fill="none" stroke="#2E2A25" strokeWidth={3} strokeLinecap="round" />
      <path d="M39 13 Q43 19 39 25 M42 9 Q48 19 42 29" fill="none" stroke="#6F9CC8" strokeWidth={3} strokeLinecap="round" />
    </svg>
  )
}

/** 去選圖：往右的大箭頭 */
function GoIcon() {
  return (
    <svg viewBox="0 0 48 48" width="56%" aria-hidden="true">
      <path d="M8 24 H34 M24 12 L37 24 L24 36" fill="none" stroke="#2E2A25" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { sfx } from '../../lib/audio'
import { firstFinger, nod } from '../../games/NotYet'
import { EASE } from '../../ui/motion'
import { Sparkles } from '../../ui/Sparkles'
import type { Mood } from '../../art/Dino'
import { linePics, pieces, talkFor, talkOf, type ZhText } from './data'
import { pageUnits } from './layout'
import { Pic } from './Pic'
import type { HostTap } from './Lesson'

/** 聊一聊出來以後，多久才出現「去選圖」（大人問完、等他回答的時間；孩子這時候亂點也不會跳過這一段） */
const TALK_WAIT_MS = 4000

/** 大人的按鈕：同一顆連點時，每兩下之間不到這麼久就不算（孩子連點、手掌壓到，連點再久也只走一行）；每顆按鈕各自算，換一顆按照樣有反應 */
const NEXT_LOCK_MS = 900

/** 亮的那一行，紅字的圖放大到幾倍（孩子的眼睛跟著大人念到哪裡，圖是他看得懂的東西） */
const BIG = 1.25

/** 念過的行，圖淡一點（亮的那一行的圖才是現在要點的，T-114） */
const PAST_OPACITY = 0.5
/** 亮的那一行的圖一直沒被點：每隔這麼久自己輕輕跳一下（PHASE-7 小班段 8 秒），不出聲（大人在念） */
const CUE_AGAIN_MS = 8000

/** 點莫莫：這麼久之內，前幾下會跳、彈一聲（之後只點一下頭、不出聲，不會變成一直點莫莫的遊戲） */
const MOMO_WINDOW_MS = 8000
const MOMO_PLAY = 2
/** 莫莫開心多久就回到平常的樣子 */
const MOMO_HAPPY_MS = 1300

/**
 * 連點同一張圖：每一下換一種動作、冒出小東西（T-113，盲測 8948054 中文 seed 2：「一直點都一樣，不好玩」就離開；
 * 以前第二下起 motion 的 animate 值跟上一下一樣，不會重播，只剩一聲很輕的 tap）。
 * 第一下照舊撒星星；之後依序跳、轉一圈、搖一搖、壓扁彈回、躲起來又冒出來，每一種配不同的短音效。中文課 App 不說話，只有音效。
 */
const ACTS = ['hop', 'spin', 'wiggle', 'squish', 'peek'] as const
type Act = (typeof ACTS)[number]
const ACT_SFX: Record<Act, (n: number) => void> = {
  hop: () => sfx.boing(),
  spin: () => sfx.star(),
  wiggle: (n) => sfx.beat(n),
  squish: () => sfx.pop(),
  peek: () => sfx.tap(),
}
/** 冒出來的小東西：愛心、星星、音符輪流 */
const BITS = [
  'M12 21s-7-4.5-9.3-9A5 5 0 0 1 12 6.5 5 5 0 0 1 21.3 12C19 16.5 12 21 12 21Z',
  'M12 2.5l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8 6.2 20l1.4-6.4L2.7 9.2l6.5-.7Z',
  'M15 3v11.2a3.3 3.3 0 1 1-2-3V6.5l-5 1.3v8.4a3.3 3.3 0 1 1-2-3V5.8Z',
]
const BIT_COLORS = ['#F08A8A', '#F2C14E', '#7FB3E0']
function Bits({ n }: { n: number }) {
  const d = BITS[n % BITS.length]
  return (
    <span className="zh-bits" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <svg key={i} className="zh-bit" viewBox="0 0 24 24" style={{ '--i': i } as CSSProperties}>
          <path d={d} fill={BIT_COLORS[(n + i) % BIT_COLORS.length]} />
        </svg>
      ))}
    </span>
  )
}

/**
 * 親子共讀（2026-11-03 家長決定：拿掉全部中文語音，App 不出聲，大人念給孩子聽）。
 * - 課本一頁，一次亮一行：亮的那一行底下一條淡藍帶子，念過的行是墨色、還沒念的行很淡；紅字的圖跟著那一行跳出來一下（只一次），孩子的眼睛跟著走。
 * - 大人念完這一行，按右下的「下一行」往下走（大人的按鈕：低調、不跳動，放在孩子常點的課文和圖以外；連點只算一下）；
 *   孩子不小心按到了，上面有一顆更小的「上一行」可以退回去。
 * - 孩子的眼睛和手（T-90，AI 小男生：「整面都是字，不知道要做什麼」）：亮的那一行，紅字的圖放大、一圈淡黃框、
 *   依序輕輕跳一下（跟選圖、教學卡的「輪到你了」同一套）——大人念到那個詞，孩子看圖、點圖。
 *   點紅字（或它的圖）：圖再放大跳一下、有一聲輕的音效，外框收起來；不出聲念、不打斷大人。
 * - 每一行都有圖可以點（T-111，盲測 a35cd5e：三次都沒上完。一半以上的行沒有紅字，念那幾行時他沒有東西可以點，
 *   只好去點莫莫、點字，都沒反應，覺得「好久喔」就離開了）：
 *   - 沒有紅字的行借前後行的主角（data.ts 的 linePics：「跑到樹下睡大覺。」旁邊是兔子），樣子跟紅字的圖一樣；
 *   - 點這一行的字也算點了這一行的圖；
 *   - 每一行第一次點到圖：那張圖撒一把星星（看得出「我點到了」）；同一行再點只跳一下、輕輕一聲（不會變成一直點的遊戲）；
 *   - 上面的進度（Lesson 傳給 Shell）：念完一行亮一格，聽得出、看得出「念到哪裡、還有多少」（onLine）。
 * - 媽媽念的時候孩子有事做（T-114，盲測 940c8cd 中文 seed 1：「我一直點好久了，我不要玩了」）：
 *   - 亮的那一行的圖整圈發亮（暖黃光暈），念過的行的圖淡下去，看得出「現在點這個」；還是點得到，點了照樣有反應；
 *   - 亮的那一行的圖一直沒被點：每 8 秒自己輕輕跳一下（不出聲）；
 *   - 點課本上的空白處（沒點中圖，盲測 seed 2 第 3、4 步）：當作點了亮的那一行的圖，每一下照樣輪替動作；
 *   - 陪玩小字寫「念到這行時請他點亮起來的圖」。
 * - 點莫莫（T-111）：莫莫開心跳一下、彈一聲，亮的那一行的圖再亮黃框、跳一下（莫莫在說「看這裡」），8 秒內第 3 下起只點一下頭。
 * - 最後一行念完按「念完了」：「聊一聊」卡片（對話式共讀，T-102）：3 歲問得出來的一題（誰、什麼、哪裡，./talk.json），
 *   有圖的放那張圖讓孩子用指的回答；下面一句「他答不出來，你可以說：…」給大人示範。
 *   孩子點了那張圖（用指的回答了，T-111：盲測裡媽媽問「誰跑得快快快？」他點兔子，什麼都沒發生，只好一直點）：
 *   圖亮綠框、撒星星、莫莫開心，「去選圖」馬上出現（大人的按鈕，不用再等 4 秒）。
 *   「去選圖」「再念一次」不放在卡片上（第三次盲測：孩子自己按掉了這一段），跟「下一行」一樣放在右下角的大人位置、同樣低調的樣子，
 *   聊一聊出來 4 秒後（或孩子指了圖之後）才出現（大人問完、等他回答的時間）；同一顆連點只算一下。
 * - 聊一聊改成孩子看得懂的畫面（T-126，盲測 0f3363f 中文 2：大卡全是字，「好多字喔，我不要玩了」）：
 *   課本收起來，中間一張大圖（問題的主角；主角沒有圖的篇放問題裡提到的、或第一個紅字的圖），點得到；
 *   問題、示範句、還可以做的事收成下面一張小字條（給大人看）。往下走的按鈕一出來就看得到（淡淡的），
 *   4 秒後（或孩子點了圖）才按得動；還按不動時點它、點空白處、點字條，大圖再亮黃框、跳一下。
 */
export function Reader({
  t,
  host,
  goLabel = '去選圖',
  onTalk,
  onNext,
  onLine,
  setMood,
  startAt = 0,
  startTalk = false,
}: {
  t: ZhText
  host: HostTap
  /** 聊一聊卡片上往下走的按鈕（沒有選圖題時是「下課」） */
  goLabel?: string
  /** 進出「聊一聊」（陪玩小字跟著換） */
  onTalk?: (on: boolean) => void
  onNext: (ms: number) => void
  /** 念完幾行了（聊一聊的時候是全部的行數）：上面的進度跟著亮（T-111） */
  onLine?: (read: number) => void
  /** 莫莫的表情（點莫莫、用指的回答時開心一下；Lesson 給） */
  setMood?: (m: Mood) => void
  /** 一開始亮第幾行（排版檢查 scripts/check-zh-layout.mjs 用：直接看每一行亮起來、圖放大的樣子；課裡一律從第 0 行） */
  startAt?: number
  /** 一開始就是聊一聊（排版檢查用：180 篇的聊一聊卡片都要量；課裡一律從念課文開始） */
  startTalk?: boolean
}) {
  const still = useReducedMotion()
  const [cur, setCur] = useState(startAt)
  const [talk, setTalk] = useState(startTalk)
  /** 聊一聊出來一陣子了（或孩子已經用指的回答了）：「去選圖」「再念一次」才出現在右下角 */
  const [talkReady, setTalkReady] = useState(false)
  /** 同一張圖再點：換下一種動作、冒出小東西、配那個動作的音效 */
  const playAct = (key: string) => {
    const n = (tapsOf.current.get(key) ?? 0) + 1
    tapsOf.current.set(key, n)
    const kind = ACTS[(n - 1) % ACTS.length]
    ACT_SFX[kind](n)
    setAct({ key, n, kind })
  }

  /** 聊一聊：孩子點了問題的主角（用指的回答了） */
  const [answered, setAnswered] = useState(false)
  const [pop, setPop] = useState<{ w: string; k: number } | null>(null)
  /** 孩子點過的圖（第幾行:哪個詞）：點過就收起「點我」的外框 */
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  /** 第一次點到某一行的圖：那張圖撒一把星星（第幾行:哪個詞、第幾次） */
  const [burst, setBurst] = useState<{ key: string; n: number } | null>(null)
  /** 撒過星星的圖（第幾行:哪個詞）：每張只撒一次，點莫莫也不會重來 */
  const sparkled = useRef(new Set<string>())
  /** 每張圖點了幾下（換動作用） */
  const tapsOf = useRef(new Map<string, number>())
  /** 現在在動的那張圖：哪一張、第幾下（換 key 重播）、什麼動作（ACTS） */
  const [act, setAct] = useState<{ key: string; n: number; kind: Act } | null>(null)
  /** 亮的那一行的圖沒被點：第幾次自己跳一下（換行從 0 開始） */
  const [cueTick, setCueTick] = useState(0)
  /** 點莫莫：聊一聊的主角再亮黃框、跳一下（第幾次） */
  const [look, setLook] = useState(0)
  const momoTaps = useRef<number[]>([])
  const moodTimer = useRef(0)
  const lockUntil = useRef(new Map<string, number>())
  const startedAt = useRef(performance.now())
  const left = useRef(false)
  const last = t.lines.length - 1
  const pics = linePics(t)

  /** 大人的按鈕：連點、兩根手指只算一下（id 是哪一顆） */
  const adult = (id: string, fn: () => void) => (e: React.PointerEvent) => {
    if (!firstFinger(e.nativeEvent) || left.current) return
    const now = performance.now()
    const locked = now < (lockUntil.current.get(id) ?? 0)
    // 連點的每一下都把鎖往後延：一直點只算第一下，要停手一下再按才算下一下
    lockUntil.current.set(id, now + NEXT_LOCK_MS)
    if (!locked) fn()
  }

  const next = () => {
    sfx.tap()
    if (cur < last) setCur(cur + 1)
    else {
      setTalk(true)
      onTalk?.(true)
    }
  }

  /** 孩子不小心按了「下一行」：大人退回上一行 */
  const prev = () => {
    sfx.tap()
    setCur((c) => Math.max(0, c - 1))
  }

  const again = () => {
    sfx.tap()
    setTalk(false)
    onTalk?.(false)
    setCur(0)
  }

  const go = () => {
    left.current = true
    sfx.tap()
    onNext(Math.round(performance.now() - startedAt.current))
  }

  /** 莫莫開心一下，過一會兒回到平常的樣子 */
  const happy = () => {
    if (!setMood) return
    setMood('happy')
    clearTimeout(moodTimer.current)
    moodTimer.current = window.setTimeout(() => setMood('idle'), MOMO_HAPPY_MS)
  }

  /**
   * 孩子點紅字、點圖、點這一行的字：圖放大跳一下（只看得到念過的行）。
   * 這一行第一次點到：那張圖撒一把星星、亮一點的一聲；再點同一張：每一下換一種動作、冒出小東西（playAct，T-113）。
   */
  const tapWord = (w: string, line: number) => {
    if ((line > cur && !talk) || left.current) return
    const key = `${line}:${w}`
    if (!sparkled.current.has(key)) {
      sparkled.current.add(key)
      sfx.pop()
      setBurst({ key, n: performance.now() })
    } else playAct(key)
    if (!touched.has(key)) setTouched((s) => new Set(s).add(key))
    setPop({ w, k: performance.now() })
  }

  /** 聊一聊：孩子點了問題的主角（用指的回答）：圖跳一下；第一次再加綠框、星星、莫莫開心，「去選圖」馬上出來 */
  const answerTalk = (w: string) => {
    if (left.current) return
    setPop({ w, k: performance.now() })
    if (answered) return playAct(`talk:${w}`)
    sfx.pop()
    setAnswered(true)
    setBurst({ key: `talk:${w}`, n: performance.now() })
    happy()
    setTalkReady(true)
  }

  // 亮的那一行的圖一直沒被點：每 8 秒自己輕輕跳一下（點了就停；換一行重新算）
  const curKeys = talk ? '' : linePics(t)[cur].map((p) => `${cur}:${p.word}`).join('|')
  const curTouched = curKeys.split('|').some((k) => touched.has(k))
  useEffect(() => {
    setCueTick(0)
    if (!curKeys || curTouched || still) return
    const k = window.setInterval(() => setCueTick((n) => n + 1), CUE_AGAIN_MS)
    return () => clearInterval(k)
  }, [curKeys, curTouched, still])

  /** 聊一聊剛出來、往下走的按鈕還按不動時點了：主角的圖跳一下（「先看這個」），不跳過 */
  const waitTap = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (!firstFinger(e.nativeEvent) || left.current || answered) return
    nod()
    setLook((n) => n + 1)
  }

  /** 點在課本的空白處（沒點中圖、不是大人的按鈕）：當作點了亮的那一行的圖 */
  const tapBlank = (e: React.PointerEvent) => {
    if (left.current || !firstFinger(e.nativeEvent)) return
    if ((e.target as Element).closest('button, .zh-controls, .zh-talk-pic')) return
    // 聊一聊時點空白處、點小字條：主角的圖再亮黃框、跳一下（「點這個」，T-126）
    if (talk) {
      if (!answered) setLook((n) => n + 1)
      return
    }
    const p = pics[cur]?.[0]
    if (p) tapWord(p.word, cur)
  }

  // 上面的進度：念完幾行（聊一聊的時候整篇都念完了）
  useEffect(() => {
    onLine?.(talk ? t.lines.length : cur)
  }, [cur, talk, t.lines.length, onLine])

  useEffect(() => () => clearTimeout(moodTimer.current), [])

  // 聊一聊出來 4 秒後，大人的按鈕才出現（孩子先用指的回答了就馬上出現）
  useEffect(() => {
    if (!talk) {
      setTalkReady(false)
      setAnswered(false)
      return
    }
    const k = window.setTimeout(() => setTalkReady(true), still ? 0 : TALK_WAIT_MS)
    return () => clearTimeout(k)
  }, [talk, still])

  /**
   * 點莫莫（T-111，盲測 a35cd5e：點了沒反應，他一直想點恐龍）：不說話（大人在念），
   * 莫莫開心跳一下、彈一聲，亮的那一行的圖（聊一聊時是問題的主角）再亮黃框、跳一下——莫莫在說「看這裡」，把眼睛帶回課本。
   * 8 秒內第 3 下起只輕輕點一下頭、不出聲：有反應，但不好玩，不會變成一直點莫莫、不聽大人念。
   */
  useEffect(() => {
    host.current = () => {
      if (left.current) return
      const now = performance.now()
      momoTaps.current = [...momoTaps.current.filter((x) => now - x < MOMO_WINDOW_MS), now]
      if (momoTaps.current.length > MOMO_PLAY) return nod()
      sfx.boing()
      happy()
      setLook((n) => n + 1)
      // 亮的那一行的圖：黃框再亮起來、跳一下（點到了又收起來）
      if (!talk)
        setTouched((s) => {
          const n = new Set(s)
          for (const p of pics[cur]) n.delete(`${cur}:${p.word}`)
          return n
        })
    }
    return () => {
      host.current = null
    }
  })

  // 字級照最寬的那一行算（字＋放大的圖都要放得進課本，./layout.ts）
  const { units, rows } = pageUnits(t)
  const tk = talkFor(t)
  const more = talkOf(t.parentTip).rest
  // 聊一聊的大圖（T-126）：問題的主角；主角沒有圖的篇（例如「誰讓燈泡亮起來？」），放問題裡提到的紅字（燈泡），沒提到就放這篇第一個有圖的紅字
  const drawn = t.redWords.filter((w) => t.emoji[w])
  const star = tk.pic && t.emoji[tk.pic] ? tk.pic : (drawn.find((w) => tk.q.includes(w)) ?? drawn[0] ?? null)
  const starIsAnswer = star != null && star === tk.pic
  return (
    <div
      className={`zh-read${talk ? ' talking' : ''}`}
      data-at={talk ? 'talk' : cur}
      style={{ '--units': units, '--rows': rows } as CSSProperties}
      onPointerDown={tapBlank}
    >
      <motion.article className="zh-page" initial={still ? false : { y: 14 }} animate={{ y: 0 }} transition={{ duration: 0.5, ease: EASE.out }}>
        <h2 className="zh-title">{t.title}</h2>
        <div className="zh-lines">
          {t.lines.map((l, i) => {
            const on = !talk && cur === i
            const seen = i <= cur || talk
            return (
              <div
                key={i}
                className={`zh-line${on ? ' on' : ''}${seen ? ' seen' : ' later'}`}
                data-line={i}
                onPointerDown={(e) => {
                  // 點這一行的字（不是紅字、不是圖）：當作點了這一行的第一張圖（T-111）
                  if (!seen || !pics[i].length || !firstFinger(e.nativeEvent)) return
                  e.stopPropagation()
                  tapWord(pics[i][0].word, i)
                }}
              >
                {on && <motion.span className="zh-band" layoutId={still ? undefined : 'zh-band'} transition={{ duration: 0.35, ease: EASE.inOut }} aria-hidden="true" />}
                <span className="zh-text">
                  {pieces(l).map((p, j) =>
                    p.red ? (
                      <Fragment key={j}>
                        <button
                          type="button"
                          className={`zh-red${pop?.w === p.text ? ' pop' : ''}`}
                          data-word={p.text}
                          tabIndex={seen ? 0 : -1}
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            if (firstFinger(e.nativeEvent)) tapWord(p.text, i)
                          }}
                        >
                          {p.text}
                        </button>
                      </Fragment>
                    ) : (
                      <span key={j}>{p.text}</span>
                    ),
                  )}
                </span>
                <span className="zh-pics">
                  {pics[i].map(({ word, echo }, j) => {
                    const key = `${i}:${word}`
                    const popped = pop?.w === word
                    const again = on && cueTick > 0 && act?.key !== key
                    return (
                      <motion.button
                        key={word}
                        type="button"
                        // 亮的那一行：圖放大、一圈淡黃框、依序輕輕跳一下（點我，T-84 同一套）；點過就收起外框（點莫莫會再亮一次）
                        className={`zh-pic${echo ? ' echo' : ''}${on ? ' big' : ''}${on && !touched.has(key) ? ' cue turn-hop' : ''}`}
                        data-word={word}
                        style={{ '--turn-i': j, pointerEvents: seen ? 'auto' : 'none', zIndex: on || popped ? 2 : undefined } as CSSProperties}
                        aria-label={word}
                        initial={false}
                        animate={
                          !seen
                            ? { opacity: 0, scale: 0.7, y: 6 }
                            : popped
                              ? { opacity: 1, scale: on ? [BIG, BIG * 1.22, BIG] : [1, 1.4, 1.12], y: 0 }
                              : on
                                ? { opacity: 1, scale: BIG, y: 0 }
                                : { opacity: talk ? 1 : PAST_OPACITY, scale: 1, y: 0 }
                        }
                        transition={{ duration: still ? 0 : popped ? 0.6 : 0.45, ease: EASE.out }}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          if (firstFinger(e.nativeEvent)) tapWord(word, i)
                        }}
                      >
                        <span
                          key={act?.key === key ? `a${act.n}` : again ? `c${cueTick}` : 0}
                          className={`zh-pic-in${act?.key === key ? ` act-${act.kind}` : again ? ' act-hop' : ''}`}
                          data-act={act?.key === key ? act.kind : undefined}
                          data-cue-again={again ? cueTick : undefined}
                        >
                          <Pic name={t.emoji[word]!} />
                        </span>
                        {burst?.key === key && <Sparkles key={burst.n} count={10} />}
                        {act?.key === key && <Bits key={`bits-${act.n}`} n={act.n} />}
                      </motion.button>
                    )
                  })}
                </span>
              </div>
            )
          })}
        </div>
      </motion.article>

      {/*
        大人的按鈕：課本右下角，課文和圖以外。念課文時是上一行／下一行；聊一聊時是再念一次／去選圖。
        聊一聊（T-126）：往下走的箭頭一出來就看得到（淡淡的），4 秒後（或孩子點了圖）才按得動、變清楚；
        還按不動的時候點了，主角的圖跳一下（「先看這個」），不會跳過這一段（T-102）
      */}
      <div className={`zh-controls${!talk || talkReady ? ' on' : ' wait'}`}>
        {talk ? (
          <>
            <button type="button" className="zh-prev" onPointerDown={talkReady ? adult('again', again) : waitTap} tabIndex={talkReady ? 0 : -1}>
              再念一次
            </button>
            <button type="button" className="zh-next zh-go-quiz" onPointerDown={talkReady ? adult('go', go) : waitTap} tabIndex={talkReady ? 0 : -1}>
              <span>{goLabel}</span>
              <NextIcon />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="zh-prev" onPointerDown={adult('prev', prev)} tabIndex={cur === 0 ? -1 : 0} aria-hidden={cur === 0} style={{ visibility: cur === 0 ? 'hidden' : undefined }}>
              上一行
            </button>
            <button type="button" className="zh-next" onPointerDown={adult('next', next)}>
              <span>{cur < last ? '下一行' : '念完了'}</span>
              <NextIcon />
            </button>
          </>
        )}
      </div>

      {talk && (
        // 聊一聊（T-126，盲測 0f3363f 中文 2：大卡全是字，「好多字喔，我不要玩了」就走了）：
        // 孩子看到的是一張大圖（點得到，用指的回答）；給大人的問題、示範句收成下面一張小字條
        <motion.div
          className="zh-talk"
          role="dialog"
          aria-label="聊一聊"
          initial={still ? false : { opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: EASE.out }}
        >
          <div className="zh-talk-main">
            {star && (
              // 主角的圖：孩子可以用指的回答（點了跳一下；第一次撒星星、莫莫開心，是答案的話亮綠框，T-111）。點莫莫、點空白時換 key：再亮黃框、跳一下
              <motion.button
                key={`talk-${look}`}
                type="button"
                className={`zh-talk-pic${answered ? (starIsAnswer ? ' said' : '') : ' cue turn-hop'}`}
                aria-label={star}
                data-word={star}
                animate={pop?.w === star && !still ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: EASE.out }}
                onPointerDown={(e) => {
                  if (firstFinger(e.nativeEvent)) answerTalk(star)
                }}
              >
                <span
                  key={act?.key === `talk:${star}` ? act.n : 0}
                  className={`zh-pic-in${act?.key === `talk:${star}` ? ` act-${act.kind}` : ''}`}
                  data-act={act?.key === `talk:${star}` ? act.kind : undefined}
                >
                  <Pic name={t.emoji[star]!} />
                </span>
                {burst?.key === `talk:${star}` && <Sparkles key={burst.n} count={14} />}
                {act?.key === `talk:${star}` && <Bits key={`bits-${act.n}`} n={act.n} />}
              </motion.button>
            )}
          </div>
          <div className="zh-talk-note">
            <p className="zh-talk-ask">
              <span className="zh-talk-tag">聊一聊・問他</span>
              <span className="zh-talk-q">{tk.q}</span>
            </p>
            <p className="zh-talk-model">
              <span className="zh-talk-how">答不出來就說</span>「{tk.a}」
            </p>
            <p className="zh-talk-more">等他說；他說一兩個字，你幫他說成完整的一句。{more && `還可以：${more}`}</p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

/** 下一行：往右的箭頭 */
function NextIcon() {
  return (
    <svg viewBox="0 0 48 48" width={30} height={30} aria-hidden="true">
      <path d="M10 24 H34 M24 13 L36 24 L24 35" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

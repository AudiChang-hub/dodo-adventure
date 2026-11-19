import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { motion } from 'motion/react'
import { DINO_EN, Dino } from '../art/Dino'
import { Emoji } from '../art/Emoji'
import { currentRoute, go, type Route } from '../lib/nav'
import { audioClock, isSpeaking, onSpeech, say, sfx, stopSpeech } from '../lib/audio'
import { audioReady, onUnlock } from '../lib/boot'
import { getKV, setKV } from '../lib/db'
import { segments } from '../content/lines'
import { useTaps } from '../ui/tap'
import { useInstall } from '../lib/install'
import { useIntro } from '../ui/Scenes'
import { LESSONS, SUBJECTS, type Subject } from '../lessons'
import type { Speaker } from '../content/lines'
import { BoardStickers } from './StickerBook'
import { GATE_ORDER, gateHint, markOpenAnnounced, usePlayGate, type GateSubject, type HomeGate } from '../lib/play-gate'
import { HandArt } from '../games/Demo'
import './school.css'

let greeted = false

/**
 * 記住三隻恐龍的名字（T-137）：前 INTRO_TIMES 次打開 App，首頁的招呼換成豆豆介紹大家
 * （Hi, 名字! I'm Dodo! → This is Bobo! → And this is Momo!），說到誰、門口那隻就跳一下。之後照舊只說 Hi, 名字! Let's go!
 * 次數記在 kv 的 INTRO_KEY（開始介紹就算一次，被點門打斷也算）。
 */
export const INTRO_TIMES = 5
export const INTRO_KEY = 'home.dinoIntro'
/** 介紹的三句，依序是誰跳 */
const INTRO: { key: string; who: Speaker }[] = [
  { key: 'home.intro.0', who: 'dodo' },
  { key: 'home.intro.1', who: 'bobo' },
  { key: 'home.intro.2', who: 'momo' },
]
/** 這次打開 App 的招呼流程；點門離開時作廢（還沒讀到次數就點了門，就不再開口） */
let greetRun = 0
/** 介紹正在說（點門時停掉，不帶到課裡） */
let introducing = false

async function greet() {
  const my = ++greetRun
  const n = await getKV<number>(INTRO_KEY, 0).catch(() => INTRO_TIMES)
  if (my !== greetRun) return
  if (n >= INTRO_TIMES) return void say('home.hello')
  void setKV(INTRO_KEY, n + 1).catch(() => {})
  introducing = true
  // 最後一句真的念完了（不是被打斷）
  const last = INTRO[INTRO.length - 1].key
  let finished = false
  const off = onSpeech((e) => {
    if (e.type === 'end' && e.key === last) finished = true
  })
  try {
    await say(...INTRO.map((x) => x.key))
  } finally {
    off()
    if (my === greetRun) introducing = false
  }
  // 介紹說完：字幕留一下讓大人看完，再收起來（T-140⑤，盲測 73d57c7：And this is Momo! 一直留在首頁）。
  // 字幕常駐（ui/Subtitle.tsx：唸完留著等下一句，stopSpeech 才收）是給上課用的，首頁不是上課；只收首頁介紹這一段，
  // 還在首頁、這段招呼沒被點門作廢、而且沒有別的話在說，才收（不會切掉別的聲音）
  if (!finished) return
  await new Promise((r) => setTimeout(r, INTRO_CAPTION_HOLD_MS))
  if (my === greetRun && currentRoute().name === 'home' && !isSpeaking()) stopSpeech()
}
/** 介紹說完，字幕再留多久才收（毫秒） */
const INTRO_CAPTION_HOLD_MS = 2000

/** 門上的圖：孩子不識字，看圖和守門的恐龍就知道是哪一課（門下的字是給大人看的） */
const SIGN: Record<Subject, ReactNode> = {
  english: (
    <span className="door-sign abc" aria-hidden="true">
      <b>A</b>
      <b>B</b>
      <b>C</b>
    </span>
  ),
  chinese: (
    <span className="door-sign zh" aria-hidden="true">
      <b>中</b>
      <i />
    </span>
  ),
  math: (
    <span className="door-sign num" aria-hidden="true">
      <b>1</b>
      <b>2</b>
      <b>3</b>
    </span>
  ),
}

/** 門的顏色跟守門的恐龍一樣：豆豆綠、莫莫藍、波波橘 */
const TINT: Record<Speaker, { door: string; deep: string; glass: string }> = {
  dodo: { door: '#8FCBAA', deep: '#5FA883', glass: '#E3F2E9' },
  momo: { door: '#A3C4E4', deep: '#6F9CC8', glass: '#E6EFF8' },
  bobo: { door: '#F0B088', deep: '#D38A5E', glass: '#FBE8DA' },
}

/**
 * 遊戲角（T-152，設計稿第四節版面 A）：畫畫（進去先選白紙還是著色本）、邏輯遊戲（選豆豆收拾還是串珠珠）兩扇並排的圓窗，
 * 上面掛三盞門燈（ABC／中／123），上完一堂亮一盞。三堂課今天各上完一次才開（lib/play-gate.ts）；家長區可以今天先打開或一直開著（預設）。
 * T-147（2026-11-14 親師晤談：英文故事太難）拿掉了故事門；故事書的程式、路由和進度這一版都還留著，下一版才刪。
 */
const CORNER: { id: 'draw' | 'logic'; label: string; icon: string; to: Route }[] = [
  { id: 'draw', label: '畫畫', icon: 'artist-palette', to: { name: 'draw' } },
  { id: 'logic', label: '邏輯遊戲', icon: 'puzzle-piece', to: { name: 'logic' } },
]

/** 門燈裡的字：跟門上的窗一樣 */
const LAMP_SIGN: Record<GateSubject, string> = { english: 'ABC', chinese: '中', math: '123' }

/** 點了鎖住的遊戲角：0.8 秒內只算一次（連點、多指，跟 NotYet 的點頭節奏一樣）；8 秒內不再說話 */
const NUDGE_EVERY_MS = 800
const NUDGE_SAY_EVERY_MS = 8000
/**
 * 還沒上的那一扇門亮著、手指指著多久（T-169）：比那一句話（約 1.5 秒）長很多，三歲孩子聽完再轉頭找得到。
 * 以前 2.5 秒，話說完門就熄了。亮著的時候再點只是延長，不重來、不再跳。
 */
const NUDGE_GLOW_MS = 6000
/** 三盞都亮回到首頁：首頁先站好、窗簾還拉著，停一下再拉開 */
const OPEN_DELAY_MS = 450

/**
 * 學校的首頁（2026-10-31 家長決定照學校分科）：三個大門＝英文字母（豆豆）、中文課文（莫莫）、數學數字（波波），
 * 旁邊一扇小一點的畫畫圓窗；牆上掛一塊貼紙板（最新的幾張貼紙），點了進貼紙本（T-132）。
 * 除了家長角落沒有別的按鈕；點門任何地方一下就進去。
 * 畫面靜止（MOTION-2）：只有剛打開 App 時大家走進來一次，之後不閃、不晃。
 */
export function Home() {
  const intro = useIntro()
  const install = useInstall()

  useEffect(() => {
    const hello = () => {
      greeted = true
      void greet()
    }
    if (!greeted && audioReady()) hello()
    return onUnlock(() => {
      if (!greeted) hello()
    })
  }, [])

  // 介紹說到誰，看得出是哪一隻（T-139⑤，盲測 ccf7ac7：以前只在一句開頭跳 0.8 秒、跳完什麼都不留，
  // 三句都是豆豆的聲音、只有豆豆的嘴在動，孩子看不出 Bobo、Momo 是哪一隻）：
  // - 那一句一開始，那一扇門就亮起來（門框外一圈暖黃光），亮到這一句說完、換下一句；最後一句說完 0.8 秒熄掉。
  //   紙感螢幕（DISPLAY-1）更新慢，要留著的狀態比一閃而過的動作看得清楚。
  // - 念到名字那個字（字幕的逐字時間）那一刻，那一隻跳一下（跳到身高的 4 成），只跳一次（MOTION-1/2）。沒有逐字時間就在一開頭跳。
  // - 其他兩隻不亮、不動。被打斷（點門、stopSpeech）就熄掉。
  const [hop, setHop] = useState<{ who: Speaker; n: number } | null>(null)
  const [named, setNamed] = useState<Speaker | null>(null)
  useEffect(() => {
    let timers: number[] = []
    const clear = () => {
      timers.forEach(clearTimeout)
      timers = []
    }
    const jump = (who: Speaker) => setHop((h) => ({ who, n: (h?.n ?? 0) + 1 }))
    const off = onSpeech((e) => {
      if (e.type === 'stop' || e.type === 'cut') {
        clear()
        return setNamed(null)
      }
      const x = INTRO.find((i) => i.key === (e as { key?: string }).key)
      if (!x) return
      // 換亮用 flushSync：在聲音開始的同一個工作裡就換好門，不等 React 下一輪排程。
      // 不然 CPU 忙的時候，聲音已經換成波波，畫面卻還有一幀是豆豆的門亮著（PM 完整測試 2026-11-18）。
      // seg／whole 都在 await 之後才發，不會在 React 渲染、生命週期裡呼叫 flushSync
      if (e.type === 'whole') {
        clear()
        return flushSync(() => {
          setNamed(x.who)
          jump(x.who)
        })
      }
      if (e.type === 'end') {
        if (x.key === INTRO[INTRO.length - 1].key) timers.push(window.setTimeout(() => setNamed(null), 800))
        return
      }
      // seg：這一句開始就亮；念到名字的那一刻跳
      if (e.seg === 0) {
        clear()
        flushSync(() => setNamed(x.who))
      }
      const name = DINO_EN[x.who].toLowerCase()
      const w = e.words?.find((t) => t[2].toLowerCase().includes(name))
      if (w) timers.push(window.setTimeout(() => jump(x.who), Math.max(0, (e.at - audioClock()) * 1000 + w[0])))
      else if (e.seg === segments(e.line).length - 1 && !e.words?.length) jump(x.who)
    })
    return () => {
      off()
      clear()
    }
  }, [])

  // 遊戲角（T-152）
  const gate = usePlayGate()
  /** 這次掛上首頁時還沒打招呼（剛打開 App）：今天的 Play corner is open! 不跟招呼搶著說，窗簾直接開 */
  const firstHome = useRef(!greeted)
  /** 三盞都亮的那一刻：wait 窗簾先拉著、go 拉開 */
  const [opening, setOpening] = useState<'no' | 'wait' | 'go'>('no')
  useEffect(() => {
    if (!gate?.announce || opening !== 'no') return
    void markOpenAnnounced()
    if (firstHome.current) return setOpening('go')
    setOpening('wait')
  }, [gate?.announce, opening])
  useEffect(() => {
    if (opening !== 'wait') return
    const t = window.setTimeout(() => {
      setOpening('go')
      sfx.chime(1)
      void say('home.corner.open')
    }, OPEN_DELAY_MS)
    return () => clearTimeout(t)
  }, [opening])
  // 還沒讀到（剛打開 App 的第一下）照開著的畫：預設是一直開著，不要每次都先拉上再拉開
  const shut = gate ? !gate.open || opening === 'wait' || (gate.announce && opening === 'no') : false

  // 點了鎖住的窗或門燈（T-169：溫和地告訴他先去上哪一堂，TOUCH-6：0.3 秒內有反應）：
  // - 輕輕一聲 tap，窗簾不晃（以前左右晃一下，像在搖頭說不行）。
  // - 還沒上的第一扇門亮暖黃光、門頂上一隻手指指著那扇門的窗（ABC／中／123），遊戲角上同一個字的那盞門燈也亮外框：
  //   門燈、門窗、手指三個地方是同一個字、同一個顏色，看得出「先去那扇門」。亮 6 秒，都是靜態的（MOTION-2/3）。
  // - 那一扇門的恐龍跳一下，自己說 Let's visit Momo first!（說出名字，不說「不行」、不說條件）。
  // - 連點、多指：0.8 秒內只算一次；亮著的時候再點只延長，不再跳、不疊動畫；8 秒內只說一次。點完馬上點課門照常進去。
  const [point, setPoint] = useState<GateSubject | null>(null)
  const nudged = useRef({ at: -Infinity, said: -Infinity, timer: 0, on: false })
  useEffect(() => () => clearTimeout(nudged.current.timer), [])
  const nudge = () => {
    const n = nudged.current
    const now = performance.now()
    if (now - n.at < NUDGE_EVERY_MS || !gate) return
    n.at = now
    sfx.tap()
    const h = gateHint(gate)
    // 三盞剛亮、窗簾還沒拉開的那一下（OPEN_DELAY_MS）：只有聲音，等它自己拉開
    if (!h) return
    // 介紹還沒說完就點：say 會切掉正在說的介紹，這次不再接著介紹
    greeted = true
    greetRun++
    introducing = false
    if (!n.on) setHop((x) => ({ who: h.host, n: (x?.n ?? 0) + 1 }))
    n.on = true
    if (now - n.said >= NUDGE_SAY_EVERY_MS) {
      n.said = now
      void say(h.line)
    }
    setPoint(h.subject)
    clearTimeout(n.timer)
    n.timer = window.setTimeout(() => {
      n.on = false
      setPoint(null)
    }, NUDGE_GLOW_MS)
  }

  // 點門：按下、放開就進去，不等瀏覽器的 click（ui/tap.ts：有時候 click 沒來，孩子會覺得按了沒反應）
  const tap = useTaps()
  const open = (to: Route) => {
    greeted = true
    // 介紹還沒說完就點門：停掉介紹，不帶到下一個畫面（T-137；以前的 Hi, 名字! Let's go! 照舊不停）
    greetRun++
    if (introducing) {
      introducing = false
      stopSpeech()
    }
    sfx.pop()
    go(to)
  }

  return (
    <div className="screen home school">
      <SchoolWall />
      <div className="home-title school-title" aria-hidden="true">
        豆豆冒險
        <small>今天想上哪一課？</small>
      </div>

      {!install.standalone && !install.installed && (
        // 給大人看的小字：孩子點了也沒反應，不搶眼、不動
        <p className="install-hint school-hint">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2.5v7M5 7l3 3 3-3M3 12.5h10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            家長：可以安裝成 App，全螢幕更穩定
            <br />
            右上角按住 3 秒 → 設定與同步
          </span>
        </p>
      )}

      {gate && !gate.open && (
        // 陪玩小字（PARENT-1，給大人看）：遊戲角鎖住時才出現；孩子點了也沒反應
        <p className={`install-hint school-hint corner-hint${!install.standalone && !install.installed ? ' below' : ''}`} data-corner-hint="">
          <span>
            陪玩　今天三堂課各上完一次，就能畫畫、玩邏輯遊戲。
            <br />
            中文課要大人一起念；沒辦法陪的日子，家長區可以「今天先打開」。
          </span>
        </p>
      )}

      {/* 牆上的貼紙板（T-132）：掛在門上方的空牆，不動門的排法；看得到自己最新的貼紙，點了進貼紙本 */}
      <motion.button
        className="sticker-board"
        data-door="stickers"
        aria-label="貼紙本"
        initial={intro ? { y: -24, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 15, delay: 0.75 }}
        {...tap('stickers', () => open({ name: 'stickers' }))}
      >
        <span className="sbd-tape" aria-hidden="true" />
        <span className="sbd-paper">
          <BoardStickers />
        </span>
        <span className="door-label">貼紙本</span>
      </motion.button>

      <div className="school-yard">
        <div className="doors">
          {SUBJECTS.map((s, i) => {
            const d = LESSONS[s]
            const t = TINT[d.host]
            return (
              <motion.button
                key={s}
                className={`door door-${s}`}
                data-door={s}
                data-named={named === d.host ? '1' : undefined}
                data-point={point === s ? '1' : undefined}
                aria-label={d.title}
                style={{ '--door': t.door, '--door-deep': t.deep, '--glass': t.glass } as CSSProperties}
                initial={intro ? { y: 60, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.15 + i * 0.12 }}
                {...tap(s, () => open({ name: 'lesson', subject: s }))}
              >
                <span className="door-arch">
                  <span className="door-glass">{SIGN[s]}</span>
                  <span className="door-knob" />
                </span>
                <span className="door-host" data-hop={hop?.who === d.host ? hop.n : undefined}>
                  {/* 換 key 重新掛上：從第一格開始跳一次 */}
                  <motion.span
                    key={hop?.who === d.host ? hop.n : 0}
                    style={{ display: 'block' }}
                    animate={hop?.who === d.host ? { y: ['0%', '-40%', '0%', '-14%', '0%'] } : { y: '0%' }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  >
                    <Dino who={d.host} mood="idle" size="100%" flip={i === 2} />
                  </motion.span>
                </span>
                {point === s && (
                  // 點了鎖住的遊戲角：門頂上一隻手指，指著這扇門的窗（T-169）；袖口是門的顏色
                  <span className="door-point" data-door-point="" aria-hidden="true">
                    <svg viewBox="0 0 64 84" width="100%" style={{ display: 'block', overflow: 'visible' }}>
                      <g transform="rotate(180 32 42)">
                        <HandArt cuff={t.door} />
                      </g>
                    </svg>
                  </span>
                )}
                <span className="door-label">{d.title}</span>
              </motion.button>
            )
          })}
        </div>
        <PlayCorner
          gate={gate}
          shut={shut}
          opening={opening === 'go'}
          point={point}
          intro={intro}
          tap={tap}
          onOpen={open}
          onShut={nudge}
        />
      </div>
    </div>
  )
}

/** 學校的牆和屋簷：低對比，只是告訴大人「這是學校」，不搶門的注意力 */
function SchoolWall() {
  return (
    <svg className="school-wall" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path d="M0 140 L600 70 L1200 140 V800 H0 Z" fill="#F7F1E6" />
      <path d="M-20 150 L600 74 L1220 150" fill="none" stroke="#E7DCC8" strokeWidth={18} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={600} cy={128} r={22} fill="#F6DE95" stroke="#E9CF82" strokeWidth={5} />
      <path d="M600 112 V128 L611 136" fill="none" stroke="#B99B7A" strokeWidth={4} strokeLinecap="round" />
      <path d="M0 708 H1200 V800 H0 Z" fill="#E7DDCB" />
      <path d="M0 708 H1200" stroke="#DCCFB8" strokeWidth={5} />
    </svg>
  )
}

/**
 * 遊戲角（T-152）：門燈一排＋兩扇並排的圓窗。
 * 鎖住時：兩片窗簾從兩邊拉上、中間留一條縫看得到裡面的圖（不用鎖頭、不變灰、不打叉）；門燈還沒上的是虛線空格、上完的是實心加小勾。
 * 平常都是靜止的（MOTION-2、DISPLAY-1）：窗簾只在三盞都亮的那一刻拉開一次；點了鎖住的窗，引導在課門上（Home 的 nudge）。
 * 點門燈等於點遊戲角：鎖住時一樣是提醒；開著的時候門燈只是告訴他今天上了哪幾堂，點了輕輕一聲。
 */
function PlayCorner(p: {
  gate: HomeGate | null
  shut: boolean
  opening: boolean
  point: GateSubject | null
  intro: boolean
  tap: ReturnType<typeof useTaps>
  onOpen: (to: Route) => void
  onShut: () => void
}) {
  const { shut, tap } = p
  const lit = p.gate?.lit
  const left = lit ? GATE_ORDER.filter((s) => !lit[s]).length : undefined
  return (
    <div className="side-doors play-corner" data-corner={shut ? 'locked' : 'open'} data-anim={p.opening ? '1' : undefined}>
      <motion.button
        className="corner-lamps"
        data-corner-lamps=""
        data-left={left}
        aria-label="今天上了哪幾堂課"
        initial={p.intro ? { y: -16, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 15, delay: 0.7 }}
        {...tap('lamps', () => (shut ? p.onShut() : sfx.tap()))}
      >
        {GATE_ORDER.map((s) => {
          const t = TINT[LESSONS[s].host]
          return (
            <span
              key={s}
              className={`lamp lamp-${s}`}
              data-lamp={s}
              data-lit={lit?.[s] ? '1' : undefined}
              data-point={p.point === s ? '1' : undefined}
              style={{ '--door': t.door, '--door-deep': t.deep, '--glass': t.glass } as CSSProperties}
            >
              <span className="lamp-sign">{LAMP_SIGN[s]}</span>
              {lit?.[s] && (
                <svg className="lamp-tick" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx={8} cy={8} r={7.4} fill="#fbf8f2" />
                  <path d="M4.6 8.3l2.3 2.3 4.5-4.8" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          )
        })}
      </motion.button>
      <div className="corner-windows">
        {CORNER.map((x, i) => (
          <motion.button
            key={x.id}
            className={`side-door side-${x.id}`}
            data-door={x.id}
            data-shut={shut ? '1' : undefined}
            aria-label={x.label}
            initial={p.intro ? { scale: 0.6, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 160, damping: 15, delay: 0.55 + i * 0.1 }}
            {...tap(x.id, () => (shut ? p.onShut() : p.onOpen(x.to)))}
          >
            <span className="side-window">
              <Emoji name={x.icon} />
              {/* 窗簾：點了不晃（T-169：左右晃像搖頭說不行），只在三盞都亮的那一刻拉開一次 */}
              <span className="curtains" aria-hidden="true">
                <span className="curtain curtain-l" />
                <span className="curtain curtain-r" />
              </span>
            </span>
            <span className="door-label">{x.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

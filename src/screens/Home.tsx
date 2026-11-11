import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { DINO_EN, Dino } from '../art/Dino'
import { Emoji } from '../art/Emoji'
import { go, type Route } from '../lib/nav'
import { audioClock, onSpeech, say, sfx, stopSpeech } from '../lib/audio'
import { audioReady, onUnlock } from '../lib/boot'
import { getKV, setKV } from '../lib/db'
import { segments } from '../content/lines'
import { useTaps } from '../ui/tap'
import { useInstall } from '../lib/install'
import { useIntro } from '../ui/Scenes'
import { LESSONS, SUBJECTS, type Subject } from '../lessons'
import type { Speaker } from '../content/lines'
import { BoardStickers } from './StickerBook'
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
  try {
    await say(...INTRO.map((x) => x.key))
  } finally {
    if (my === greetRun) introducing = false
  }
}

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

/** 首頁另外兩個小入口：故事書、自由畫畫（遊戲畫面還是畫畫小屋的那一個） */
const SIDE: { id: 'story' | 'draw'; label: string; icon: string; to: Route }[] = [
  { id: 'story', label: '故事', icon: 'open-book', to: { name: 'storybook' } },
  { id: 'draw', label: '畫畫', icon: 'artist-palette', to: { name: 'draw' } },
]

/**
 * 學校的首頁（2026-10-31 家長決定照學校分科）：三個大門＝英文字母（豆豆）、中文課文（莫莫）、數學數字（波波），
 * 旁邊兩個小一點的故事、畫畫；牆上掛一塊貼紙板（最新的幾張貼紙），點了進貼紙本（T-132）。
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
      if (e.type === 'whole') {
        clear()
        setNamed(x.who)
        return jump(x.who)
      }
      if (e.type === 'end') {
        if (x.key === INTRO[INTRO.length - 1].key) timers.push(window.setTimeout(() => setNamed(null), 800))
        return
      }
      // seg：這一句開始就亮；念到名字的那一刻跳
      if (e.seg === 0) {
        clear()
        setNamed(x.who)
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
                <span className="door-label">{d.title}</span>
              </motion.button>
            )
          })}
        </div>
        <div className="side-doors">
          {SIDE.map((x, i) => (
            <motion.button
              key={x.id}
              className={`side-door side-${x.id}`}
              data-door={x.id}
              aria-label={x.label}
              initial={intro ? { scale: 0.6, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 160, damping: 15, delay: 0.55 + i * 0.1 }}
              {...tap(x.id, () => open(x.to))}
            >
              <span className="side-window">
                <Emoji name={x.icon} />
              </span>
              <span className="door-label">{x.label}</span>
            </motion.button>
          ))}
        </div>
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

import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Dino } from '../art/Dino'
import { Emoji } from '../art/Emoji'
import { go, type Route } from '../lib/nav'
import { say, sfx } from '../lib/audio'
import { on } from '../lib/features'
import { audioReady, onUnlock } from '../lib/boot'
import { useInstall } from '../lib/install'
import { useIntro } from '../ui/Scenes'
import { LESSONS, SUBJECTS, type Subject } from '../lessons'
import type { Speaker } from '../content/lines'
import { AdventureHome } from './HomeAdventure'
import './school.css'

let greeted = false

/** 首頁：今日冒險打開時是舊的「出發」首頁；現在是學校的樣子（三個大門＋故事、畫畫） */
export function Home() {
  return on('adventure') ? <AdventureHome /> : <SchoolHome />
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
  { id: 'draw', label: '畫畫', icon: 'artist-palette', to: { name: 'play', game: 'd-free', station: 'draw' } },
]

/**
 * 學校的首頁（2026-10-31 家長決定照學校分科）：三個大門＝英文字母（豆豆）、中文課文（莫莫）、數學數字（波波），
 * 旁邊兩個小一點的故事、畫畫。除了家長角落沒有別的按鈕；點門任何地方一下就進去。
 * 畫面靜止（MOTION-2）：只有剛打開 App 時大家走進來一次，之後不閃、不晃。
 */
function SchoolHome() {
  const intro = useIntro()
  const install = useInstall()

  useEffect(() => {
    const hello = () => {
      greeted = true
      void say('home.hello')
    }
    if (!greeted && audioReady()) hello()
    return onUnlock(() => {
      if (!greeted) hello()
    })
  }, [])

  const open = (to: Route) => {
    greeted = true
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
                aria-label={d.title}
                style={{ '--door': t.door, '--door-deep': t.deep, '--glass': t.glass } as CSSProperties}
                initial={intro ? { y: 60, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.15 + i * 0.12 }}
                onClick={() => open({ name: 'lesson', subject: s })}
              >
                <span className="door-arch">
                  <span className="door-glass">{SIGN[s]}</span>
                  <span className="door-knob" />
                </span>
                <span className="door-host">
                  <Dino who={d.host} mood="idle" size="100%" flip={i === 2} />
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
              onClick={() => open(x.to)}
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

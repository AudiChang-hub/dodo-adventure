import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Dino, type Mood } from '../art/Dino'
import { BackButton } from '../ui/Back'
import { Emoji } from '../art/Emoji'
import { Scenery } from '../ui/Scenery'
import { ThemeScenery } from '../ui/ThemeScenery'
import { themeNow } from '../lib/theme-play'
import { ProgressStars } from '../ui/ProgressStars'
import { station as stationDef } from '../content/games'
import { coplayHint } from '../content/coplay'
import { useRoute } from '../lib/nav'
import { holdBedtime } from '../lib/session'
import { useGrowth } from '../lib/growth'
import { bandOf } from './frame'
import { FRAMES } from '../content/growth'
import type { StationId } from '../lib/db'
import './coplay.css'

/**
 * 現在在玩哪個遊戲：今日冒險用它告訴 Shell（陪玩提示要依遊戲 id 挑）。
 * 從站點直接玩時路由本身就帶著遊戲 id，不需要提供。
 */
export const PlayingGame = createContext<string | null>(null)

function usePlayingGame(): string | null {
  const fromAdventure = useContext(PlayingGame)
  const r = useRoute()
  return fromAdventure ?? (r.name === 'play' ? r.game : null)
}

/** 給爸爸看的一行中文陪玩提示：小字、低對比、不接收點擊（benchmark 手法 2） */
export function CoplayHint({ station, text: override }: { station: StationId; text?: string }) {
  const gameId = usePlayingGame()
  // 一進遊戲就決定，玩的過程中不換句子（遊戲自己給的提示例外，例如描字的建議工具）
  const [picked] = useState(() => coplayHint(gameId, station))
  const text = override ?? picked
  return (
    <p className="coplay-hint" aria-hidden="true">
      <span className="coplay-tag">陪玩</span>
      {text}
    </p>
  )
}

export interface GameResult {
  items: number
  firstTry: number
}

export interface GameProps {
  gameId: string
  onDone: (r: GameResult) => void
  onExit: () => void
  /** 主題式冒險的主題（content/themes.ts）。PlayGame 會在遊戲期間設成 themeNow()，各遊戲不用自己傳 */
  theme?: string
}

export function HomeIcon() {
  return (
    <svg viewBox="0 0 48 48" width={40} aria-hidden="true">
      <path d="M8 22 L24 8 L40 22 V38 Q40 41 37 41 H11 Q8 41 8 38 Z" fill="#F1D27C" stroke="#2E2A25" strokeWidth={3.5} strokeLinejoin="round" />
      <rect x={19} y={27} width={10} height={14} rx={3} fill="#E99A84" />
    </svg>
  )
}

/** 站點的圓牌（跟地圖上那一站同一個圖）：從站點進來的遊戲「回站點」用 */
export function StationIcon({ station }: { station: StationId }) {
  const st = stationDef(station)
  return (
    <span className="back-station" style={{ background: st.tint }} aria-hidden="true">
      <Emoji name={st.icon} />
    </span>
  )
}

/** 今天的小路線（三面小旗沿著路、最後是蛋）：今日冒險裡「回路線圖」用 */
export function RouteIcon() {
  return (
    <svg viewBox="0 0 48 48" width={40} aria-hidden="true">
      <path d="M6 38 C14 38 14 28 22 28 S 32 18 42 14" fill="none" stroke="#E2D8C6" strokeWidth={9} strokeLinecap="round" />
      <path d="M6 38 C14 38 14 28 22 28 S 32 18 42 14" fill="none" stroke="#2E2A25" strokeWidth={2.5} strokeDasharray="3 4" strokeLinecap="round" />
      <path d="M12 34 V22 L19 25 L12 28" fill="#E99A84" stroke="#2E2A25" strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M27 24 V12 L34 15 L27 18" fill="#BFDCC8" stroke="#2E2A25" strokeWidth={2.5} strokeLinejoin="round" />
      <ellipse cx={41} cy={10} rx={5} ry={6.5} fill="#F1D27C" stroke="#2E2A25" strokeWidth={2.5} />
    </svg>
  )
}

/** 摺起來的地圖：站點畫面「回地圖」用 */
export function MapIcon() {
  return (
    <svg viewBox="0 0 48 48" width={40} aria-hidden="true">
      <path d="M6 12 L17 8 L31 13 L42 9 V36 L31 40 L17 35 L6 39 Z" fill="#BFDCC8" stroke="#2E2A25" strokeWidth={3.5} strokeLinejoin="round" />
      <path d="M17 8 V35 M31 13 V40" stroke="#2E2A25" strokeWidth={3} />
      <path d="M22 22 q4 -6 8 0 q-4 7 -4 9 q0 -2 -4 -9 Z" fill="#E99A84" />
    </svg>
  )
}

interface Props {
  station: StationId
  mood: Mood
  progress?: { total: number; done: number }
  onExit: () => void
  onHost?: () => void
  children: ReactNode
  hideHost?: boolean
  /** 角落的陪玩提示，預設顯示；傳 false 就不顯示 */
  hint?: boolean
  /** 遊戲自己決定的陪玩提示（例如描字現在建議用手指還是用筆），取代預設的那句 */
  hintText?: string
  /** 示範中（筆、手在畫）：只輸出成 data-demo 標記給三歲模擬測試看（tests/toddler），不影響行為 */
  demo?: boolean
}

/** 小班段的觸控尺寸（準則 TOUCH-1 的 px，跟 styles/global.css 的 --touch-* 一樣）；其他年段照外框的公分數等比例換算 */
const TOUCH_PX = { min: 90, primary: 112, gap: 28 }

/** 每個遊戲共用的舞台：上方返回鍵（點一下回上一層）與進度、左下角是主持的恐龍（點它會再說一次題目） */
export function Shell({ station, mood, progress, onExit, onHost, children, hideHost, hint = true, hintText, demo }: Props) {
  const st = stationDef(station)
  // 主題式冒險：每一站都是同一個故事的場景（公車旅行的街道），不分站點的顏色和背景，孩子不會覺得「現在換到數學了」
  const [th] = useState(themeNow)
  // 遊戲在畫面上的時候，每日時間到了也先等它玩完（在兩個遊戲之間才去睡覺）
  useEffect(() => holdBedtime(), [])
  // 從站點進來的遊戲回站點；今日冒險裡的遊戲回冒險的路線圖（保留今天走到哪）
  const toStation = useRoute().name === 'play'
  // 年段的操作外框（成長系統 G-3）：觸控尺寸寫成 CSS 變數給共用元件用；data-band 給三歲模擬測試和截圖看是哪個年段的外框
  const growth = useGrowth()
  const f = growth.frame
  const s = FRAMES.small
  const touch = {
    '--touch-min': `${Math.round(TOUCH_PX.min * (f.touchCm / s.touchCm))}px`,
    '--touch-primary': `${Math.round(TOUCH_PX.primary * (f.primaryCm / s.primaryCm))}px`,
    '--touch-gap': `${Math.round(TOUCH_PX.gap * (f.gapCm / s.gapCm))}px`,
  }
  return (
    <div
      className="stage"
      data-demo={demo ? '1' : undefined}
      data-band={bandOf(growth, 'maxOptions')}
      style={{ '--stage': th?.tint ?? st.tint, '--deep': th?.deep ?? st.deep, ...touch } as CSSProperties}
    >
      {th ? <ThemeScenery def={th} /> : <Scenery station={station} />}
      <div className="stage-top">
        <BackButton label={toStation ? `回${st.name}` : '回路線圖'} onTap={onExit}>
          {toStation ? <StationIcon station={station} /> : <RouteIcon />}
        </BackButton>
        {/* 答對時星星飛進這一格（成就感強化） */}
        {progress && <ProgressStars total={progress.total} done={progress.done} />}
        {/* 跟返回鍵一樣寬：進度點在正中間 */}
        <div style={{ width: 92 }} />
        {hint && <CoplayHint station={station} text={hintText} />}
      </div>
      <div className="stage-main">{children}</div>
      {!hideHost && (
        <div className="stage-host">
          <Dino who={st.host} mood={mood} size="100%" onTap={onHost} />
        </div>
      )}
      {!hideHost && <div className="stage-host-rest" aria-hidden="true" />}
    </div>
  )
}

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Dino, type Mood } from '../art/Dino'
import { BackButton } from '../ui/Back'
import { Scenery } from '../ui/Scenery'
import { ProgressStars } from '../ui/ProgressStars'
import { station as stationDef } from '../content/games'
import { coplayHint } from '../content/coplay'
import { useRoute } from '../lib/nav'
import { holdBedtime } from '../lib/session'
import type { StationId } from '../lib/db'
import './coplay.css'

/**
 * 一局結束的慶祝（ui/Celebrate.tsx：每局回顧、里程碑、挑貼紙）正蓋在遊戲上面：PlayGame 告訴 Shell。
 * 慶祝的紙色遮罩蓋住整個畫面，但返回鍵要留在最上層、點一下就離開（準則 NAV-1、NAV-7），
 * 上方那一排的其他東西（進度點、陪玩小字）跟著遊戲一起藏到遮罩後面。
 */
export const Cheering = createContext(false)

/**
 * 一局結束、慶祝也看完了，停在遊戲畫面上（T-110：畫畫完成後點畫面任何地方都會被帶回首頁，他只是想再看一下自己的畫）：
 * 有值的時候遊戲要放一顆大房子，點房子才呼叫它回去；點別的地方不離開。PlayGame 給。
 */
export const Resting = createContext<(() => void) | null>(null)

/** 現在在玩哪個遊戲（陪玩提示要依遊戲 id 挑）：路由帶著遊戲 id；學校的一堂課沒有 */
function usePlayingGame(): string | null {
  const r = useRoute()
  return r.name === 'play' ? r.game : null
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
  /** 著色本選的那一張圖（T-138）；其他遊戲沒有 */
  pic?: string
  onDone: (r: GameResult) => void
  onExit: () => void
}

export function HomeIcon() {
  return (
    <svg viewBox="0 0 48 48" width={40} aria-hidden="true">
      <path d="M8 22 L24 8 L40 22 V38 Q40 41 37 41 H11 Q8 41 8 38 Z" fill="#F1D27C" stroke="#2E2A25" strokeWidth={3.5} strokeLinejoin="round" />
      <rect x={19} y={27} width={10} height={14} rx={3} fill="#E99A84" />
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

/** 每個遊戲共用的舞台：上方返回鍵（點一下回上一層）與進度、左下角是主持的恐龍（點它會再說一次題目） */
export function Shell({ station, mood, progress, onExit, onHost, children, hideHost, hint = true, hintText, demo }: Props) {
  const st = stationDef(station)
  // 遊戲在畫面上的時候，每日時間到了也先等它玩完（在兩個遊戲之間才去睡覺）
  useEffect(() => holdBedtime(), [])
  const cheering = useContext(Cheering)
  return (
    <div
      className={`stage${cheering ? ' cheering' : ''}`}
      data-demo={demo ? '1' : undefined}
      style={{ '--stage': st.tint, '--deep': st.deep } as CSSProperties}
    >
      {/* 觸控尺寸（--touch-*）用 styles/global.css 的小班段外框 */}
      <Scenery station={station} />
      <div className="stage-top">
        {/* 學校的一堂課、首頁的畫畫：返回都回首頁 */}
        <BackButton label="回首頁" onTap={onExit}>
          <HomeIcon />
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

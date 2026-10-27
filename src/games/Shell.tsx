import type { CSSProperties, ReactNode } from 'react'
import { Dino, type Mood } from '../art/Dino'
import { HoldButton } from '../ui/Hold'
import { Scenery } from '../ui/Scenery'
import { station as stationDef } from '../content/games'
import type { StationId } from '../lib/db'

export interface GameResult {
  items: number
  firstTry: number
}

export interface GameProps {
  gameId: string
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
}

/** 每個遊戲共用的舞台：上方返回鍵與進度、左下角是主持的恐龍（點它會再說一次題目） */
export function Shell({ station, mood, progress, onExit, onHost, children, hideHost }: Props) {
  const st = stationDef(station)
  return (
    <div className="stage" style={{ '--stage': st.tint, '--deep': st.deep } as CSSProperties}>
      <Scenery station={station} />
      <div className="stage-top">
        <HoldButton label="回首頁（按住）" onHold={onExit}>
          <HomeIcon />
        </HoldButton>
        {progress && (
          <div className="progress" aria-label={`第 ${progress.done + 1} 題，共 ${progress.total} 題`}>
            {Array.from({ length: progress.total }, (_, i) => (
              <i key={i} className={i < progress.done ? 'on' : i === progress.done ? 'now' : undefined} />
            ))}
          </div>
        )}
        <div style={{ width: 76 }} />
      </div>
      <div className="stage-main">{children}</div>
      {!hideHost && (
        <div className="stage-host">
          <Dino who={st.host} mood={mood} size="100%" onTap={onHost} />
        </div>
      )}
    </div>
  )
}

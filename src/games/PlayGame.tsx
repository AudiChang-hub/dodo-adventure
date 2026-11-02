import { useEffect, useRef, useState, type ReactElement } from 'react'
import { game } from '../content/games'
import { Cheering, type GameProps, type GameResult } from './Shell'
import { Celebrate } from '../ui/Celebrate'
import { beginRound, endRound, type RoundSummary } from '../lib/achievements'
import { useBack } from '../lib/nav'
import { stopSpeech } from '../lib/audio'
import { FreeDraw } from './draw/FreeDraw'
import type { GameKind } from '../content/games'

/**
 * 孩子點得到的遊戲只剩首頁「畫畫」那一扇門進去的自由畫畫（2026-10-31 改成學校的三堂課；舊的站點、冒險遊戲 T-75 拿掉了）。
 * 其他 id（舊的網址、舊資料）沒有畫面：直接交回上一層。
 */
const BY_KIND: Partial<Record<GameKind, (p: GameProps) => ReactElement>> = {
  free: FreeDraw,
}

export function PlayGame(props: GameProps) {
  const g = game(props.gameId)
  const C = BY_KIND[g.kind]
  // 成就感：在遊戲自己的 markPlayed 之前記下開局的難度；結束時先回顧這一局、慶祝里程碑，再交回去
  useState(() => beginRound(g.id))
  const [cheer, setCheer] = useState<{ r: GameResult; s: RoundSummary } | null>(null)
  const ended = useRef(false)
  /** 已經交回去了（站點或冒險的下一段）：只交一次，慶祝自己結束和返回鍵不會各交一次 */
  const handed = useRef(false)
  const finish = (r: GameResult) => {
    if (handed.current) return
    handed.current = true
    props.onDone(r)
  }
  const onDone = (r: GameResult) => {
    if (ended.current) return
    ended.current = true
    const s = endRound(g.id)
    if (!s.things.length && !s.milestones.length) return finish(r)
    setCheer({ r, s })
  }
  /**
   * 返回（返回鍵、Android 的返回手勢）：玩到一半就回上一層，已經答的題目都記下了（logAttempt 每題當下就寫）。
   * 慶祝中返回當作看完慶祝：這一局照樣算完成，不會因為返回少一站。已經交回去了就交給外層（冒險）處理。
   * 慶祝蓋著遊戲時，返回鍵還是在遮罩上面（Shell 讀 Cheering），點一下就離開，不是只跳過這一段慶祝。
   */
  const exit = () => {
    if (handed.current) return false
    if (cheer) {
      // 慶祝的那一句不要跟著到下一個畫面
      stopSpeech()
      return finish(cheer.r)
    }
    props.onExit()
  }
  useBack(exit)
  useEffect(() => {
    if (!C) props.onExit()
  }, [])
  if (!C) return null
  return (
    <Cheering.Provider value={!!cheer}>
      <C key={g.id} {...props} gameId={g.id} onDone={onDone} onExit={exit} />
      {cheer && <Celebrate summary={cheer.s} onDone={() => finish(cheer.r)} />}
    </Cheering.Provider>
  )
}

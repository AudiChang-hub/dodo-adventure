import { useEffect, useRef, useState, type ReactElement } from 'react'
import { game } from '../content/games'
import { Cheering, Resting, type GameProps, type GameResult } from './Shell'
import { Celebrate } from '../ui/Celebrate'
import { beginRound, endRound, type RoundSummary } from '../lib/achievements'
import { useBack } from '../lib/nav'
import { stopSpeech } from '../lib/audio'
import { FreeDraw } from './draw/FreeDraw'
import { ColoringGame } from './draw/ColoringGame'
import type { GameKind } from '../content/games'

/**
 * 孩子點得到的遊戲只剩首頁「畫畫」那一扇門進去的自由畫畫、著色本（2026-10-31 改成學校的三堂課；舊的站點、冒險遊戲 T-75 拿掉了；著色本 T-138 恢復）。
 * 其他 id（舊的網址、舊資料）沒有畫面：直接交回上一層。
 */
const BY_KIND: Partial<Record<GameKind, (p: GameProps) => ReactElement>> = {
  free: FreeDraw,
  // 著色本（T-138，家長 2026-11-11 要求）：從畫畫的「著色本」選一張圖進來
  coloring: ColoringGame,
}

export function PlayGame(props: GameProps) {
  const g = game(props.gameId)
  const C = BY_KIND[g.kind]
  // 成就感：在遊戲自己的 markPlayed 之前記下開局的難度；結束時先回顧這一局、慶祝里程碑，再交回去
  useState(() => beginRound(g.id))
  const [cheer, setCheer] = useState<{ r: GameResult; s: RoundSummary } | null>(null)
  /**
   * 慶祝看完了：停在遊戲畫面上（作品還在），遊戲放一顆大房子，點房子才交回去（T-110）。
   * 以前慶祝一結束（或點一下跳過）就回首頁：孩子點畫上的星星想再看一下，就被帶走了。
   */
  const [rest, setRest] = useState(false)
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
    setCheer({ r, s })
    // 沒有東西可以回顧：不蓋慶祝，直接停在作品上等他點房子
    if (!s.things.length && !s.milestones.length) setRest(true)
  }
  /**
   * 返回（返回鍵、Android 的返回手勢、停下來時的大房子）：玩到一半就回上一層，已經答的題目都記下了（logAttempt 每題當下就寫）。
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
    <Cheering.Provider value={!!cheer && !rest}>
      <Resting.Provider value={rest ? () => void exit() : null}>
        <C key={g.id} {...props} gameId={g.id} onDone={onDone} onExit={exit} />
      </Resting.Provider>
      {cheer && !rest && <Celebrate summary={cheer.s} onDone={() => setRest(true)} />}
    </Cheering.Provider>
  )
}

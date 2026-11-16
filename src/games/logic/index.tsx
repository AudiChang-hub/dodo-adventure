import { go } from '../../lib/nav'
import { Shell } from '../Shell'

// 遊戲角的邏輯遊戲（T-152）。P1 先放空殼：首頁還沒有入口，孩子看不到；P3 換成真的選玩法和兩種玩法。

/** 遊戲角「邏輯遊戲」進來：選豆豆收拾還是串珠珠（P3 做） */
export function LogicPick() {
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'home' }, { back: true })} hideHost hint={false}>
      <div data-logic-pick="">建設中</div>
    </Shell>
  )
}

/** 一種玩法：sort 豆豆收拾、pattern 串珠珠（P3 做） */
export function LogicPlay({ game }: { game: 'sort' | 'pattern' }) {
  return (
    <Shell station="logic" mood="idle" onExit={() => go({ name: 'logic' }, { back: true })} hideHost hint={false}>
      <div data-logic-play={game}>建設中</div>
    </Shell>
  )
}

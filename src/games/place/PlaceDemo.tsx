// 操作降階版的示範用法（成長系統 G-3）：家長區「年齡與年段」裡試玩，看每個年段「拿起來放進去」怎麼操作。
// 第 3 階段的遊戲（數字火車站、排長短、規律補洞…）照這個寫法用 Place：遊戲只管題目和對錯，手勢交給 Place。
//
// 題目：三顆蛋照大小排進窩裡（小的先放）。fill: 'next'：點一下就飛進下一個空格，順序不對就飛回來。
import { useState } from 'react'
import { BAND_ZH, BANDS, FRAMES, type Band } from '../../content/growth'
import { useGrowth } from '../../lib/growth'
import { sfx } from '../../lib/audio'
import { Emoji } from '../../art/Emoji'
import { bandOf } from '../frame'
import { Place, type PlaceHow, type PlacePiece, type PlaceSlot } from './Place'

/** 三顆蛋的大小（片子裡佔多少）：由小到大就是正確的順序 */
const EGGS = [
  { id: 'egg-s', label: '小蛋', size: '48%' },
  { id: 'egg-m', label: '中蛋', size: '70%' },
  { id: 'egg-l', label: '大蛋', size: '92%' },
]
/** 片子在托盤裡的順序：故意打亂，不是由小到大 */
const TRAY = ['egg-l', 'egg-s', 'egg-m']

const egg = (size: string) => (
  <span style={{ display: 'block', width: size, height: size }}>
    <Emoji name="egg" />
  </span>
)

const PIECES: PlacePiece[] = TRAY.map((id) => {
  const e = EGGS.find((x) => x.id === id)!
  return { id, label: e.label, node: egg(e.size) }
})
const SLOTS: PlaceSlot[] = EGGS.map((e, i) => ({ id: `nest-${i}`, label: `第 ${i + 1} 個窩`, node: egg(e.size) }))

const HOW: Record<Band, string> = {
  small: '只用點的：點一下蛋，蛋就飛進下一個窩。',
  middle: '點一下或拖過去都可以：放手時靠近窩就會吸進去，拖到一半放開，蛋安靜地回原位，不算錯。',
  big: '點、拖都可以；拖曳本身是學習目標的題目（例如插到中間）才會要求拖，點了蛋只會往窩那邊輕推一下。',
}

export function PlaceDemo() {
  const growth = useGrowth()
  const now = bandOf(growth, 'drag')
  const [band, setBand] = useState<Band>(now)
  const [mustDrag, setMustDrag] = useState(false)
  const [placed, setPlaced] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const done = Object.keys(placed).length === SLOTS.length

  const reset = () => {
    setPlaced({})
    setNote('')
  }

  const onPlace = (piece: string, slot: string, how: PlaceHow) => {
    const want = EGGS[Number(slot.split('-')[1])].id
    if (piece !== want) {
      sfx.gentle()
      setNote('順序不對，蛋飛回去了（孩子端不會有紅叉，答錯的支架由遊戲決定）。')
      return false
    }
    sfx.correct()
    setPlaced((p) => ({ ...p, [slot]: piece }))
    setNote(how === 'drag' ? '用拖的放進去了。' : '用點的放進去了。')
    return true
  }

  return (
    <div className="place-demo">
      <div className="place-demo-bar" role="radiogroup" aria-label="看哪個年段的操作">
        {BANDS.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={band === b}
            className={`place-demo-band${band === b ? ' on' : ''}`}
            onClick={() => {
              setBand(b)
              reset()
            }}
          >
            {BAND_ZH[b]}
            {b === now && <span className="place-demo-now">現在</span>}
          </button>
        ))}
      </div>
      <p className="place-demo-how">{HOW[band]}</p>
      {band === 'big' && (
        <label className="place-demo-check">
          <input type="checkbox" checked={mustDrag} onChange={(e) => setMustDrag(e.target.checked)} />
          這一題的學習目標是「拖」
        </label>
      )}
      <div className="place-demo-stage">
        <Place pieces={PIECES} slots={SLOTS} placed={placed} fill="next" drag={FRAMES[band].drag} dragGoal={mustDrag} onPlace={onPlace} onNeedDrag={() => setNote('要用拖的：蛋往窩那邊輕推了一下。')} />
      </div>
      <div className="place-demo-foot">
        <span aria-live="polite">{done ? '排好了！小的先、大的後。' : note || '試試看：照大小排，小的先放。'}</span>
        <button type="button" className="btn" onClick={reset}>
          再玩一次
        </button>
      </div>
    </div>
  )
}

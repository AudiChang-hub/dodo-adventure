import { useState } from 'react'
import { motion } from 'motion/react'
import { countIcons } from './plan'
import { AWAY_S, LoadPart, type LoadSkin, type Pt } from './Load'
import type { PartCtx } from './kit'

/** 左邊可以拿的東西：跟拿給波波一樣兩排（上 4、下 3），左下角留給波波 */
const SUPPLY: Pt[] = [
  { x: 23, y: 24 },
  { x: 34, y: 24 },
  { x: 45, y: 24 },
  { x: 56, y: 24 },
  { x: 34, y: 46 },
  { x: 45, y: 46 },
  { x: 56, y: 46 },
]
/** 火車頭在右下（往右開走）；車廂一節一節往左接，第 1 節緊貼火車頭。y 是鐵軌（車輪站在這條線上，math.css 往上長） */
const ENGINE = { x: 86, y: 84 }
const CAR_GAP = 12
/** 開走：整列往右移出畫面 */
const AWAY_DX = 64
const carPos = (i: number, _n: number, away: boolean): Pt => ({ x: ENGINE.x - CAR_GAP * (i + 1) + (away ? AWAY_DX : 0), y: ENGINE.y })

function Car() {
  return (
    <svg className="ma-car" viewBox="0 0 120 90" aria-hidden="true">
      <rect x={8} y={18} width={104} height={50} rx={10} fill="#E9B872" stroke="#2E2A25" strokeWidth={4} />
      <rect x={18} y={28} width={84} height={14} rx={6} fill="#F6DDB0" />
      <circle cx={34} cy={74} r={11} fill="#5D5148" stroke="#2E2A25" strokeWidth={4} />
      <circle cx={86} cy={74} r={11} fill="#5D5148" stroke="#2E2A25" strokeWidth={4} />
      <path d="M0 52 H8 M112 52 H120" stroke="#2E2A25" strokeWidth={5} strokeLinecap="round" />
    </svg>
  )
}

function Engine() {
  return (
    <svg viewBox="0 0 140 120" aria-hidden="true">
      <rect x={14} y={16} width={56} height={58} rx={8} fill="#D9826A" stroke="#2E2A25" strokeWidth={4} />
      <rect x={24} y={26} width={36} height={24} rx={5} fill="#E3EEF2" stroke="#2E2A25" strokeWidth={3} />
      <rect x={66} y={46} width={58} height={42} rx={10} fill="#D9826A" stroke="#2E2A25" strokeWidth={4} />
      <rect x={96} y={20} width={16} height={28} rx={4} fill="#5D5148" stroke="#2E2A25" strokeWidth={4} />
      <rect x={6} y={72} width={124} height={22} rx={8} fill="#B85F4A" stroke="#2E2A25" strokeWidth={4} />
      <circle cx={34} cy={100} r={14} fill="#5D5148" stroke="#2E2A25" strokeWidth={4} />
      <circle cx={100} cy={100} r={14} fill="#5D5148" stroke="#2E2A25" strokeWidth={4} />
    </svg>
  )
}

/**
 * 拿給波波的第 2 種玩法（T-127）：小火車。「Three! Put three on the train!」車廂有 N 節，點左邊的東西就坐上下一節空車廂、
 * 波波數一聲；點車上的就下車。坐好了按勾勾，火車開走（There are three! Choo choo! Bye-bye!）。
 * 流程（示範、搶點、發呆、答錯、記錄 give:N）跟拿給波波一樣，在 ./Load.tsx。
 */
export function TrainPart({ ctx }: { ctx: PartCtx }) {
  const [icon] = useState(() => countIcons(1)[0])
  const skin: LoadSkin = {
    play: 'train',
    className: 'ma-train',
    askLine: (n) => `ma.train.${n}`,
    doneLine: () => 'ma.train.go',
    source: true,
    sourcePos: (k) => SUPPLY[k],
    slotPos: carPos,
    done: { x: 86, y: 34 },
    icon,
    sourceLabel: (k, on) => (on ? `拿回第 ${k + 1} 個（下車）` : `第 ${k + 1} 個坐上火車`),
    slotLabel: (i, full) => `第 ${i + 1} 節車廂${full ? '' : '（空的）'}`,
    body: ({ away, glad }) => (
      <>
        <div className="ma-rail" aria-hidden="true" />
        <motion.div
          // 交出去、數的時候（還沒開走）：火車頭輕輕顛，看得出要出發了、正在等（T-140）
          className={`ma-engine${glad && !away ? ' is-ready' : ''}`}
          aria-hidden="true"
          initial={false}
          animate={{ left: `${ENGINE.x + (away ? AWAY_DX : 0)}%` }}
          transition={{ duration: away ? AWAY_S : 0, ease: 'easeIn' }}
          style={{ top: `${ENGINE.y}%` }}
        >
          <Engine />
        </motion.div>
      </>
    ),
    emptySlot: () => <Car />,
  }
  return <LoadPart ctx={ctx} skin={skin} />
}

import { useState } from 'react'
import { getTodayWorld } from '../../lib/today-world'
import { pick } from '../../lib/random'
import { LoadPart, type LoadSkin, type Pt } from './Load'
import type { PartCtx } from './kit'

/** 花圃上的洞：一排，置中（5 個也放得下），左下角留給波波 */
const BED_Y = 68
const GAP = 13
const holePos = (i: number, n: number): Pt => ({ x: 57 - (GAP * (n - 1)) / 2 + GAP * i, y: BED_Y })

function Hole() {
  return (
    <svg className="ma-hole" viewBox="0 0 100 60" aria-hidden="true">
      <ellipse cx={50} cy={34} rx={40} ry={18} fill="#8C6A4F" stroke="#5D4636" strokeWidth={4} />
      <ellipse cx={50} cy={30} rx={28} ry={10} fill="#6B4F3A" />
    </svg>
  )
}

/**
 * 拿給波波的第 3 種玩法（T-127）：種花。「Three! Plant three flowers!」花圃上有 N 個洞，點一個洞就種一朵，
 * 波波數一聲；點已經種好的就收回去。種好了按勾勾，花一起長大（There are three! Look! They grow!）。
 * 流程（示範、搶點、發呆、答錯、記錄 give:N）跟拿給波波一樣，在 ./Load.tsx。
 */
export function PlantPart({ ctx }: { ctx: PartCtx }) {
  const [icon] = useState(() => (getTodayWorld()?.id === 'garden' ? 'sunflower' : pick(['tulip', 'sunflower'])))
  const skin: LoadSkin = {
    play: 'plant',
    className: 'ma-plant',
    askLine: (n) => `ma.plant.${n}`,
    doneLine: (n) => (n === 1 ? 'ma.plant.grow1' : 'ma.plant.grow'),
    source: false,
    sourcePos: (k) => holePos(k, 1),
    slotPos: (i, n) => holePos(i, n),
    done: { x: 86, y: 30 },
    icon,
    sourceLabel: () => '',
    slotLabel: (i, full) => (full ? `拿回第 ${i + 1} 朵花` : `在第 ${i + 1} 個洞種一朵花`),
    body: ({ n }) => {
      const a = holePos(0, n).x - GAP / 2 - 1
      const b = holePos(n - 1, n).x + GAP / 2 + 1
      return <div className="ma-bed" aria-hidden="true" style={{ left: `${a}%`, width: `${b - a}%`, top: `${BED_Y}%` }} />
    },
    emptySlot: () => <Hole />,
  }
  return <LoadPart ctx={ctx} skin={skin} />
}

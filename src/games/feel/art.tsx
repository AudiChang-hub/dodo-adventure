// 心情臉（T-160）的小圖示：選玩法、「再一局」用。兩張臉：開心的兔子、難過的小熊。
import { CritterHead } from './critter'

export function FeelPickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <g transform="translate(4 56) scale(0.5)">
        <CritterHead sp="bunny" face="happy" />
      </g>
      <g transform="translate(118 62) scale(0.5)">
        <CritterHead sp="bear" face="sad" />
      </g>
    </svg>
  )
}

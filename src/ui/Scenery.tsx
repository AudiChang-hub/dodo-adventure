import type { StationId } from '../lib/db'

/**
 * 各站點的背景：只在畫面邊緣放低對比的造型，不搶題目的注意力。
 * 遊戲物件會撒在舞台中間（見 games/layout.ts 的 scatter），裝飾只能放在地面帶或左右最外緣，
 * 也不要用和題目物件相像的形狀與顏色（彩色方塊、圓點），孩子會以為可以點或可以數。
 */
export function Scenery({ station }: { station: StationId | 'home' }) {
  return (
    <svg className="scenery" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}>
      {station === 'english' && (
        <g opacity={0.9}>
          <path d="M0 690 Q300 640 600 680 T1200 660 V800 H0 Z" fill="#B7DCC5" />
          {[[90, 600, 1], [1080, 560, 1.25], [1170, 640, 0.8], [30, 680, 0.7]].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <rect x={-9} y={0} width={18} height={90} rx={8} fill="#B99B7A" />
              <circle cx={0} cy={-20} r={62} fill="#9ACDAF" />
              <circle cx={-34} cy={8} r={40} fill="#A8D5BA" />
              <circle cx={38} cy={4} r={44} fill="#8FC5A5" />
            </g>
          ))}
        </g>
      )}
      {station === 'math' && (
        <g>
          <path d="M0 700 H1200 V800 H0 Z" fill="#EBD3BE" />
          <path d="M0 700 H1200" stroke="#DDBFA3" strokeWidth={6} strokeDasharray="40 30" />
          {[[70, 700, 1], [1140, 700, 0.8], [1186, 700, 0.6]].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <path d="M-34 0 L-12 -96 L12 -96 L34 0 Z" fill="#F0B088" />
              <rect x={-24} y={-62} width={48} height={14} fill="#FBF8F2" />
              <rect x={-44} y={-6} width={88} height={12} rx={4} fill="#D38A5E" />
            </g>
          ))}
        </g>
      )}
      {station === 'mandarin' && (
        <g>
          <path d="M0 680 Q400 650 800 690 T1200 670 V800 H0 Z" fill="#C9DDEB" />
          {[[60, 560, '#F3C1B2'], [1090, 540, '#F6DE95']].map(([x, y, c], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <rect x={0} y={40} width={120} height={110} rx={12} fill={c as string} />
              <path d="M-14 50 L60 -16 L134 50 Z" fill="#B99B7A" />
              <rect x={44} y={92} width={34} height={58} rx={10} fill="#FBF8F2" />
            </g>
          ))}
          <path d="M520 760 q20 -40 40 0 q20 -40 40 0" fill="none" stroke="#A9C98B" strokeWidth={8} strokeLinecap="round" />
        </g>
      )}
      {station === 'draw' && (
        <g>
          <path d="M0 700 H1200 V800 H0 Z" fill="#DCD3EC" />
          {/* 鉛筆平躺在地面帶、和地面同色系：畫畫遊戲幾乎占滿舞台，裝飾不能看起來像可以點的東西 */}
          <g transform="translate(150 742) rotate(-90) scale(0.42)" opacity={0.55}>
            <rect x={-20} y={0} width={40} height={220} rx={10} fill="#C6B8DE" />
            <path d="M-20 220 L0 270 L20 220 Z" fill="#D9CDEA" />
            <path d="M-8 250 L0 270 L8 250 Z" fill="#A99BC6" />
          </g>
        </g>
      )}
      {station === 'park' && (
        <g>
          <path d="M0 690 Q600 640 1200 690 V800 H0 Z" fill="#CFE2B9" />
          {['#E99A84', '#F1D27C', '#A9C98B', '#A3C4E4', '#BFB2DF'].map((c, i) => (
            <path key={c} d={`M${880 + i * 22} 700 A ${300 - i * 22} ${300 - i * 22} 0 0 1 ${1480 - i * 22} 700`} fill="none" stroke={c} strokeWidth={22} opacity={0.75} />
          ))}
        </g>
      )}
      {station === 'home' && (
        <g>
          <path d="M0 520 Q260 430 560 500 T1200 470 V800 H0 Z" fill="#DCE9D2" />
          <path d="M0 610 Q320 540 700 600 T1200 590 V800 H0 Z" fill="#C9DFBF" />
          <path d="M-20 700 Q400 640 760 690 T1240 670" fill="none" stroke="#E9E1D2" strokeWidth={90} strokeLinecap="round" />
          <path d="M-20 700 Q400 640 760 690 T1240 670" fill="none" stroke="#FBF8F2" strokeWidth={5} strokeDasharray="34 30" />
        </g>
      )}
    </svg>
  )
}

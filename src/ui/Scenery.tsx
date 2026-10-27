import type { StationId } from '../lib/db'

/** 各站點的背景：只在畫面邊緣放低對比的造型，不搶題目的注意力 */
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
          {[[70, 700], [1130, 700], [1060, 700]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${i === 2 ? 0.7 : 1})`}>
              <path d="M-34 0 L-12 -96 L12 -96 L34 0 Z" fill="#F0B088" />
              <rect x={-24} y={-62} width={48} height={14} fill="#FBF8F2" />
              <rect x={-44} y={-6} width={88} height={12} rx={4} fill="#D38A5E" />
            </g>
          ))}
          <g transform="translate(1000 520)">
            <rect x={0} y={0} width={70} height={70} rx={10} fill="#F1D27C" />
            <rect x={70} y={30} width={60} height={60} rx={10} fill="#A3C4E4" />
            <rect x={20} y={-56} width={56} height={56} rx={10} fill="#E99A84" />
          </g>
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
          <g transform="translate(200 560) rotate(-62) scale(0.7)">
            <rect x={0} y={0} width={40} height={220} rx={10} fill="#F1D27C" />
            <path d="M0 220 L20 270 L40 220 Z" fill="#E9C9A3" />
            <path d="M12 250 L20 270 L28 250 Z" fill="#2E2A25" />
          </g>
          {[[1110, 730, '#E99A84'], [1170, 690, '#A3C4E4'], [40, 740, '#8FCBAA']].map(([x, y, c], i) => (
            <circle key={i} cx={x as number} cy={y as number} r={34} fill={c as string} opacity={0.7} />
          ))}
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

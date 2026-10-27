/**
 * 編織籃（viewBox 0 0 320 220，籃口橢圓中心在 (160, 70)）。
 * 分成「後面」和「前面」兩層：蛋夾在中間，看起來就是放進籃子裡、只露出上半部。
 */
const RIM = { cx: 160, cy: 70, rx: 150, ry: 38 }

export function BasketBack() {
  return (
    <svg viewBox="0 0 320 220" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <ellipse cx={RIM.cx} cy={210} rx={140} ry={10} fill="rgba(46,42,37,0.12)" />
      <ellipse {...RIM} fill="#B98E62" stroke="rgba(46,42,37,0.4)" strokeWidth={4} />
      <ellipse cx={RIM.cx} cy={RIM.cy + 6} rx={RIM.rx - 16} ry={RIM.ry - 12} fill="#8F6A47" />
    </svg>
  )
}

export function BasketFront({ glow = false }: { glow?: boolean }) {
  const weave = [0, 1, 2, 3]
  return (
    <svg viewBox="0 0 320 220" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <clipPath id="basket-body">
          <path d="M10 70 Q160 124 310 70 L282 188 Q160 222 38 188 Z" />
        </clipPath>
      </defs>
      <path d="M10 70 Q160 124 310 70 L282 188 Q160 222 38 188 Z" fill="#D9AE7E" stroke="rgba(46,42,37,0.4)" strokeWidth={4} strokeLinejoin="round" />
      <g clipPath="url(#basket-body)" fill="none" stroke="#C49466" strokeWidth={7} strokeLinecap="round">
        {weave.map((i) => (
          <path key={i} d={`M0 ${104 + i * 26} Q160 ${150 + i * 26} 320 ${104 + i * 26}`} />
        ))}
        {Array.from({ length: 11 }, (_, i) => (
          <path key={`v${i}`} d={`M${20 + i * 28} 60 L${34 + i * 25} 220`} stroke="#E8C79E" strokeWidth={4} opacity={0.7} />
        ))}
      </g>
      {/* 籃口前緣：粗粗的一圈藤編 */}
      <path d="M10 70 Q160 124 310 70" fill="none" stroke="#A97E54" strokeWidth={16} strokeLinecap="round" />
      <path d="M10 70 Q160 124 310 70" fill="none" stroke="#E8C79E" strokeWidth={4} strokeDasharray="10 12" strokeLinecap="round" />
      {glow && <path d="M10 70 Q160 124 310 70 L282 188 Q160 222 38 188 Z" fill="none" stroke="#F1D27C" strokeWidth={10} className="nudge-path" />}
    </svg>
  )
}

/**
 * 籃子裡第 i 顆蛋的中心（籃子座標）：前排 6 顆先放，再放後排；後排高一點、錯開半格。
 * 蛋的下半部會被籃口前緣（二次曲線，中間最低）擋住，看起來是放在籃子裡。
 */
export function basketSlot(i: number): { x: number; y: number; back: boolean } {
  // 每排 5 顆（十格框的一排）：前排、後排、最後排
  const row = Math.min(2, Math.floor(i / 5))
  const col = i % 5
  const x = 48 + col * 56 + (row === 1 ? 28 : 0)
  const t = x / 320
  const arc = 70 + 108 * t * (1 - t)
  return { x, y: arc - 18 - row * 24, back: row > 0 }
}

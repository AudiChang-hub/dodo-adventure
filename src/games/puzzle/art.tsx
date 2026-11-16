// 拼圖的小圖示（T-156）：選玩法、「再一張」用。跟邏輯遊戲同一套粗線條，自己畫的 SVG。
const INK = '#2E2A25'

/** 一張 2×2 的拼圖，右下那一片拿出來、歪在旁邊（只有圖示裡歪，遊戲裡的片不旋轉） */
export function PuzzlePickArt() {
  return (
    <svg viewBox="0 0 240 200" width="100%" height="100%" aria-hidden="true">
      <g stroke={INK} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
        {/* 空著的位置 */}
        <rect x={106} y={96} width={78} height={62} rx={8} fill="#EFE7D6" strokeDasharray="10 9" strokeWidth={4} opacity={0.8} />
        {/* 三片：天空、草地、太陽 */}
        <path d="M28 34 H106 V96 H28 Z" fill="#CFE6F0" />
        <path d="M106 34 H184 V96 H106 Z" fill="#CFE6F0" />
        <path d="M28 96 H106 V158 H28 Z" fill="#B9DB9C" />
        <circle cx={150} cy={64} r={18} fill="#F2C94C" />
        <path d="M44 128 q14 -26 28 0 q14 -26 28 0" fill="none" stroke="#6E9E58" strokeWidth={5} />
        <path d="M28 34 H184 V96 H28 Z M28 96 V158 H106 V34" fill="none" />
      </g>
      {/* 拿出來的那一片 */}
      <g transform="translate(166 116) rotate(12)" stroke={INK} strokeWidth={5} strokeLinejoin="round">
        <rect x={0} y={0} width={78} height={62} rx={6} fill="#B9DB9C" />
        <circle cx={40} cy={30} r={13} fill="#E0604E" />
      </g>
    </svg>
  )
}

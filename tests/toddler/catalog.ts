// 要測的遊戲（src/content/games.ts 的 GAMES）。新增遊戲時在這裡加一行；
// screens.spec.ts 的「站點列出的遊戲都在清單上」會提醒漏掉的。
export const STATIONS = {
  english: '字母森林',
  math: '數字工地',
  mandarin: '動物村',
  draw: '畫畫小屋',
  park: '彩虹公園',
  code: '程式車庫',
} as const

export type StationId = keyof typeof STATIONS

export interface GameDef {
  id: string
  station: StationId
  kind: string
  title: string
}

export const GAMES: GameDef[] = [
  { id: 'ph-start', station: 'english', kind: 'phonics', title: '開頭音找圖' },
  { id: 'ph-same', station: 'english', kind: 'phonics', title: '開頭一樣' },
  { id: 'ph-letter', station: 'english', kind: 'phonics', title: '聽音找字母' },
  { id: 'm-count', station: 'math', kind: 'count', title: '點點數數' },
  { id: 'm-match', station: 'math', kind: 'choice', title: '有幾個' },
  { id: 'm-find', station: 'math', kind: 'choice', title: '找數字' },
  { id: 'm-compare', station: 'math', kind: 'choice', title: '比多少' },
  { id: 'm-order', station: 'math', kind: 'order', title: '照順序' },
  { id: 'm-quick', station: 'math', kind: 'choice', title: '數字快答' },
  { id: 'm-fill', station: 'math', kind: 'fill', title: '塗格子' },
  { id: 'm-give', station: 'math', kind: 'give', title: '給波波蛋' },
  { id: 'm-flash', station: 'math', kind: 'subitize', title: '一眼看幾個' },
  { id: 'z-find', station: 'mandarin', kind: 'choice', title: '聽詞找圖' },
  { id: 'z-category', station: 'mandarin', kind: 'choice', title: '動動腦' },
  { id: 'z-sound', station: 'mandarin', kind: 'choice', title: '聽聲音猜猜看' },
  { id: 'z-use', station: 'mandarin', kind: 'findall', title: '做什麼用' },
  { id: 'd-trace', station: 'draw', kind: 'trace', title: '運筆小路' },
  { id: 'd-dots', station: 'draw', kind: 'dots', title: '連點成圖' },
  { id: 'd-color', station: 'draw', kind: 'coloring', title: '蠟筆著色' },
  { id: 'd-free', station: 'draw', kind: 'free', title: '自由畫畫' },
  { id: 'd-glyph', station: 'draw', kind: 'glyph', title: '描數字字母' },
  { id: 'p-color', station: 'park', kind: 'choice', title: '找顏色' },
  { id: 'p-shape', station: 'park', kind: 'choice', title: '找形狀' },
  { id: 'p-size', station: 'park', kind: 'choice', title: '比大小' },
  { id: 'p-findall', station: 'park', kind: 'findall', title: '找出全部' },
  { id: 'p-lasso', station: 'park', kind: 'lasso', title: '圈圈看' },
  { id: 'p-solid', station: 'park', kind: 'findall', title: '立體形狀' },
  { id: 'c-drive', station: 'code', kind: 'drive', title: '箭頭卡開車' },
  { id: 'c-pattern', station: 'code', kind: 'pattern', title: '找規律' },
  { id: 'c-seq', station: 'code', kind: 'sequence', title: '排順序' },
]

/** 畫畫類：要檢查墨跡 */
export const DRAWING = new Set(['trace', 'dots', 'coloring', 'free', 'glyph', 'lasso'])

/** TODDLER_GAMES=m-count,d-color 只跑這幾個（也可以寫站點 id 或種類） */
export function selected(): GameDef[] {
  const want = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!want.length) return GAMES
  return GAMES.filter((g) => want.includes(g.id) || want.includes(g.station) || want.includes(g.kind))
}

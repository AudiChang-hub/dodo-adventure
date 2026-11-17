// 積木模型的格式（T-162）：每個模型是一樣東西（車子、恐龍、房子…），用 ./bricks.ts 的文字格式寫。
// 模型檔（models-*.ts）只放資料；圖庫、出題在 ./models.ts、./plan.ts。
import { parseRows, type Brick } from './bricks'

/** 主題：交通工具、動物、恐龍、房子和建築、植物、食物、生活用品、天空和太空、海裡 */
export type ThemeId = 'go' | 'animal' | 'dino' | 'build' | 'plant' | 'food' | 'home' | 'sky' | 'sea'
export const THEME_ZH: Record<ThemeId, string> = { go: '交通工具', animal: '動物', dino: '恐龍', build: '房子和建築', plant: '植物', food: '食物', home: '生活用品', sky: '天空和太空', sea: '海裡' }

/**
 * 蓋好以後成品動一下（一次、≤ 1.5 秒，FB-4；減少動態效果時不動）：
 * drive 往前開一小段再回來、fly 往上飛一點再下來、swim 左右游、hop 跳兩下、roar 變大一點（恐龍叫）、grow 從底下長高一點、shine 亮一下
 */
export type Act = 'drive' | 'fly' | 'swim' | 'hop' | 'roar' | 'grow' | 'shine'
const THEME_ACT: Record<ThemeId, Act> = { go: 'drive', animal: 'hop', dino: 'roar', build: 'shine', plant: 'grow', food: 'shine', home: 'shine', sky: 'fly', sea: 'swim' }

/** S：3～4 塊（第 1 級平面、第 3 級立體）；M：6～8 塊（第 2 級平面、第 4 級照步驟圖） */
export type ModelSize = 'S' | 'M'

export interface Model {
  id: string
  theme: ThemeId
  size: ModelSize
  zh: string
  /** 蓋好念的那一句（英文、≤ 6 個字） */
  en: string
  act: Act
  /** 平面的積木（y 0、d 1） */
  bricks: Brick[]
  rows: readonly string[]
  key?: string
}

/** 一個主題的模型：m(id, 中文, 英文那一句, rows, key?, act?) */
export function themeKit(theme: ThemeId, size: ModelSize) {
  const out: Model[] = []
  const m = (id: string, zh: string, en: string, rows: readonly string[], key?: string, act?: Act) => {
    out.push({ id, theme, size, zh, en, act: act ?? THEME_ACT[theme], bricks: parseRows(rows, key), rows, key })
  }
  return { m, out }
}

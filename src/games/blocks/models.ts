// 積木蓋蓋看（T-162）的圖庫：小的（./models-s.ts）＋中的（./models-m*.ts）。
// 第 1 級：小的、平面；第 2 級：中的、平面；第 3 級：小的換成前後兩排；第 4 級：中的換成前後兩排、照步驟圖蓋。
import { to3d, type Brick } from './bricks'
import type { Model } from './model-kit'
import { MODELS_S } from './models-s'
import { MODELS_M } from './models-m'

export type { Model, ThemeId, Act, ModelSize } from './model-kit'
export const MODELS: Model[] = [...MODELS_S, ...MODELS_M]
export const modelOf = (id: string) => MODELS.find((m) => m.id === id) ?? null
/** 這個模型要蓋的積木：平面的，或換成前後兩排的 */
export const modelBricks = (m: Model, deep: boolean): Brick[] => (deep ? to3d(m.bricks) : m.bricks)

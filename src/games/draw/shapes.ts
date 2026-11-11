// 著色本線稿用的形狀（T-138）：圖都是用這些簡單的形狀自己畫的
export interface Region {
  id: string
  d: string
}

export interface Picture {
  id: string
  /** 分類（pictures.ts 的 CATS） */
  cat: string
  title: string
  transform?: string
  regions: Region[]
  deco: string[]
  /** 塗成墨色的 deco（眼睛）；其餘 deco 只有線條 */
  ink?: number[]
}

/** 橢圓 */
export const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`
/** 圓角方形 */
export const rect = (x: number, y: number, w: number, h: number, r = 0) =>
  `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`
/** 蛋形（上尖下圓），cx、cy 是正中間 */
export const egg = (cx: number, cy: number, w: number, h: number) =>
  `M${cx} ${cy - h} C${cx + w * 0.75} ${cy - h} ${cx + w} ${cy + h * 0.2} ${cx + w} ${cy + h * 0.35} C${cx + w} ${cy + h} ${cx - w} ${cy + h} ${cx - w} ${cy + h * 0.35} C${cx - w} ${cy + h * 0.2} ${cx - w * 0.75} ${cy - h} ${cx} ${cy - h} Z`

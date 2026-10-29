import { useEffect, useState } from 'react'
import { theme, type ThemeDef, type ThemeId } from '../content/themes'

/**
 * 現在正在玩的主題（主題式冒險的那一站）。和 adaptive 的 withTargetFilter 同一種輕量做法：
 * 今日冒險把主題交給 PlayGame，PlayGame 在遊戲畫面存在的期間設定它；
 * 題目產生器（games.ts、code.ts、games-worksheet.ts）和幾個自己出題的遊戲在出題時讀 themeNow()，
 * 有主題就「優先」用主題的東西，沒有就照原本的出。自由探索（地圖上的站點）不設定，一切照舊。
 */
let active: { def: ThemeDef; token: number } | null = null
let seq = 0

export const themeNow = (): ThemeDef | null => active?.def ?? null

/** 進入主題；回傳的函式會把它清掉（只清自己設的那一次，下一站已經設了新的就不動） */
export function enterTheme(id: ThemeId | string | null | undefined): () => void {
  const def = theme(id)
  if (!def) return () => {}
  const token = ++seq
  active = { def, token }
  return () => {
    if (active?.token === token) active = null
  }
}

/**
 * 這個元件在畫面上的期間，主題都設好：第一次 render 之前就設（遊戲在 useState 裡就出題），離開時清掉；
 * StrictMode 重新掛載時 effect 會再設一次。PlayGame 用。
 */
export function useThemeScope(id: string | null | undefined) {
  useState(() => enterTheme(id))
  useEffect(() => enterTheme(id), [id])
}

/** 主題要的那一份，沒有主題（或主題沒給）就用一般的 */
export function themed<T>(fallback: readonly T[], of: (t: ThemeDef) => readonly T[] | undefined): readonly T[] {
  const t = themeNow()
  const v = t ? of(t) : undefined
  return v && v.length ? v : fallback
}

/** all 裡面主題優先的那幾個（同一批物件，交給 adaptive.pickPreferred）；沒有主題是空的 */
export function preferThemed<T>(all: readonly T[], of: (t: ThemeDef) => readonly T[] | undefined): T[] {
  const t = themeNow()
  const fav = t ? (of(t) ?? []).filter((x) => all.includes(x)) : []
  return all.filter((x) => fav.includes(x))
}

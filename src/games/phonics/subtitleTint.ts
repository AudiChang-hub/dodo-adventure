import { useEffect } from 'react'
import { allLines } from '../../content/lines'
import { cuePart, tintTarget, tintWord } from '../../content/subtitles'

/**
 * 字幕的開頭字母上色（PRD §6.1b），規則在 content/subtitles.ts 的 tintTarget／tintWord。
 *
 * 字幕元件（src/ui/Subtitle.tsx）不用改：自然發音的遊戲開著時，觀察字幕的 DOM，
 * 認出正在顯示的是哪一句 ph. 台詞，在要上色的字上加 data-tint，由 phonics.css 的 ::first-letter 上色；
 * 字母名稱、字母音另外加 data-part（name／sound），整個字換樣子。
 * - 只加一個 React 不管的屬性，不動文字節點，React 之後更新 class 也不會把它洗掉。
 * - 挖空的字（.sub-blank）一律跳過，挖空規則完全不受影響。
 * - 離開遊戲就停止觀察；其他畫面的字幕維持原樣。
 */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

let table: Map<string, string> | null = null

/** 每一句會上色的台詞：去掉標點與空白的全文 → 目標字母 */
function lineTable() {
  if (table) return table
  table = new Map()
  for (const [key, l] of allLines()) {
    const t = tintTarget(key)
    if (t) table.set(norm(l.text.replace(/\|/g, ' ')), t)
  }
  return table
}

function paint(root: Element) {
  for (const pill of root.querySelectorAll('.sub-pill')) {
    const words = [...pill.querySelectorAll<HTMLElement>('.sub-w')]
    if (!words.length || pill.querySelector('.sub-blank')) continue
    const target = lineTable().get(norm(words.map((w) => w.textContent ?? '').join(' ')))
    if (!target) continue
    for (const w of words) {
      const t = w.textContent ?? ''
      if (!w.dataset.tint && tintWord(target, t)) w.dataset.tint = target
      // 字母音台詞（S, S, S… s, s, s… snake!）：字母名稱、字母音各有自己的樣子
      const part = cuePart(target, t)
      if (part && w.dataset.part !== part) w.dataset.part = part
    }
  }
}

export function useSubtitleTint() {
  useEffect(() => {
    const root = document.querySelector('.subtitle')
    if (!root) return
    paint(root)
    const mo = new MutationObserver(() => paint(root))
    mo.observe(root, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])
}

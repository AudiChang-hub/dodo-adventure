import { useState } from 'react'
import { checkCards, decideCheck, useChecks } from '../../lib/parent-check'
import { HEARD_MIN_RIGHT, HEARD_WINDOW } from '../../lib/heard'
import type { ParentData } from './data'
import './check.css'

/** 一次最多出幾張（其他的等這幾張按完再出來） */
const SHOW = 3

/**
 * 「真的學會了嗎？」（T-109，總覽最上面）：App 裡照新規則熟練了（最近 5 次聽完才答、對 4 次以上）的概念，
 * 請家長離開螢幕、用家裡的東西問一次。「他會」：家長區標「家長確認過」；「還不會」：這一項退回練習，熟練重新算。
 * 決定會同步到雲端（平板、手機一樣），重置學習進度時一起清掉（lib/parent-check.ts）。
 */
export function LearnedCheck({ d }: { d: ParentData }) {
  const checks = useChecks()
  const [busy, setBusy] = useState<string | null>(null)
  const cards = checkCards(d.attempts, checks)
  if (!cards.length) return null
  const decide = async (skill: string, ok: boolean) => {
    setBusy(skill)
    try {
      await decideCheck(skill, ok)
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="lcheck" aria-labelledby="lcheck-title">
      <h3 id="lcheck-title">
        真的學會了嗎？
        <small>
          App 裡最近 {HEARD_WINDOW} 次聽完題目才答、對了 {HEARD_MIN_RIGHT} 次以上。離開螢幕問他一次，確認不是在 App 裡猜的。
        </small>
      </h3>
      <ul className="lcheck-list">
        {cards.slice(0, SHOW).map((c) => (
          <li key={c.skill} className="lcheck-card">
            <p className="lcheck-what">{c.label}</p>
            <p className="lcheck-ask">{c.ask}</p>
            <div className="lcheck-btns">
              <button type="button" className="lcheck-yes" disabled={busy === c.skill} onClick={() => void decide(c.skill, true)}>
                他會
              </button>
              <button type="button" className="lcheck-no" disabled={busy === c.skill} onClick={() => void decide(c.skill, false)}>
                還不會
              </button>
            </div>
            <p className="lcheck-note">按「還不會」：這一項退回練習，App 裡的熟練重新算。</p>
          </li>
        ))}
      </ul>
      {cards.length > SHOW && <p className="lcheck-more">還有 {cards.length - SHOW} 項，按完上面的就會出來。</p>}
    </section>
  )
}

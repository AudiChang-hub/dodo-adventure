import { useMemo, useState } from 'react'
import { Emoji } from '../../art/Emoji'
import { LEXICON, keyOfVocab, lexWord, type Tier, type Word } from '../../content/lexicon'
import { wordId } from '../../content/letters'
import { isQuiz, type Attempt } from '../../lib/db'
import { setUnknown, useUnknownWords, wasTaught } from '../../lib/words'
import { requestSync } from '../../lib/sync'
import { CHILD_ZH } from '../../lib/env'
import type { ParentData } from './data'
import './words.css'

const TIER_TITLE: Record<Tier, [string, string]> = {
  1: ['第 1 層：天天看到的東西', '生活中天天看到、中文已經會的東西，最先教'],
  2: ['第 2 層：從興趣延伸', '恐龍、車子、動物，或第 1 層的下一步'],
  3: ['第 3 層：以後再用', '目前很少出現，先知道就好'],
}

type Filter = 'all' | 'taught' | 'new' | 'unknown'
const FILTERS: [Filter, string][] = [
  ['all', '全部'],
  ['taught', '已教過'],
  ['new', '還沒教'],
  ['unknown', '他不認得'],
]

/** 一題作答的答案是哪個單字（動物村的詞、字母森林的字） */
function answerWord(a: Attempt): string | null {
  if (a.game === 'z-find' || a.game === 'z-sound' || a.game === 'z-category') return lexWord(keyOfVocab(a.answer)) ? keyOfVocab(a.answer) : null
  if (a.game === 'ph-start' || a.game === 'ph-same' || a.game === 'en-word' || a.game === 'en-pic') return lexWord(wordId(a.answer)) ? wordId(a.answer) : null
  return null
}

/** 最常答錯的字：自己答（不含教學、一起練）答錯的次數，至少錯過一次 */
function mostMissed(attempts: Attempt[], n = 8) {
  const m = new Map<string, { wrong: number; total: number }>()
  for (const a of attempts) {
    if (!isQuiz(a)) continue
    const k = answerWord(a)
    if (!k) continue
    const r = m.get(k) ?? { wrong: 0, total: 0 }
    r.total++
    if (!a.firstTryCorrect) r.wrong++
    m.set(k, r)
  }
  return [...m]
    .filter(([, r]) => r.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong || b[1].wrong / b[1].total - a[1].wrong / a[1].total)
    .slice(0, n)
    .map(([k, r]) => ({ w: lexWord(k)!, ...r }))
}

function WordTile({ w, unknown, taught, readOnly }: { w: Word; unknown: boolean; taught: boolean | null; readOnly: boolean }) {
  return (
    <li className={`word${unknown ? ' is-unknown' : ''}`}>
      <span className="word-pic">
        <Emoji name={w.icon} />
      </span>
      <span className="word-names">
        <b lang="en">{w.en}</b>
        <span>{w.zh}</span>
      </span>
      {taught != null && <span className={`word-state${taught ? ' on' : ''}`}>{taught ? '教過' : '還沒教'}</span>}
      <label className="word-flag">
        <input
          type="checkbox"
          checked={unknown}
          disabled={readOnly}
          aria-label={`${w.en}（${w.zh}）他不認得`}
          onChange={(e) => {
            void setUnknown(w.key, e.target.checked).then(() => requestSync())
          }}
        />
        <span>他不認得</span>
      </label>
    </li>
  )
}

/**
 * 家長區「單字清單」：孩子會遇到的字，依層級列出，每個字有圖、英文、中文。
 * 勾「他不認得」的字：不當例子、不當干擾選項、點錯時不唸它的名字；它是教學目標時，先重新教過才考（lib/words.ts）。
 * 這台裝置的勾選存在 kv（重置學習進度會保留），同步時備份到雲端；看雲端資料時只能看、不能改。
 */
export function WordList({ d }: { d: ParentData }) {
  const local = useUnknownWords()
  const cloud = d.source === 'cloud'
  const flags = useMemo(() => (cloud ? new Map(Object.entries(d.unknownWords ?? {})) : local), [cloud, d.unknownWords, local])
  const [filter, setFilter] = useState<Filter>('all')
  const missed = useMemo(() => mostMissed(d.attempts), [d.attempts])
  // 「教過沒」只有這台裝置算得出來（雲端沒有存）
  const taughtOf = (w: Word) => (cloud ? null : wasTaught(w.key))
  const show = (w: Word) => {
    if (filter === 'unknown') return flags.has(w.key)
    if (filter === 'taught') return taughtOf(w) === true
    if (filter === 'new') return taughtOf(w) === false
    return true
  }
  const taughtCount = cloud ? null : LEXICON.filter((w) => wasTaught(w.key)).length

  return (
    <>
      <h2>單字清單</h2>
      <p className="sub">
        {CHILD_ZH}在 App 裡會看到、會被考到的英文單字，依層級排列。勾了「他不認得」的字，就不會再當例子或錯的選項，也不會在點錯時唸它的名字；如果它是要學的字，會先重新教一次（看圖、聽名字），才會考。
      </p>

      <div className="grid">
        <div className="card stat">
          <div className="label">單字</div>
          <div className="value">
            {LEXICON.length}
            <small>個</small>
          </div>
        </div>
        {taughtCount != null && (
          <div className="card stat">
            <div className="label">已經教過</div>
            <div className="value">
              {taughtCount}
              <small>個</small>
            </div>
          </div>
        )}
        <div className="card stat">
          <div className="label">勾了他不認得</div>
          <div className="value">
            {flags.size}
            <small>個</small>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>最常答錯的字</h3>
        {missed.length ? (
          <ol className="missed">
            {missed.map(({ w, wrong, total }) => (
              <li key={w.key}>
                <span className="word-pic">
                  <Emoji name={w.icon} />
                </span>
                <span className="word-names">
                  <b lang="en">{w.en}</b>
                  <span>{w.zh}</span>
                </span>
                <span className="missed-n">
                  答錯 {wrong}
                  <small>／{total} 次</small>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">還沒有答錯的字（只算動物村和字母森林「自己答」的題目）。</p>
        )}
      </div>

      {cloud && <p className="words-note">目前看的是雲端資料：勾選要在孩子用的那台平板上改，改了之後會自動同步上來。</p>}

      <div className="words-filter" role="radiogroup" aria-label="篩選">
        {FILTERS.filter(([f]) => !cloud || f === 'all' || f === 'unknown').map(([f, label]) => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? 'on' : undefined} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>

      {([1, 2, 3] as Tier[]).map((t) => {
        const list = LEXICON.filter((w) => w.tier === t && show(w)).sort((a, b) => a.en.localeCompare(b.en))
        if (!list.length) return null
        return (
          <section key={t} className="card words-tier">
            <h3>
              {TIER_TITLE[t][0]}
              <small>
                {TIER_TITLE[t][1]}・{list.length} 個
              </small>
            </h3>
            <ul className="words">
              {list.map((w) => (
                <WordTile key={w.key} w={w} unknown={flags.has(w.key)} taught={taughtOf(w)} readOnly={cloud} />
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

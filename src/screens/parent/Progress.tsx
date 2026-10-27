import { LETTERS, PHONICS, phonicsSkill } from '../../content/letters'
import { VOCAB, THEME_LABEL, type VocabTheme } from '../../content/vocab'
import { GAMES, unlockedSounds } from '../../content/games'
import { gameLevel, level, unlockedNumbers } from '../../lib/adaptive'
import { isQuiz } from '../../lib/db'
import { pct, STATION_NAME, type ParentData } from './data'
import { DueCard, HintCard, ProtegeCard, SpeedCard, placementDots, placementText } from './EngineCards'

function Cell({ label, box, locked }: { label: string; box: number; locked?: boolean }) {
  return (
    <div className={`cell${locked ? ' locked' : ''}`} title={`熟練度 ${box}/5`}>
      {label}
      <div className="bar">
        <i style={{ width: `${(box / 5) * 100}%` }} />
      </div>
    </div>
  )
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <p className="empty">至少要玩兩次才畫得出趨勢。</p>
  const w = 520
  const h = 90
  const max = Math.max(...values, 0.01)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 10) - 5}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="偏離比例趨勢，越低越穩">
      <polyline points={pts} fill="none" stroke="#8F7CC0" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Progress({ d }: { d: ParentData }) {
  const box = (k: string) => d.skills.get(k)?.box ?? 0
  const sounds = unlockedSounds()
  // 舊版字母森林（認字母名稱、字母配圖）已熟的字母
  const namesKnown = LETTERS.filter((l) => box(`letter:${l.letter}`) >= 3 || box(`word:${l.letter}`) >= 3).map((l) => l.letter)
  const maxN = unlockedNumbers()
  const themes = Object.keys(THEME_LABEL) as VocabTheme[]
  // 運筆進步曲線只看孩子自己畫的，不含示範
  const trace = d.attempts.filter((a) => a.game === 'd-trace' && isQuiz(a) && a.metrics).reverse().map((a) => a.metrics!.offRatio ?? 0)
  const glyphs = [...new Set(d.attempts.filter((a) => a.game === 'd-glyph' && isQuiz(a)).map((a) => a.itemId))]

  return (
    <>
      <h2>學習進度</h2>
      <p className="sub">每格下方的長條是熟練度（0–5）：第一次就答對、而且不比自己平常慢，往上一格；答錯退一格；3 格以上視為熟練，之後會定期回來複習。</p>

      <DueCard d={d} />

      <div className="card">
        <h3>字母音（自然發音，目前開放 {sounds.length} 個）</h3>
        <p className="sub" style={{ margin: '0 0 10px' }}>
          依教學順序排列（不是 A 到 Z）。熟練度看的是能不能分辨「哪個字是這個音開頭」，不是會不會念字母名稱。
          三個遊戲（開頭音找圖、開頭一樣、聽音找字母）都算在同一個字母音上。
        </p>
        <div className="cells">
          {PHONICS.map((u) => (
            <Cell key={u.letter} label={`${u.letter.toUpperCase()} ${u.letter}`} box={box(phonicsSkill(u.letter))} locked={!sounds.includes(u)} />
          ))}
        </div>
        <p className="sub" style={{ margin: '10px 0 0' }}>
          還沒排進課程：i、u（畫得出來的短母音開頭字太少）、z（只有 zebra、zero）、x（只在字尾）、q（之後和 u 一起教 qu）。
        </p>
        {namesKnown.length > 0 && (
          <p className="sub" style={{ margin: '6px 0 0' }}>
            舊版遊戲的紀錄：已經認得字母名稱 {namesKnown.join('、')}（保留紀錄；字母音仍會從頭教一次）。
          </p>
        )}
      </div>

      <div className="card">
        <h3>數字（目前開放到 {maxN}）</h3>
        <p className="sub" style={{ margin: '0 0 10px' }}>上排：認數字　下排：數數量</p>
        <div className="cells">
          {Array.from({ length: 20 }, (_, i) => (
            <Cell key={i} label={String(i + 1)} box={box(`num:${i + 1}`)} locked={i + 1 > maxN} />
          ))}
        </div>
        <div className="cells" style={{ marginTop: 8 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <Cell key={i} label={String(i + 1)} box={box(`count:${i + 1}`)} />
          ))}
        </div>
      </div>

      <div className="card">
        <h3>動物村英文詞彙</h3>
        <table>
          <tbody>
            {themes.map((t) => {
              const words = VOCAB.filter((v) => v.theme === t)
              const ok = words.filter((v) => box(`vocab:${v.id}`) >= 3)
              return (
                <tr key={t}>
                  <td style={{ width: 120 }}>{THEME_LABEL[t]}</td>
                  <td>
                    {ok.length}/{words.length} 個已熟練（{pct(ok.length, words.length)}%）
                  </td>
                  <td style={{ color: 'var(--ink-soft)' }}>{ok.map((v) => `${v.en}（${v.zh}）`).join('、')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>運筆小路：偏離路徑的比例（越低越穩）</h3>
        <Spark values={trace} />
        <h3 style={{ marginTop: 14 }}>描過的數字與字母</h3>
        <p>{glyphs.length ? glyphs.join('　') : <span className="empty">還沒有。</span>}</p>
      </div>

      <SpeedCard d={d} />
      <HintCard d={d} />
      <ProtegeCard d={d} />

      <div className="card">
        <h3>各遊戲目前的難度</h3>
        <table>
          <thead>
            <tr>
              <th>站點</th>
              <th>遊戲</th>
              <th>難度</th>
              <th>程度校準（第一次玩的探測）</th>
            </tr>
          </thead>
          <tbody>
            {GAMES.filter((g) => g.maxLevel > 1).map((g) => {
              const l = gameLevel(g.id)
              const dots = placementDots(l)
              return (
                <tr key={g.id}>
                  <td>{STATION_NAME[g.station]}</td>
                  <td>{g.title}</td>
                  <td>
                    {level(g.id)} / {g.maxLevel}
                  </td>
                  <td className="placed">
                    {placementText(g.id, l)}
                    {dots && (
                      <span className="steps-dots" aria-label="探測題結果：○ 答對、× 答錯">
                        {dots}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="note">每個遊戲第一次玩時，前 2–3 題直接出比較難的題目：答對升一級、答錯降一級（沒學過的就先教）。畫畫類照發展順序走，不探測。</p>
      </div>
    </>
  )
}

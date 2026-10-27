import { LETTERS } from '../../content/letters'
import { VOCAB, THEME_LABEL, type VocabTheme } from '../../content/vocab'
import { GAMES } from '../../content/games'
import { level, unlockedLetters, unlockedNumbers } from '../../lib/adaptive'
import { pct, STATION_NAME, type ParentData } from './data'

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
  const letters = unlockedLetters()
  const maxN = unlockedNumbers()
  const themes = Object.keys(THEME_LABEL) as VocabTheme[]
  const trace = d.attempts.filter((a) => a.game === 'd-trace' && a.metrics).reverse().map((a) => a.metrics!.offRatio ?? 0)
  const glyphs = [...new Set(d.attempts.filter((a) => a.game === 'd-glyph').map((a) => a.itemId))]

  return (
    <>
      <h2>學習進度</h2>
      <p className="sub">每格下方的長條是熟練度（0–5）：第一次就答對往上一格，答錯退一格；3 格以上視為熟練。</p>

      <div className="card">
        <h3>英文字母（目前開放到 {letters[letters.length - 1]}）</h3>
        <div className="cells">
          {LETTERS.map((l) => (
            <Cell key={l.letter} label={l.letter} box={Math.max(box(`letter:${l.letter}`), 0)} locked={!letters.includes(l.letter)} />
          ))}
        </div>
        <h3 style={{ marginTop: 18 }}>字母對應的單字</h3>
        <div className="cells">
          {LETTERS.map((l) => (
            <Cell key={l.letter} label={l.letter} box={box(`word:${l.letter}`)} locked={!letters.includes(l.letter)} />
          ))}
        </div>
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

      <div className="card">
        <h3>各遊戲目前的難度</h3>
        <table>
          <thead>
            <tr>
              <th>站點</th>
              <th>遊戲</th>
              <th>難度</th>
            </tr>
          </thead>
          <tbody>
            {GAMES.filter((g) => g.maxLevel > 1).map((g) => (
              <tr key={g.id}>
                <td>{STATION_NAME[g.station]}</td>
                <td>{g.title}</td>
                <td>
                  {level(g.id)} / {g.maxLevel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

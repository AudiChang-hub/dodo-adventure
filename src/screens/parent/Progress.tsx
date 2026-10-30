import { DEFERRED_PHONICS, LETTERS, PHONICS, phonicsSkill } from '../../content/letters'
import { VOCAB, THEME_LABEL, type VocabTheme } from '../../content/vocab'
import { GAMES, unlockedSounds } from '../../content/games'
import { ALL_STORIES, DIRS, DIR_ZH, PATTERN_ZH, STORIES, seqSkill, type PatternKind } from '../../content/code'
import { gameLevel, level, unlockedNumbers } from '../../lib/adaptive'
import { isQuiz } from '../../lib/db'
import { PART_ZH, isPart } from '../../games/draw/glyphs'
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
  const traced = [...new Set(d.attempts.filter((a) => a.game === 'd-glyph' && isQuiz(a)).map((a) => a.itemId))]
  const glyphs = traced.filter((g) => !isPart(g))
  const parts = [...new Set(traced.filter(isPart).map((g) => PART_ZH[g]))]
  // 箭頭卡開車：開錯之後自己改卡、再開就到了的次數
  const debugFixes = d.attempts.filter((a) => a.game === 'c-drive' && isQuiz(a) && a.metrics?.fixed).length

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
          還沒排進課程：o、j、v、y（2026-10-28 單字盤點：找不到三個孩子一看就認得的例字，先延後）、i、u（畫得出來的短母音開頭字太少）、z（只有 zebra、zero）、x（只在字尾）、q（之後和 u 一起教 qu）。
          {DEFERRED_PHONICS.some((u) => box(phonicsSkill(u.letter)) > 0) &&
            ` 延後之前學到的程度保留著：${DEFERRED_PHONICS.filter((u) => box(phonicsSkill(u.letter)) > 0)
              .map((u) => `${u.letter} ${box(phonicsSkill(u.letter))}/5`)
              .join('、')}。`}
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
        <h3>程式車庫（方向、規律、順序）</h3>
        <p className="sub" style={{ margin: '0 0 10px' }}>
          6 歲寫程式的地基（PRD §10）。箭頭卡用「上下左右」的絕對方向；錯了車子會退回起點，孩子改一張卡再開一次，就是最早的除錯。
          {debugFixes > 0 && ` 目前自己改卡修好 ${debugFixes} 次。`}
        </p>
        <p className="sub" style={{ margin: '0 0 6px' }}>方向與路線</p>
        <div className="cells">
          {DIRS.map((dir) => (
            <Cell key={dir} label={DIR_ZH[dir]} box={box(`arrow:${dir}`)} />
          ))}
          <Cell label="2 張卡" box={box('route:2')} />
          <Cell label="3 張卡" box={box('route:3')} />
        </div>
        <p className="sub" style={{ margin: '10px 0 6px' }}>找規律</p>
        <div className="cells">
          {(Object.keys(PATTERN_ZH) as PatternKind[]).map((k) => (
            <Cell key={k} label={PATTERN_ZH[k]} box={box(`pattern:${k}`)} />
          ))}
        </div>
        <p className="sub" style={{ margin: '10px 0 6px' }}>排順序（{STORIES.filter((st) => box(seqSkill(st)) >= 3).length}/{STORIES.length} 個故事已熟練）</p>
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
          {/* 主題式冒險的故事也列出來（玩過才會出現），分母仍是一般的故事 */}
          {ALL_STORIES.filter((st) => d.skills.get(seqSkill(st))?.seen)
            .map((st) => `${st.zh}${box(seqSkill(st)) >= 3 ? ' ✓' : ''}`)
            .join('、') || <span className="empty">還沒玩過。</span>}
        </p>
      </div>

      <div className="card">
        <h3>運筆小路：偏離路徑的比例（越低越穩）</h3>
        <Spark values={trace} />
        <h3 style={{ marginTop: 14 }}>描過的字的零件</h3>
        <p>{parts.length ? parts.join('、') : <span className="empty">還沒有。</span>}</p>
        <h3 style={{ marginTop: 14 }}>描過的數字與字母</h3>
        <p>{glyphs.length ? glyphs.join('　') : <span className="empty">還沒有。</span>}</p>
        <p className="sub" style={{ margin: '6px 0 0' }}>
          3 歲的目標是看了示範之後畫出直線和圓，照筆順寫字母是 4～5 歲的事，所以描數字字母前兩級先描字的零件（直線、圓、十字；斜線、半圓、轉角）。
          等運筆小路、連點成圖都穩固（八成的級數通過兩次隔天的複習），斜線、半圓、轉角這組零件也穩固，才開始描字母；不看年齡。
          以前描過字母、還沒到這個程度的，也會先回到零件；這不是退步，孩子那邊不會聽到降級的話。
        </p>
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

import type { ParentData } from './data'

/** 三堂課教的範圍：英文 A→Z、數學 1～10（中文課文的進度在「中文課文」分頁） */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1)

function Cell({ label, box }: { label: string; box: number }) {
  return (
    <div className="cell" title={`熟練度 ${box}/5`}>
      {label}
      <div className="bar">
        <i style={{ width: `${(box / 5) * 100}%` }} />
      </div>
    </div>
  )
}

/**
 * 學習進度：三堂課的英文字母、數字，每一格下方是熟練度。
 * 舊的站點遊戲（字母森林、動物村、程式車庫、運筆小路…）的卡片 2026-11-02 拿掉了（B2 第 2 層），以前的作答紀錄還在「作答紀錄」看得到。
 */
export function Progress({ d }: { d: ParentData }) {
  const box = (k: string) => d.skills.get(k)?.box ?? 0
  // 大寫、小寫分開記（letter:A、letter:a），取比較熟的那個
  const either = (a: string, b: string) => Math.max(box(a), box(b))

  return (
    <>
      <h2>學習進度</h2>
      <p className="sub">每格下方的長條是熟練度（0–5）：第一次就答對、而且不比自己平常慢，往上一格；答錯退一格；3 格以上視為熟練。中文課文上過哪幾篇在「中文課文」分頁。</p>

      <div className="card">
        <h3>英文字母</h3>
        <p className="sub" style={{ margin: '0 0 10px' }}>上排：認字母（大寫、小寫取比較熟的）　下排：描字母</p>
        <div className="cells">
          {[...LETTERS].map((L) => (
            <Cell key={L} label={`${L} ${L.toLowerCase()}`} box={either(`letter:${L}`, `letter:${L.toLowerCase()}`)} />
          ))}
        </div>
        <div className="cells" style={{ marginTop: 8 }}>
          {[...LETTERS].map((L) => (
            <Cell key={L} label={`${L} ${L.toLowerCase()}`} box={either(`write:${L}`, `write:${L.toLowerCase()}`)} />
          ))}
        </div>
      </div>

      <div className="card">
        <h3>數字</h3>
        <p className="sub" style={{ margin: '0 0 10px' }}>上排：認數字　中排：數數量　下排：寫數字</p>
        {(['num', 'count', 'glyph'] as const).map((k, i) => (
          <div key={k} className="cells" style={i ? { marginTop: 8 } : undefined}>
            {NUMBERS.map((n) => (
              <Cell key={n} label={String(n)} box={box(`${k}:${n}`)} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

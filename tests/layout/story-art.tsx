// 故事時間手繪插畫的預覽頁（T-119 樣張，給家長看畫風；不進 App 的打包，vite 只打包 index.html）。
// 開法：npx vite，然後開 /dodo-adventure/tests/layout/story-art.html?p=<頁>
//   p=sheet-dinos：三隻恐龍的設定稿；p=sheet-friends：兔子、烏龜（和方舟頁的大象）；p=rt-fast、rt-walk、rt-win、noah-elephants：插畫頁
// 插畫頁照平板 1200×786 排：上面字幕（念到哪個字哪個字亮）、中間一頁插畫、左下講故事的莫莫。念到名字，那個角色跳一下（只跳一次）。
import { createRoot } from 'react-dom/client'
import { useEffect, useState, type ReactNode } from 'react'
import { DINO_BOX, DinoArt, type Mood } from '../../src/art/Dino'
import type { Speaker } from '../../src/content/lines'
import { ELEPHANT_BOX, Elephant, RABBIT_BOX, Rabbit, TURTLE_BOX, Turtle, type Box } from '../../src/art/storybook/chars'
import { PAGES } from '../../src/art/storybook/pages'
import '../../src/styles/global.css'

const css = `
html, body { margin: 0; background: #EFE6D3; }
.sb-stage { position: relative; width: 1200px; height: 786px; overflow: hidden; background: #EFE6D3; font-family: Fredoka, sans-serif; color: #2E2A25; }
.sb-back { position: absolute; left: 26px; top: 18px; width: 92px; height: 92px; border-radius: 50%; background: #FBF8F2; box-shadow: 0 6px 0 rgba(46,42,37,.1); display: grid; place-items: center; }
.sb-sub { position: absolute; left: 50%; top: 22px; translate: -50% 0; padding: 10px 30px; border-radius: 999px; background: #FBF8F2; box-shadow: 0 6px 0 rgba(46,42,37,.08); font-weight: 600; font-size: 38px; white-space: nowrap; display: flex; gap: .32em; }
.sb-sub span { padding: 0 .12em; border-radius: 10px; color: #A39B8E; transition: color .2s, background .2s; }
.sb-sub span.said { color: #2E2A25; }
.sb-sub span.now { color: #2E2A25; background: #F1D27C; }
.sb-frame { position: absolute; left: 205px; top: 100px; width: 975px; height: 610px; border-radius: 28px; overflow: hidden; background: #FBF8F2; box-shadow: 0 0 0 8px #FBF8F2, 0 14px 0 rgba(46,42,37,.10); }
.sb-frame svg { display: block; }
.sb-host { position: absolute; left: 6px; bottom: 6px; width: 190px; }
.sb-hop { animation: sb-hop .55s cubic-bezier(.22,1,.36,1) both; }
@keyframes sb-hop { 0% { transform: translateY(0) } 38% { transform: translateY(-22px) } 70% { transform: translateY(2px) } 100% { transform: translateY(0) } }
.sb-sheet { padding: 26px 34px; box-sizing: border-box; }
.sb-sheet h1 { margin: 0 0 4px; font: 400 30px/1.3 Huninn, sans-serif; }
.sb-sheet p { margin: 0 0 16px; font: 400 17px/1.5 Huninn, sans-serif; color: #6B645A; }
.sb-row { display: grid; grid-template-columns: 120px repeat(3, 1fr); gap: 18px; align-items: end; margin-bottom: 14px; }
.sb-name { font: 400 26px/1.2 Huninn, sans-serif; align-self: center; }
.sb-name small { display: block; font-size: 15px; color: #6B645A; }
.sb-card { background: #FBF8F2; border-radius: 22px; padding: 10px 12px 6px; text-align: center; box-shadow: 0 6px 0 rgba(46,42,37,.07); }
.sb-card svg { display: block; margin: 0 auto; }
.sb-card b { display: block; font: 400 17px/1.4 Huninn, sans-serif; color: #6B645A; }
`

function Fig({ box, h, label, children }: { box: Box; h: number; label: string; children: ReactNode }) {
  return (
    <div className="sb-card">
      <svg viewBox={`-10 -10 ${box.w + 20} ${box.h + 20}`} height={h} width={((box.w + 20) / (box.h + 20)) * h} style={{ overflow: 'visible' }}>
        {children}
      </svg>
      <b>{label}</b>
    </div>
  )
}

/** 恐龍的姿勢：用 App 裡同一份圖（art/Dino.tsx），表情、身體不重畫，造型一定一致 */
function DinoPose({ who, pose }: { who: Speaker; pose: 'stand' | 'cheer' | 'sleep' }) {
  const b = DINO_BOX[who]
  const mood: Mood = pose === 'stand' ? 'happy' : pose
  return (
    <g transform={pose === 'sleep' ? `translate(0 ${b.h * 0.08}) scale(1 0.92)` : undefined}>
      <DinoArt who={who} mood={mood} />
      {pose === 'sleep' && (
        <g fill="#8E95C9" fontFamily="Fredoka, sans-serif" fontWeight={600}>
          <text x={b.w - 40} y={30} fontSize={28}>
            z
          </text>
          <text x={b.w - 14} y={2} fontSize={38}>
            Z
          </text>
        </g>
      )}
    </g>
  )
}

function SheetDinos() {
  const rows: [Speaker, string, string][] = [
    ['dodo', '豆豆', '綠色・背上一排三角'],
    ['bobo', '波波', '橘色・頭上三根角'],
    ['momo', '莫莫', '藍色・長脖子'],
  ]
  return (
    <div className="sb-stage sb-sheet" data-ready="1">
      <h1>角色設定稿 1：三隻恐龍</h1>
      <p>就是 App 裡現在的豆豆、波波、莫莫（同一份圖），在故事插畫裡用這三個姿勢；表情、顏色、身材都不變。</p>
      {rows.map(([who, name, note]) => (
        <div className="sb-row" key={who}>
          <div className="sb-name">
            {name}
            <small>{note}</small>
          </div>
          {(['stand', 'cheer', 'sleep'] as const).map((pose) => (
            <Fig key={pose} box={{ w: DINO_BOX[who].w, h: DINO_BOX[who].h }} h={150} label={{ stand: '站著', cheer: '開心', sleep: '睡覺' }[pose]}>
              <DinoPose who={who} pose={pose} />
            </Fig>
          ))}
        </div>
      ))}
    </div>
  )
}

function SheetFriends() {
  return (
    <div className="sb-stage sb-sheet" data-ready="1">
      <h1>角色設定稿 2：故事裡的朋友（原創造型）</h1>
      <p>兔子：奶油白、右耳折下來、珊瑚色圍巾。烏龜：芥末黃的殼、三塊大殼片、淺綠的頭腳。每次出場都長這樣。</p>
      <div className="sb-row">
        <div className="sb-name">
          兔子<small>Rabbit</small>
        </div>
        <Fig box={RABBIT_BOX.stand} h={170} label="站著">
          <Rabbit pose="stand" />
        </Fig>
        <Fig box={RABBIT_BOX.run} h={150} label="跑">
          <Rabbit pose="run" />
        </Fig>
        <Fig box={RABBIT_BOX.sleep} h={130} label="睡覺">
          <Rabbit pose="sleep" />
        </Fig>
      </div>
      <div className="sb-row">
        <div className="sb-name">
          烏龜<small>Turtle</small>
        </div>
        <Fig box={TURTLE_BOX.walk} h={130} label="慢慢走">
          <Turtle pose="walk" />
        </Fig>
        <Fig box={TURTLE_BOX.cheer} h={136} label="開心">
          <Turtle pose="cheer" />
        </Fig>
        <Fig box={ELEPHANT_BOX} h={130} label="（方舟頁）大象">
          <Elephant />
        </Fig>
      </div>
    </div>
  )
}

const WORD_MS = 430
const START_MS = 700

function Page({ id }: { id: string }) {
  const pg = PAGES.find((p) => p.id === id)!
  const words = pg.en.split(' ')
  const [at, setAt] = useState(-1)
  const [hop, setHop] = useState<Record<string, number>>({})
  useEffect(() => {
    const ts = words.map((_, i) =>
      window.setTimeout(() => {
        setAt(i)
        for (const hh of pg.hops) if (hh.word === i) setHop((x) => ({ ...x, [hh.actor]: (x[hh.actor] ?? 0) + 1 }))
      }, START_MS + i * WORD_MS),
    )
    ts.push(window.setTimeout(() => setAt(words.length), START_MS + words.length * WORD_MS))
    return () => ts.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="sb-stage" data-at={at} data-hopped={Object.keys(hop).length ? '1' : undefined} data-done={at >= words.length ? '1' : undefined}>
      <div className="sb-back" aria-hidden="true">
        <svg viewBox="0 0 48 48" width={44}>
          <rect x={8} y={8} width={32} height={34} rx={3} fill="#C9A57E" stroke="#2E2A25" strokeWidth={3} />
          <path d="M8 25 H40" stroke="#2E2A25" strokeWidth={3} />
        </svg>
      </div>
      <div className="sb-sub">
        {words.map((w, i) => (
          <span key={i} className={i === at ? 'now' : i < at ? 'said' : undefined}>
            {w}
          </span>
        ))}
      </div>
      <div className="sb-frame">
        <svg viewBox="0 0 960 600" width={975} height={610}>
          {pg.draw(hop)}
        </svg>
      </div>
      <div className="sb-host">
        <svg viewBox={`0 0 ${DINO_BOX.momo.w} ${DINO_BOX.momo.h}`} width="100%">
          <DinoArt who="momo" mood="happy" />
        </svg>
      </div>
    </div>
  )
}

function App() {
  const p = new URLSearchParams(location.search).get('p') ?? 'sheet-dinos'
  return (
    <>
      <style>{css}</style>
      {p === 'sheet-dinos' ? <SheetDinos /> : p === 'sheet-friends' ? <SheetFriends /> : <Page id={p} />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

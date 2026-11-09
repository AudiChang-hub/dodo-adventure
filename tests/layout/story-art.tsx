// 故事時間手繪插畫的預覽頁（T-119；不進 App 的打包，vite 只打包 index.html）。
// 開法：npx vite，然後開 /dodo-adventure/tests/layout/story-art.html?…
//   ?lib=0、1、2…：角色庫設定稿（每頁 12 個角色、東西，每個姿勢都畫）
//   ?key=<句子的 key>：那一句的插畫頁（平板 1200×786：上面字幕、中間插畫、左下講故事的恐龍），字幕一個字一個字亮，念到名字的角色跳一下
//   ?keys=1：回傳全部句子的 key（給截圖腳本用，window.__keys）
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { DINO_BOX, DinoArt } from '../../src/art/Dino'
import { ITEMS } from '../../src/art/storybook/meta'
import { drawItem } from '../../src/art/storybook/library'
import { StoryPage } from '../../src/art/storybook/Page'
import { hopsOf, fromPic, type PageArt } from '../../src/art/storybook/layout'
import { PAGE_ART } from '../../src/content/story/pages'
import { allChapters, chapterLines, scriptOf } from '../../src/content/story'
import type { Speaker } from '../../src/content/lines'
import '../../src/styles/global.css'

const css = `
html, body { margin: 0; background: #EFE6D3; }
.sb-stage { position: relative; width: 1200px; height: 786px; overflow: hidden; background: #EFE6D3; font-family: Fredoka, sans-serif; color: #2E2A25; }
.sb-back { position: absolute; left: 26px; top: 18px; width: 92px; height: 92px; border-radius: 50%; background: #FBF8F2; box-shadow: 0 6px 0 rgba(46,42,37,.1); }
.sb-sub { position: absolute; left: 50%; top: 22px; translate: -50% 0; max-width: 940px; padding: 10px 30px; border-radius: 999px; background: #FBF8F2; box-shadow: 0 6px 0 rgba(46,42,37,.08); font-weight: 600; font-size: 34px; white-space: nowrap; display: flex; gap: .3em; }
.sb-sub span { padding: 0 .12em; border-radius: 10px; color: #A39B8E; }
.sb-sub span.said { color: #2E2A25; }
.sb-sub span.now { color: #2E2A25; background: #F1D27C; }
.sb-frame { position: absolute; left: 205px; top: 100px; width: 975px; height: 610px; border-radius: 28px; overflow: hidden; background: #FBF8F2; box-shadow: 0 0 0 8px #FBF8F2, 0 14px 0 rgba(46,42,37,.10); }
.sb-host { position: absolute; left: 6px; bottom: 6px; width: 190px; }
.sb-key { position: absolute; right: 18px; bottom: 6px; font: 12px ui-monospace, monospace; color: #A39B8E; }
.sb-sheet { padding: 20px 28px; box-sizing: border-box; }
.sb-sheet h1 { margin: 0 0 12px; font: 400 26px/1.3 Huninn, sans-serif; }
.sb-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.sb-card .row svg { max-width: 48%; }
.sb-card .row svg:only-child { max-width: 100%; }
.sb-card { background: #FBF8F2; border-radius: 18px; padding: 8px; text-align: center; box-shadow: 0 5px 0 rgba(46,42,37,.07); }
.sb-card .row { display: flex; justify-content: center; align-items: flex-end; gap: 6px; height: 132px; }
.sb-card svg { display: block; }
.sb-card b { display: block; font: 400 16px/1.3 Huninn, sans-serif; color: #6B645A; margin-top: 4px; }
`

/** 全部句子：key → [英文, 說話的人, 這一章的場景, pic] */
function allBeats() {
  const en = new Map<string, [string, Speaker]>()
  for (const ch of allChapters()) for (const [k, sp, e] of chapterLines(ch)) en.set(k, [e, sp])
  const out = new Map<string, { en: string; who: Speaker; scene: string; pic?: string }>()
  for (const ch of allChapters()) {
    const s = scriptOf(ch, { tracks: [], friend: null, door: ch.door ?? 'park' })
    if (!s) continue
    for (const b of [...s.title, ...s.intro, ...s.stops.flat(), ...s.finale, ...s.end])
      if (!out.has(b.key)) out.set(b.key, { en: en.get(b.key)?.[0] ?? '', who: b.speaker, scene: s.look.scene, pic: b.pic })
  }
  return out
}

function Lib({ page }: { page: number }) {
  const ids = Object.keys(ITEMS)
  const per = 12
  const shown = ids.slice(page * per, page * per + per)
  return (
    <div className="sb-stage sb-sheet" data-ready="1">
      <h1>
        角色庫設定稿 {page + 1}／{Math.ceil(ids.length / per)}（每次出場都長這樣）
      </h1>
      <div className="sb-grid">
        {shown.map((id) => {
          const it = ITEMS[id]
          const poses = Object.entries(it.poses)
          return (
            <div className="sb-card" key={id}>
              <div className="row">
                {poses.map(([pose, b]) => {
                  const h = Math.min(124, (124 * 1.6 * b.h) / Math.max(b.w, b.h) / (poses.length > 1 ? 1.25 : 1))
                  return (
                    <svg key={pose} viewBox={`-8 -8 ${b.w + 16} ${b.h + 16}`} height={h} width={((b.w + 16) / (b.h + 16)) * h} style={{ overflow: 'visible' }}>
                      {drawItem(id, pose)}
                    </svg>
                  )
                })}
              </div>
              <b>
                {it.zh}
                {poses.length > 1 ? `（${poses.map(([p]) => ({ stand: '站', run: '跑', sleep: '睡', walk: '走', cheer: '開心', fly: '飛', leaf: '叼葉子', full: '滿的', face: '笑臉' })[p] ?? p).join('、')}）` : ''}
              </b>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ?fast=1：截圖用，字幕很快念完（跳一下的動畫照樣做完才算念完）
const FAST = new URLSearchParams(location.search).has('fast')
const WORD_MS = FAST ? 30 : 420
const START_MS = FAST ? 100 : 600

function Beat({ k }: { k: string }) {
  const b = allBeats().get(k)!
  const art: PageArt = PAGE_ART[k] ?? fromPic(b.pic, (b.scene as PageArt['scene']) ?? 'park')!
  const words = b.en.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)
  const hops = hopsOf(b.en, art)
  const [at, setAt] = useState(-1)
  const [hop, setHop] = useState<Record<number, number>>({})
  useEffect(() => {
    const ts = words.map((_, i) =>
      window.setTimeout(() => {
        setAt(i)
        for (const h of hops) if (h.word === i) setHop((x) => ({ ...x, [h.cast]: (x[h.cast] ?? 0) + 1 }))
      }, START_MS + i * WORD_MS),
    )
    ts.push(window.setTimeout(() => setAt(words.length), START_MS + words.length * WORD_MS + 700))
    return () => ts.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="sb-stage" data-done={at >= words.length ? '1' : undefined} data-hopped={Object.keys(hop).length ? '1' : undefined} data-hops={hops.length}>
      <div className="sb-back" />
      <div className="sb-sub">
        {words.map((w, i) => (
          <span key={i} className={i === at ? 'now' : i < at ? 'said' : undefined}>
            {w}
          </span>
        ))}
      </div>
      <div className="sb-frame">
        <StoryPage art={art} hop={hop} width={975} />
      </div>
      <div className="sb-host">
        <svg viewBox={`0 0 ${DINO_BOX[b.who].w} ${DINO_BOX[b.who].h}`} width="100%">
          <DinoArt who={b.who} mood="happy" />
        </svg>
      </div>
      <div className="sb-key">{k}</div>
    </div>
  )
}

function App() {
  const q = new URLSearchParams(location.search)
  ;(window as unknown as { __keys: string[] }).__keys = [...allBeats().keys()]
  const lib = q.get('lib')
  const key = q.get('key')
  return (
    <>
      <style>{css}</style>
      {lib != null ? <Lib page={Number(lib)} /> : key ? <Beat k={key} /> : <div data-ready="1">?lib=0 或 ?key=…</div>}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

// 產生拼圖的組合圖（T-159 第二版，PM 2026-11-16 退件後重做）：node scripts/gen-puzzle-pics.mjs
// 1. scripts/puzzle-templates.ts 的 12 種版型，各用固定亂數產生一堆候選圖（同一個主角在整個圖庫最多出現幾次）。
// 2. 先用框粗篩（src/games/puzzle/coverage-free.ts：3×3 每一格都有東西、只有背景的格子不能兩格一樣）。
// 3. 在瀏覽器裡畫出來量像素：每一格跟「只有天空和地面」比，至少 10% 的像素不一樣（有畫東西）；
//    同一張裡任兩格縮成 16×10 比，平均差 ≥ DIST（不會兩片幾乎一樣，例如三片都只有遮雨棚的條紋）；
//    同一個版型的兩張整張縮小比，不能太像。
// 4. 每個版型留 n 張，寫到 src/games/puzzle/pics-free.ts。之後產語音：npx tsx scripts/extract-phrases.ts && python scripts/gen_audio.py --only pz.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const req = createRequire(path.join(process.cwd(), 'package.json'))
const { renderToStaticMarkup } = req('react-dom/server')
const React = req('react')
const vite = await createServer({ configFile: false, root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', ssr: { external: ['react', 'react-dom', 'react/jsx-runtime'] }, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] } })
const { TEMPLATES, rng } = await vite.ssrLoadModule('/scripts/puzzle-templates.ts')
const { FreeArtView } = await vite.ssrLoadModule('/src/games/puzzle/FreeArt.tsx')
const { freeProblems } = await vite.ssrLoadModule('/src/games/puzzle/coverage-free.ts')
const { HAND_PICS } = await vite.ssrLoadModule('/src/games/puzzle/pics-hand.ts')
await vite.close()

/** 同一個主角（第一個 item）在整個組合圖最多幾張；三隻恐龍是 App 的主角，可以多一點 */
const CAP = 5
const CAP_DINO = 9
const capOf = (who) => (['dodo', 'momo', 'bobo'].includes(who) ? CAP_DINO : CAP)
/** 一格至少多少像素有畫東西（一隻蜜蜂、一隻小鳥大約 6～10%） */
const CONTENT = 0.06
/** 同一張裡兩格：只比「有畫東西」的地方（縮小成 16×10，任一格有畫的像素），平均色差（0～255）至少多少 */
const DIST = 12
/** 同一個版型兩張整張縮小後的平均色差至少多少（擋幾乎一樣的兩張；同版型的背景本來就像，靠主角、天上、左右相反分開） */
const SAME = 4

const svgOf = (art) => renderToStaticMarkup(React.createElement(FreeArtView, { art })).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
const taken = new Set(HAND_PICS.map((p) => p.id))
const lead = new Map()
const cands = []
let ti = 0
for (const [name, t] of Object.entries(TEMPLATES)) {
  const r = rng(7919 * ++ti)
  let got = 0
  for (let k = 0; k < 6000 && got < t.n * 6; k++) {
    const c = t.make(r)
    if (!c || taken.has(c.id)) continue
    if (c.en.split(/\s+/).length > 6) continue
    if (freeProblems(c.free).length) continue
    taken.add(c.id)
    cands.push({ ...c, tpl: name, full: svgOf(c.free), bare: svgOf({ ...c.free, deco: [], items: [] }) })
    got++
  }
  console.log(`${name}：候選 ${got}`)
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>')
const metrics = await page.evaluate(async (list) => {
  const W = 480, H = 300
  const load = (svg) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) })
  const draw = async (svg, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(await load(svg), 0, 0, w, h); return x.getImageData(0, 0, w, h).data }
  const out = []
  for (const p of list) {
    const a = await draw(p.full, W, H)
    const b = await draw(p.bare, W, H)
    const content = Array(9).fill(0)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4
      if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 40) content[Math.floor(y / 100) * 3 + Math.floor(x / 160)]++
    }
    // 每一格縮成 16×10；mask：這個點有畫東西（跟只有天空地面的不一樣）
    const t = await draw(p.full, 48, 30)
    const tb = await draw(p.bare, 48, 30)
    const cell = (src, c) => { const v = []; const cx = (c % 3) * 16, cy = Math.floor(c / 3) * 10; for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) { const k = ((cy + y) * 48 + cx + x) * 4; v.push([src[k], src[k + 1], src[k + 2]]) } return v }
    const cells = Array.from({ length: 9 }, (_, c) => cell(t, c))
    const bares = Array.from({ length: 9 }, (_, c) => cell(tb, c))
    const mask = cells.map((v, c) => v.map((px, k) => Math.abs(px[0] - bares[c][k][0]) + Math.abs(px[1] - bares[c][k][1]) + Math.abs(px[2] - bares[c][k][2]) > 30))
    let minDist = 999
    let pair = null
    for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) {
      let d = 0
      let n = 0
      for (let k = 0; k < cells[i].length; k++) {
        if (!mask[i][k] && !mask[j][k]) continue
        n++
        d += (Math.abs(cells[i][k][0] - cells[j][k][0]) + Math.abs(cells[i][k][1] - cells[j][k][1]) + Math.abs(cells[i][k][2] - cells[j][k][2])) / 3
      }
      d = n ? d / n : 0
      if (d < minDist) { minDist = d; pair = [i, j] }
    }
    out.push({ content: content.map((n) => n / 16000), minDist, pair, thumb: [...t] })
  }
  return out
}, cands.map(({ full, bare }) => ({ full, bare })))
if (process.env.PZ_PREVIEW) {
  const firsts = Object.keys(TEMPLATES).map((n) => cands.findIndex((c) => c.tpl === n)).filter((i) => i >= 0)
  const html = firsts.map((i) => `<div style="display:inline-block;width:460px;margin:4px;font:12px sans-serif">${cands[i].full.replace('<svg ', '<svg width="460" ')}<br>${cands[i].id} ${metrics[i].content.map((v) => v.toFixed(2)).join(' ')} d=${metrics[i].minDist.toFixed(1)} ${metrics[i].pair}</div>`).join('')
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;width:1440px">${html}</body>`)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: process.env.PZ_PREVIEW, fullPage: true })
}
await browser.close()

const keep = []
if (process.env.PZ_STATS) {
  for (const name of Object.keys(TEMPLATES)) {
    const h = Array(9).fill(0)
    const ss = []
    const idx = cands.map((c, i) => (c.tpl === name ? i : -1)).filter((i) => i >= 0)
    for (const i of idx) metrics[i].content.forEach((v, c) => { if (v < CONTENT) h[c]++ })
    for (let a = 0; a < Math.min(idx.length, 12); a++) for (let b = a + 1; b < Math.min(idx.length, 12); b++) ss.push(metrics[idx[a]].thumb.reduce((s, v, k) => s + Math.abs(v - metrics[idx[b]].thumb[k]), 0) / metrics[idx[a]].thumb.length)
    ss.sort((x, y) => x - y)
    console.log(name, idx.length, '空格', h.join(' '), '同版型差異 中位數', ss[Math.floor(ss.length / 2)]?.toFixed(1), '最小', ss[0]?.toFixed(1))
  }
}
const why = { content: 0, dist: 0, same: 0, cap: 0 }
for (const [name, t] of Object.entries(TEMPLATES)) {
  const mine = []
  cands.forEach((c, i) => {
    if (c.tpl !== name || mine.length >= t.n) return
    const m = metrics[i]
    if (m.content.some((v) => v < CONTENT)) return void why.content++
    if (m.minDist < DIST) return void why.dist++
    if (mine.some((o) => o.thumb.reduce((s, v, k) => s + Math.abs(v - m.thumb[k]), 0) / m.thumb.length < SAME)) return void why.same++
    const who = c.free.items[0].who
    if ((lead.get(who) ?? 0) >= capOf(who)) return void why.cap++
    lead.set(who, (lead.get(who) ?? 0) + 1)
    mine.push({ ...c, thumb: m.thumb })
  })
  console.log(`${name}：留 ${mine.length}/${t.n}`)
  keep.push(...mine)
}
console.log(`擋下：沒畫東西的格子 ${why.content}、兩格太像 ${why.dist}、跟同版型別張太像 ${why.same}、主角用太多次 ${why.cap}`)

const body = keep.map((c) => `  ${JSON.stringify({ id: c.id, zh: c.zh, en: c.en, free: c.free })},`).join('\n')
fs.writeFileSync(
  'src/games/puzzle/pics-free.ts',
  `// 由 scripts/gen-puzzle-pics.mjs 產生，請勿手動修改（改 scripts/puzzle-templates.ts 再跑一次）。T-159 拼圖的組合圖：12 種版型、像素比對挑過。
import type { PuzzlePic } from './pics-hand'

export const FREE_PICS: PuzzlePic[] = [
${body}
]
`,
)
console.log(`共 ${keep.length} 張 → src/games/puzzle/pics-free.ts`)

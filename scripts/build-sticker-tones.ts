// 貼紙圖庫每個主角的主要顏色（src/content/sticker-tones.generated.ts），給隨機貼紙排除「背景跟主角顏色太接近」的組合。
// 把每個 Fluent Emoji 畫成 64px 的點陣，統計不透明像素的顏色（量化成 16 階），取面積最大的幾個顏色與佔比。
// 用法：npm run emoji（build-emoji.ts 之後接著跑）
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { EMOJI } from '../src/art/emoji.generated'
import { STICKER_ART } from '../src/content/sticker-art'

const SIZE = 64
const out: Record<string, [string, number][]> = {}
/** 主角實際畫到的範圍（0–1，相對於圖示的寬高）：[中心 x, 中心 y, 寬, 高]，讓每個主角在貼紙上看起來一樣大 */
const boxes: Record<string, [number, number, number, number]> = {}
for (const a of STICKER_ART) {
  const e = EMOJI[a.id]
  if (!e) throw new Error(`Missing emoji: ${a.id}（先跑 build-emoji）`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${e.w} ${e.h}" width="${SIZE}" height="${SIZE}">${e.b}</svg>`
  const { data } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  let total = 0
  let [x0, y0, x1, y1] = [SIZE, SIZE, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % SIZE
    const py = Math.floor(i / 4 / SIZE)
    if (data[i + 3] > 40) [x0, y0, x1, y1] = [Math.min(x0, px), Math.min(y0, py), Math.max(x1, px + 1), Math.max(y1, py + 1)]
    if (data[i + 3] < 200) continue
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const x = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    x.n++
    x.r += r
    x.g += g
    x.b += b
    bins.set(k, x)
    total++
  }
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  boxes[a.id] = [r3((x0 + x1) / 2 / SIZE), r3((y0 + y1) / 2 / SIZE), r3((x1 - x0) / SIZE), r3((y1 - y0) / SIZE)]
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  out[a.id] = [...bins.values()]
    .sort((p, q) => q.n - p.n)
    .slice(0, 4)
    .map((x) => [`#${hex(x.r / x.n)}${hex(x.g / x.n)}${hex(x.b / x.n)}`, Math.round((x.n / total) * 100) / 100] as [string, number])
    .filter(([, share]) => share >= 0.06)
}
writeFileSync('src/content/sticker-tones.generated.ts', `// 由 scripts/build-sticker-tones.ts 產生，請勿手動修改。每個貼紙主角面積最大的顏色與佔比（隨機貼紙排除撞色用）\nexport const TONES: Record<string, [string, number][]> = ${JSON.stringify(out)}\n/** 主角實際畫到的範圍：[中心 x, 中心 y, 寬, 高]（0–1） */\nexport const BOXES: Record<string, [number, number, number, number]> = ${JSON.stringify(boxes)}\n`)
console.log(`${Object.keys(out).length} sticker tones`)

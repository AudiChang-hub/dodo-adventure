// 隨機貼紙的樣本拼圖：檢查有沒有難看的組合（撞色、太花、主角被外框切到）。
// 用法：npx tsx scripts/sticker-samples.ts 輸出.png [張數=30] [種子=1]
// 跟 App 用同一個 stickerSvg()，所以拼圖上看到的就是孩子看到的。
import sharp from 'sharp'
import { STICKER_ART } from '../src/content/sticker-art'
import { lookOf, stickerSvg } from '../src/content/sticker-look'

const [out = 'sticker-samples.png', nArg = '30', seedArg = '1'] = process.argv.slice(2)
const N = Number(nArg)
let s = Number(seedArg) >>> 0
const rnd = () => {
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0
  return s / 4294967296
}

const COLS = 6
const CELL = 230
const PAD = 26
const rows = Math.ceil(N / COLS)
const W = COLS * CELL + PAD * 2
const H = rows * (CELL + 34) + PAD * 2
const cells: string[] = []
for (let i = 0; i < N; i++) {
  const art = STICKER_ART[Math.floor(rnd() * STICKER_ART.length)].id
  const seed = Math.floor(rnd() * 4294967296) >>> 0
  const L = lookOf(art, seed)
  const x = PAD + (i % COLS) * CELL
  const y = PAD + Math.floor(i / COLS) * (CELL + 34)
  const svg = stickerSvg(art, seed).replace(/ width="100%" height="100%"/, ``).replace("<svg ", `<svg x="${x + 14}" y="${y + 6}" width="${CELL - 28}" height="${CELL - 28}" `)
  cells.push(svg)
  cells.push(`<text x="${x + CELL / 2}" y="${y + CELL + 8}" text-anchor="middle" font-family="Arial" font-size="13" fill="#6b645a">${art} · ${L.shape.id}/${L.palette.id}/${L.pattern}</text>`)
}
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#F3EEE4"/>${cells.join('')}</svg>`
await sharp(Buffer.from(sheet)).png().toFile(out)
console.log(`${N} samples → ${out}`)

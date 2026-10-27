// 由 public/icon.svg 產生 PWA 需要的 PNG 圖示
import sharp from 'sharp'

const svg = 'public/icon.svg'
await sharp(svg).resize(192, 192).png().toFile('public/icon-192.png')
await sharp(svg).resize(512, 512).png().toFile('public/icon-512.png')
// maskable：四周留安全區，背景鋪滿
const inner = await sharp(svg).resize(400, 400).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#F3EEE4' } })
  .composite([{ input: inner, top: 56, left: 56 }])
  .png()
  .toFile('public/icon-maskable.png')
console.log('icons ok')

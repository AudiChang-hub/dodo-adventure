#!/usr/bin/env node
// 「找一樣的字」（T-117）要知道兩個字長得像不像：把 180 篇課文裡出現的每個國字，用課裡的字型（粉圓體 Huninn）畫成 16×16 的小圖，
// 存成 src/lessons/chinese/glyphs.generated.json（每個字 64 個 16 進位字元＝256 格，有墨的格是 1）。
// 加長版課文（linesLong，T-150）的字也畫。像不像在 src/lessons/chinese/match.ts 的 glyphSim 算（兩張小圖疊起來，重疊多少）。課文改了（texts.json 多了新字）要重跑：
//   node scripts/build-zh-glyphs.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const N = 16
/** 畫的時候放大幾倍再縮成 N×N（每一格看 S×S 個像素有多少墨） */
const S = 8
/** 一格裡墨佔多少以上算「有墨」 */
const INK = 0.18

const texts = JSON.parse(fs.readFileSync(path.join(root, 'src/lessons/chinese/texts.json'), 'utf8'))
const chars = [...new Set(texts.flatMap((t) => [...t.lines.join(''), ...(t.linesLong ?? []).join(''), ...t.redWords.join('')]).filter((c) => /[一-鿿]/.test(c)))].sort()

const css = pathToFileURL(path.join(root, 'node_modules/@fontsource/huninn/400.css')).href
const tmp = path.join(root, 'test-results', 'zh-glyphs.html')
fs.mkdirSync(path.dirname(tmp), { recursive: true })
fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${css}"><body></body>`)

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(tmp).href)
  const out = await page.evaluate(
    async ({ chars, N, S, INK }) => {
      const px = N * S
      const cv = document.createElement('canvas')
      cv.width = cv.height = px
      const g = cv.getContext('2d', { willReadFrequently: true })
      const res = {}
      const missing = []
      for (const ch of chars) {
        await document.fonts.load(`${px}px Huninn`, ch)
        if (!document.fonts.check(`${px}px Huninn`, ch)) missing.push(ch)
        g.clearRect(0, 0, px, px)
        g.fillStyle = '#000'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.font = `${Math.round(px * 0.92)}px Huninn`
        g.fillText(ch, px / 2, px / 2 + px * 0.04)
        const d = g.getImageData(0, 0, px, px).data
        let hex = ''
        for (let y = 0; y < N; y++) {
          let row = 0
          for (let x = 0; x < N; x++) {
            let a = 0
            for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) a += d[((y * S + yy) * px + x * S + xx) * 4 + 3]
            row = (row << 1) | (a / (S * S * 255) >= INK ? 1 : 0)
          }
          hex += row.toString(16).padStart(4, '0')
        }
        res[ch] = hex
      }
      return { res, missing }
    },
    { chars, N, S, INK },
  )
  if (out.missing.length) {
    console.error(`粉圓體沒有這些字：${out.missing.join('')}`)
    process.exitCode = 1
  }
  const file = path.join(root, 'src/lessons/chinese/glyphs.generated.json')
  fs.writeFileSync(file, JSON.stringify(out.res) + '\n')
  console.log(`${chars.length} 個字 → ${path.relative(root, file)}（${fs.statSync(file).size} bytes）`)
} finally {
  await browser.close()
  // 不用 fs.rmSync：這個中文路徑下它會沒有訊息就讓 node 崩潰（AGENTS.md 已知地雷）
  try {
    fs.unlinkSync(tmp)
  } catch {
    /* 沒有就算了 */
  }
}

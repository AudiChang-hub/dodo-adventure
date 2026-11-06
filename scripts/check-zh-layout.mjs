#!/usr/bin/env node
// 中文課文的排版檢查（T-94）：180 篇 × 每一行亮起來（紅字的圖放大）× 第 1、2 次（第 2 次有框起來的詞和「停」）×
// 平板橫向 1280×800、1200×786、手機直式 390×844，量每個字和標點的框：
//   - 不能跟任何一張圖（含放大的）、「停」的小標籤重疊；
//   - 不能超出課本那一頁；圖、「停」也不能超出課本那一頁。
// 開一個 vite dev（tests/layout/zh-layout.html，真的舞台 games/Shell 裡排 Reader），在瀏覽器裡一篇一篇換著量。
// 用法：node scripts/check-zh-layout.mjs [--day 2] [--shots DIR]（--shots：把每個有問題的畫面截圖存下來）
// 結果最後一行：「排版問題 N 個」；不是 0 就以 1 結束（npm run verify 的「中文課文排版」）。
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null)
const onlyDay = opt('--day') ? Number(opt('--day')) : null
const shots = opt('--shots')
const PORT = Number(process.env.ZH_LAYOUT_PORT || 4611)
const VIEWPORTS = [
  { name: '平板 1280×800', width: 1280, height: 800 },
  { name: '平板 1200×786', width: 1200, height: 786 },
  { name: '手機 390×844', width: 390, height: 844 },
]

const vite = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' })
const kill = () => {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' })
  else vite.kill()
}
process.on('exit', kill)
const url = `http://localhost:${PORT}/dodo-adventure/tests/layout/zh-layout.html`

let code = 1
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) break
    } catch {
      /* 還沒起來 */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  const browser = await chromium.launch()
  const problems = []
  let measured = 0
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    await page.goto(url)
    await page.waitForFunction(() => typeof window.zhLayout === 'function', null, { timeout: 120_000 })
    // 字型（Huninn）用到才下載：先排一篇、等字型好了再量
    await page.evaluate(async () => {
      window.zhLayout(window.zhDays[0], 1, 0)
      await document.fonts.ready
    })
    await page.waitForTimeout(300)
    const days = onlyDay ? [onlyDay] : await page.evaluate(() => window.zhDays)
    const res = await page.evaluate(
      ({ days }) => {
        const out = []
        let n = 0
        const hit = (a, b, tol = 0.5) => a.left < b.right - tol && b.left < a.right - tol && a.top < b.bottom - tol && b.top < a.bottom - tol
        const inside = (a, box, tol = 0.5) => a.left >= box.left - tol && a.right <= box.right + tol && a.top >= box.top - tol && a.bottom <= box.bottom + tol
        for (const day of days) {
          for (const run of [1, 2]) {
            const lines = document.querySelectorAll('.zh-line').length || 6
            for (let line = 0; line < lines; line++) {
              window.zhLayout(day, run, line)
              const pg = document.querySelector('.zh-page')
              if (!pg) {
                out.push({ day, run, line, what: '課本沒有排出來' })
                continue
              }
              const box = pg.getBoundingClientRect()
              const rows = [...document.querySelectorAll('.zh-line')]
              if (line >= rows.length) break
              n++
              const pics = [...document.querySelectorAll('.zh-pic')].map((e) => ({ r: e.getBoundingClientRect(), name: `圖「${e.getAttribute('aria-label')}」` }))
              const tags = [...document.querySelectorAll('.zh-gap-tag')].map((e) => ({ r: e.getBoundingClientRect(), name: '「停」' }))
              const blockers = [...pics, ...tags]
              for (const b of blockers) if (!inside(b.r, box)) out.push({ day, run, line, row: -1, what: `${b.name}超出課本` })
              rows.forEach((row, ri) => {
                const text = row.querySelector('.zh-text')
                const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
                const range = document.createRange()
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                  // 「停」的標籤是給大人看的小字，自己不算課文
                  if (node.parentElement?.closest('.zh-gap-tag')) continue
                  const s = node.textContent ?? ''
                  for (let k = 0; k < s.length; k++) {
                    if (!s[k].trim()) continue
                    range.setStart(node, k)
                    range.setEnd(node, k + 1)
                    const r = range.getBoundingClientRect()
                    if (!r.width) continue
                    if (!inside(r, box)) out.push({ day, run, line, row: ri, ch: s[k], what: '字超出課本' })
                    for (const b of blockers) if (hit(r, b.r)) out.push({ day, run, line, row: ri, ch: s[k], what: `字被${b.name}蓋住` })
                  }
                }
              })
            }
          }
        }
        return { out, n }
      },
      { days },
    )
    measured += res.n
    for (const p of res.out) problems.push({ vp: vp.name, ...p })
    if (shots && res.out.length) {
      fs.mkdirSync(shots, { recursive: true })
      const seen = new Set()
      for (const p of res.out) {
        const k = `${p.day}-${p.run}-${p.line}`
        if (seen.has(k) || seen.size >= 12) continue
        seen.add(k)
        await page.evaluate(({ day, run, line }) => window.zhLayout(day, run, line), p)
        await page.screenshot({ path: path.join(shots, `${vp.width}x${vp.height}-第${p.day}篇-第${p.run}次-第${p.line + 1}行.png`) })
      }
    }
    await page.close()
    console.log(`${vp.name}：量了 ${res.n} 個畫面，問題 ${res.out.length} 個`)
  }
  await browser.close()
  // 同一篇同一個字只列一次
  const uniq = new Map()
  for (const p of problems) {
    const k = `${p.vp}|${p.day}|${p.run}|${p.row}|${p.ch}|${p.what}`
    if (!uniq.has(k)) uniq.set(k, p)
  }
  for (const p of [...uniq.values()].slice(0, 40))
    console.log(`  ${p.vp} 第 ${p.day} 篇 第 ${p.run} 次 亮第 ${p.line + 1} 行：${p.row >= 0 ? `第 ${p.row + 1} 行「${p.ch}」` : ''}${p.what}`)
  console.log(`180 篇 × 3 種尺寸共 ${measured} 個畫面，排版問題 ${uniq.size} 個`)
  code = uniq.size ? 1 : 0
} finally {
  kill()
}
process.exit(code)

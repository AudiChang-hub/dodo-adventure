#!/usr/bin/env node
// 中文課文的排版檢查（T-94）：180 篇 × 每一行亮起來（紅字的圖放大）× 第 1、2、3 次（第 2 次有框起來的詞和「停」；上面有第幾次的小圖示，T-127）×
// 平板橫向 1280×800、1200×786、手機直式 390×844，量每個字和標點的框：
//   - 不能跟任何一張圖（含放大的）、「停」的小標籤重疊；
//   - 不能超出課本那一頁；圖、「停」也不能超出課本那一頁。
// 開一個 vite dev（tests/layout/zh-layout.html，真的舞台 games/Shell 裡排 Reader），在瀏覽器裡一篇一篇換著量。
// 用法：node scripts/check-zh-layout.mjs [--day 2] [--shots DIR]（--shots：把每個有問題的畫面截圖存下來）
// 聊一聊（T-126）：每篇量一次——大圖、給大人的小字條、往下走的按鈕都在畫面裡、不互相蓋住，小字條的字不被圖蓋住。
// 第 3 次的故事題、排順序（T-127）：每篇各量一次——題目卡（挖空的那一句）、圖、格子、小字條都在畫面裡、不重疊，字不超出、不被圖和恐龍蓋住。
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
    // 第一次開要等 vite 打包依賴（node_modules 跟主 repo 共用時，快取常被別的 vite 刷掉，要一分鐘以上）
    await page.goto(url, { timeout: 180_000 })
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
          for (const run of [1, 2, 3]) {
            // 這一篇自己的行數（T-118：以前拿畫面上「上一篇」的行數，遇到行數不一樣的篇就去亮不存在的行，課本排不出來，
            // 之後每一篇都跟著誤報「課本沒有排出來」，真的排版問題反而被蓋掉）
            const lines = window.zhLines[day]
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
              // 第幾次的小圖示（T-127）：在課本裡、不蓋到標題和課文
              const marks = [...document.querySelectorAll('.zh-run')].map((e) => ({ r: e.getBoundingClientRect(), name: '第幾次的小圖示' }))
              if (marks.length !== 3) out.push({ day, run, line, row: -1, what: `第幾次的小圖示有 ${marks.length} 個` })
              const blockers = [...pics, ...tags, ...marks]
              for (const b of blockers) if (!inside(b.r, box)) out.push({ day, run, line, row: -1, what: `${b.name}超出課本` })
              const title = document.querySelector('.zh-title')
              if (title) {
                const range = document.createRange()
                const tw = document.createTreeWalker(title, NodeFilter.SHOW_TEXT)
                for (let node = tw.nextNode(); node; node = tw.nextNode()) {
                  const s = node.textContent ?? ''
                  for (let k = 0; k < s.length; k++) {
                    if (!s[k].trim()) continue
                    range.setStart(node, k)
                    range.setEnd(node, k + 1)
                    const r = range.getBoundingClientRect()
                    if (r.width && marks.some((m) => hit(r, m.r))) out.push({ day, run, line, row: -1, ch: s[k], what: '標題被第幾次的小圖示蓋住' })
                  }
                }
              }
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
          // 聊一聊（T-126）：中間一張大圖、下面給大人的小字條。圖（含外面一圈黃框）不能蓋到小字條的字；
          // 圖、小字條、往下走的按鈕都要在畫面裡，彼此不重疊
          window.zhLayout(day, 1, 'talk')
          n++
          const view = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
          const pic = document.querySelector('.zh-talk-pic')
          const note = document.querySelector('.zh-talk-note')
          const go = document.querySelector('.zh-go-quiz')
          if (!pic) out.push({ day, run: 1, line: 'talk', row: -1, what: '聊一聊沒有圖' })
          if (!note || !go) out.push({ day, run: 1, line: 'talk', row: -1, what: '聊一聊沒有排出來' })
          if (pic && note && go) {
            const p0 = pic.getBoundingClientRect()
            // 外面一圈黃框（.zh-talk-pic::after inset -5%）也算
            const ring = { left: p0.left - p0.width * 0.05, right: p0.right + p0.width * 0.05, top: p0.top - p0.height * 0.05, bottom: p0.bottom + p0.height * 0.05 }
            const nr = note.getBoundingClientRect()
            const btns = [...document.querySelectorAll('.zh-controls button')].map((e) => e.getBoundingClientRect())
            if (p0.width < 120) out.push({ day, run: 1, line: 'talk', row: -1, what: `聊一聊的圖太小（${Math.round(p0.width)}px）` })
            for (const [r, name] of [[ring, '圖'], [nr, '小字條'], ...btns.map((b) => [b, '大人的按鈕'])]) if (!inside(r, view)) out.push({ day, run: 1, line: 'talk', row: -1, what: `聊一聊的${name}超出畫面` })
            if (hit(ring, nr)) out.push({ day, run: 1, line: 'talk', row: -1, what: '聊一聊的圖蓋到小字條' })
            for (const b of btns) {
              if (hit(ring, b)) out.push({ day, run: 1, line: 'talk', row: -1, what: '聊一聊的圖蓋到大人的按鈕' })
              if (hit(nr, b)) out.push({ day, run: 1, line: 'talk', row: -1, what: '聊一聊的小字條蓋到大人的按鈕' })
            }
            const walker = document.createTreeWalker(note, NodeFilter.SHOW_TEXT)
            const range = document.createRange()
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const s = node.textContent ?? ''
              for (let k = 0; k < s.length; k++) {
                if (!s[k].trim()) continue
                range.setStart(node, k)
                range.setEnd(node, k + 1)
                const r = range.getBoundingClientRect()
                if (!r.width) continue
                if (!inside(r, nr)) out.push({ day, run: 1, line: 'talk', row: -1, ch: s[k], what: '聊一聊小字條的字超出字條' })
                if (hit(r, ring)) out.push({ day, run: 1, line: 'talk', row: -1, ch: s[k], what: '聊一聊小字條的字被圖蓋住' })
              }
            }
          }
          // 第 3 次的故事題、排順序（T-127）：題目卡、圖、格子、給大人的小字條都在畫面裡、彼此不重疊；
          // 題目卡的字在卡片裡、小字條的字在字條裡，都不被圖、恐龍蓋住
          const chars = (el) => {
            const res = []
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
            const range = document.createRange()
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              // 空格裡先排好、看不到的答案（答對了才出現）也量：答對時一樣不能超出
              const s = node.textContent ?? ''
              for (let k = 0; k < s.length; k++) {
                if (!s[k].trim()) continue
                range.setStart(node, k)
                range.setEnd(node, k + 1)
                const r = range.getBoundingClientRect()
                if (r.width) res.push({ ch: s[k], r })
              }
            }
            return res
          }
          for (const mode of ['story', 'order']) {
            if (!window.zhLayout(day, 3, mode)) continue
            n++
            const view = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
            const R = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect())
            const dino = R('.stage-host')[0]
            const note = document.querySelector('.zh-note')
            const parts =
              mode === 'story'
                ? [...R('.zh-ask').map((r) => [r, '題目卡']), ...R('.zh-quiz .tile').map((r) => [r, '圖'])]
                : [...R('.zh-order-slot').map((r) => [r, '格子']), ...R('.zh-order-card').map((r) => [r, '圖'])]
            const label = mode === 'story' ? '故事題' : '排順序'
            const bad = (what, ch) => out.push({ day, run: 3, line: mode, row: -1, ch, what: `${label}：${what}` })
            if (!note) bad('沒有給大人的小字條')
            if (parts.length < (mode === 'story' ? 3 : 4)) bad(`東西不夠（${parts.length} 個）`)
            const nr = note?.getBoundingClientRect()
            const all = nr ? [...parts, [nr, '小字條']] : parts
            for (const [r, name] of all) if (!inside(r, view)) bad(`${name}超出畫面`)
            for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (hit(all[i][0], all[j][0])) bad(`${all[i][1]}和${all[j][1]}疊在一起`)
            const ask = document.querySelector('.zh-ask')
            if (ask) {
              const ar = ask.getBoundingClientRect()
              for (const c of chars(ask)) if (!inside(c.r, ar)) bad('題目的字超出題目卡', c.ch)
            }
            if (note && nr)
              for (const c of chars(note)) {
                if (!inside(c.r, nr)) bad('小字條的字超出字條', c.ch)
                if (dino && hit(c.r, dino)) bad('小字條的字被恐龍蓋住', c.ch)
                for (const [r] of parts) if (hit(c.r, r)) bad('小字條的字被圖蓋住', c.ch)
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
        await page.screenshot({ path: path.join(shots, `${vp.width}x${vp.height}-第${p.day}篇-第${p.run}次-${typeof p.line === 'string' ? p.line : `第${p.line + 1}行`}.png`) })
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
    console.log(`  ${p.vp} 第 ${p.day} 篇 ${typeof p.line === 'string' ? (p.line === 'talk' ? '聊一聊' : '第 3 次') : `第 ${p.run} 次 亮第 ${p.line + 1} 行`}：${p.row >= 0 ? `第 ${p.row + 1} 行「${p.ch}」` : ''}${p.what}`)
  console.log(`180 篇 × 3 種尺寸共 ${measured} 個畫面，排版問題 ${uniq.size} 個`)
  code = uniq.size ? 1 : 0
} finally {
  kill()
}
process.exit(code)

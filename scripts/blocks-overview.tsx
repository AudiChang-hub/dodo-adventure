// 積木蓋蓋看（T-162）全部模型的總覽圖：npx tsx scripts/blocks-overview.tsx [輸出資料夾]
// 產生 overview.html（每個模型一格：平面圖、立體圖、名字、幾塊），再用 Playwright 截成 PNG（每個主題一張＋全部一張）。
// 預設寫到主 repo 的 docs/截圖/新遊戲-積木/（worktree 裡的 docs/ 不會留下來）。
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from 'playwright'
import { MODELS, modelBricks } from '../src/games/blocks/models'
import { ModelPic } from '../src/games/blocks/BrickArt'
import { THEME_ZH, type ThemeId } from '../src/games/blocks/model-kit'

void React
const out = path.resolve(process.argv[2] ?? path.join(process.cwd().replace(/[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/, ''), 'docs', '截圖', '新遊戲-積木'))
fs.mkdirSync(out, { recursive: true })

const themes = [...new Set(MODELS.map((m) => m.theme))] as ThemeId[]
const card = (m: (typeof MODELS)[number]) =>
  `<figure><div class="pics"><div class="pic">${renderToStaticMarkup(<ModelPic bricks={m.bricks} v="flat" />)}</div><div class="pic">${renderToStaticMarkup(<ModelPic bricks={modelBricks(m, true)} v="deep" />)}</div></div><figcaption><b>${m.zh}</b> ${m.size === 'S' ? '小' : '中'}・${m.bricks.length}／${modelBricks(m, true).length} 塊</figcaption></figure>`
const section = (t: ThemeId) => `<section id="t-${t}"><h2>${THEME_ZH[t]}（${MODELS.filter((m) => m.theme === t).length}）</h2><div class="grid">${MODELS.filter((m) => m.theme === t).map(card).join('')}</div></section>`
const html = `<!doctype html><meta charset="utf-8"><title>積木模型總覽</title><style>
body{font-family:'Noto Sans TC',system-ui,sans-serif;background:#FBF8F2;color:#2E2A25;margin:24px}
h1{font-size:28px;margin:0 0 6px} p{margin:0 0 18px;color:#6b6258} h2{font-size:22px;margin:22px 0 10px}
.grid{display:grid;grid-template-columns:repeat(8,1fr);gap:10px}
figure{margin:0;background:#fff;border-radius:12px;padding:8px;box-shadow:0 0 0 2px #E6DCCB}
.pics{display:flex;gap:4px}.pic{flex:1;height:96px}.pic svg{display:block}
figcaption{font-size:13px;margin-top:4px;text-align:center}figcaption b{font-size:14px}
</style><h1>積木蓋蓋看：全部 ${MODELS.length} 個模型</h1><p>小（3～4 塊，第 1 級平面、第 3 級立體）${MODELS.filter((m) => m.size === 'S').length} 個；中（6～8 塊，第 2 級平面、第 4 級照步驟圖）${MODELS.filter((m) => m.size === 'M').length} 個。每格左邊是平面版、右邊是前後兩排的立體版；數字是平面／立體的塊數。</p>${themes.map(section).join('')}`
fs.writeFileSync(path.join(out, 'overview.html'), html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('file:///' + path.join(out, 'overview.html').replace(/\\/g, '/'))
await page.screenshot({ path: path.join(out, '模型總覽-全部.png'), fullPage: true })
for (const t of themes) await page.locator(`#t-${t}`).screenshot({ path: path.join(out, `模型總覽-${THEME_ZH[t]}.png`) })
await browser.close()
console.log(`${MODELS.length} 個模型 → ${out}`)

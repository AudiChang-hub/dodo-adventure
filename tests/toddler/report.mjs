#!/usr/bin/env node
// 把 test-results/toddler/findings/*.json 整理成一份報告（markdown）。
//   node tests/toddler/report.mjs [--out docs/三歲模擬測試報告.md]
// 截圖複製到報告旁邊的「三歲模擬測試截圖」資料夾。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const res = process.env.TODDLER_OUT || path.join(root, 'test-results/toddler')
const args = process.argv.slice(2)
const outArg = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : null
const out = outArg ?? path.join(res, 'report.md')
const shotDirName = outArg ? '三歲模擬測試截圖' : 'shots'
// 同一份報告附上第二輪（例如回歸）時，截圖加前綴避免撞名
const prefix = args.includes('--shot-prefix') ? args[args.indexOf('--shot-prefix') + 1] : ''
const title = args.includes('--title') ? args[args.indexOf('--title') + 1] : '三歲模擬測試報告'
const shotDir = path.join(path.dirname(out), shotDirName)

const files = fs.existsSync(path.join(res, 'findings')) ? fs.readdirSync(path.join(res, 'findings')).filter((f) => f.endsWith('.json')) : []
const runs = files.map((f) => JSON.parse(fs.readFileSync(path.join(res, 'findings', f), 'utf8')))
if (!runs.length) {
  console.log('沒有結果可以整理')
  process.exit(0)
}

const SEV = ['卡死', '無法返回', '誤記作答', '閃動縮放', '困惑', '小問題']
const BEHAVIORS = ['連點進場', '搶著操作', '亂玩', '答錯很多次', '發呆', '切到背景再回來', '拖曳中按首頁', '教學中按首頁', '轉場中按首頁', '慶祝中按首頁', '返回鍵', '重新整理']

// 推測的程式位置（依標題比對）；T-4x 是其他工作階段正在改的
const WHERE = [
  [/整頁畫面縮放|透明度來回跳（scene|空白底色|疊在一起/, 'src/ui/motion.ts 的 page／RANGE（整頁 0.6↔1、背景 1↔1.06）、src/ui/Scenes.tsx', 'T-44～T-48 轉場（transition-nozoom）處理中'],
  [/題目層|card-bg|card-fg/, 'src/ui/motion.ts 的 foreground／background、src/ui/Scenes.tsx 的 CardStage', 'T-44～T-48 轉場（transition-nozoom）處理中'],
  [/連點站牌|連點遊戲卡/, 'src/ui/Scenes.tsx 的 ARM_MS（新畫面 0.x 秒後就收點擊）＋ src/screens/MapScreen.tsx 站牌、StationScreen.tsx 遊戲卡的位置重疊', ''],
  [/轉場中按住/, 'src/ui/Scenes.tsx：新畫面還沒 armed 時 pointer-events:none，按下去的那一下（pointerdown）被吃掉，src/ui/Hold.tsx 的 useHold 就不會開始計時', ''],
  [/按住.*沒有回去|回首頁/, 'src/ui/Hold.tsx、src/games/Shell.tsx 的 HoldButton', ''],
  [/短按/, 'src/ui/Hold.tsx（遊戲 1.2 秒、其他 0.6 秒）', ''],
  [/返回鍵/, 'src/lib/lock.ts installGuards（popstate 一律吃掉）', ''],
  [/歡迎語音/, 'src/App.tsx 換畫面時的 stopSpeech() effect（在子畫面 say 之後才跑）、src/screens/StationScreen.tsx', ''],
  [/示範還沒結束就能畫|示範中/, '各畫畫遊戲的示範流程（src/games/draw/*、src/games/sheet/SheetGame.tsx）', ''],
  [/墨跡/, 'src/games/draw/ColoringGame.tsx 的 RegionMap clip（蠟筆只塗在下筆的那一塊）、src/games/draw/Ink.tsx', ''],
  [/重複|一直說話|沒有提示/, 'src/games/idle.ts 與各遊戲的 idle.start', ''],
  [/語音疊/, 'src/lib/audio.ts 的 say／halt', ''],
  [/音檔缺漏/, 'public/audio（npm run audio）', ''],
  [/touchmove/, 'src/lib/lock.ts 的 touchmove preventDefault（不可取消的事件）', ''],
  [/卡|沒有任何變化/, '依畫面而定（見動作紀錄）', ''],
]
const whereOf = (t) => WHERE.find(([re]) => re.test(t)) ?? [null, '（未分類）', '']

// 同一種問題：把數字、引號裡的遊戲名拿掉
const keyOf = (f) => `${f.severity}|${f.title.replace(/[\d.]+/g, 'N').replace(/「[^」]*」/g, '「…」').replace(/（[^）]*）$/, '')}`
const groups = new Map()
for (const r of runs)
  for (const f of r.findings) {
    const k = keyOf(f)
    let g = groups.get(k)
    if (!g) groups.set(k, (g = { key: k, first: f, run: r, hits: [], count: 0 }))
    const n = Number(/共 (\d+) 次/.exec(f.detail)?.[1] ?? 1)
    g.count += n
    g.hits.push(`${f.where}（${f.viewport}）`)
  }
const bugs = [...groups.values()].sort((a, b) => SEV.indexOf(a.first.severity) - SEV.indexOf(b.first.severity) || new Set(b.hits).size - new Set(a.hits).size)

if (fs.existsSync(path.join(res, 'shots'))) {
  fs.mkdirSync(shotDir, { recursive: true })
  if (shotDir !== path.join(res, 'shots'))
    for (const b of bugs) if (b.first.shot) fs.copyFileSync(path.join(res, 'shots', b.first.shot), path.join(shotDir, prefix + b.first.shot))
}

const esc = (s) => String(s ?? '').replace(/\|/g, '｜').replace(/\n/g, ' ')
const L = []
const vps = [...new Set(runs.map((r) => r.viewport))].join('、')
const base = runs[0].base ?? 20261029
const version = process.env.TODDLER_VERSION ?? runs[0].version ?? '（未記錄）'
L.push(`# ${title}`, '')
L.push(`> 由 \`npm run test:toddler\` 產生（tests/toddler/report.mjs）。測的版本：**${version}**。打包版（vite preview），觸控平板 ${vps}，基準 seed ${base}。`)
L.push(`> 產生時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`, '')

L.push('## 總覽', '')
const bySev = SEV.map((s) => [s, bugs.filter((b) => b.first.severity === s).length])
L.push(`問題共 **${bugs.length}** 種（同一種問題出現在多個遊戲只算一種）：${bySev.filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join('、')}。`, '')

// 結果表
const gameRuns = runs.filter((r) => r.game).sort((a, b) => a.name.localeCompare(b.name) || a.viewport.localeCompare(b.viewport))
const screenRuns = runs.filter((r) => r.screen)
const mark = (r, b) => {
  const os = (r.outcomes ?? []).filter((o) => o.behavior.startsWith(b))
  if (!os.length) return '—'
  return os.every((o) => o.ok) ? '✅' : '❌'
}
if (gameRuns.length) {
  L.push('## 每個遊戲 × 每種行為', '')
  L.push('✅ 通過、❌ 有問題、— 這次沒有測到（例如沒玩到慶祝）。1280×800 跑的是精簡版（不發呆）。逐項說明在最後的「各遊戲細節」。', '')
  L.push(`| 遊戲 | 尺寸 | ${BEHAVIORS.join(' | ')} | 問題數 |`)
  L.push(`|---|---|${BEHAVIORS.map(() => ':-:').join('|')}|:-:|`)
  for (const r of gameRuns) L.push(`| ${r.game.title}（${r.game.id}） | ${r.viewport} | ${BEHAVIORS.map((b) => mark(r, b)).join(' | ')} | ${r.findings.length} |`)
  L.push('')
}
if (screenRuns.length) {
  L.push('## 每個畫面', '')
  L.push('| 畫面 | 尺寸 | 檢查 | 結果 | 說明 |', '|---|---|---|:-:|---|')
  for (const r of screenRuns) for (const o of r.outcomes ?? []) L.push(`| ${r.screen} | ${r.viewport} | ${esc(o.behavior)} | ${o.ok ? '✅' : '❌'} | ${esc(o.note)} |`)
  L.push('')
}

// 逐幀統計
if (gameRuns.length) {
  L.push('## 轉場逐幀數據', '')
  L.push('每一幀量整頁圖層（.scene）的縮放與透明度、九個點的覆蓋率。標準：縮放 0.97～1.0、覆蓋率 ≥ 0.85、同一段轉場透明度只往一個方向變。', '')
  L.push('| 遊戲 | 尺寸 | 整頁最小縮放 | 題目層縮放 | 最低覆蓋率 | 透明度反轉 | 語音重疊 |', '|---|---|:-:|:-:|:-:|:-:|:-:|')
  for (const r of gameRuns) {
    const s = r.stats ?? {}
    L.push(`| ${r.game.id} | ${r.viewport} | ${s.zoomMin ?? '—'} | ${s.cardZoomMin ?? '—'} | ${s.blankMin ?? '—'} | ${s.flips ?? 0} | ${s.overlaps ?? 0} |`)
  }
  L.push('')
}

// 幼兒設計準則（docs/幼兒設計準則.md 的「怎麼測」）
const ruleRows = runs.flatMap((r) => (r.rules ?? []).map((x) => ({ ...x, vp: r.viewport })))
if (ruleRows.length) {
  const guide = [path.join(root, 'docs/幼兒設計準則.md'), path.resolve(root, '../../../docs/幼兒設計準則.md')].find((p) => fs.existsSync(p))
  const titles = new Map()
  if (guide) for (const m of fs.readFileSync(guide, 'utf8').matchAll(/^### ([A-Z]+-\d+) (.+)$/gm)) titles.set(m[1], m[2].trim())
  const ids = [...new Set(ruleRows.map((x) => x.id))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  L.push('## 幼兒設計準則檢查', '')
  L.push('依 `docs/幼兒設計準則.md` 每條規則的「怎麼測」自動檢查。準則是新訂的目標，不符合的項目**不算在上面的問題數裡**，列在這裡給設計和驗收對照。沒列出的規則見最後的「還沒辦法自動化」。', '')
  L.push('| 規則 | 內容 | 符合 | 不符合 | 不符合的例子 |', '|---|---|:-:|:-:|---|')
  for (const id of ids) {
    const xs = ruleRows.filter((x) => x.id === id)
    const bad = xs.filter((x) => !x.ok)
    const ex = [...new Map(bad.map((x) => [x.note.replace(/[\d.]+/g, 'N'), x])).values()].slice(0, 3).map((x) => `${x.where}：${x.note}`)
    L.push(`| ${id} | ${esc(titles.get(id) ?? '')} | ${xs.length - bad.length} | ${bad.length} | ${esc(ex.join('<br>'))} |`)
  }
  L.push('')
}

L.push('## 最嚴重的 10 個', '')
bugs.slice(0, 10).forEach((b, i) => L.push(`${i + 1}. **[${b.first.severity}] ${b.first.title}** — ${new Set(b.hits).size} 處${whereOf(b.first.title)[2] ? `（${whereOf(b.first.title)[2]}）` : ''}`))
L.push('')

L.push('## 問題清單', '')
bugs.forEach((b, i) => {
  const f = b.first
  const [, where, tag] = whereOf(f.title)
  const hits = [...new Set(b.hits)]
  L.push(`### B${String(i + 1).padStart(2, '0')}　[${f.severity}] ${f.title}`, '')
  if (tag) L.push(`- **狀態**：${tag}，合併後重跑這份測試確認`)
  L.push(`- **出現在**：${hits.length > 8 ? hits.slice(0, 8).join('、') + ` 等 ${hits.length} 處` : hits.join('、')}（共 ${b.count} 次）`)
  L.push(`- **說明**：${esc(f.detail)}`)
  L.push(`- **推測程式位置**：${where}`)
  const sel = b.run.game?.id ?? ({ 首頁: 'home', 地圖與站點: 'map', 貼紙本: 'collection', 家長區: 'parent', 返回鍵: 'back', 今日冒險: 'adventure', 護眼休息: 'eyebreak', 睡覺畫面: 'bedtime' }[b.run.screen] ?? 'screens')
  L.push(`- **重現**：\`npm run test:toddler -- ${sel} --seed ${base}${f.viewport === 'tab1200' ? ' --quick' : ''}\`（這一段的 seed ${f.seed}，行為「${f.behavior}」，第 ${(f.at / 1000).toFixed(0)} 秒）`)
  if (f.shot) L.push(`- **截圖**：![${f.title}](${shotDirName}/${encodeURI(prefix + f.shot)})`)
  else L.push(`- **截圖**：（逐幀問題是事後從探針資料判斷的，截圖拍不到那一幀；數值見說明）`)
  L.push('', '<details><summary>發生前的動作紀錄</summary>', '', '```', ...f.actions.slice(-15), '```', '', '</details>', '')
})

if (gameRuns.length) {
  L.push('## 各遊戲細節', '')
  for (const r of gameRuns) {
    L.push(`### ${r.game.title}（${r.game.id}，${r.viewport}，seed ${r.seed}）`, '')
    for (const o of r.outcomes ?? []) L.push(`- ${o.ok ? '✅' : '❌'} ${o.behavior}：${esc(o.note)}`)
    L.push('')
  }
}

L.push(fs.readFileSync(path.join(root, 'tests/toddler/report-method.md'), 'utf8'))

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, L.join('\n'))
console.log(`報告寫到 ${out}（${bugs.length} 種問題）`)

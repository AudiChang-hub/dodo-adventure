#!/usr/bin/env node
// 把 test-results/toddler/findings/*.json 整理成一份報告（markdown）。
//   node tests/toddler/report.mjs [--out docs/三歲模擬測試報告.md]
// 截圖複製到報告旁邊的「三歲模擬測試截圖」資料夾。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findingRuns, pwResults, rerunDirs, testKey } from './lib/rerun.mjs'

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

const runs = findingRuns(res)
if (!runs.length) {
  console.log('沒有結果可以整理')
  process.exit(0)
}
// 自動重跑（run.mjs）：rerun-2、rerun-3 裡同一項的結果，依測試對起來
const reruns = rerunDirs(res).map((r) => ({ ...r, runs: new Map(findingRuns(r.dir).filter((x) => x.test).map((x) => [testKey(x.test), x])), pw: pwResults(r.dir) ?? [] }))
const timing = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(res, 'run.json'), 'utf8'))
  } catch {
    return null
  }
})()
const pw1 = pwResults(res) ?? []

const SEV = ['卡死', '無法返回', '誤記作答', '閃動縮放', '困惑', '小問題']
const BEHAVIORS = ['連點進場', '搶著操作', '亂玩', '亂玩中途返回', '返回後再進遊戲', '答錯很多次', '發呆', '切到背景再回來', '拖曳中按首頁', '教學中按首頁', '轉場中按首頁', '慶祝中按首頁', '返回鍵', '重新整理']

// 推測的程式位置（依標題比對）；T-4x 是其他工作階段正在改的
const WHERE = [
  [/整頁畫面縮放|透明度來回跳（scene|空白底色|疊在一起/, 'src/ui/motion.ts 的 page／RANGE（整頁 0.6↔1、背景 1↔1.06）、src/ui/Scenes.tsx', 'T-44～T-48 轉場（transition-nozoom）處理中'],
  [/題目層|card-bg|card-fg/, 'src/ui/motion.ts 的 foreground／background、src/ui/Scenes.tsx 的 CardStage', 'T-44～T-48 轉場（transition-nozoom）處理中'],
  [/連點/, 'src/ui/Scenes.tsx 的 ARM_MS（新畫面 0.x 秒後就收點擊）＋ 首頁的門和下一個畫面按鈕的位置重疊', ''],
  [/轉場中按住/, 'src/ui/Scenes.tsx：新畫面還沒 armed 時 pointer-events:none，按下去的那一下（pointerdown）被吃掉，src/ui/Hold.tsx 的 useHold 就不會開始計時', ''],
  [/按住.*沒有回去|回首頁/, 'src/ui/Hold.tsx、src/games/Shell.tsx 的 HoldButton', ''],
  [/短按/, 'src/ui/Hold.tsx（遊戲 1.2 秒、其他 0.6 秒）', ''],
  [/返回鍵/, 'src/lib/lock.ts installGuards（popstate 一律吃掉）', ''],
  [/歡迎語音/, 'src/App.tsx 換畫面時的 stopSpeech() effect（在子畫面 say 之後才跑）', ''],
  [/示範還沒結束就能畫|示範中/, '各課描字的示範流程（src/lessons/english/Trace.tsx、src/lessons/math/Write.tsx）', ''],
  [/墨跡/, 'src/games/draw/Ink.tsx、src/games/draw/adopt.ts', ''],
  [/重複|一直說話|沒有提示/, 'src/games/idle.ts 與各遊戲的 idle.start', ''],
  [/語音疊/, 'src/lib/audio.ts 的 say／halt', ''],
  [/音檔缺漏/, 'public/audio（npm run audio）', ''],
  [/touchmove/, 'src/lib/lock.ts 的 touchmove preventDefault（不可取消的事件）', ''],
  [/卡|沒有任何變化/, '依畫面而定（見動作紀錄）', ''],
]
const whereOf = (t) => WHERE.find(([re]) => re.test(t)) ?? [null, '（未分類）', '']

/**
 * 同一項測試、同一種問題在三次裡出現幾次：第一輪一定有（才會重跑），重跑的那幾輪看同一項的 findings 有沒有同一種。
 * 重跑那一輪沒有那一項的結果（當掉、沒跑到）就不算進分母。
 */
function repro(r, f) {
  const key = r.test ? testKey(r.test) : null
  const k = keyOf(f)
  const tries = [{ attempt: 1, hit: f, run: r }]
  for (const rr of reruns) {
    if (!key) continue
    const x = rr.runs.get(key)
    const ran = x || rr.pw.some((p) => testKey(p) === key && p.status !== 'skipped')
    if (ran) tries.push({ attempt: rr.attempt, hit: x?.findings.find((ff) => keyOf(ff) === k) ?? null, run: x ?? null, pw: rr.pw.find((p) => testKey(p) === key) })
  }
  return { n: tries.filter((t) => t.hit).length, of: tries.length, tries }
}
const reproLabel = (t) => (t.of < 2 ? '沒有重跑' : `${t.n}/${t.of} ${t.n === t.of ? '重現' : '偶發'}`)

// 同一種問題：把數字、引號裡的遊戲名拿掉
const keyOf = (f) => `${f.severity}|${f.title.replace(/[\d.]+/g, 'N').replace(/「[^」]*」/g, '「…」').replace(/（[^）]*）$/, '')}`
const groups = new Map()
for (const r of runs)
  for (const f of r.findings) {
    const k = keyOf(f)
    let g = groups.get(k)
    if (!g) groups.set(k, (g = { key: k, first: f, run: r, hits: [], count: 0, tries: [] }))
    const n = Number(/共 (\d+) 次/.exec(f.detail)?.[1] ?? 1)
    g.count += n
    g.hits.push(`${f.where}（${f.viewport}）`)
    // 同一項測試裡同一種問題（例如畫布內、畫布外各一筆）只留最常重現的那一筆
    const t = { where: `${f.where}（${f.viewport}）`, ...repro(r, f) }
    const same = g.tries.findIndex((x) => x.where === t.where)
    if (same < 0) g.tries.push(t)
    else if (t.n / t.of > g.tries[same].n / g.tries[same].of) g.tries[same] = t
  }
// 每一組：最常重現的那一處決定標示（3/3 重現、2/3 偶發、1/3 偶發；沒重跑的寫「沒有重跑」）
for (const g of groups.values()) {
  const best = g.tries.reduce((a, b) => (b.n / b.of > a.n / a.of || (b.n / b.of === a.n / a.of && b.of > a.of) ? b : a))
  g.best = best
  g.cls = best.of < 2 ? 'norerun' : best.n === best.of ? 'repro' : 'flaky'
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
// 偶發自動判別（run.mjs 用同一個 seed 再跑 2 次）：偶發不算通過，跟每次都會發生的分開列
const cls = (c) => bugs.filter((b) => b.cls === c)
const rerunOnly = rerunOnlyGroups()
const crashed = crashedTests()
if (reruns.length) {
  L.push('| 分類 | 種數 | 說明 |', '|---|:-:|---|')
  L.push(`| 每次都重現 | **${cls('repro').length}** | 同一個 seed 跑 ${1 + reruns.length} 次，每次都出現：照問題清單修 |`)
  L.push(`| 偶發 | **${cls('flaky').length}** | 有時出現、有時不會（${cls('flaky').map((b) => `B${String(bugs.indexOf(b) + 1).padStart(2, '0')} ${reproLabel(b.best)}`).join('、') || '—'}）：**不算通過**，看每次的動作紀錄找差在哪 |`)
  if (cls('norerun').length) L.push(`| 沒有重跑 | ${cls('norerun').length} | 重跑時那一項沒有結果（當掉、沒跑到） |`)
  L.push(`| 重跑時才出現 | ${rerunOnly.length} | 第一輪沒有、重跑那幾次才出現的（列在問題清單後面） |`)
  L.push(`| 測試本身失敗 | ${crashed.length} | 沒寫出問題紀錄就失敗（逾時、斷言、當掉） |`, '')
} else {
  L.push(`沒有自動重跑（${timing?.args?.includes('--no-rerun') ? '--no-rerun' : '第一輪沒有問題，或是舊版的結果'}）：問題都只跑了一次，分不出是每次都會發生還是偶發。${crashed.length ? `另有 ${crashed.length} 項測試本身失敗（見最後）。` : ''}`, '')
}
if (timing) {
  const ph = Object.entries(timing.phases ?? {}).map(([k, v]) => `${{ build: '打包', queue: '排隊', attempt1: '第一輪', attempt2: '重跑 1', attempt3: '重跑 2' }[k] ?? k} ${(v / 60).toFixed(1)} 分`)
  L.push(`花的時間：共 **${(timing.total / 60).toFixed(1)} 分鐘**（${ph.join('、')}）；${timing.workers} 個瀏覽器同時跑（${timing.workersWhy}）。`, '')
}
if (timing?.affected && !timing.affected.full) {
  L.push(`只跑受影響的部分（\`--changed ${timing.affected.base}\`）：${timing.affected.tokens.join(' ')}`, '')
  L.push('<details><summary>對照表</summary>', '')
  L.push('| 改到的檔 | 規則 | 要跑 |', '|---|---|---|', ...timing.affected.rows.map((r) => `| ${esc(r.file)} | ${esc(r.rule)} | ${esc(r.effect)} |`), '', '</details>', '')
}

// 結果表
const gameRuns = runs.filter((r) => r.game).sort((a, b) => a.name.localeCompare(b.name) || a.viewport.localeCompare(b.viewport))
const screenRuns = runs.filter((r) => r.screen)
const mark = (r, b) => {
  // 「亂玩」不算「亂玩中途返回」：比較長的行為名稱優先
  const os = (r.outcomes ?? []).filter((o) => o.behavior.startsWith(b) && !BEHAVIORS.some((x) => x !== b && x.startsWith(b) && o.behavior.startsWith(x)))
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
  const bySpec = { 'story.spec.ts': 'story' }[b.run.test?.file]
  const sel = b.run.game?.id ?? bySpec ?? ({ 家長區: 'parent', 護眼休息: 'eyebreak', 睡覺畫面: 'bedtime' }[b.run.screen] ?? 'screens')
  L.push(`- **重現**：\`npm run test:toddler -- ${sel} --seed ${base}${f.viewport === 'tab1200' ? ' --quick' : ''}\`（這一段的 seed ${f.seed}，行為「${f.behavior}」，第 ${(f.at / 1000).toFixed(0)} 秒）`)
  if (f.shot) L.push(`- **截圖**：![${f.title}](${shotDirName}/${encodeURI(prefix + f.shot)})`)
  else L.push(`- **截圖**：（逐幀問題是事後從探針資料判斷的，截圖拍不到那一幀；數值見說明）`)
  if (b.best.of > 1) {
    L.push(`- **每次都會發生嗎**：**${reproLabel(b.best)}**（同一個 seed 跑 ${b.best.of} 次，${b.best.n} 次出現${b.best.n < b.best.of ? '；偶發也不算通過' : ''}）`)
    if (b.tries.length > 1) L.push(`- **各處**：${b.tries.map((t) => `${t.where} ${reproLabel(t)}`).join('、')}`)
  } else if (reruns.length) L.push('- **每次都會發生嗎**：沒有重跑（重跑時這一項沒有結果）')
  // 每一次的動作紀錄：出現的那幾次是問題發生前的 15 個動作；沒出現的那幾次附那一段最後的動作，對照差在哪
  for (const t of b.best.tries) {
    const lines = t.hit ? t.hit.actions.slice(-15) : (t.run?.log ?? []).filter((l) => l.includes(`/${f.behavior}:`)).slice(-15)
    const head = t.attempt === 1 ? '第 1 次（第一輪）' : `第 ${t.attempt} 次（自動重跑）`
    const what = t.hit ? '出現，發生前的動作紀錄' : t.run ? `沒有出現，同一段（${f.behavior}）最後的動作` : `沒有結果（${t.pw?.status ?? '沒跑到'}）`
    L.push('', `<details><summary>${head}：${what}</summary>`, '', '```', ...(lines.length ? lines : ['（沒有動作紀錄）']), '```', '', '</details>')
  }
  L.push('')
})

// 第一輪沒有、重跑時才出現的：也要看（可能是同一個偶發換個樣子出現）
function rerunOnlyGroups() {
  const out = new Map()
  for (const rr of reruns)
    for (const [key, x] of rr.runs) {
      const first = runs.find((r) => r.test && testKey(r.test) === key)
      const had = new Set((first?.findings ?? []).map(keyOf))
      for (const f of x.findings) {
        if (had.has(keyOf(f))) continue
        const k = `${key}|${keyOf(f)}`
        const g = out.get(k) ?? { key, f, attempts: [] }
        g.attempts.push({ attempt: rr.attempt, f })
        out.set(k, g)
      }
    }
  return [...out.values()]
}
if (rerunOnly.length) {
  L.push('## 重跑時才出現的問題', '')
  L.push('第一輪沒有、自動重跑時才出現。偶發的一種，**不算通過**。', '')
  for (const g of rerunOnly) {
    const ran = 1 + reruns.filter((rr) => rr.runs.has(g.key)).length
    L.push(`- **[${g.f.severity}] ${g.f.title}** — ${g.f.where}（${g.f.viewport}），${g.attempts.length}/${ran} 偶發（出現在第 ${g.attempts.map((a) => a.attempt).join('、')} 次）：${esc(g.f.detail).slice(0, 200)}`)
    for (const a of g.attempts) L.push('', `<details><summary>第 ${a.attempt} 次的動作紀錄</summary>`, '', '```', ...a.f.actions.slice(-15), '```', '', '</details>')
    L.push('')
  }
}

// Playwright 判失敗、卻沒有寫出任何問題紀錄（逾時、斷言、當掉）：以前的報告看不到
function crashedTests() {
  const withFindings = new Set(runs.filter((r) => r.test && r.findings.length).map((r) => testKey(r.test)))
  return pw1
    .filter((r) => r.status === 'unexpected' && !withFindings.has(testKey(r)))
    .map((r) => ({ ...r, later: reruns.map((rr) => ({ attempt: rr.attempt, st: rr.pw.find((p) => testKey(p) === testKey(r)) })).filter((x) => x.st) }))
}
if (crashed.length) {
  L.push('## 測試本身失敗', '')
  L.push('Playwright 判失敗、但沒有寫出問題紀錄的項目（逾時、斷言失敗、瀏覽器當掉）。', '')
  for (const t of crashed) {
    const n = 1 + t.later.filter((x) => x.st.status === 'unexpected').length
    const of = 1 + t.later.length
    L.push(`- **${t.title}**（${t.project}，${t.file}:${t.line}）：${t.result}${of > 1 ? `，${n}/${of} ${n === of ? '重現' : '偶發'}` : ''}`)
    L.push('', '  ```', ...t.error.split('\n').slice(0, 8).map((l) => '  ' + l), '  ```', '')
  }
}

// 導覽覆蓋（T-72）：亂點一律避開返回、首頁、家長入口；返回改成固定會發生的步驟
{
  const navRows = runs.flatMap((r) => (r.outcomes ?? []).filter((o) => /返回|首頁|回家|回地圖|history|家長/.test(o.behavior)).map((o) => ({ r, o })))
  const g = runs.reduce((a, r) => ({ zone: a.zone + (r.guarded?.zone ?? 0), live: a.live + (r.guarded?.live ?? 0) }), { zone: 0, live: 0 })
  if (runs.some((r) => r.guarded)) {
    L.push('## 導覽覆蓋', '')
    L.push(`亂點、連點、拖、手掌一律避開左上角返回鍵、右上角家長角落和「回首頁」大按鈕：這一輪移開了 ${g.zone + g.live} 次（固定區域 ${g.zone}、按下前看到導覽 ${g.live}）。想返回、回家改成固定會發生的步驟，結果如下（✅／❌ 是那一步有沒有回到該回的地方）：`, '')
    const by = new Map()
    for (const { r, o } of navRows) {
      const k = o.behavior.replace(/（[^）]*）$/, '').replace(/\d+ms/, 'Nms')
      const e = by.get(k) ?? { ok: 0, bad: 0, where: new Set() }
      o.ok ? e.ok++ : e.bad++
      if (!o.ok) e.where.add(`${r.game?.id ?? r.screen ?? r.name}（${r.viewport}）`)
      by.set(k, e)
    }
    L.push('| 步驟 | ✅ | ❌ | ❌ 在哪 |', '|---|:-:|:-:|---|')
    for (const [k, e] of [...by.entries()].sort((a, b) => b[1].ok + b[1].bad - a[1].ok - a[1].bad)) L.push(`| ${esc(k)} | ${e.ok} | ${e.bad} | ${esc([...e.where].slice(0, 6).join('、'))} |`)
    L.push('')
  }
}

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

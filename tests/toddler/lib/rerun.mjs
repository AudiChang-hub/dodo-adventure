// 偶發自動判別（T-72）：第一輪有問題的項目，run.mjs 用同一個 seed 再跑 2 次；report.mjs 把三次對起來標「3/3 重現」或「1/3 偶發」。
import fs from 'node:fs'
import path from 'node:path'

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return null
  }
}

/** 一項測試的鍵：尺寸｜檔名｜標題 */
export const testKey = (t) => `${t.project}|${path.basename(t.file)}|${t.title}`

/** Playwright json 報告裡每一項的結果：{ project, file, line, title, status, error } */
export function pwResults(dir) {
  const j = readJson(path.join(dir, 'results.json'))
  if (!j) return null
  const out = []
  const walk = (s) => {
    for (const sp of s.specs ?? [])
      for (const t of sp.tests ?? []) {
        const last = t.results?.[t.results.length - 1]
        const err = last?.errors?.map((e) => e.message ?? '').join('\n') || last?.error?.message || ''
        out.push({ project: t.projectName, file: path.basename(sp.file), line: sp.line, title: sp.title, status: t.status, result: last?.status, error: err.replace(/\u001b\[[0-9;]*m/g, '') })
      }
    for (const c of s.suites ?? []) walk(c)
  }
  for (const s of j.suites ?? []) walk(s)
  return out
}

/** findings/*.json（每一項一個檔，含 test、attempt） */
export function findingRuns(dir) {
  const d = path.join(dir, 'findings')
  if (!fs.existsSync(d)) return []
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(d, f)))
    .filter(Boolean)
}

/** 第一輪有問題的項目：Playwright 判失敗（含逾時、當掉），或寫出的 findings 不是空的 */
export function problemTests(dir) {
  const m = new Map()
  for (const r of pwResults(dir) ?? []) if (r.status === 'unexpected' || r.status === 'flaky') m.set(testKey(r), { project: r.project, file: r.file, line: r.line, title: r.title })
  for (const r of findingRuns(dir)) if (r.test && r.findings?.length) m.set(testKey(r.test), r.test)
  return [...m.values()]
}

/** 重跑的那幾輪（rerun-2、rerun-3…）的資料夾 */
export const rerunDirs = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => /^rerun-\d+$/.test(f))
        .sort()
        .map((f) => ({ attempt: Number(f.slice(6)), dir: path.join(dir, f) }))
    : []

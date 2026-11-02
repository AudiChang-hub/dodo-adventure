// 用 run.json 重新產生 報告.md（改了報告格式之後用；不重跑、不重新分析）：
//   npx tsx tests/ai-toddler/rebuild.ts <報告資料夾>
import fs from 'node:fs'
import path from 'node:path'
import { writeReport, type Run } from './lib/report'
import type { Brain } from './lib/brain'

const dir = path.resolve(process.argv[2] ?? '.')
const R = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8')) as Run
R.out = dir
R.analysis ??= null
await writeReport(R, null as unknown as Brain, '')
console.log(path.join(dir, '報告.md'))

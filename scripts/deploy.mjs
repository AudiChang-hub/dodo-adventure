// 把 dist/ 推到 gh-pages 分支（GitHub Pages 的來源）
// 在系統暫存資料夾裡建 git，不在 dist/ 留下 .git，否則下次 vite build 會清不掉 dist 而中斷
import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })
const origin = execSync('git remote get-url origin').toString().trim()
const out = mkdtempSync(join(tmpdir(), 'dodo-deploy-'))
cpSync('dist', out, { recursive: true })
writeFileSync(join(out, '.nojekyll'), '')
sh('git init -q -b gh-pages', out)
sh('git add -A', out)
sh(`git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "Deploy ${new Date().toISOString()}"`, out)
sh(`git push -f -q ${origin} gh-pages`, out)
console.log('deployed to gh-pages')

// 把 dist/ 推到 gh-pages 分支（GitHub Pages 的來源）
// git 資料夾放在系統暫存區、用 --work-tree 指向 dist/，dist/ 裡不會留下 .git，
// 否則下次 vite build 會清不掉 dist 而中斷
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const origin = execSync('git remote get-url origin').toString().trim()
const repo = mkdtempSync(join(tmpdir(), 'dodo-deploy-'))
const git = (args) => execSync(`git --git-dir="${join(repo, '.git')}" --work-tree=dist ${args}`, { stdio: 'inherit' })

writeFileSync('dist/.nojekyll', '')
execSync(`git init -q -b gh-pages "${repo}"`)
git('add -A')
git(`-c user.name="deploy" -c user.email="deploy@local" commit -q -m "Deploy ${new Date().toISOString()}"`)
git(`push -f -q ${origin} gh-pages`)
console.log('deployed to gh-pages')

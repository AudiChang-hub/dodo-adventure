// 把 dist/ 推到 gh-pages 分支（GitHub Pages 的來源）
import { execSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })
const origin = execSync('git remote get-url origin').toString().trim()
writeFileSync('dist/.nojekyll', '')
sh('git init -q -b gh-pages', 'dist')
sh('git add -A', 'dist')
sh(`git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "Deploy ${new Date().toISOString()}"`, 'dist')
sh(`git push -f -q ${origin} gh-pages`, 'dist')
// 留著 dist/.git 會讓下次 vite build 清不掉 dist 而中斷
rmSync('dist/.git', { recursive: true, force: true })
console.log('deployed to gh-pages')

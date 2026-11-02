// 讓本機的 claude（Claude Code）登入一次，AI 小男生測試的 cli 大腦才叫得動：npm run ai-toddler:login
// 用訂閱帳號登入（瀏覽器會打開），不需要 API key；登入資訊存在使用者自己的 ~/.claude，不進 repo。
import { spawnSync } from 'node:child_process'
import { cliLoggedIn, findClaude } from './lib/brain'

const bin = findClaude()
if (!bin) {
  console.log('找不到 claude。裝了 Claude 桌面版的話，設環境變數 CLAUDE_BIN 指到 claude.exe 再跑一次。')
  process.exit(1)
}
const st = cliLoggedIn(bin)
if (st.ok) {
  console.log(`已經登入了（${st.detail}）：${bin}`)
  process.exit(0)
}
console.log(`用 ${bin} 登入…`)
const r = spawnSync(bin, ['auth', 'login'], { stdio: 'inherit' })
console.log(cliLoggedIn(bin).ok ? '✓ 登入好了' : '✗ 還是沒有登入')
process.exit(r.status ?? 1)

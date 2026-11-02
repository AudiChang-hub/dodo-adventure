# AI 小男生測試（`npm run test:ai-toddler`）

由 Claude 扮演一個 **3 歲 3 個月的台灣小男生**（角色設定：[persona.md](persona.md)，每一條都附出處），
看平板截圖、聽 App 念的話，自己決定下一步：點哪裡、拖曳、等一下、按返回、不玩了，順便說一句「心裡想什麼」。
手指照三歲孩子的誤差偏開、偶爾連點、拖到一半放手（[lib/finger.ts](lib/finger.ts)）。

| | `npm run test:toddler` | `npm run test:ai-toddler`（這個） |
|---|---|---|
| 是什麼 | 固定腳本的回歸測試：亂點、搶按、返回、發呆、多指 | 探索測試：一個「孩子」自己看畫面玩 |
| 回答的問題 | App 會不會壞（卡死、無法返回、誤記、閃動） | 孩子**看得懂嗎**、在哪裡卡住、多久開始不耐煩、玩得完嗎 |
| 每次結果 | 同一個 seed 每次一樣 | 大腦的回答每次不一樣（seed 只固定手指誤差和 App 題目） |
| 時間 | 完整版約 50 分鐘；`--changed` 只跑受影響的 | 一課約 8～10 分鐘，一次只跑一課 |
| 額度 | 不用 | 用 Claude（見〈要花多少〉） |

兩個都要：test:toddler 抓壞掉的，AI 小男生抓「沒壞但孩子不會玩」的。

## 怎麼跑

```bash
npm run test:ai-toddler -- --lesson zh --minutes 8 --seed 1
```

- `--lesson`：`en` 英文字母、`zh` 中文課文、`math` 數學數字、`draw` 畫畫、`story` 故事（必填，一次一課）。
- `--minutes`（預設 8，含大腦想的時間）、`--max-steps`（預設 60）、`--seed`（預設 1）。
- `--brain`：`auto`（預設）、`cli`、`api`、`relay`、`mock`，見下面。`--model` 預設 `claude-sonnet-5-5`。
- `--dev` 用 dev server；預設用打包版（`dist/` 不在才打包，`--build` 強制重新打包）。
- `--headed` 開看得到的瀏覽器（會出聲）。預設不開視窗；聲音照常播放，探針記下每一句的字幕交給小男生。
- `--out DIR`：報告放別的地方。`--no-lock`：不排隊。
- 環境變數 `AI_TODDLER_PORT`（預設 4537）。

worktree 裡跑要先有 `node_modules`、`public/audio`、`.env.local`（都不進 git）：從主 repo 複製，或用 junction 連過去（PowerShell：`New-Item -ItemType Junction -Path node_modules -Target <主 repo>\node_modules`）。

開 App 的方式：首頁 → 爸爸媽媽幫他點開那一課（不算小男生的動作）→ 小男生自己玩。故事會先放 8 本講過的書（跟 test:toddler 的故事測試一樣），不然新裝置的書架是空的。

### 什麼時候停

到時間、到步數、小男生說「不玩了」、上完一堂（出現挑貼紙）之後再 3 步、或大腦連續 3 次沒回應。畫畫不會「上完」，畫了 3 筆以上算完成，繼續玩到時間或不玩了。

### 資源

- 一次只開一個瀏覽器；程式自己降成低優先權（之後開的 vite、瀏覽器也是）。
- 跟 `test:toddler` 共用同一把鎖（`%TEMP%\dodo-toddler`）：兩種測試不會同時跑，後來的排隊。
- 中文課文語音批次（`scripts/zh_batch_guard.py`）在跑時可以跑這個（只有一個瀏覽器），但不要同時跑完整版 test:toddler。

## 大腦：怎麼叫 Claude

不需要 API key，也不會把任何金鑰寫進 repo。

| `--brain` | 怎麼叫 | 什麼時候用 |
|---|---|---|
| `auto`（預設） | 環境變數本來就有 `ANTHROPIC_API_KEY` → `api`，否則 → `cli` | 平常 |
| `cli` | 本機已登入的 Claude Code 無頭模式：`claude -p --model claude-sonnet-5-5 --system-prompt-file … --tools Read`，用 Read 讀截圖、只回 JSON。每一步開一個新的 claude（不留紀錄，`--no-session-persistence`） | 平常（訂閱帳號的額度） |
| `api` | 直接打 Messages API（圖片放在訊息裡，一次來回，比 cli 快）；打失敗會自動退回 `cli` | 環境裡剛好有金鑰時 |
| `relay` | 交接模式：不呼叫任何東西，把題目寫成檔案，等一個 Claude Code 工作階段回答 | 本機 claude 沒登入時；PM 的工作階段自己驗收時 |
| `mock` | 不叫 Claude，亂點亂等 | 只測執行器本身 |

**claude 找不到或沒登入**：桌面版的 Claude Code 登入不會給子程序用（`claude auth status` 會是 `loggedIn: false`）。家長在終端機跑一次就好（瀏覽器會打開，用訂閱帳號登入，不需要 API key）：

```bash
npm run ai-toddler:login
```

claude 的位置：`CLAUDE_BIN` → PATH 上的 `claude` → 桌面版帶的 `claude.exe`（`%LOCALAPPDATA%\Claude-Data\…\claude-code\<版本>\…\claude.exe`，取最新的）。

### 交接模式（`--brain relay`）

1. 開測試（背景跑）：`npm run test:ai-toddler -- --lesson zh --brain relay`
2. 讓一個 Claude Code 工作階段（建議 Sonnet 的子代理）扮演小男生，給它這段話：

   > 你要扮演一個 3 歲 3 個月的台灣小男生在玩平板，角色設定在 `tests/ai-toddler/persona.md`，先讀一次。
   > 跑 `node tests/ai-toddler/relay.mjs next latest` 拿第一題。每一題：用 Read 看截圖、照角色設定想好、
   > 用 `node tests/ai-toddler/relay.mjs answer latest <題號> <<'EOF' … EOF` 交一個 JSON，它會接著印出下一題。
   > 印出 `WAIT` 就再跑一次 `next latest`；印出 `DONE` 就結束。最後一題（題號 analysis）是用大人的眼光寫分析，照題目給的格式回答。
   > 不要因為自己是 AI 就表現得比三歲孩子聰明：看不懂就猜、無聊就亂點或按返回。

   每一題等 240 秒（`AI_TODDLER_RELAY_TIMEOUT` 可改），沒人回答就算大腦沒回應。

## 報告

每跑一次寫到**主 repo** 的 `docs/AI小男生測試/<日期>-<課>/`（同一天第二次加 `-2`），不是 worktree 裡（worktree 被清掉會跟著不見）：

- `報告.md`
  - 摘要表：有沒有完成這一課、玩了多久、開始不耐煩的時間點、按了幾次返回、幾步不知道要做什麼、示範中搶著點了幾下、心情曲線、花費。
  - 給開發的修正建議，依嚴重程度排好（嚴重／重要／小），每一條連到哪幾步。最後由大腦用「分析師」的眼光寫（[analyst.md](analyst.md)）。
  - App 本身的錯誤（程式自動抓的，不靠大腦）：卡住、無法返回（按返回鍵或 Android 返回後 3 秒還在原畫面）、誤記作答（按下去那一刻 App 在示範，1.5 秒內卻多了一筆作答紀錄）、閃動（探針的透明度來回、半個畫面空白）、主控台錯誤、點了按鈕完全沒反應（不在示範時）。
  - 看得懂的地方、看不懂或卡住的地方（附截圖）。
  - 時間軸：每一步的縮圖、聽到的話、看到什麼、心裡想什麼、心情、想點哪裡和實際點到哪裡、結果。
- `截圖/`（原尺寸）、`縮圖/`、`brain/`（給大腦看的、四邊加了座標尺的截圖和系統提示）、`run.json`（全部資料）、`relay/`（交接模式的題目和答案）。

**看報告要記得**：大腦每一步要想幾秒到十幾秒（報告最後一行有每一步的時間），這段時間 App 照常在跑。「示範已經結束才點」「錯過了」這類跟時間有關的現象可能是測試造成的；要確認「示範時搶按」請看 test:toddler。

## 加進驗收流程（PM）

**每一批**（合併前、跑完 `npm run test:toddler -- --changed` 之後）：

1. 這一批改到哪幾課（看改了 `src/lessons/<課>`、`src/content/lines-*`、首頁、`src/games/draw`、`src/screens/StoryBook.tsx`…），只跑那幾課，一課一次：
   ```bash
   npm run test:ai-toddler -- --lesson zh --seed 1
   ```
   一課約 8～10 分鐘（含打包第一次約 2 分鐘）。一次只跑一課，跑完再跑下一課。
2. 看 `報告.md` 的「App 本身的錯誤」：有「卡住」「無法返回」「誤記作答」就不能合併（跟 test:toddler 的嚴重問題一樣處理；先用同一個 seed 重跑一次判斷是不是偶發）。
3. 看「給開發的修正建議」的〈嚴重〉：是內容或流程問題的，開工作階段修；是測試延遲造成的（報告會標），記下來就好。〈重要〉〈小〉累積起來，排進下一批。
4. 跟上一次同一課的報告比：完成了嗎、開始不耐煩的時間點、返回次數有沒有變差。

**每週一次、或改了共用的東西**（首頁、返回鍵、字幕、語音、示範的手）：五課都跑一次，約 50 分鐘。

### 要花多少

一步大約：系統提示（角色設定）約 4 千 token、截圖約 1.4 千 token、題目 0.5 千 token，回答 0.2 千 token。
`cli` 每一步是兩次來回（先 Read 截圖、再回答），所以一步約 1.2 萬 token 輸入（大部分是快取讀取）、0.4 千 token 輸出；
一課 8 分鐘約 25～40 步，再加最後的分析一次（約 1 萬 token），合計**一課約 30～50 萬 token 輸入、1.5 萬 token 輸出**。
`cli` 用的是訂閱帳號的使用額度（會算進每 5 小時的上限），五課一輪大約是一個人密集用 Claude Code 半小時的量；`api` 照 Sonnet 的價格算，報告的摘要表會寫實際花了多少（cli 回報的等值金額）。

## 檔案

| 檔案 | 做什麼 |
|---|---|
| [persona.md](persona.md) | 小男生的角色設定（＝系統提示）和出處 |
| [analyst.md](analyst.md) | 跑完後的分析師提示（大人的眼光，寫修正建議） |
| [run.ts](run.ts) | 主程式：開 App、每一步截圖→問大腦→送觸控→檢查 App |
| [lib/brain.ts](lib/brain.ts) | 大腦：api／cli／relay／mock |
| [lib/finger.ts](lib/finger.ts) | 三歲的手指：誤差、連點、拖到一半放手 |
| [lib/lessons.ts](lib/lessons.ts) | 五課的門、怎麼算完成、故事書的書 |
| [lib/report.ts](lib/report.ts) | 縮圖、分析、`報告.md` |
| [relay.mjs](relay.mjs) | 交接模式的另一頭 |
| [login.ts](login.ts) | `npm run ai-toddler:login` |

探針（語音、字幕、閃動、示範狀態、錯誤）和開 App 的方法沿用 `tests/toddler/probe.js`、`tests/toddler/lib/app.ts`。

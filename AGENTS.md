# AGENTS.md：開發規則

產品介紹和安裝步驟在 [README.md](README.md)。這份只放開發規則；規則有變動就改這份，README 不重複寫。

## 範圍（2026-10-31 起）

- 只做 3 歲適用的內容。依據放在主 repo 的 `docs/全球幼教指引-3到4歲.md` 和 `docs/幼兒設計準則.md`。要等孩子滿 4 歲，或家長確認他已經熟練，才做下一階段。
- 孩子端只有首頁的三堂課，加上故事、畫畫和貼紙本：
  - 三堂課：英文字母（豆豆）、中文課文（莫莫）、數學數字（波波），程式在 `src/lessons/`，介面約定見 [src/lessons/README.md](src/lessons/README.md)。
  - 故事：`src/screens/StoryBook.tsx`。
  - 畫畫：自由畫畫 `d-free`、著色本 `d-color`（家長 2026-11-11 明確要求），程式在 `src/games/draw/`。畫畫的門進去先選白紙還是著色本（`DrawPick.tsx`）。
  - 貼紙本：只看不改，程式在 `src/screens/StickerBook.tsx`（家長 2026-11-11 明確要求恢復：要能回頭看自己有哪些貼紙）。
- 已經停做的功能不要恢復：地圖、冒險、魔法屋、程式車庫、爸爸回合、成長系統、第 3 階段遊戲，以及中文課文和數學的中文語音。家長沒有明確要求，就不要提議做回來。
- 語音：
  - 全部用英文（edge-tts，`en-US-AnaNeural`）。
  - 中文只出現在英文單字三明治（Apple → 蘋果 → Apple）。
  - 中文課文和數學都不念中文。中文課文是親子共讀，由大人念。
  - 不要提議用合成語音或平板內建 TTS 念中文。
- 設計和驗收以 TCL NXTPAPER 11 Plus 橫向（約 1200×786）為準。手機直式只要求不跑版。

## 個人資料

- 孩子的稱呼和 Firebase 設定放在 `.env.local`，不進 git。範本是 `.env.example`。
- `docs/`、`public/audio/`、`dist/`、`test-results/` 都在 `.gitignore` 裡。
  - 報告和截圖寫到主 repo 的 `docs/`。
  - worktree 裡的 `docs/` 不會被 commit，worktree 刪掉時會跟著消失。
- 程式碼、commit 訊息、測試資料都不能出現孩子的真名、學校、生日。

## 分工

- **PM 工作階段**：派工、合併、部署。開發工作階段不合併到 main，也不部署。
- **開發工作階段**：
  - 在自己的分支或 worktree 改，只改分到的檔案，commit 但不 push。
  - 只跑自己改到的部分：`npm run verify`，加上 `npm run test:toddler -- --changed`。
  - 不用 `preview_start`、`AskUserQuestion`。有疑問寫在回報裡。
- **AI 小男生測試員**：獨立的盲測工作階段，見 [tests/ai-toddler/README.md](tests/ai-toddler/README.md)。
  - 只測 PM 合併後的版本。不看 diff、`src/`，也不看開發報告。
  - 只回報，不改 `src/`。
  - 報告放主 repo 的 `docs/AI小男生測試/`。

## 指令

| 用途 | 指令 |
|---|---|
| 改了台詞（`src/content/lines.ts`）之後產生語音 | `npm run audio`（只產有變動的） |
| 合併前的檢查（型別、單元、排版、故事、音檔） | `npm run verify` |
| 三歲測試，只跑受影響的 | `npm run test:toddler -- --changed` |
| 三歲測試，完整版 | `npm run test:toddler` |
| AI 小男生盲測 | `npm run test:ai-toddler -- --lesson en\|zh\|math\|draw\|story` |
| 打包 | `npm run build` |
| 部署到 GitHub Pages | `node scripts/deploy.mjs` |

**PM 的上線流程**：同一批合併完，依序跑 `npm run audio` → `npm run verify` → `npm run test:toddler -- --changed main`（每批至少跑一次完整版）→ `npm run build` → `node scripts/deploy.mjs`。上線後交給 AI 小男生測試員盲測。

## 測試規則

- 三歲測試要涵蓋三歲孩子的操作：亂點、連點、多指、搶在示範時操作、隨時返回、發呆、拖到一半放手。每個畫面都要 1 步就能回到上一層。
- 只出現一次的問題，先用同一個 seed 重跑（`--seed N`，預設會自動重跑 2 次），確認是穩定重現還是偶發。
- 執行測試：
  - 不用 `nice`，worker 數交給 `test:toddler` 自動決定，例如 `npm run test:toddler -- --changed main`。只有大量生成語音時才要降低優先權、限制執行緒數。
  - 三歲測試和 AI 小男生測試共用排隊鎖（`%TEMP%\dodo-toddler`），不要加 `--no-lock`。
  - 停測試只停自己啟動時記下的 PID（`taskkill /PID <pid> /T /F`），不要用指令字串比對。

## 已知地雷

- worktree 沒有 `node_modules`、`public/audio`、`.env.local`。要從主 repo 複製或用 junction 連過去。用 junction 的話，刪 worktree 前要先拆掉連結，見 [tests/ai-toddler/README.md](tests/ai-toddler/README.md)。
- 這個中文路徑下，`dist/` 已經存在時，`npm run build` 可能沒有任何訊息就中斷（Node 的 `fs.rmSync` 崩潰）。打包前先用 bash 跑 `rm -rf dist`。`npm run test:toddler` 已經會自己清。

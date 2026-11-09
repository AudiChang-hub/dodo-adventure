# 豆豆冒險

給 3 歲孩子用的學前學習 PWA，在 TCL NXTPAPER 11 Plus（紙感螢幕、觸控筆）上橫向使用。

首頁有三堂課，照學校的教法上，一堂約 5 分鐘：

| 課 | 帶課的恐龍 | 內容 |
|---|---|---|
| 英文字母 | 豆豆 | 認字母 → 描字 → 單字範例 → 選擇 |
| 中文課文 | 莫莫 | 親子共讀：大人念短課文（App 不出聲），重點字詞標紅，聊一聊，選圖 |
| 數學數字 | 波波 | 數數、比多少、寫數字 |

首頁旁邊還有「故事」和「畫畫」（自由畫畫，用手指或觸控筆）。語音都是英文，中文只出現在英文單字三明治（Apple → 蘋果 → Apple）。

家長區：在畫面右上角按住 3 秒，再答一題兩位數加法就能進入。家長區可以看進度和作答紀錄、作品，也可以調整每日時間、護眼休息等設定。手機打開網址時加上 `#parent`，就會直接進家長區。

開發規則（範圍、分工、驗收、部署流程）寫在 [AGENTS.md](AGENTS.md)。

## 安裝

```bash
npm install
cp .env.example .env.local                 # 填入孩子的稱呼（不進 git）
pip install -r scripts/requirements.txt    # 語音產生用：edge-tts、praat-parselmouth、imageio-ffmpeg、numpy
npm run audio                              # 產生語音，要連網；只產有變動的句子
npm run dev
```

- `npm run emoji`：內容新增圖示後，重新產生 `src/art/emoji.generated.ts`。
- `npm run icons`：由 `public/icon.svg` 產生 PWA 圖示。

## 部署（GitHub Pages）

```bash
npm run build
node scripts/deploy.mjs
```

`scripts/deploy.mjs` 會把 `dist/` 推到 `gh-pages` 分支。語音和孩子的稱呼是在本機打包時才放進去的，所以原始碼裡沒有個人資料。

## 雲端同步（Firebase，免費方案，選用）

1. 在 [Firebase Console](https://console.firebase.google.com/) 新增專案。
2. Authentication 啟用 **Google** 登入，在 Authorized domains 加入 `audichang-hub.github.io`。
3. 建立 Firestore 資料庫（production mode，地區 `asia-east1`），Rules 貼上 repo 裡的 `firestore.rules`。
4. 新增 Web App，把 `apiKey`、`authDomain`、`projectId`、`appId` 填進 `.env.local` 的 `VITE_FIREBASE_*`，重新打包、部署。
5. 在平板的家長區 →「設定與同步」用 Google 登入一次。

## 鎖定平板

網頁擋不住回到桌面的手勢。請搭配 Android 的「螢幕固定（App 固定）」，並開啟「取消固定前要求 PIN」。家長區的設定頁有逐步說明。

## 授權

圖示來自 [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji)（MIT）。

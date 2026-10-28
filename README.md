# 豆豆冒險

給 3 歲孩子用的學前學習 PWA，語音全部是英文（北美童聲），針對 TCL NXTPAPER 11 Plus（紙感螢幕、觸控筆）設計。豆豆、波波、莫莫三隻恐龍帶孩子在五個站點學習：

| 站點 | 主持 | 內容 |
|---|---|---|
| 字母森林 | 豆豆 | 英文字母 A–Z 與單字（分組解鎖） |
| 數字工地 | 波波 | 點數、數量配對、找數字、比多少、照順序（1–20 逐步開放） |
| 動物村 | 莫莫 | 英文詞彙（動物、交通工具、恐龍、水果）、分類題、聽叫聲猜猜看 |
| 畫畫小屋 | 豆豆 | 運筆小路、連點成圖、著色、自由畫畫、描數字字母（支援觸控筆） |
| 彩虹公園 | 波波 | 顏色、形狀、大小 |

每天的「今日冒險」會自動排 4 站，難度依孩子的作答自動升降（維持約七到八成答對率），每一題都會留下完整紀錄。家長區（右上角按住 3 秒＋算術題）可以看報告、進度、作答紀錄、作品集，並調整每日時間、護眼休息等設定。

## 開發

```bash
npm install
cp .env.example .env.local   # 填入孩子的稱呼
pip install -r scripts/requirements.txt   # 語音產生用：edge-tts、praat-parselmouth、imageio-ffmpeg（內含 ffmpeg）、numpy
npm run audio                # 產生所有語音（約 2000 段，全部重產約 15 分鐘，要連網）
npm run dev
```

- `npm run emoji`：內容新增圖示後，重新產生 `src/art/emoji.generated.ts`。
- `npm run icons`：由 `public/icon.svg` 產生 PWA 圖示。
- 台詞都定義在 `src/content/lines.ts`；新增或修改台詞後重跑 `npm run audio`，只會產生有變動的音檔。
- 字幕逐字亮起用的 `public/audio/timings.json` 會跟音檔一起產生（edge-tts 的 WordBoundary，停頓後第一個字的開始時間校正到實際出聲處）；已有音檔但缺時間資料的，重跑 `npm run audio` 會只補時間、不重產音檔。
- 語調是「E4 溫和版」：情緒句前面自動加溫和的感嘆詞（規則在 `src/content/interjections.ts`），合成參數在 `src/content/voices.ts` 的 `E4`，
  `scripts/gen_audio.py` 合成後修剪頭尾靜音、再用 Praat 不對稱放大起伏。改了這些參數，檔名的雜湊會跟著變，重跑 `npm run audio` 就會重產。
  自然發音的示範（`ph.*`、`en.where.sound.*`）不加感嘆詞、不做放大，沿用原本實測過的音檔。放大失敗的段會保留未放大的聲音，記在 `scripts/.cache/fx-report.json`。

## 部署（GitHub Pages）

```bash
npm run build
npm run deploy
```

`deploy` 會把 `dist/` 推到 `gh-pages` 分支。語音和孩子的稱呼是在本機打包時放進去的，所以原始碼裡沒有個人資料。

## 啟用雲端同步（Firebase，免費方案）

1. 到 [Firebase Console](https://console.firebase.google.com/) 新增專案（不需要 Google Analytics）。
2. 「Build → Authentication」啟用 **Google** 登入；在「Settings → Authorized domains」加入 `audichang-hub.github.io`。
3. 「Build → Firestore Database」建立資料庫（production mode，地區選 `asia-east1`）。
4. Firestore 的「Rules」貼上：

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. 「Project settings → Your apps」新增 Web App，把 `apiKey`、`authDomain`、`projectId`、`appId` 填進 `.env.local` 的 `VITE_FIREBASE_*`，重新打包部署。
6. 在平板的家長區 →「設定與同步」用 Google 登入一次即可。手機打開同一網址、加上 `#parent`，登入同一個帳號就能看報告。

## 鎖定平板

網頁擋不住回到桌面的手勢，請搭配 Android 的「螢幕固定（App 固定）」並開啟「取消固定前要求 PIN」。家長區的設定頁有逐步說明。

## 授權

圖示來自 [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji)（MIT）。

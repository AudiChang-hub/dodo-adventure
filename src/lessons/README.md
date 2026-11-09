# 學校的三堂課（src/lessons/）

2026-10-31 家長決定孩子端照學校的教法：首頁三個大門＝英文字母（豆豆）、中文課文（莫莫）、數學數字（波波），旁邊是故事、畫畫。
這個資料夾是三堂課的家。三個工作階段平行做，**各自只改自己的資料夾**，不用動 `App.tsx`、`Home.tsx`、`nav.ts`。

| 課 | 資料夾 | 守門的恐龍 | 要教的（家長定的順序） |
|---|---|---|---|
| 英文字母 | `english/` | 豆豆 `dodo` | 認字母 → 描字 → 單字範例 → 選擇 |
| 中文課文 | `chinese/` | 莫莫 `momo` | 親子共讀（2026-11-03 起 App 不出聲，大人念）：短課文一行一行念，重點字詞標紅，聊一聊，選圖（哪個是包子），最後找一樣的字 |
| 數學數字 | `math/` | 波波 `bobo` | 數數、比多少、寫數字 |

中文課最後一題「找一樣的字」（T-117，2026-11-09 家長要的）：上面一個大字，下面兩、三個字，點長得一模一樣的那個。比的是字的樣子，不用會念（幼教指引 CG-1 找一樣的、ZH-5 對文字的覺察；ZH-6 不考認字，所以不問「哪個是豬？」）。
- 答案是當篇紅字詞裡的一個字（小豬 → 豬），干擾字只用當篇課文裡的字（不教不考）；2 選 1 起，熟練了才 3 選 1、才放有點像的字。
- 程式：畫面 `chinese/Glyph.tsx`，出題和升降級 `chinese/match.ts`，字形資料 `chinese/glyphs.generated.json`（課文多了新字要重跑 `node scripts/build-zh-glyphs.mjs`）。
- 作答紀錄是 `zh-glyph`／`zhglyph:<字>`，跟選圖的 `zhtext:` 分開，不算進下一步準備度 NEXT-3。設計：主 repo `docs/T-117-認字配對設計.md`。

## 介面（定好了，不改）

每一課的資料夾有一個 `index.tsx`，export 一個元件（名字已經登記在 `index.ts`）：

```tsx
import type { LessonProps } from '../types'

export function EnglishLesson({ onDone }: LessonProps) {
  // 整個畫面都是這一課的：自己畫背景、返回鍵、題目
  return <div className="screen">…</div>
}
```

- **`onDone()`**：上完一堂就叫一次。`LessonScreen.tsx` 接著放下課畫面（平均每 3～4 堂有一次是挑貼紙、不固定、事先不說，其他是安靜的下課畫面，見 `src/lib/lesson-sticker.ts`），然後回首頁。叫第二次不會再算一堂。課自己的稱讚、再見照常說，不要提到貼紙。
- **返回**：畫面左上角放返回鍵，點一下回首頁（照路由回上一層，不用自己處理）：
  ```tsx
  import { BackButton } from '../../ui/Back'
  import { HomeIcon } from '../../games/Shell'
  <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 5 }}>
    <BackButton label="回首頁"><HomeIcon /></BackButton>
  </div>
  ```
  用 `games/Shell` 包起來的話，Shell 已經有返回鍵（在 lesson 路由上自動寫「回首頁」），`onExit` 給 `leaveLesson`（`./LessonScreen.tsx`）。
  一課裡有好幾段、返回要先回上一段的話，用 `useBack`（`src/lib/nav.ts`）：回傳 `false` 交給外層回首頁。
- **路由**：`{ name: 'lesson', subject: 'english' | 'chinese' | 'math' }`（`src/lib/nav.ts`）；畫面的 id（三歲測試看的 `live`）是 `lesson-english` 這樣。

不要改的檔（三課共用，改了會互相打架）：`index.ts`、`types.ts`、`LessonScreen.tsx`。
需要改共用的地方，回報給 PM。

## 可以重用的零件

| 要做的 | 零件 | 路徑 | 怎麼用 |
|---|---|---|---|
| 字母、代表字、圖 | `LETTERS`（A apple 🍎…）、`LETTER_GROUPS`、`letterEntry('B')`；自然發音用 `PHONICS`、`soundUnit` | `src/content/letters.ts` | 純資料，直接 import |
| 描字（字母、數字） | 筆順 `GLYPHS`、零件 `PARTS`；描的跑道 `PathTracker`、畫布 `Ink` | `src/games/draw/glyphs.ts`、`src/games/draw/track.ts`、`src/games/draw/Ink.tsx` | 英文課的 `Trace.tsx`、數學課的 `Write.tsx` 是現成的例子 |
| 選擇題、數數 | 舊的站點遊戲（ChoiceGame、CountGame…）T-75 已經拿掉，各課自己組（中文課的 `Quiz.tsx`、數學課的 `kit.tsx` 的 `Quiz`、`Count.tsx`） | `src/lessons/<科>/` | 互動做法照抄現有的課 |
| 教學卡（恐龍拿出來念、孩子點一下再聽一次） | `TeachCard`，內容是 `TeachSpec` | `src/games/Teach.tsx`、型別在 `src/content/games.ts` | `<TeachCard spec={…} onDone={(ms) => …} />` |
| 說話、音效 | `say(...keys)`（依序念、會被新的 say 打斷）、`stopSpeech()`、`sfx.pop()` 等 | `src/lib/audio.ts` | 台詞要先登記：`def(key, 'dodo', 'text')`（`src/content/lines.ts` 或自己檔案再 import 進 `lines.ts`），再 `npm run phrases && python scripts/gen_audio.py --only <key 前綴>` 產生音檔 |
| 中文的詞 | 中文三明治（中文 → 停一下 → 英文）`ZH_WORDS`、`bridgeKey` | `src/content/zh-words.ts`、`src/content/lines-zh.ts` | 中文語音是另一套（BreezyVoice，`scripts/gen_zh_words.py`）；`scripts/check-zh.ts` 檢查缺漏。中文課文 2026-11-03 起是親子共讀，App 不念課文和題目（`scripts/test-zh-course.ts` 會檢查） |
| 字幕 | 跟著語音自動出現（App 最上層的 `Subtitle`），重點字上色 `tintTarget`、`tintWord` | `src/ui/Subtitle.tsx`、`src/content/subtitles.ts` | 不用自己放；say 了就有 |
| 恐龍 | `<Dino who="dodo" mood="happy" size="100%" onTap={…} />`（說話時嘴巴會動） | `src/art/Dino.tsx` | |
| 圖 | `<Emoji name="red-apple" />`（Fluent Emoji，名字在 `src/art/emoji.generated.ts`） | `src/art/Emoji.tsx` | 沒有的圖：`npm run emoji` |
| 作答紀錄（家長區看得到） | `logAttempt({...})`、教學卡 `logTeach({...})` | `src/lib/record.ts` | 每一題都要記；`station` 用 `english`／`mandarin`／`math`，`game` 用自己的 id |
| 轉場、動態 | 整頁轉場 `Scenes`、換題 `Swap`、教學卡 ↔ 題目 `CardStage`；節奏在 `ui/motion.ts` | `src/ui/Scenes.tsx`、`src/ui/motion.ts` | 一課裡有好幾段就用 `Scenes`（每段一個 id） |

## 其他規矩

- 舊的地圖、冒險、魔法屋、貼紙本、站點遊戲 T-75 已經從程式拿掉（要找回來從 git 歷史救）；`src/lib/features.ts` 只剩成長系統的關卡鎖和睡覺畫面兩個開關。
- 孩子的名字、幼兒園、生日不能寫進 repo（台詞裡用 `lines.ts` 的 `N`）。
- 三歲測試：`npm run test:toddler -- --changed`。只改自己的資料夾時，會跑 `home.spec.ts` 的「三大門」（進出每一課、連點、返回）；
  自己的課要加測試，寫一個新的 spec（例如 `tests/toddler/lesson-english.spec.ts`），加進 `playwright.config.ts` 的 `testMatch`。

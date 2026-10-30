// 主題式冒險（content/themes.ts）和故事（content/story）的台詞：標題、開場、每站之間、結尾。
// 每句都很短、只說一次（家長嫌吵過），點一下畫面就跳過；`|` 之後是加重的字。
// 主題的開車目的地（c.drive.to.*）、排順序故事（c.seq.*）、新的規律圖（c.name.*）、新詞彙（z.*）
// 都跟著原本的迴圈在 lines-code.ts、lines.ts 產生，這裡不重複寫。
//
// 12 個主題已經轉成通用章節（content/story/evergreen.ts）：key 還是 theme.<id>.title／intro／stop.<i>／end，
// 文字也一樣，所以字幕和音檔都跟轉換前相同（scripts/check-story-themes.ts 比對）。
// 故事的台詞 key 是 story.<章 id>.<位置>；`{name}` 在這裡換成孩子的英文名字（env，名字不進 repo）。
import { CHILD_EN } from '../lib/env'
import { def } from './registry'
import { allChapters, chapterLines } from './story'

for (const ch of allChapters()) for (const [key, speaker, en] of chapterLines(ch)) def(key, speaker, en.replaceAll('{name}', CHILD_EN))

// 魔法屋、我的故事書（screens/MagicHouse.tsx、StoryBook.tsx）
def('story.house.hello', 'dodo', 'Welcome back to the Magic House!')
def('story.house.new', 'dodo', 'Look! Something new!')
def('story.book.hello', 'momo', 'Pick a story.')
def('story.book.empty', 'momo', "No stories yet. Let's go!")

// 箭頭卡開車：主題式冒險裡開的是說故事那隻恐龍的車（主持一樣是波波）
def('c.intro.drive.momo', 'bobo', 'Help Momo drive! Use the arrow cards!')
def('c.intro.drive.bobo', 'bobo', "Let's drive my car! Use the arrow cards!")

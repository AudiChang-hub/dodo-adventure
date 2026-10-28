// 主題式冒險（content/themes.ts）的台詞：標題、開場、每站之間的一句、結尾，都由說故事的那隻恐龍念。
// 每句都很短、只說一次（家長嫌吵過），點一下畫面就跳過；`|` 之後是加重的字。
// 主題的開車目的地（c.drive.to.*）、排順序故事（c.seq.*）、新的規律圖（c.name.*）、新詞彙（z.*）
// 都跟著原本的迴圈在 lines-code.ts、lines.ts 產生，這裡不重複寫。
import { def } from './registry'
import { BEATS, THEMES } from './themes'

for (const t of THEMES) {
  const b = BEATS[t.id]
  // 莫莫說話慢慢的，句尾用句號；波波、豆豆用驚嘆號
  def(`theme.${t.id}.title`, t.host, `${t.title}${t.host === 'momo' ? '.' : '!'}`)
  def(`theme.${t.id}.intro`, t.host, b.intro)
  b.stops.forEach((x, i) => def(`theme.${t.id}.stop.${i}`, t.host, x))
  def(`theme.${t.id}.end`, t.host, b.end)
}

// 箭頭卡開車：主題式冒險裡開的是說故事那隻恐龍的車（主持一樣是波波）
def('c.intro.drive.momo', 'bobo', 'Help Momo drive! Use the arrow cards!')
def('c.intro.drive.bobo', 'bobo', "Let's drive my car! Use the arrow cards!")

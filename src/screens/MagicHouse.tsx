import { useEffect, useState } from 'react'
import { BackButton } from '../ui/Back'
import { HomeIcon } from '../games/Shell'
import { Emoji } from '../art/Emoji'
import { MagicHouseArt } from '../ui/MagicHouseArt'
import { go } from '../lib/nav'
import { say, sfx } from '../lib/audio'
import { db, getKV, setKV } from '../lib/db'
import { houseItems } from '../lib/story'
import './story.css'

/** 上一次看到魔法屋時有幾樣東西：多了的那一樣標成「新的」（看過一次就不再標） */
const SEEN_KV = 'houseSeen'

/**
 * 魔法屋（docs/故事世界.md §1）：剖面圖就是孩子看得見的成就——不是分數，是「我們一起把家變大」。
 * 每完成一篇多一樣東西，只會變多。點書房（或右下角的書）：打開我的故事書。
 */
export function MagicHouse() {
  const [items, setItems] = useState<string[] | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [friends, setFriends] = useState<string[]>([])

  useEffect(() => {
    let live = true
    void (async () => {
      const [list, seen, fs] = await Promise.all([houseItems(), getKV<number>(SEEN_KV, 0), db.friends.orderBy('ts').toArray()])
      if (!live) return
      setItems(list)
      setFriends(fs.map((f) => f.id))
      const isNew = list.length > seen ? list[list.length - 1] : null
      setFresh(isNew)
      void setKV(SEEN_KV, list.length)
      await say('story.house.hello', ...(isNew ? ['story.house.new'] : []))
    })()
    return () => {
      live = false
    }
  }, [])

  const openBook = () => {
    sfx.pop()
    go({ name: 'storybook' })
  }

  return (
    <div className="screen house-screen">
      <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 6 }}>
        <BackButton label="回首頁">
          <HomeIcon />
        </BackButton>
      </div>
      <div className="house-title" aria-hidden="true">
        魔法屋{items && items.length > 0 ? ` · 多了 ${items.length} 樣東西` : ''}
      </div>
      <div className="house-frame">
        {items && (
          <MagicHouseArt
            items={items}
            fresh={fresh}
            friends={friends}
            onBook={openBook}
          />
        )}
      </div>
      {/* 故事書也有一顆大按鈕（書房的書架太小的時候，例如手機直式） */}
      <button className="round-btn house-book-btn" aria-label="故事書" onClick={openBook}>
        <Emoji name="books" size={58} />
      </button>
    </div>
  )
}

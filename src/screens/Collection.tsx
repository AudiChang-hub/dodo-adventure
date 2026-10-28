import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Egg } from '../art/Egg'
import { HoldButton } from '../ui/Hold'
import { HomeIcon } from '../games/Shell'
import { FriendActor } from '../ui/FriendActor'
import { Emoji } from '../art/Emoji'
import { StickerBook } from './Stickers'
import { freshCount } from '../lib/achievements'
import { FRIENDS } from '../content/park'
import { FRIEND_COUNT_MAX } from '../content/lines-friends'
import { db, type Friend } from '../lib/db'
import { go } from '../lib/nav'
import { say, sfx } from '../lib/audio'
import { pick } from '../lib/random'
import './friends.css'

/** 進來一陣子都沒點：一隻朋友自己動一下，告訴孩子「可以點我」 */
const INVITE_MS = 6000

/** 還沒孵出來的空格：點了蛋晃一晃，豆豆說去冒險就能孵出來 */
function EggSlot({ i }: { i: number }) {
  const [n, setN] = useState(0)
  return (
    <motion.button
      className="friend-slot is-egg"
      aria-label="還沒孵出來的蛋"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.1 + i * 0.03 }}
      onClick={() => {
        sfx.tap()
        setN((x) => x + 1)
        void say('friend.egg')
      }}
    >
      <span className="friend-egg">
        <Egg cracks={0} wobble={n > 0} size="100%" key={n} />
      </span>
    </motion.button>
  )
}

export function Collection() {
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [invite, setInvite] = useState<string | null>(null)
  const touched = useRef(false)
  /** 朋友／貼紙本（成就感強化）：同一頁切換，不用另開路由 */
  const [view, setView] = useState<'friends' | 'book'>('friends')
  const [fresh] = useState(freshCount)
  const switchTo = (v: 'friends' | 'book') => {
    if (v === view) return
    sfx.tap()
    setView(v)
    if (v === 'friends') void say('collection.hi')
  }

  useEffect(() => {
    let timer = 0
    db.friends
      .orderBy('ts')
      .toArray()
      .then((f) => {
        setFriends(f)
        if (!f.length) return void say('collection.empty')
        // 偶爾數一數：You have five friends!（波波最愛數東西）
        const count = f.length >= 2 && f.length <= FRIEND_COUNT_MAX && Math.random() < 0.5
        void say('collection.hi', ...(count ? [`friend.count.${f.length}`] : []))
        timer = window.setTimeout(() => {
          if (!touched.current) setInvite(pick(f).id)
        }, INVITE_MS)
      })
    return () => clearTimeout(timer)
  }, [])

  const list = friends ?? []
  // 最多先露出 6 顆蛋：讓孩子知道還有朋友可以孵，但不要一整片「還沒有」
  const eggs = friends ? Math.max(0, Math.min(FRIENDS.length - list.length, 6)) : 0
  return (
    <div className={`screen collection${view === 'book' ? ' is-book' : ''}`} onPointerDown={() => (touched.current = true)}>
      <div className="collection-top">
        <HoldButton label="回首頁（按住）" ms={600} onHold={() => go({ name: 'home' })}>
          <HomeIcon />
        </HoldButton>
        <div className="collection-title" aria-hidden="true">
          {view === 'book' ? '我的貼紙' : '我的朋友'}
          {view === 'book' && <small>點貼紙，聽聽它是什麼</small>}
          {view === 'friends' && friends && friends.length > 0 && (
            <small>
              {list.length} / {FRIENDS.length}　點朋友，牠會說自己的英文名字
            </small>
          )}
        </div>
        <div className="collection-tabs">
          <button className={`round-btn${view === 'friends' ? ' on' : ''}`} aria-label="我的朋友" onClick={() => switchTo('friends')}>
            <Emoji name="hatching-chick" />
          </button>
          <button className={`round-btn${view === 'book' ? ' on' : ''}`} aria-label="我的貼紙" onClick={() => switchTo('book')}>
            <Emoji name="open-book" />
            {fresh > 0 && view === 'friends' && <span className="badge-dot" />}
          </button>
        </div>
      </div>
      {view === 'book' && <StickerBook />}
      <div className="friend-grid" style={view === 'book' ? { display: 'none' } : undefined}>
        {list.map((f, i) => (
          <motion.div key={f.id} className="friend-slot" initial={{ scale: 0, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 16, delay: i * 0.03 }}>
            <motion.div className="friend-invite" animate={invite === f.id ? { rotate: [0, -10, 10, -6, 0], y: [0, -10, 0] } : {}} transition={{ duration: 0.9, repeat: invite === f.id ? 2 : 0, repeatDelay: 0.6 }}>
              <FriendActor id={f.id} label onReact={() => setInvite(null)} />
            </motion.div>
          </motion.div>
        ))}
        {Array.from({ length: eggs }, (_, i) => (
          <EggSlot key={`e${i}`} i={list.length + i} />
        ))}
      </div>
    </div>
  )
}

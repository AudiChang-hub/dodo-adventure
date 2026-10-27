import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { HoldButton } from '../ui/Hold'
import { HomeIcon } from '../games/Shell'
import { FRIENDS } from '../content/park'
import { db, type Friend } from '../lib/db'
import { go } from '../lib/nav'
import { say, sfx } from '../lib/audio'

export function Collection() {
  const [friends, setFriends] = useState<Friend[]>([])
  const [bounce, setBounce] = useState<string | null>(null)

  useEffect(() => {
    db.friends.orderBy('ts').toArray().then((f) => {
      setFriends(f)
      void say(f.length ? 'collection.hi' : 'collection.empty')
    })
  }, [])

  const empty = Math.max(0, Math.min(FRIENDS.length, friends.length + 6) - friends.length)
  return (
    <div className="screen" style={{ background: 'var(--paper)' }}>
      <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 5 }}>
        <HoldButton label="回首頁（按住）" ms={600} onHold={() => go({ name: 'home' })}>
          <HomeIcon />
        </HoldButton>
      </div>
      <div style={{ position: 'absolute', left: 130, top: 34, fontFamily: 'Huninn', fontSize: 26, color: 'var(--ink-soft)' }} aria-hidden="true">
        我的朋友
      </div>
      <div className="friends">
        {friends.map((f, i) => (
          <motion.button
            key={f.id}
            className="friend"
            aria-label="朋友"
            initial={{ scale: 0 }}
            animate={bounce === f.id ? { scale: [1, 1.2, 1], rotate: [0, -8, 8, 0] } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 14, delay: bounce ? 0 : i * 0.03 }}
            onClick={() => {
              sfx.pop()
              setBounce(null)
              requestAnimationFrame(() => setBounce(f.id))
            }}
          >
            <Emoji name={f.id} />
          </motion.button>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e${i}`} className="friend empty" aria-hidden="true">
            <div style={{ width: '70%', opacity: 0.25, filter: 'grayscale(1)' }}>
              <Emoji name="egg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Ride } from '../art/Ride'
import { Dino } from '../art/Dino'
import { Emoji } from '../art/Emoji'
import { Scenery } from '../ui/Scenery'
import { go } from '../lib/nav'
import { say, sfx } from '../lib/audio'
import { db } from '../lib/db'
import { todayPlan, planDone, type Plan } from '../lib/plan'
import { station } from '../content/games'
import { useSettings } from '../lib/settings'
import { audioReady, onUnlock } from '../lib/boot'
import { useInstall } from '../lib/install'
import { HomeFriends } from './HomeFriends'

let greeted = false

export function Home() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [friends, setFriends] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const settings = useSettings()
  const install = useInstall()

  useEffect(() => {
    todayPlan().then(setPlan)
    db.friends.count().then(setFriends)
    if (!greeted && audioReady()) {
      greeted = true
      void say('home.hello')
    }
    return onUnlock(() => {
      if (greeted) return
      greeted = true
      void say('home.hello')
    })
  }, [])

  const done = plan ? planDone(plan) : false
  const mapOpen = settings.freePlay === 'always' || done

  const start = async () => {
    sfx.pop()
    greeted = true
    if (done) {
      await say('adv.again')
      return go({ name: 'map' })
    }
    setLeaving(true)
    sfx.whoosh()
    void say('adv.go')
    setTimeout(() => go({ name: 'adventure' }), 1100)
  }

  return (
    <div className="screen home">
      {[{ top: '9%', w: 150, d: 95, delay: -20 }, { top: '19%', w: 100, d: 70, delay: -50 }, { top: '6%', w: 80, d: 120, delay: -80 }].map((c, i) => (
        <div key={i} className="cloud" style={{ top: c.top, width: c.w, animationDuration: `${c.d}s`, animationDelay: `${c.delay}s` }} />
      ))}
      <motion.div style={{ position: 'absolute', right: '6vw', top: '6vh', width: '9vmin' }} animate={{ rotate: 360 }} transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x={47} y={2} width={6} height={16} rx={3} fill="#F1D27C" transform={`rotate(${i * 36} 50 50)`} />
          ))}
          <circle cx={50} cy={50} r={26} fill="#F6DE95" />
        </svg>
      </motion.div>
      <Scenery station="home" />

      <div className="home-title" aria-hidden="true">
        豆豆冒險
        <small>{done ? '今天的冒險完成了' : '今天的冒險'}</small>
      </div>
      {plan && (
        <div className="today-path" aria-hidden="true">
          {plan.items.map((it, i) => (
            <i key={i} className={it.done ? 'done' : undefined}>
              <Emoji name={station(it.station).icon} />
            </i>
          ))}
          <i className={done ? 'done' : undefined}>
            <Emoji name={plan.hatched ?? 'egg'} />
          </i>
        </div>
      )}

      {!install.standalone && !install.installed && (
        // 給大人看的小字：孩子點了也沒反應，不搶眼、不動
        <p className="install-hint">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2.5v7M5 7l3 3 3-3M3 12.5h10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            家長：可以安裝成 App，全螢幕更穩定
            <br />
            右上角按住 3 秒 → 設定與同步
          </span>
        </p>
      )}

      <motion.div
        style={{ position: 'absolute', right: '-3vw', bottom: '30vh', width: '22vmin' }}
        initial={{ x: 120 }}
        animate={{ x: 0 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 60, damping: 14 }}
      >
        <Dino who="momo" mood="peek" size="100%" flip onTap={() => say('home.tapmomo')} />
      </motion.div>

      {/* 今天出來玩的朋友：在車子和右下角按鈕之間的草地上慢慢走 */}
      <HomeFriends />

      <motion.div
        style={{ position: 'absolute', left: '8vw', bottom: '10vh', width: '52vmin', zIndex: 2 }}
        initial={{ x: '-60vw' }}
        animate={leaving ? { x: '120vw', transition: { duration: 1.1, ease: [0.6, 0, 0.8, 0.4] } } : { x: 0, transition: { type: 'spring', stiffness: 50, damping: 13 } }}
      >
        <Ride who="dodo" width="100%" moving={leaving} mood={leaving ? 'cheer' : 'happy'} onTap={() => say('home.tapdodo')} />
      </motion.div>

      <motion.div
        style={{ position: 'absolute', left: '-2vw', bottom: '-2vh', width: '20vmin', zIndex: 3 }}
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.9, type: 'spring', stiffness: 70, damping: 12 }}
      >
        <Dino who="bobo" size="100%" onTap={() => say('home.tapbobo')} />
      </motion.div>

      <motion.button
        className={`go-btn${done ? ' map' : ''}`}
        aria-label={done ? '去地圖' : '出發'}
        onClick={start}
        initial={{ scale: 0 }}
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ scale: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } }}
      >
        {done ? (
          <svg viewBox="0 0 48 48" width="42%" aria-hidden="true">
            <path d="M6 12 L18 7 L30 12 L42 7 V36 L30 41 L18 36 L6 41 Z" fill="#FBF8F2" />
            <path d="M18 7 V36 M30 12 V41" stroke="#5FA883" strokeWidth={3} />
          </svg>
        ) : (
          <svg viewBox="0 0 48 48" width="40%" aria-hidden="true">
            <path d="M16 9 Q14 8 14 11 V37 Q14 40 16 39 L38 26 Q40 24 38 22 Z" fill="#FBF8F2" />
          </svg>
        )}
        <span>{done ? '地圖' : '出發'}</span>
      </motion.button>

      <div className="home-dock">
        <button className="round-btn" aria-label="地圖" style={{ opacity: mapOpen ? 1 : 0.5 }} onClick={() => (mapOpen ? go({ name: 'map' }) : say('map.locked'))}>
          <Emoji name="rainbow" size={54} />
        </button>
        <button className="round-btn" aria-label="我的朋友" onClick={() => go({ name: 'collection' })}>
          <Emoji name="hatching-chick" size={56} />
          {friends > 0 && <span className="badge-count">{friends}</span>}
        </button>
      </div>
    </div>
  )
}

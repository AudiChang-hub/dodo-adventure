import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { Dino } from '../art/Dino'
import { HoldButton } from '../ui/Hold'
import { HomeIcon } from '../games/Shell'
import { STATIONS } from '../content/games'
import { go } from '../lib/nav'
import { say, sfx } from '../lib/audio'
import { todayPlan, planDone } from '../lib/plan'
import { useSettings } from '../lib/settings'

const SPOTS = [
  { x: 16, y: 62 },
  { x: 34, y: 30 },
  { x: 52, y: 64 },
  { x: 70, y: 32 },
  { x: 86, y: 64 },
]

export function MapScreen() {
  const settings = useSettings()
  const [open, setOpen] = useState(settings.freePlay === 'always')

  useEffect(() => {
    todayPlan().then((p) => {
      const ok = settings.freePlay === 'always' || planDone(p)
      setOpen(ok)
      void say(ok ? 'map.where' : 'map.locked')
    })
  }, [settings.freePlay])

  const road = `M${SPOTS.map((p) => `${p.x * 12} ${p.y * 8}`).join(' L')}`
  return (
    <div className="screen map">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        <path d="M0 560 Q300 500 600 560 T1200 540 V800 H0 Z" fill="#DCE9D2" />
        <path d={road} fill="none" stroke="#E9E1D2" strokeWidth={70} strokeLinecap="round" strokeLinejoin="round" />
        <path d={road} fill="none" stroke="#FBF8F2" strokeWidth={5} strokeDasharray="26 24" strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 5 }}>
        <HoldButton label="回首頁（按住）" ms={600} onHold={() => go({ name: 'home' })}>
          <HomeIcon />
        </HoldButton>
      </div>
      {STATIONS.map((s, i) => (
        <motion.button
          key={s.id}
          className={`map-stop${open ? '' : ' locked'}`}
          style={{ left: `${SPOTS[i].x}%`, top: `${SPOTS[i].y}%` }}
          initial={{ scale: 0, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 15, delay: 0.1 * i }}
          whileTap={{ scale: 0.93 }}
          onClick={() => {
            sfx.pop()
            if (!open) return void say('map.locked')
            go({ name: 'station', station: s.id })
          }}
          aria-label={s.name}
        >
          <div className="disc" style={{ background: s.tint }}>
            <Emoji name={s.icon} />
          </div>
          <span>{s.name}</span>
          <div style={{ position: 'absolute', width: '46%', right: '-26%', top: '-6%' }}>
            <Dino who={s.host} size="100%" />
          </div>
        </motion.button>
      ))}
    </div>
  )
}

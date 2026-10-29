import { useEffect, type CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../art/Emoji'
import { Dino } from '../art/Dino'
import { HoldButton } from '../ui/Hold'
import { Scenery } from '../ui/Scenery'
import { MapIcon } from '../games/Shell'
import { gamesOf, station as stationDef } from '../content/games'
import { level } from '../lib/adaptive'
import { go } from '../lib/nav'
import { say, sfx } from '../lib/audio'
import type { StationId } from '../lib/db'
import { useIntro } from '../ui/Scenes'

/** 自由探索時的站點：列出這一站所有遊戲 */
export function StationScreen({ id }: { id: StationId }) {
  const st = stationDef(id)
  const games = gamesOf(id)
  const intro = useIntro()
  useEffect(() => {
    void say(`welcome.${id}`)
  }, [id])

  return (
    <div className="screen stage" style={{ '--stage': st.tint } as CSSProperties}>
      <Scenery station={id} />
      <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 5, display: 'flex', gap: 14 }}>
        <HoldButton label="回地圖（按住）" ms={600} onHold={() => go({ name: 'map' })}>
          <MapIcon />
        </HoldButton>
      </div>
      <div style={{ position: 'absolute', left: '2vw', bottom: 0, width: '20vw', zIndex: 4 }}>
        <Dino who={st.host} mood="happy" size="100%" onTap={() => say(`welcome.${id}`)} />
      </div>
      <div className="station-games">
        {games.map((g, i) => (
          <motion.button
            key={g.id}
            className="game-tile"
            aria-label={g.title}
            initial={intro ? { y: 40, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.07 * i }}
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              sfx.pop()
              go({ name: 'play', game: g.id, station: id })
            }}
          >
            <Emoji name={g.icon} />
            <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
              <b>{g.title}</b>
              {g.maxLevel > 1 && (
                <div className="stars" aria-hidden="true">
                  {Array.from({ length: g.maxLevel }, (_, k) => (
                    <i key={k} className={k < level(g.id) ? 'on' : undefined} />
                  ))}
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

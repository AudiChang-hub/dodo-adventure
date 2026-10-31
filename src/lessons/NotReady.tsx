import { useEffect, type CSSProperties } from 'react'
import { Dino } from '../art/Dino'
import { Emoji } from '../art/Emoji'
import { BackButton } from '../ui/Back'
import { HomeIcon } from '../games/Shell'
import { say } from '../lib/audio'
import { INFO, type Subject } from './types'
import './lessons.css'

/** 每一課的底色：跟首頁那扇門同一個顏色，淡一點 */
const BG: Record<Subject, { tint: string; deep: string }> = {
  english: { tint: '#E3F2E9', deep: '#8FCBAA' },
  chinese: { tint: '#E6EFF8', deep: '#A3C4E4' },
  math: { tint: '#FBE8DA', deep: '#F0B088' },
}

/**
 * 還在準備的課：守門的恐龍說「快好了」，左上角是回首頁。點恐龍再說一次。
 * 三堂課做好之後就不用了（各課的 index.tsx 換成真的課）。
 */
export function NotReady({ subject }: { subject: Subject }) {
  const d = INFO[subject]
  const bg = BG[subject]
  useEffect(() => {
    void say(`lesson.soon.${subject}`)
  }, [subject])

  return (
    <div className="screen lesson-soon" style={{ '--tint': bg.tint, '--deep': bg.deep } as CSSProperties}>
      <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 5 }}>
        <BackButton label="回首頁">
          <HomeIcon />
        </BackButton>
      </div>
      <div className="lesson-soon-stage">
        <div className="lesson-soon-dino">
          <Dino who={d.host} mood="happy" size="100%" onTap={() => say(`lesson.soon.${subject}`)} />
        </div>
        {/* 給大人看的牌子：孩子看恐龍 */}
        <div className="lesson-soon-sign" aria-hidden="true">
          <Emoji name="construction" />
          <span>
            {d.title}
            <small>準備中</small>
          </span>
        </div>
      </div>
    </div>
  )
}

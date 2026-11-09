import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Shell } from '../../games/Shell'
import { Swap } from '../../ui/Scenes'
import { EASE } from '../../ui/motion'
import { sfx, stopSpeech } from '../../lib/audio'
import { getKV, setKV } from '../../lib/db'
import { logTeach } from '../../lib/record'
import type { Mood } from '../../art/Dino'
import { leaveLesson } from '../LessonScreen'
import type { LessonProps } from '../types'
import { STORY_RUN, questionsOf, storyQuestionsOf, type ZhQuestion, type ZhText } from './data'
import { doneDays, glyphState, lessonToday, markDone, saveGlyph } from './progress'
import { NEXT_HINT, nextStep, useNextPending } from '../../ui/NextStep'
import { Reader } from './Reader'
import { Quiz } from './Quiz'
import { Glyph } from './Glyph'
import { glyphQuestion, needsDemo, type GlyphQuestion } from './match'
import './chinese.css'

/** 作答紀錄（家長區）用的遊戲 id；技能是 zhtext:<字詞> */
export const ZH_GAME = 'zh-lesson'

/** 大人看過「親子共讀怎麼上」的說明了（只出現一次；家長重置學習進度時跟著清掉，會再出現一次） */
const INTRO_KV = 'zhLesson:introSeen'

/** 主持的恐龍被點了：交給現在這一段（App 不出聲，只有一聲輕的音效或題目卡跳一下） */
export type HostTap = { current: (() => void) | null }

/** number：第幾題選圖；glyph：最後的找一樣的字（T-117） */
type Scene = 'intro' | 'read' | number | 'glyph'

/** 角落的陪玩小字：大人每一步要做什麼（PARENT-1） */
/** 選圖的張數寫成國字（畫面上有幾張就寫幾張：教過的字詞不夠時只有兩張） */
const COUNT = ['零', '一', '兩', '三', '四']

/**
 * 角落的陪玩小字。孩子在大人念的時候最常沒事做（AI 小男生盲測 f7c3119：不到 1 分鐘就說好久了），
 * 所以念課文的每一句都先寫「念到這行時請他點亮起來的圖」（T-114：念到哪一行，那一行的圖就亮起來）。opts 是這一題選圖有幾張。
 */
function hintOf(scene: Scene, run: number, talk: boolean, opts = 3, demo = false): string {
  if (scene === 'intro') return '先看一下怎麼上，看完按「開始念」。'
  if (scene === 'glyph')
    return demo
      ? '先看手示範一次：找一個跟上面長得一模一樣的字。再讓他自己找，不用念這是什麼字。'
      : '指著上面的字問他：「下面哪一個跟它長得一模一樣？」讓他自己找，不用念這是什麼字。找到了可以說：「你看得好仔細，一模一樣！」'
  if (scene !== 'read') return `念題目給他聽：「哪個是〇〇？」再指著${COUNT[opts] ?? opts}張有黃框的圖說「點一下」。點錯會有提示，不用幫他點。`
  if (talk) return '照卡片問他，指著圖等他回答；答不出來就照卡片說一次給他聽。「去選圖」過幾秒會出現在右下角。'
  if (run === 2) return '念到這行時，請他點亮起來的圖。今天第 2 次：框起來、標「停」的詞先停一下，等他說出來。念完一行按右下「下一行」。'
  if (run >= 3) return '念到這行時，請他點亮起來的圖，再請他跟著說一次。念完一行按右下「下一行」。'
  return '念到這行時，請他點亮起來的圖（點了圖會動、不出聲）。指著字一行一行念，念完一行按右下「下一行」。'
}

/**
 * 中文課的一堂（親子共讀，2026-11-03：App 不出聲，大人念給孩子聽）：
 * 第一次進來先給大人一張說明 → 念課文（大人一行一行念、按「下一行」）→ 聊一聊（開放問題）→ 選圖（每個紅字一題）
 * → 找一樣的字（T-117，一題：紅字裡的一個字，2 選 1 起，./match.ts）→ 上完叫 onDone。
 * 同一篇連上 3 次（progress.ts）：第 2 次念到框起來的紅字前停一下讓孩子接（Reader）；第 3 次再加故事題（STORY_RUN，現況對照 A8，題目還沒做）。
 * 兩段之間、每一題之間都是原地淡入淡出（ui/Scenes 的 Swap），沒有打斷課程的整頁卡片。
 */
export function ChineseLessonBody({ onDone }: LessonProps) {
  const [t, setT] = useState<ZhText | null>(null)
  /** 這一篇第幾次上 */
  const [run, setRun] = useState(1)
  const [qs, setQs] = useState<ZhQuestion[]>([])
  /** 最後一題找一樣的字；這一堂要不要先讓手示範 */
  const [gq, setGq] = useState<GlyphQuestion | null>(null)
  const [gDemo, setGDemo] = useState(false)
  /** 示範還在進行（陪玩小字寫「先看手示範」；示範完換平常那句） */
  const [gDemoing, setGDemoing] = useState(false)
  const [scene, setScene] = useState<Scene | null>(null)
  const [talk, setTalk] = useState(false)
  const [answered, setAnswered] = useState(0)
  /** 課文念完幾行（上面的進度：念課文、選圖在同一排，T-111） */
  const [read, setRead] = useState(0)
  const onLine = useCallback((n: number) => setRead(n), [])
  const [mood, setMood] = useState<Mood>('idle')
  const host: HostTap = useRef(null)
  const taught = useRef(false)

  useEffect(() => {
    let off = false
    void Promise.all([lessonToday(), doneDays(), getKV<boolean>(INTRO_KV, false), glyphState()]).then(([{ t: x, n }, done, seen, g]) => {
      if (off) return
      setT(x)
      setRun(n)
      setQs([...questionsOf(x, done), ...(n >= STORY_RUN ? storyQuestionsOf(x) : [])])
      setGq(glyphQuestion(x, n, g.level))
      setGDemo(needsDemo(g))
      setGDemoing(needsDemo(g))
      setScene(seen ? 'read' : 'intro')
    })
    return () => {
      off = true
      stopSpeech()
    }
  }, [])

  const start = () => {
    sfx.tap()
    void setKV(INTRO_KV, true)
    setScene('read')
  }

  /** 上完：完成的音效、莫莫歡呼，馬上出下課畫面（T-113：以前最後一題打勾後等 1.5＋0.9 秒，中間畫面沒有新東西，孩子按返回） */
  const finish = async () => {
    if (!t) return
    setMood('cheer')
    sfx.done()
    await Promise.all([markDone(t.day), new Promise((r) => window.setTimeout(r, 350))])
    onDone()
  }

  /** 課文念完、要去選圖了：第一次念完時，每個要考的字詞記一筆「教學」（家長區看得到今天教了什麼） */
  const toQuiz = (ms: number) => {
    if (!t) return
    if (!taught.current) {
      taught.current = true
      for (const q of qs) void logTeach({ station: 'mandarin', game: ZH_GAME, itemId: `${t.day}:${q.word}`, skill: `zhtext:${q.word}`, level: 1, ms })
    }
    if (qs.length) setScene(0)
    else if (gq) setScene('glyph')
    else void finish()
  }

  /**
   * 答完一題：停在答對的樣子（打勾、星星），等孩子點「下一步」的大箭頭才換題（T-118，家長：選圖答對之後換題要等他點）。
   * 沒有找字時的最後一張選圖答完直接慶祝、到下課的晚安道別。
   * 找一樣的字答完：停在兩個字配成一對、大打勾的樣子，也等孩子點「下一步」才下課（T-123，盲測 ca0d1e1 中文 seed 3：
   * 以前 0.8 秒就自己換到下課，孩子還在找勾勾，「我一直點都一樣」就離開）。
   */
  const next = async () => {
    setAnswered((n) => n + 1)
    setMood('idle')
    const to: Scene | null = typeof scene === 'number' && scene + 1 < qs.length ? scene + 1 : typeof scene === 'number' && gq ? 'glyph' : null
    if (to == null) {
      if (scene === 'glyph' && (!(await nextStep()) || !live.current)) return
      return void finish()
    }
    if (!(await nextStep()) || !live.current) return
    setScene(to)
  }
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const pending = useNextPending()

  return (
    <Shell
      station="mandarin"
      mood={mood}
      // 上面的進度（T-111，盲測 a35cd5e：念課文的時候看不出有進展）：課文一行一格、選圖一題一格，
      // 大人按「下一行」亮一格，選對一題亮一格；看得出「念到哪裡、還剩多少」
      progress={
        t && scene != null && scene !== 'intro'
          ? { total: t.lines.length + qs.length + (gq ? 1 : 0), done: (typeof scene === 'number' || scene === 'glyph' ? t.lines.length : read) + answered }
          : undefined
      }
      onExit={leaveLesson}
      onHost={() => host.current?.()}
      hintText={scene == null ? undefined : pending ? NEXT_HINT : hintOf(scene, run, talk, typeof scene === 'number' ? qs[scene]?.options.length : undefined, gDemoing)}
    >
      {t && scene != null && (
        <Swap id={typeof scene === 'number' ? `q${scene}` : scene}>
          {scene === 'intro' ? (
            <Intro onStart={start} />
          ) : scene === 'read' ? (
            <Reader t={t} run={run} host={host} goLabel={qs.length ? '去選圖' : gq ? '去找字' : '下課'} onTalk={setTalk} onNext={toQuiz} onLine={onLine} setMood={setMood} />
          ) : scene === 'glyph' ? (
            gq && <Glyph t={t} q={gq} demo={gDemo} host={host} setMood={setMood} onResult={(r) => void saveGlyph(r)} onDemoEnd={() => setGDemoing(false)} onNext={next} />
          ) : (
            <Quiz key={scene} t={t} q={qs[scene]} last={scene + 1 >= qs.length && !gq} host={host} setMood={setMood} onNext={next} />
          )}
        </Swap>
      )}
    </Shell>
  )
}

/** 第一次進中文課：給大人的一張說明（只出現一次） */
function Intro({ onStart }: { onStart: () => void }) {
  const still = useReducedMotion()
  return (
    <div className="zh-intro-wrap">
      <motion.section
        className="zh-intro"
        role="dialog"
        aria-label="親子共讀怎麼上"
        initial={still ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE.out }}
      >
        <div className="zh-talk-tag">給大人・只看這一次</div>
        <h2>念到這行時，請他點亮起來的圖</h2>
        <p className="zh-intro-lead">中文課是親子共讀：App 不出聲，由你念給他聽。他聽你念的時候，點圖就是他的事。</p>
        <ol>
          <li>
            <b>一行一行念</b>：畫面一次亮一行，你指著字念，念完按右下「下一行」。念到的那一行，圖會放大、亮起來，請他點；點了圖會動。
          </li>
          <li>
            <b>同一篇上 3 次</b>：第 2 次念到框起來、標「停」的詞前停一下，等他說出來。
          </li>
          <li>
            <b>念完聊一聊</b>：卡片上有一個問題（誰、什麼、哪裡），問他、等他回答；答不出來，卡片上有一句你可以說給他聽。
          </li>
          <li>
            <b>最後選圖</b>：你念「哪個是〇〇？」讓他點；再請他找出長得一模一樣的字（不用會念）。
          </li>
        </ol>
        <p className="zh-intro-more">每一步要做什麼，右上角的小字都會寫。</p>
        <button type="button" className="zh-go" onPointerDown={onStart}>
          開始念
        </button>
      </motion.section>
    </div>
  )
}

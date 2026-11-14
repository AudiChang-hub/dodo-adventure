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
import { type ZhText } from './data'
import { stepsOf, weight, type Part, type Step } from './steps'
import { doneDays, glyphState, lessonPlan, markDone, markOld, saveGlyph } from './progress'
import { NEXT_HINT, cancelNextStep, nextStep, useNextPending } from '../../ui/NextStep'
import { Reader } from './Reader'
import { Between, Breath, CHEER_BEAT_MS } from './Between'
import { Quiz } from './Quiz'
import { Glyph } from './Glyph'
import { firstFinger } from '../../games/NotYet'
import './chinese.css'

/** 作答紀錄（家長區）用的遊戲 id；技能是 zhtext:<字詞> */
export const ZH_GAME = 'zh-lesson'

/** 大人看過「親子共讀怎麼上」的說明了（只出現一次；家長重置學習進度時跟著清掉，會再出現一次） */
const INTRO_KV = 'zhLesson:introSeen'

/** 主持的恐龍被點了：交給現在這一段（App 不出聲，只有一聲輕的音效或題目卡跳一下） */
export type HostTap = { current: (() => void) | null }

/** 角落的陪玩小字：大人每一步要做什麼（PARENT-1） */
/** 選圖的張數寫成國字（畫面上有幾張就寫幾張：教過的字詞不夠時只有兩張） */
const COUNT = ['零', '一', '兩', '三', '四']

/** 複習上完（Between，T-142）的陪玩小字 */
const BETWEEN_HINT = '複習上完了，今天這樣就算上完！請他點右下角的大箭頭下課。他想聽新的故事，再點旁邊的書；不點也沒關係，新的一篇留到下次，下次直接上。'
/** 喘口氣（T-141）的陪玩小字 */
const BREATH_HINT = '新的一篇要開始了，先跟他一起深呼吸一下，書打開就開始念。'

/** 每一段開頭的小字：大人看得出現在是舊篇、新篇還是小複習 */
const PART_TAG: Record<Part, string> = { old: '複習舊篇・', new: '', review: '最後小複習・' }

/**
 * 角落的陪玩小字。孩子在大人念的時候最常沒事做（AI 小男生盲測 f7c3119：不到 1 分鐘就說好久了），
 * 所以念課文的每一句都先寫「念到這行時請他點亮起來的圖」（T-114：念到哪一行，那一行的圖就亮起來）。
 */
function hintOf(s: Step | 'intro', talk: boolean, demo: boolean, hadOld: boolean): string {
  if (s === 'intro') return '先看一下怎麼上，看完按「開始念」。'
  const tag = PART_TAG[s.part]
  if (s.k === 'glyph')
    return (
      tag +
      (demo && s.demo
        ? '先看手示範一次：找一個跟上面長得一模一樣的字。再讓他自己找，不用念這是什麼字。'
        : '指著上面的字問他：「下面哪一個跟它長得一模一樣？」讓他自己找，不用念這是什麼字。找到了可以說：「你看得好仔細，一模一樣！」')
    )
  if (s.k === 'quiz') return `${tag}念題目給他聽：「哪個是〇〇？」再指著${COUNT[s.q.options.length] ?? s.q.options.length}張有黃框的圖說「點一下」。點錯會有提示，不用幫他點。`
  if (talk) return `${tag}照下面的小字條問他，指著圖等他回答；答不出來就照字條說一次給他聽。右下角的「${s.go}」過幾秒才按得動。`
  // 複習篇孩子翻行（T-144）：他點亮的圖就翻下一行（Reader 的 childTurns）
  if (s.part === 'old') return '他聽過這篇了：你念這一行，他點亮的圖就翻下一行（你也可以按下一行）'
  return `${hadOld ? '新的一篇：' : ''}念到這行時，請他點亮起來的圖（點了圖會動、不出聲）。指著字一行一行念，念完一行按右下「下一行」。`
}

/**
 * 中文課的一堂（親子共讀，2026-11-03：App 不出聲，大人念給孩子聽）。先複習、新篇是提議（T-136、T-142，規則在 course.ts）：
 * 第一次進來先給大人一張說明 → 舊篇（複習：3 次前上的那篇，跟原本的課一樣完整；右上角大人可以跳過）
 * → 複習上完：慶祝、下課的大箭頭（點了就 onDone，今天上完），旁邊一本不搶眼的書，孩子主動點了才上新篇
 * → 新篇（念課文 → 聊一聊 → 選圖每個紅字一題 → 找一樣的字）→ 結尾小複習（前 1 次、前 7 次上的各一題）→ 上完叫 onDone。
 * 前 3 次沒有舊篇、小複習那一次還沒有就略過。這一次課的複習做過了（progress.ts 的 markOld），再進來直接上新篇。
 * 兩段之間、每一題之間都是原地淡入淡出（ui/Scenes 的 Swap），沒有打斷課程的整頁卡片。
 */
export function ChineseLessonBody({ onDone }: LessonProps) {
  const [t, setT] = useState<ZhText | null>(null)
  const [old, setOld] = useState<ZhText | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  /** 現在在第幾步（intro：給大人的說明） */
  const [at, setAt] = useState<number | 'intro' | null>(null)
  /** 示範還在進行（陪玩小字寫「先看手示範」；示範完換平常那句） */
  const [gDemoing, setGDemoing] = useState(true)
  const [talk, setTalk] = useState(false)
  /** 課文念完幾行（上面的進度：念課文、選圖在同一排，T-111） */
  const [read, setRead] = useState(0)
  const onLine = useCallback((n: number) => setRead(n), [])
  const [mood, setMood] = useState<Mood>('idle')
  const host: HostTap = useRef(null)
  const taught = useRef(false)
  const skipLock = useRef(0)
  /** 複習上完的畫面（T-142：下課的大箭頭、旁邊一本「再一篇」的書）；點書要去的那一步 */
  const [between, setBetween] = useState<number | null>(null)
  /** 孩子點了「再一篇」的書（下課的大箭頭不再算） */
  const offered = useRef(false)
  /** 新的一篇開始前喘口氣（T-141）：喘完要去的那一步、是不是大人跳過舊篇來的 */
  const [breath, setBreath] = useState<{ i: number; skipped: boolean } | null>(null)

  useEffect(() => {
    let off = false
    void Promise.all([lessonPlan(), doneDays(), getKV<boolean>(INTRO_KV, false), glyphState()]).then(([p, done, seen, g]) => {
      if (off) return
      const o = p.oldDone ? null : p.old
      setT(p.t)
      setOld(o)
      setSteps(stepsOf({ ...p, old: o }, done, g))
      setAt(seen ? 0 : 'intro')
    })
    return () => {
      off = true
      stopSpeech()
    }
  }, [])

  const start = () => {
    sfx.tap()
    void setKV(INTRO_KV, true)
    setAt(0)
  }

  /** 上完：完成的音效、莫莫歡呼，馬上出下課畫面（T-113：以前最後一題打勾後等 1.5＋0.9 秒，中間畫面沒有新東西，孩子按返回） */
  const finish = async () => {
    if (!t) return
    setMood('cheer')
    sfx.done()
    await Promise.all([markDone(t.day), new Promise((r) => window.setTimeout(r, 350))])
    onDone()
  }

  /** 換到第 i 步（沒有了就下課）；舊篇走完了記下來（今天再進來直接上新篇） */
  const enter = (i: number, skipped = false) => {
    const cur = typeof at === 'number' ? steps[at] : undefined
    if (old && cur?.part === 'old' && steps[i]?.part !== 'old') void markOld(old.day, skipped)
    if (i >= steps.length) return void finish()
    setTalk(false)
    setRead(0)
    setAt(i)
  }

  /** 大人跳過舊篇（他累了）：直接上新篇。連點、兩根手指只算一下 */
  const skipOld = (e: React.PointerEvent) => {
    if (!firstFinger(e.nativeEvent) || typeof at !== 'number' || steps[at]?.part !== 'old') return
    const now = performance.now()
    if (now < skipLock.current) return
    skipLock.current = now + 1000
    sfx.tap()
    setMood('idle')
    if (old) void markOld(old.day, true)
    setBreath({ i: steps.findIndex((s) => s.part !== 'old'), skipped: true })
  }

  /** 課文念完：新篇第一次念完時，每個要考的字詞記一筆「教學」（家長區看得到今天教了什麼） */
  const afterRead = (ms: number) => {
    if (typeof at !== 'number') return
    const s = steps[at]
    if (s.k === 'read' && s.part === 'new' && !taught.current) {
      taught.current = true
      for (const q of s.qs) void logTeach({ station: 'mandarin', game: ZH_GAME, itemId: `${s.t.day}:${q.word}`, skill: `zhtext:${q.word}`, level: 1, ms })
    }
    enter(at + 1)
  }

  /**
   * 答完一題：停在答對的樣子（打勾、星星），等孩子點「下一步」的大箭頭才換題（T-118，家長：選圖答對之後換題要等他點）。
   * 這一堂最後一步是選圖的話，答完直接慶祝、到下課的晚安道別（T-113）。
   * 找一樣的字答完：停在兩個字配成一對、大打勾的樣子，也等孩子點「下一步」才往下（T-123，盲測 ca0d1e1 中文 seed 3：
   * 以前 0.8 秒就自己換到下課，孩子還在找勾勾，「我一直點都一樣」就離開）。
   */
  const next = async () => {
    if (typeof at !== 'number') return
    setMood('idle')
    const i = at + 1
    if (i >= steps.length && steps[at].k === 'quiz') return enter(i)
    if (old && steps[at].part === 'old' && steps[i]?.part !== 'old') return toNew(i)
    // cue：大箭頭一出來就跳一下、手點一下給他看（T-139，以前 2.5 秒手才來）
    if (!(await nextStep({ cue: true })) || !live.current) return
    enter(i)
  }
  /**
   * 複習（舊篇）上完（T-142，家長 2026-11-12：第二篇改成提議；盲測 9231aa6：孩子舊篇撐得完，接著上新篇就離開，連兩版都這樣）：
   * 莫莫歡呼、完成的音效，換到複習上完的畫面（./Between.tsx：舊篇的書打勾）；慶祝一拍後右下角出現下課的大箭頭（手指著它；T-146 手不再先去指新書），
   * 點了就下課、晚安，今天就算上完——新篇不消耗（markDone 不叫），這一次課的複習記下來，下次進來直接上新篇（course.ts 的 reviewDone）。
   * 旁邊一本小一點的新書：孩子主動點了才上新篇（more）。
   */
  const toNew = async (i: number) => {
    if (old) void markOld(old.day, false)
    setMood('cheer')
    sfx.done()
    setBetween(i)
    await new Promise((r) => window.setTimeout(r, CHEER_BEAT_MS))
    if (!live.current || offered.current) return
    if (!(await nextStep({ cue: true })) || !live.current || offered.current) return
    setMood('idle')
    onDone()
  }
  const more = () => {
    if (between == null || offered.current) return
    offered.current = true
    cancelNextStep()
    setMood('happy')
    const i = between
    setBetween(null)
    setBreath({ i, skipped: false })
  }
  /** 喘完口氣：開始念新的一篇（上面的進度在喘口氣時收起來，新篇從空的一排重新開始，T-141） */
  const breathed = () => {
    if (!breath) return
    const { i, skipped } = breath
    setMood('idle')
    setBreath(null)
    enter(i, skipped)
  }
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const pending = useNextPending()
  const s = typeof at === 'number' ? steps[at] : undefined
  // 進度分兩段算（舊篇一段；新篇＋小複習一段）：一起排的話十幾格，上面那排會長到碰到右上角的陪玩小字
  const group = (x: Step) => x.part === 'old'
  const same = s ? steps.filter((x) => group(x) === group(s)) : []
  const total = same.reduce((n, x) => n + weight(x), 0)
  const before = s ? same.slice(0, same.indexOf(s)).reduce((n, x) => n + weight(x), 0) : 0

  return (
    <Shell
      station="mandarin"
      mood={mood}
      // 上面的進度（T-111，盲測 a35cd5e：念課文的時候看不出有進展）：課文一行一格、選圖一題一格，
      // 大人按「下一行」亮一格，選對一題亮一格；看得出「念到哪裡、還剩多少」（舊篇一排；新篇和小複習一排）。
      // 喘口氣時收起來（T-141，盲測 c9bb003：以前舊篇的星星留在新篇那一排，新篇一開始就幾乎滿了，孩子點了也看不出進度）
      progress={s && !breath ? { total, done: between != null ? total : before + (s.k === 'read' ? read : 0) } : undefined}
      onExit={leaveLesson}
      onHost={() => host.current?.()}
      hintText={at == null ? undefined : breath ? BREATH_HINT : between != null ? BETWEEN_HINT : pending ? NEXT_HINT : hintOf(s ?? 'intro', talk, gDemoing, !!old)}
    >
      {t && at != null && (
        <Swap id={breath ? 'breath' : between != null ? 'between' : typeof at === 'number' ? `s${at}` : at}>
          {breath ? (
            <Breath t={t} onDone={breathed} />
          ) : between != null && old ? (
            <Between old={old} t={t} onMore={more} />
          ) : at === 'intro' || !s ? (
            <Intro onStart={start} />
          ) : s.k === 'read' ? (
            <Reader t={s.t} host={host} goLabel={s.go} onTalk={setTalk} onNext={afterRead} onLine={onLine} setMood={setMood} childTurns={s.part === 'old'} />
          ) : s.k === 'glyph' ? (
            <Glyph t={s.t} q={s.q} demo={s.demo} host={host} setMood={setMood} onResult={(r) => void saveGlyph(r)} onDemoEnd={() => setGDemoing(false)} onNext={next} />
          ) : (
            <Quiz key={at} t={s.t} q={s.q} last={at + 1 >= steps.length} first={s.first} host={host} setMood={setMood} onNext={next} />
          )}
        </Swap>
      )}
      {/* 跳過舊篇（T-136）：大人用的，放在右上角陪玩小字下面（孩子點的課本、圖、右下角的大箭頭以外），淡淡的底線字、不像要按的大按鈕 */}
      {s?.part === 'old' && !pending && between == null && !breath && (
        <button type="button" className="zh-skip-old" onPointerDown={skipOld}>
          跳過舊篇
        </button>
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
            <b>先複習，新的看他要不要</b>：先複習 3 次前上的那篇（跟第一次上的一樣），上完就下課。他還想聽，再點旁邊的書上新的一篇；不點的話，下次直接上新的。
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

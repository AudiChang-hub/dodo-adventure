import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Dino } from '../../art/Dino'
import { BackButton } from '../../ui/Back'
import { HomeIcon } from '../../games/Shell'
import { Sparkles } from '../../ui/Sparkles'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../../games/lines'
import type { LessonProps } from '../types'
import { lexWord, wordKey } from '../../content/lexicon'
import { lessonLetter, type LessonLetter } from './data'
import { lessonGood, loadProgress, markDone, markStage, markStarted, planFor, type QuizResult, type TodayPlan } from './plan'
import { NEXT_HINT, nextStep, useNextPending } from '../../ui/NextStep'
import { Meet } from './Meet'
import { LESSON_RETRIES, Trace, type RetryBudget } from './Trace'
import { WriteChoice } from './WriteChoice'
import { BubbleParty } from './Bubbles'
import { Play, type PlayView } from './Play'
import { byeTip, wordTip } from './coplay'
import { Words } from './Words'
import { Quiz } from './Quiz'
import { makeQuiz, type Question } from './quiz-plan'
import { loadFormats } from '../formats'
import { resumeEnd } from '../resume-end'
import { getTodayWorld } from '../../lib/today-world'
import { pickVariety } from '../../lib/variety'
import { Scene } from '../../art/storybook/scenes'
import { PAGE_H, PAGE_W } from '../../art/storybook/layout'
import { QUIZ_LOOKS, forcedLook, type QuizLook } from './QuizParts'
import '../../games/coplay.css'
import './english.css'
import './abc.css'

/** party：遊戲回合做完的泡泡派對（慶祝，不寫進度）；abc：今天上完再進來的字母遊戲時間（T-147） */
type Stage = 'meet' | 'trace' | 'words' | 'write' | 'quiz' | 'party' | 'end' | 'abc'
/**
 * 一堂的段落（T-147 英文門案 A：認字母 → 描大寫、小寫 → 2 個代表字 → 寫寫看 → 泡泡或餵豆豆的遊戲回合＋泡泡派對）。
 * 寫寫看（T-112）保留：家長 2026-11-14「描英文字是很重要的練習」，描字的段落都不拿掉
 */
const STEPS: Stage[] = ['meet', 'trace', 'words', 'write', 'quiz']

/** 給大人看的一行陪玩小字（A10，角落、不收點擊；跟數學課的 HINT、中文課的 parentTip 一樣） */
/** 一個字的中文（陪玩小字用；單字表沒有就只寫英文） */
const zhOf = (w: string) => lexWord(wordKey(w))?.zh?.replace(/\s+/g, '')
const said = (w?: string) => (w ? (zhOf(w) ? `${zhOf(w)}（${w}）` : w) : '豆豆說的那個東西')

function hintOf(stage: Stage, x: LessonLetter, q?: Question, look: QuizLook = 'cards', pv?: PlayView | null) {
  const zh = zhOf(x.words[0].w)
  switch (stage) {
    case 'meet':
      return `跟他一起用手指在空中寫 ${x.L}`
    case 'trace':
      return '請他從綠點開始，沿著發亮的路描到星星；描歪沒關係'
    case 'words':
      // 不問「家裡有沒有」：第一個字可能是 snake、volcano 這種家裡沒有的（AI 小男生測試 2026-11-02）
      // 實際上單字那一段用 coplay.ts 的 wordTip（T-149 E3）；這一句只是備用。不問「還有什麼是 A 開頭的」（家長 2026-11-14）
      return zh ? `跟他一起說：${zh}、${x.words[0].w}` : `跟他一起說：${x.words[0].w}`
    case 'write':
      return `換他自己寫：從綠點開始描一次大的 ${x.L}；描歪沒關係，不用重來`
    case 'party':
      return `泡泡派對：讓他點破泡泡，每點一顆豆豆念一次 ${x.L}；不計分`
    case 'abc':
      if (pv?.part === 'pair') return `聽字找圖：請他把${said(pv.w)}拖進籃子（點一下也可以）`
      if (pv?.part === 'flip') return '翻翻卡：請他一次翻兩張，找出兩張一樣的圖；翻開時跟他一起說出英文'
      return '字母牆：讓他點學過的字母，跟著豆豆念；不計分'
    case 'quiz':
      // 每一題直接寫「現在請他點哪一個」（T-107 真人試玩：大人聽完英文也不知道這一段要做什麼）
      // 今天的玩法（T-127）：點卡片、點泡泡、把卡片拖給豆豆吃（點一下也算餵）
      if (look === 'feed') {
        if (q?.kind === 'big') return `餵豆豆：請他把大的 ${q.L} 拖給豆豆吃（點一下也可以）`
        if (q?.kind === 'little') return `餵豆豆：請他把小的 ${q.L.toLowerCase()} 拖給豆豆吃（點一下也可以）`
        if (q?.kind === 'word') return `餵豆豆：請他把${said(q.word)}拖給豆豆吃（點一下也可以）`
      }
      if (look === 'bubbles') {
        if (q?.kind === 'big') return `點泡泡：請他點大的 ${q.L}（大泡泡）`
        if (q?.kind === 'little') return `點泡泡：請他點小的 ${q.L.toLowerCase()}（小泡泡）`
        if (q?.kind === 'word') return `點泡泡：請他點${said(q.word)}`
      }
      if (q?.kind === 'big') return `找字母：請他點大的 ${q.L}（大卡片）`
      if (q?.kind === 'little') return `找字母：請他點小的 ${q.L.toLowerCase()}（小卡片）`
      if (q?.kind === 'word') return `找圖：請他點${said(q.word)}`
      return '找字母：請他點豆豆頭上泡泡裡亮的那一個'
    default:
      return `今天的字母是 ${x.L}、${x.l}`
  }
}

/**
 * 英文字母課（豆豆）：照學校的順序，一堂約 3.5～5 分鐘（T-147 英文門案 A，老師建議：字母＋簡單單字、從遊戲中學）。
 * 認字母 → 描字（大寫、小寫各一次）→ 單字範例（2 個代表字，中文三明治）→ 寫寫看（自己再描一次大寫，T-112）→ 遊戲回合（泡泡或餵豆豆每天輪，第一天 2 回合、之後 3 回合）
 * → 泡泡派對（約 10 秒，點破今天字母的泡泡）→ 上完（下課畫面、不定時的貼紙由 LessonScreen 處理）。
 * 一天一個新字母（名字的字母先、再 A→Z）；字母題錯很多就隔天重上（./plan.ts）。
 * 今天上完再進來：字母遊戲時間（./Play.tsx：字母牆＋放進籃子（聽字找圖）或翻翻卡，只用學過的字母和教過的字），不再從頭複習今天的字母。
 * 右上角一行給大人的陪玩小字（hintOf）。
 * 段落之間在原地淡入淡出，不縮放、不跳整頁卡片；下面五顆小石頭是進度。左上角返回鍵回首頁（中途離開隔天重上同一個字母）。
 * 每一段、每一輪描字、每一題做完都停在做完的樣子，右下角出「下一步」的大箭頭，孩子點了才往下（T-118，ui/NextStep）；
 * 最後一題答對直接慶祝、到下課的晚安道別（LessonScreen）。
 * 同一天中途離開又回來：從離開的那一段接著上，做過的段落石頭已經亮著，描字大寫描過了就只描小寫（T-95；./plan.ts 的 markStage）。
 * 題目都做完、還沒跟恐龍說完晚安就離開：同一天回來直接回到晚安道別（T-122），這一堂不再算一次、不會變成挑貼紙（T-125）。
 */
/** 這一題算不算「聽完才答、一次就對」（舊的進度沒有 heard，當作聽完了） */
const earnedBy = (r: QuizResult | undefined) => !!r && r.first && r.heard !== false

export function EnglishLesson({ onDone }: LessonProps) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [stage, setStage] = useState<Stage>('meet')
  /** 描字從第幾輪開始（同一天回來接著上） */
  const [traceFrom, setTraceFrom] = useState(0)
  /** 選擇題：同一天回來從第幾題接著問、前面答完的（T-104） */
  const [quizAt, setQuizAt] = useState<{ from: number; answers: QuizResult[]; replay: boolean }>({ from: 0, answers: [], replay: false })
  /** 選擇題答完幾題（最後一顆石頭裡的小點） */
  const [quizDone, setQuizDone] = useState(0)
  /** 哪幾題是聽完才答、一次就對（這幾顆小點多一顆小星星，T-109；答完的都會填滿，T-124） */
  const [earned, setEarned] = useState<boolean[]>([])
  /** 答對一題：豆豆歡呼一下 */
  const [cheer, setCheer] = useState(0)
  /** 選擇題今天的玩法（T-127：找卡片、泡泡、餵豆豆每天輪流，連續兩天不一樣；同一天沿用） */
  const [look, setLook] = useState<QuizLook>('cards')
  /** 今天的世界（T-127）：背景換成這個世界的場景；選擇題的時候看得更清楚，選項站在世界裡 */
  const [world] = useState(() => getTodayWorld())
  /** 下課畫面出來了：左下角的豆豆收起來，畫面上只有下課畫面中間那一隻（T-141） */
  const [bye, setBye] = useState(false)
  /** 上完：交給 LessonScreen 放下課畫面 */
  const toBye = () => {
    setBye(true)
    onDone()
  }
  const qs = useRef<Question[]>([])
  const live = useRef(true)
  /** 描字、寫寫看共用的重描次數（T-122 整堂最多一次；T-125 起 0 次：沒描好就由筆帶著描完） */
  const retry = useRef<RetryBudget>({ left: LESSON_RETRIES })
  /** 字母遊戲時間現在在哪一段（小石頭、陪玩小字） */
  const [pv, setPv] = useState<PlayView | null>(null)
  /** 單字那一段正在念第幾個字（陪玩小字跟著換，T-149 E3） */
  const [wordAt, setWordAt] = useState(0)

  useEffect(() => {
    live.current = true
    void Promise.all([loadProgress(), loadFormats(), forcedLook() ?? pickVariety('english', QUIZ_LOOKS).catch(() => 'cards' as const)]).then(async ([p, , lk]) => {
      const pl = planFor(p)
      setLook(lk)
      // 中途離開、回來接著做選擇題：題目照舊，大寫、小寫都留著（T-124：以前小寫題改問大寫，同一個大 S 問兩次，「一直點都一樣」）
      qs.current = makeQuiz(lessonLetter(pl.idx, pl.seq), pl.idx, pl.seq)
      if (pl.review && pl.resume?.stage !== 'end') {
        // 今天上完了又進來（T-147）：字母遊戲時間。不寫 lesson.english（不影響隔天重不重上），進度另外記在 lesson.english.play
        setStage('abc')
        setPlan(pl)
        return
      }
      await markStarted(pl)
      if (!live.current) return
      if (pl.resume?.stage === 'end') {
        // 上完了、還沒說完晚安就離開（T-122）：停在今天的字母上一下，直接回到晚安道別（不重說 You did it!、不重上）
        setStage('end')
        setPlan(pl)
        sfx.pop()
        await wait(900)
        if (!live.current) return
        // 上完時已經算過一堂：不再算一次，不會因為貼紙的間隔剛好到了直接變成挑貼紙（T-125，盲測 0f3363f 英文 seed 2）
        resumeEnd()
        toBye()
        return
      }
      if (pl.resume) {
        setStage(pl.resume.stage)
        setTraceFrom(pl.resume.round)
        if (pl.resume.stage === 'quiz') {
          const from = Math.min(pl.resume.round, qs.current.length - 1)
          setQuizAt({ from, answers: (pl.resume.answers ?? []).slice(0, from), replay: true })
          setQuizDone(from)
          setEarned((pl.resume.answers ?? []).slice(0, from).map(earnedBy))
        }
      }
      setPlan(pl)
    })
    return () => {
      live.current = false
      stopSpeech()
    }
  }, [])

  /** 這一段做完了、正在等「下一步」（同一段不會等兩次） */
  const waiting = useRef<Stage | null>(null)
  /**
   * 這一段做完：先記下來（中途離開，同一天回來從下一段接著上），畫面停在做完的樣子，
   * 等孩子點「下一步」的大箭頭才換到下一段（T-118，家長：每一段都要自己點下一步，不自己換頁）
   */
  const next = async (s: Exclude<Stage, 'end' | 'party' | 'abc'>) => {
    if (waiting.current === s) return
    waiting.current = s
    if (plan) void markStage(plan, s)
    const ok = await nextStep()
    waiting.current = null
    if (ok && live.current) setStage(s)
  }
  const pending = useNextPending()

  /**
   * 上完：換成慶祝（大字母、星星、完成的音效），You did it! 一開口就出下課畫面（記好上完就出，不再等 1.1 秒）。
   * T-113：以前念完再等 0.5 秒，打勾到下課 4.5 秒。T-143（盲測 9231aa6）：還要等 1.1 秒，答對到看得出要點恐龍約 2.6 秒，
   * 孩子看到「恐龍笑笑、You did it」以為結束了就按返回（5 次 2 次）。You did it! 照樣說完（LessonBye 等它說完才請他點恐龍）
   */
  const finish = async (rs: QuizResult[]) => {
    if (!plan) return
    // 先記上完（T-147：派對的時候離開，同一天回來直接回到晚安道別，跟 T-122 一樣），再開泡泡派對
    await markDone(plan, lessonGood(rs))
    if (live.current) setStage('party')
  }
  /** 泡泡派對完：You did it! 一開口就出下課畫面（T-143） */
  const partyDone = () => {
    if (!live.current) return
    setStage('end')
    sfx.done()
    void say('le.en.done')
    toBye()
  }
  /** 字母遊戲時間玩完：一樣 You did it!、下課畫面（晚安道別、不定時的貼紙） */
  const playDone = () => {
    if (!live.current) return
    sfx.done()
    void say('le.en.done')
    toBye()
  }

  /** 選擇題又答完一題：聽完才答、一次就對的小點亮一顆、豆豆歡呼一下（其他的只留一圈淡框），記下來（中途離開，回來從下一題接著問） */
  const progress = (n: number, rs: QuizResult[]) => {
    setQuizDone(n)
    setEarned(rs.map(earnedBy))
    // 豆豆歡呼只給聽完才答、一次就對的（T-109）
    if (earnedBy(rs[rs.length - 1])) setCheer((c) => c + 1)
    if (plan && n < qs.current.length) void markStage(plan, 'quiz', n, rs)
  }

  useEffect(() => {
    if (!cheer) return
    const t = setTimeout(() => live.current && setCheer(0), 1400)
    return () => clearTimeout(t)
  }, [cheer])

  const letter = plan ? lessonLetter(plan.idx, plan.seq) : null
  /** 派對算在遊戲回合那一顆石頭裡（石頭全亮） */
  const at = stage === 'party' ? STEPS.length : STEPS.indexOf(stage)

  return (
    <div
      className={`screen en-lesson${world ? ' has-world' : ''}`}
      data-phase={stage}
      data-look={look}
      data-world={world?.id}
      data-abc={stage === 'abc' ? (pv?.part ?? 'wall') : undefined}
    >
      {world && (
        // 今天的世界（T-127）：故事插畫的場景，淡淡的鋪在後面（紙感螢幕，不搶字母）
        <svg className="en-world" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <Scene id={world.scene} />
        </svg>
      )}
      <div className="en-back">
        <BackButton label="回首頁">
          <HomeIcon />
        </BackButton>
      </div>
      {/* 進度：五顆小石頭（認字母、描字、單字、寫寫看、遊戲回合），走過的變成今天的字母；遊戲回合那一顆拉長，一回合一顆小點（T-104）。
          字母遊戲時間：兩顆（字母牆、配對遊戲），配對遊戲那一顆一回合一顆小點 */}
      <div className="en-steps" aria-hidden="true">
        {stage === 'abc' ? (
          <>
            <span className={pv && pv.part !== 'wall' ? 'is-done' : 'is-now'}>{pv && pv.part !== 'wall' && letter ? letter.l : ''}</span>
            {pv?.game &&
              (pv.part === 'pair' || pv.part === 'flip' ? (
                <span className="is-now is-quiz" data-done={pv.done} data-total={pv.total}>
                  {Array.from({ length: pv.total }, (_, j) => (
                    <i key={j} className={j < pv.done ? 'on' : undefined} />
                  ))}
                </span>
              ) : (
                <span className={pv.part === 'end' ? 'is-done' : ''}>{pv.part === 'end' && letter ? letter.l : ''}</span>
              ))}
          </>
        ) : STEPS.map((s, i) =>
          s === 'quiz' && stage === 'quiz' ? (
            <span key={s} className="is-now is-quiz" data-done={quizDone} data-total={qs.current.length}>
              {qs.current.map((_, j) => (
                // 答完一題就填滿、跳一下（T-124：每點對一題都看得到往前走）；聽完才答、一次就對的多一顆小星星（T-109 的分別留著）
                <i key={j} className={j < quizDone ? (earned[j] ? 'on is-star' : 'on') : undefined} />
              ))}
            </span>
          ) : (
            <span key={s} className={i < at || stage === 'end' ? 'is-done' : i === at ? 'is-now' : ''}>
              {(i < at || stage === 'end') && letter ? letter.l : ''}
            </span>
          ),
        )}
      </div>
      {letter && (
        <p className="coplay-hint en-coplay" aria-hidden="true">
          <span className="coplay-tag">陪玩</span>
          {pending ? NEXT_HINT : stage === 'words' ? wordTip(letter, wordAt) : hintOf(stage, letter, qs.current[Math.min(quizDone, qs.current.length - 1)], look, pv)}
        </p>
      )}
      {/* 下課時給大人一句「今天在家可以做的事」（T-149 C1）：下課畫面蓋在課上面（.cheer-scrim、挑貼紙），所以放到 body 最上層；
          英文課自己的檔，不動共用的 LessonBye。中文小字、不念、不收點擊 */}
      {bye &&
        letter &&
        createPortal(
          <p className="coplay-hint en-bye-tip" aria-hidden="true">
            <span className="coplay-tag">今天在家</span>
            {byeTip(letter)}
          </p>,
          document.body,
        )}
      {/* 下課畫面出來就收起來（T-141：盲測 c9bb003 英文 2，孩子點了淡淡的這一隻，是空白處、沒有反應） */}
      <div className={`en-host${bye ? ' is-away' : ''}`} aria-hidden="true">
        <Dino who="dodo" mood={stage === 'end' || cheer ? 'cheer' : 'happy'} size="100%" />
      </div>
      <div className="en-stage">
        {/* 一段淡出、下一段再淡入（紙感螢幕上兩段疊在一起看起來很亂，不交叉淡化） */}
        <AnimatePresence initial={false} mode="wait">
          {letter && (
            <motion.div
              key={stage}
              className="en-pane"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
            >
              {stage === 'meet' && <Meet letter={letter} review={plan!.review} repeat={plan!.repeat} onDone={() => void next('trace')} />}
              {stage === 'trace' && <Trace letter={letter} from={traceFrom} retry={retry.current} onRound={(i) => i > 0 && void markStage(plan!, 'trace', i)} onDone={() => void next('words')} />}
              {stage === 'words' && <Words letter={letter} onLit={setWordAt} onDone={() => void next('write')} />}
              {stage === 'write' && <WriteChoice letter={letter} retry={retry.current} onDone={() => void next('quiz')} />}
              {stage === 'quiz' && (
                <Quiz qs={qs.current} look={look} from={quizAt.from} answers={quizAt.answers} replay={quizAt.replay} onProgress={progress} onDone={(rs) => void finish(rs)} />
              )}
              {stage === 'party' && <BubbleParty letter={letter} onDone={partyDone} />}
              {stage === 'abc' && plan && <Play plan={plan} onView={setPv} onDone={playDone} />}
              {stage === 'end' && (
                <div className="en-end">
                  <span className="en-letter is-big is-lit">{letter.L}</span>
                  <span className="en-letter is-little is-lit">{letter.l}</span>
                  <div className="en-end-spark">
                    <Sparkles count={18} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

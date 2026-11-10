import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Dino } from '../art/Dino'
import { BackButton } from '../ui/Back'
import { StoryPic } from '../ui/StoryPic'
import { Scenes, Swap, type SceneMove } from '../ui/Scenes'
import { useBack } from '../lib/nav'
import { HomeIcon } from '../games/Shell'
import { motion, useAnimate } from 'motion/react'
import { audioClock, onSpeech, say, sfx, stopSpeech } from '../lib/audio'
import { REPEAT, finishTold, saveToldAt, storyState, todaysStory, toldAt, toldChapters, toldTimes, type ToldChapter } from '../lib/story'
import { Emoji } from '../art/Emoji'
import { Sparkles } from '../ui/Sparkles'
import { arcOf, chapterLook, chapterOf, type Pic } from '../content/story'
import { theme as themeDef, type ThemeId } from '../content/themes'
import { line, hasLine, type Speaker } from '../content/lines'
import { wait } from '../games/lines'
import { holdBedtime } from '../lib/session'
import { StoryPage, type PageMotion } from '../art/storybook/Page'
import { hopTimes, type PageArt } from '../art/storybook/layout'
import { flowOf, modeOfDay, peekOf, type ActStop, type LookAsk, type Mode, type StoryFlow, type TellPick } from '../content/story/flow'
import { STORY_NOUNS, storyNounKey } from '../content/story/words'
import { bridgeKey } from '../content/zh-words'
import { storyWhereKey, storyNextKey, storyWordKey } from '../content/lines-story'
import { zhClipReady } from '../lib/words'
import { ActWait } from './story/Act'
import { AskCard, Choose, TellCard } from './story/Tell'
import './story.css'

/** 一頁幾本書（平板 3×2；手機直式 2×3，一樣 6 本） */
const PER_PAGE = 6
/** 書的封面：標題、圖、書背的顏色。孩子端不出現科目分類，只有故事 */
function coverOf(r: ToldChapter): { title: string; pic: Pic; spine: string } {
  const ch = chapterOf(r.ref)
  const door = themeDef(r.door ?? ch?.door)
  if (ch?.kind === 'epic') {
    const arc = arcOf(ch.arc)
    return { title: arc?.title ?? '', pic: r.script.find((b) => b.pic)?.pic ?? arc?.icon ?? 'open-book', spine: '#E8907E' }
  }
  if (ch?.kind === 'classic') return { title: ch.look?.title ?? '', pic: ch.look?.stops[0] ?? 'open-book', spine: ch.look?.deep ?? '#A8875A' }
  return { title: door?.title ?? '', pic: door?.icon ?? 'open-book', spine: door?.deep ?? '#C9A57E' }
}

/** 正在講的那一本：isNew 是今天的新章節（講完才收進書架，中途離開下次接著講）；mode 是今天的玩法（第 1 天看、第 2 天一起演、第 3 天你來說） */
interface Open {
  r: ToldChapter
  isNew: boolean
  mode: Mode
}

/** 一章的會動繪本（頁、動作、三明治、停頓點、選圖）：同一筆紀錄只算一次 */
const flows = new WeakMap<ToldChapter, StoryFlow>()
function flowFor(r: ToldChapter): StoryFlow {
  let f = flows.get(r)
  if (!f) {
    const ch = chapterOf(r.ref)
    const look = ch ? chapterLook(ch, r.door as ThemeId | undefined) : null
    const texts = r.script.map((b) => (hasLine(b.k) ? line(b.k).text : ''))
    // 三明治只念中文音檔產生好了的名詞（還沒產生的照舊只念英文句子）
    f = flowOf(ch, r.script, texts, look?.scene, coverOf(r).pic, (id) => !!STORY_NOUNS[id] && zhClipReady(STORY_NOUNS[id].zh))
    flows.set(r, f)
  }
  return f
}
const hostOf = (r: ToldChapter): Speaker => {
  const ch = chapterOf(r.ref)
  return (ch ? chapterLook(ch, r.door as ThemeId | undefined)?.host : null) ?? 'momo'
}

/** 正在等他做的事：第 2 天點角色（act）、第 3 天選下一頁（tell）、第 1 天最後的問題（ask） */
type Wait = { kind: 'act'; stop: ActStop } | { kind: 'tell'; pick: TellPick } | { kind: 'ask'; ask: LookAsk; key: string }

/** 這一句的動作：哪一句、什麼時候開始（null 還沒開始）、是不是第 2 天探出頭等他點 */
interface Motion {
  beat: number
  go: number | null
  peek: boolean
}

/**
 * 我的故事書（T-77：像學校的故事時間）：
 * - 點進來，今天有還沒講完的新章節就先講（lib/story.ts 的 todaysStory）；講完有「讀完了」，可以再聽一次或回書架，這一本收進書架。
 * - 中途按返回：回書架，新章節的書在最前面亮著；下次進來（或點那本書）從離開的那一句接著講，講到最後才算講完。
 * - 書架：講過的書有一顆星；點一本就重聽。
 * - 會動的繪本（T-127）：一頁 1～3 句、一章最多 6 頁；每一句只有說到的那個角色做一個慢慢的大動作（content/story/flow.ts）。
 *   每句的主角名詞第一次出現時，念完那一句接著念三明治（Rabbit. → 兔子 → Rabbit.）。
 * - 同一章連講 3 天（lib/story.ts 的 REPEAT）：第 1 天看（念完問一題 Where is the egg?）、第 2 天一起演（./story/Act.tsx）、
 *   第 3 天你來說（./story/Tell.tsx）。書架上的書一圈三格，亮幾格是聽了幾天（不給獎品）。
 * - 念的當下點圖只有輕輕一聲（不放熱點，Takacs 2015），不跳過正在念的這一句。
 * 返回：講故事、讀完了 → 書架；書架 → 首頁。
 */
export function StoryBook() {
  const [rows, setRows] = useState<ToldChapter[] | null>(null)
  const [fresh, setFresh] = useState<ToldChapter | null>(null)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<Open | null>(null)
  const [done, setDone] = useState(false)
  const [at, setAt] = useState(0)
  const [motion, setMotion] = useState<Motion>({ beat: 0, go: null, peek: false })
  const [waiting, setWaiting] = useState<Wait | null>(null)
  const resolveWait = useRef<(() => void) | null>(null)
  const [told, setTold] = useState<Record<string, number>>({})
  const backing = useRef(false)
  const run = useRef(0)

  // 每天的時間到了，不在故事講到一半時換成睡覺畫面（T-118、準則 TIME-2）：在故事書裡就擋著，回首頁才去睡覺畫面。
  // 放著不管超過上限 6 分鐘（lib/session 的 GRACE_MAX_SEC）照舊會結束
  useEffect(() => holdBedtime(), [])

  useEffect(() => {
    let live = true
    void Promise.all([toldChapters(), todaysStory()]).then(async ([r, t]) => {
      if (!live) return
      const st = await storyState()
      if (!live) return
      setTold(st.told ?? {})
      setRows(r)
      setFresh(t)
      if (t) return start({ r: t, isNew: true, mode: modeOf(st.told ?? {}, t) }, await toldAt(t.date))
      void say('story.book.hello')
    })
    return () => {
      live = false
      run.current++
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toShelf = () => {
    run.current++
    stopSpeech()
    backing.current = true
    resolveWait.current = null
    setWaiting(null)
    setDone(false)
    setOpen(null)
  }

  /** 停下來等他做一件事（點角色、選圖），做完（或 30 秒內手幫他做完）才往下；離開了就不再往下 */
  const waitFor = (w: Wait) =>
    new Promise<void>((res) => {
      resolveWait.current = res
      setWaiting(w)
    })
  const waitDone = () => {
    const r = resolveWait.current
    resolveWait.current = null
    setWaiting(null)
    r?.()
  }

  // 返回鍵、Android 的返回：講故事、讀完了先回書架，書架才回首頁
  useBack(() => {
    if (!open) return false
    toShelf()
  })

  const play = async (o: Open, from: number) => {
    const me = ++run.current
    const gone = () => run.current !== me
    const { r } = o
    const f = flowFor(r)
    const host = hostOf(r)
    await wait(500)
    for (let i = from; i < r.script.length; i++) {
      if (gone()) return
      // 第 3 天：新的一頁之前先問 What happens next?，選完才翻到那一頁
      const pick = o.mode === 'tell' ? f.tellPicks.find((t) => t.beat === i) : undefined
      if (pick) {
        await waitFor({ kind: 'tell', pick })
        if (gone()) return
      }
      setAt(i)
      if (o.isNew) void saveToldAt(r.date, i)
      // 第 2 天：這一句之前停下來，換他點那個角色（點了動作才做、才念）
      const stop = o.mode === 'act' ? f.actStops.find((x) => x.beat === i) : undefined
      setMotion({ beat: i, go: null, peek: !!stop })
      if (stop) {
        await wait(400)
        if (gone()) return
        await waitFor({ kind: 'act', stop })
        if (gone()) return
        setMotion({ beat: i, go: 0, peek: true })
        await wait(700)
        if (gone()) return
      }
      const k = r.script[i].k
      if (hasLine(k)) await say(k)
      if (gone()) return
      // 主角名詞第一次出現：念三明治（Rabbit. → 兔子 → Rabbit.）
      const noun = f.sandwiches.get(i)
      if (noun && hasLine(k)) {
        const sp = line(k).speaker
        const head = storyWordKey(sp, noun)
        const br = bridgeKey(storyNounKey(noun), sp)
        if (hasLine(head) && hasLine(br)) {
          await wait(350)
          if (gone()) return
          await say(head, br)
          if (gone()) return
        }
      }
      await wait(450)
    }
    if (gone()) return
    // 第 1 天：念完問一題（Where is the egg?），他點圖回答
    const askKey = f.ask ? storyWhereKey(host, f.ask.noun) : ''
    if (o.mode === 'look' && f.ask && hasLine(askKey)) {
      await wait(300)
      if (gone()) return
      await waitFor({ kind: 'ask', ask: f.ask, key: askKey })
      if (gone()) return
    }
    // 講到最後才算講完：新章節收進書架（書架上的星星）
    if (o.isNew) {
      await finishTold(r)
      const [shelf, st] = await Promise.all([toldChapters(), storyState()])
      if (gone()) return
      setRows(shelf)
      setTold(st.told ?? {})
      setFresh(null)
      setOpen({ r, isNew: false, mode: o.mode })
    }
    sfx.done()
    setDone(true)
  }

  const start = (o: Open, from = 0) => {
    backing.current = false
    setDone(false)
    resolveWait.current = null
    setWaiting(null)
    const at0 = Math.min(from, Math.max(0, o.r.script.length - 1))
    setAt(at0)
    setMotion({ beat: at0, go: null, peek: false })
    setOpen(o)
    void play(o, from)
  }

  const pickBook = (o: Open) => {
    sfx.pop()
    if (!o.isNew) return start(o)
    void toldAt(o.r.date).then((from) => start(o, from))
  }

  // 書架上的書：今天的新書照今天是第幾天決定玩法；聽過的書重聽一律「看」
  const books: Open[] = [...(fresh ? [{ r: fresh, isNew: true, mode: modeOf(told, fresh) }] : []), ...(rows ?? []).map((r) => ({ r, isNew: false, mode: 'look' as Mode }))]
  const pages = Math.max(1, Math.ceil(books.length / PER_PAGE))
  const shown = books.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  const turn = (d: number) => {
    sfx.tap()
    setPage((p) => Math.min(pages - 1, Math.max(0, p + d)))
  }

  const move = (): SceneMove => ({ back: backing.current })
  const id = !open ? 'shelf' : done ? `done-${open.r.id}` : `replay-${open.r.id}`

  return (
    <div className="screen book-screen">
      <Scenes id={id} move={move} className="scene is-clear">
        {open && done ? (
          <BookDone r={open.r} onAgain={() => pickBook({ r: open.r, isNew: false, mode: 'look' })} onShelf={toShelf} />
        ) : open ? (
          <Replay r={open.r} at={at} motion={motion} setMotion={setMotion} waiting={waiting} onWaitDone={waitDone} onClose={toShelf} />
        ) : (
          <Shelf ready={rows != null} shown={shown} told={told} page={page} pages={pages} onPick={pickBook} onTurn={turn} />
        )}
      </Scenes>
    </div>
  )
}

/** 今天的新章節是第幾天：講完過幾天再加 1（最多 REPEAT） */
const modeOf = (told: Record<string, number>, r: ToldChapter): Mode => modeOfDay(Math.min(REPEAT, toldTimes({ told }, r.ref) + 1))

/**
 * 返回鍵：每一段（書架、重聽）都放在自己那一層裡，位置一樣（NAV-1）。
 * 重聽 → 書架（畫成書架）；書架 → 首頁。
 */
function BookBack({ onClose }: { onClose?: () => void }) {
  if (!onClose)
    return (
      <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 6 }}>
        <BackButton label="回首頁">
          <HomeIcon />
        </BackButton>
      </div>
    )
  return (
    <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 6 }}>
      <BackButton label="回書架" onTap={onClose}>
        <ShelfIcon />
      </BackButton>
    </div>
  )
}

function Shelf({
  ready,
  shown,
  told,
  page,
  pages,
  onPick,
  onTurn,
}: {
  ready: boolean
  shown: Open[]
  told: Record<string, number>
  page: number
  pages: number
  onPick: (o: Open) => void
  onTurn: (d: number) => void
}) {
  if (!ready) return <BookBack />
  return (
    <div className="screen">
      <BookBack />
      <div className="book-shelf">
        {shown.map((o) => {
          const c = coverOf(o.r)
          return (
            <button
              key={o.r.id}
              className={`book-card${o.isNew ? ' is-new' : ' is-heard'}`}
              data-book={o.isNew ? 'new' : 'heard'}
              style={{ '--spine': c.spine } as CSSProperties}
              aria-label={c.title}
              onClick={() => onPick(o)}
            >
              <StoryPic pic={c.pic} />
              <span className="book-card-title">{c.title}</span>
              {/* 聽過的書：書角一顆星；今天的新書沒有星，整本微微亮著。外面一圈三格：這一章聽了幾天（1～3，T-127；不給獎品） */}
              {(!o.isNew || toldTimes({ told }, o.r.ref) > 0) && (
                <span className="book-star" aria-hidden="true" data-told={Math.min(REPEAT, toldTimes({ told }, o.r.ref))}>
                  <ToldRing n={toldTimes({ told }, o.r.ref)} />
                  {!o.isNew && <Emoji name="glowing-star" />}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {pages > 1 && (
        <div className="book-pager">
          <button className="round-btn" aria-label="上一頁" disabled={page === 0} onClick={() => onTurn(-1)}>
            <Arrow dir={-1} />
          </button>
          <div className="book-dots" aria-hidden="true">
            {Array.from({ length: pages }, (_, i) => (
              <i key={i} className={i === page ? 'is-on' : undefined} />
            ))}
          </div>
          <button className="round-btn" aria-label="下一頁" disabled={page >= pages - 1} onClick={() => onTurn(1)}>
            <Arrow dir={1} />
          </button>
        </div>
      )}
    </div>
  )
}

/** 讀完了畫面封面旁的小星星：[左 %, 上 %, 大小 vmin] */
const DONE_SKY: [number, number, number][] = [
  [30, 16, 4.5],
  [26, 40, 3],
  [68, 12, 3.5],
  [72, 38, 5],
  [36, 52, 2.5],
  [64, 54, 3],
]

/** 讀完了：封面、星星、歡呼的恐龍；兩個大按鈕：再聽一次、回書架（返回鍵也回書架） */
function BookDone({ r, onAgain, onShelf }: { r: ToldChapter; onAgain: () => void; onShelf: () => void }) {
  const ch = chapterOf(r.ref)
  const look = ch ? chapterLook(ch, r.door as ThemeId | undefined) : null
  const c = coverOf(r)
  const [badge, bounce] = useAnimate<HTMLSpanElement>()
  const [again, spin] = useAnimate<HTMLSpanElement>()
  const [card, wiggle] = useAnimate<HTMLDivElement>()
  // 停著沒動作（AI 小男生 T-77：不知道下一步點哪裡）：8 秒、20 秒時「再聽一次」的箭頭轉一圈，告訴他這個可以點
  useEffect(() => {
    const ts = [8000, 20000].map((ms) => window.setTimeout(() => again.current && void spin(again.current, { rotate: [0, 360] }, { duration: 0.9, ease: 'easeInOut' }), ms))
    return () => ts.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="book-replay book-done" style={{ background: look?.tint }}>
      <BookBack onClose={onShelf} />
      {/* 點封面（蛋、書）：晃一下（T-123，盲測 ca0d1e1：故事講完孩子點蛋，以為恐龍會孵出來，沒有反應）。只晃一下，不換頁、不自己往下走 */}
      <div
        ref={card}
        className="story-home-card"
        style={{ '--deep': look?.deep } as CSSProperties}
        onPointerDown={(e) => {
          if ((e.target as Element).closest?.('.book-done-badge')) return
          sfx.boing()
          if (card.current) void wiggle(card.current, { rotate: [0, -6, 6, -4, 3, 0], scale: [1, 1.04, 1] }, { duration: 0.6 })
        }}
      >
        <StoryPic pic={c.pic} />
        {/* 跟書架上「聽過」的星星同一顆：這本書得到一顆星 */}
        {/* 最亮的東西一定有回應：點星星，星星跳一下（AI 小男生 T-77 第 2 步） */}
        <motion.span
          className="book-done-badge"
          aria-hidden="true"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.35 }}
          onPointerDown={() => {
            sfx.pop()
            if (badge.current) void bounce(badge.current, { y: [0, -18, 0], scale: [1, 1.15, 1] }, { duration: 0.45 })
          }}
        >
          <span ref={badge} style={{ display: 'block' }}>
            <Emoji name="glowing-star" />
          </span>
        </motion.span>
        <div className="book-done-stars" aria-hidden="true">
          <Sparkles count={14} />
        </div>
      </div>
      {/* 封面旁邊幾顆小星星：平常靜止（不閃、不轉，MOTION-2）；點了那一顆閃一下、轉一下就停（T-123） */}
      <div className="book-done-sky" aria-hidden="true">
        {DONE_SKY.map(([x, y, w], i) => (
          <SkyStar key={i} x={x} y={y} w={w} />
        ))}
      </div>
      <div className="story-home-dino">
        <Dino who={look?.host ?? 'momo'} mood="cheer" size="100%" />
      </div>
      <div className="book-done-actions">
        <button className="round-btn book-again" aria-label="再聽一次" onClick={onAgain}>
          <span ref={again} style={{ display: 'grid' }}>
            <svg viewBox="0 0 48 48" width={46} aria-hidden="true">
              <path d="M36 16 A14 14 0 1 0 38 28" fill="none" stroke="#2E2A25" strokeWidth={5} strokeLinecap="round" />
              <path d="M37 7 L37 17 L27 17" fill="none" stroke="#2E2A25" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
        <button className="round-btn book-to-shelf" aria-label="回書架" onClick={onShelf}>
          <ShelfIcon />
        </button>
      </div>
    </div>
  )
}

/** 讀完了畫面的一顆小星星：點了放大、轉一下、亮一下就停（一次，不循環） */
function SkyStar({ x, y, w }: { x: number; y: number; w: number }) {
  const [star, twinkle] = useAnimate<HTMLSpanElement>()
  return (
    <span
      ref={star}
      className="book-done-star"
      style={{ left: `${x}%`, top: `${y}%`, width: `${w}vmin` }}
      onPointerDown={() => {
        sfx.star()
        if (star.current) void twinkle(star.current, { scale: [1, 1.6, 1], rotate: [0, 72, 0], opacity: [0.85, 1, 0.85] }, { duration: 0.55, ease: 'easeOut' })
      }}
    >
      <Emoji name="star" />
    </span>
  )
}

function ShelfIcon() {
  return (
    <svg viewBox="0 0 48 48" width={44} aria-hidden="true">
      <rect x={8} y={8} width={32} height={34} rx={3} fill="#C9A57E" stroke="#2E2A25" strokeWidth={3} />
      <path d="M8 25 H40" stroke="#2E2A25" strokeWidth={3} />
      <rect x={13} y={12} width={5} height={11} fill="#E8907E" />
      <rect x={20} y={13} width={5} height={10} fill="#9FCB9A" />
      <rect x={27} y={29} width={5} height={11} fill="#8DB8D8" />
    </svg>
  )
}

function Arrow({ dir }: { dir: 1 | -1 }) {
  return (
    <svg viewBox="0 0 48 48" width={42} aria-hidden="true" style={{ transform: dir < 0 ? 'scaleX(-1)' : undefined }}>
      <path d="M14 24 H34 M26 14 L36 24 L26 34" fill="none" stroke="#2E2A25" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 書架上的書外面一圈三格：這一章聽了幾天（1～3），亮幾格就是幾天。靜態的（不閃、不轉） */
function ToldRing({ n }: { n: number }) {
  const r = 21
  const arc = (i: number) => {
    const a0 = ((-90 + i * 120 + 8) * Math.PI) / 180
    const a1 = ((-90 + i * 120 + 112) * Math.PI) / 180
    return `M${24 + r * Math.cos(a0)} ${24 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${24 + r * Math.cos(a1)} ${24 + r * Math.sin(a1)}`
  }
  return (
    <svg className="book-told" viewBox="0 0 48 48" aria-hidden="true">
      {Array.from({ length: REPEAT }, (_, i) => (
        <path key={i} d={arc(i)} fill="none" strokeWidth={5} strokeLinecap="round" stroke={i < n ? '#E39B3A' : 'rgba(46,42,37,0.16)'} data-on={i < n ? '' : undefined} />
      ))}
    </svg>
  )
}

/**
 * 講故事的畫面（新章節、重聽都是這個）：會動的繪本（T-127）。一頁手繪插畫（T-119）、說話的恐龍、講到第幾頁。
 * - 一頁 1～3 句：同一頁換句子時不翻頁，只有這一句說到的那個角色做一個慢慢的大動作（走進來、走過去、跳過去、睡著、門打開），做完就停；
 *   念到那個角色的名字時才開始動（照語音的逐字時間），沒說到名字的從這一句開始念時動。換頁才翻頁（淡入淡出）。
 * - 第 2 天停下來等他點的時候，要走進來的角色在畫面邊邊探出頭（./story/Act.tsx）；第 3 天選圖、第 1 天最後的問題蓋在插畫上（./story/Tell.tsx）。
 * - 念的當下點插畫只有輕輕一聲（不放熱點）。講到第幾頁的小點點放在插畫下面。
 */
function Replay({
  r,
  at,
  motion,
  setMotion,
  waiting,
  onWaitDone,
  onClose,
}: {
  r: ToldChapter
  at: number
  motion: Motion
  setMotion: (m: Motion) => void
  waiting: Wait | null
  onWaitDone: () => void
  onClose: () => void
}) {
  const ch = chapterOf(r.ref)
  const look = ch ? chapterLook(ch, r.door as ThemeId | undefined) : null
  const f = flowFor(r)
  const art: PageArt = f.arts[at] ?? f.arts[0] ?? { scene: 'meadow', cast: [] }
  const page = f.pageOf[at] ?? 0
  const k = r.script[at]?.k
  const host = hostOf(r)
  const who = k && hasLine(k) ? line(k).speaker : host
  const act = motion.beat === at ? (f.acts[at] ?? null) : null
  useActGo(k, at, art, act, motion, setMotion)
  const from = act ? (motion.peek ? peekOf(act, art) : { dx: act.dx, dy: act.dy }) : null
  const pm: PageMotion | null = act && from ? { cast: act.cast, kind: act.kind, dx: from.dx, dy: from.dy, fromPose: act.fromPose, go: motion.go, id: `${r.id}:${at}` } : null
  // 同一頁新出現、但不是這一句主角的東西：淡淡地出現
  const fresh = useMemo(() => {
    if (at === 0 || f.pageOf[at - 1] !== f.pageOf[at]) return []
    const was = new Set(f.arts[at - 1].cast.map((c) => `${c.who}${c.two ? '×2' : ''}`))
    return art.cast.flatMap((c, i) => (!was.has(`${c.who}${c.two ? '×2' : ''}`) && i !== act?.cast ? [i] : []))
  }, [f, at, art, act?.cast])
  return (
    <div className="book-replay" style={{ background: look?.tint }}>
      <BookBack onClose={onClose} />
      <div className="book-progress" aria-hidden="true">
        {Array.from({ length: f.pages }, (_, i) => (
          <i key={i} className={i <= page ? 'is-done' : undefined} />
        ))}
      </div>
      <div
        className="book-art"
        style={{ '--deep': look?.deep } as CSSProperties}
        data-page={page}
        data-beat={at}
        data-wait={waiting?.kind}
        onPointerDown={() => {
          // 念的當下點插畫：輕輕一聲就好（不放會跳的熱點，Takacs 2015）；等他做事的時候由 Act、Choose 自己回應
          if (!waiting) sfx.tap()
        }}
      >
        <Swap id={`p${page}`} className="swap-pic" arm={false}>
          <StoryPage art={art} motion={pm} fresh={fresh} />
        </Swap>
        {waiting?.kind === 'act' && (
          <ActWait key={`act${waiting.stop.beat}`} art={art} cast={waiting.stop.cast} peek={pm ? { dx: pm.dx, dy: pm.dy } : { dx: 0, dy: 0 }} host={host} onDone={onWaitDone} />
        )}
        {waiting?.kind === 'tell' && (
          <Choose
            key={`tell${waiting.pick.beat}`}
            kind="tell"
            ask={storyNextKey(host)}
            answer={waiting.pick.answer}
            cards={[<TellCard key="a" art={f.arts[waiting.pick.arts[0]]} />, <TellCard key="b" art={f.arts[waiting.pick.arts[1]]} />]}
            onDone={onWaitDone}
          />
        )}
        {waiting?.kind === 'ask' && (
          <Choose
            key="ask"
            kind="ask"
            ask={waiting.key}
            answer={waiting.ask.answer}
            cards={[<AskCard key="a" who={waiting.ask.picks[0]} scene={art.scene} />, <AskCard key="b" who={waiting.ask.picks[1]} scene={art.scene} />]}
            onDone={onWaitDone}
          />
        )}
      </div>
      <div className="story-home-dino">
        <Dino who={who} mood="happy" size="100%" />
      </div>
    </div>
  )
}

/** 沒有語音事件（沒有音檔、平板內建語音也不能用）時，最晚多久讓角色動：不會一直卡在畫面外 */
const GO_FALLBACK_MS = 1500

/**
 * 這一句的動作什麼時候開始：聽語音播放的事件（lib/audio 的 onSpeech），這一句開始播時照逐字時間算出念到那個角色的名字是第幾毫秒；
 * 句子沒說到它的名字，就在開始念的時候動。第 2 天探出頭等他點的那一句由他點的時候開始（StoryBook 設好 go），這裡不管。
 */
function useActGo(k: string | undefined, at: number, art: PageArt, act: StoryFlow['acts'][number], motion: Motion, setMotion: (m: Motion) => void) {
  const now = useRef({ art, act, motion })
  now.current = { art, act, motion }
  useEffect(() => {
    if (!k) return
    let set = false
    const go = (ms: number) => {
      const m = now.current.motion
      if (set || !now.current.act || m.beat !== at || m.go != null || m.peek) return
      set = true
      setMotion({ beat: at, go: Math.max(0, Math.round(ms)), peek: false })
    }
    const off = onSpeech((e) => {
      const { art: a, act: x } = now.current
      if (!x || !hasLine(k) || ('key' in e && e.key !== k)) return
      if (e.type === 'seg' && e.words?.length) {
        const lead = (e.at - audioClock()) * 1000
        const h = hopTimes(line(k).text, a, e.words).find((t) => t.cast === x.cast)
        go(lead + (h?.ms ?? 250))
      } else if (e.type === 'whole' || e.type === 'seg') go(300)
    })
    const t = window.setTimeout(() => go(0), GO_FALLBACK_MS)
    return () => {
      off()
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, at])
}

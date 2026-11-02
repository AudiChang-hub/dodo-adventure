import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Dino } from '../art/Dino'
import { BackButton } from '../ui/Back'
import { StoryPic } from '../ui/StoryPic'
import { Scenes, Swap, type SceneMove } from '../ui/Scenes'
import { useBack } from '../lib/nav'
import { HomeIcon } from '../games/Shell'
import { motion, useAnimate } from 'motion/react'
import { say, sfx, stopSpeech } from '../lib/audio'
import { finishTold, saveToldAt, todaysStory, toldAt, toldChapters, type ToldChapter } from '../lib/story'
import { Emoji } from '../art/Emoji'
import { Sparkles } from '../ui/Sparkles'
import { arcOf, chapterLook, chapterOf, type Pic } from '../content/story'
import { theme as themeDef, type ThemeId } from '../content/themes'
import { line, hasLine } from '../content/lines'
import { wait } from '../games/lines'
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

/** 正在講的那一本：isNew 是今天的新章節（講完才收進書架，中途離開下次接著講） */
interface Open {
  r: ToldChapter
  isNew: boolean
}

/**
 * 我的故事書（T-77：像學校的故事時間）：
 * - 點進來，今天有還沒講完的新章節就先講（lib/story.ts 的 todaysStory）；講完有「讀完了」，可以再聽一次或回書架，這一本收進書架。
 * - 中途按返回：回書架，新章節的書在最前面亮著；下次進來（或點那本書）從離開的那一句接著講，講到最後才算講完。
 * - 書架：講過的書有一顆星；點一本就重聽。
 * - 一句一張圖，下面是說話的恐龍；點圖只讓圖動一下，不跳過正在念的這一句（三歲點圖是想看它動）。
 * 返回：講故事、讀完了 → 書架；書架 → 首頁。
 */
export function StoryBook() {
  const [rows, setRows] = useState<ToldChapter[] | null>(null)
  const [fresh, setFresh] = useState<ToldChapter | null>(null)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<Open | null>(null)
  const [done, setDone] = useState(false)
  const [at, setAt] = useState(0)
  const backing = useRef(false)
  const run = useRef(0)

  useEffect(() => {
    let live = true
    void Promise.all([toldChapters(), todaysStory()]).then(async ([r, t]) => {
      if (!live) return
      setRows(r)
      setFresh(t)
      if (t) return start({ r: t, isNew: true }, await toldAt(t.date))
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
    setDone(false)
    setOpen(null)
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
    await wait(500)
    for (let i = from; i < r.script.length; i++) {
      if (gone()) return
      setAt(i)
      if (o.isNew) void saveToldAt(r.date, i)
      const k = r.script[i].k
      if (hasLine(k)) await say(k)
      if (gone()) return
      await wait(450)
    }
    if (gone()) return
    // 講到最後才算講完：新章節收進書架（書架上的星星）
    if (o.isNew) {
      await finishTold(r)
      const told = await toldChapters()
      if (gone()) return
      setRows(told)
      setFresh(null)
      setOpen({ r, isNew: false })
    }
    sfx.done()
    setDone(true)
  }

  const start = (o: Open, from = 0) => {
    backing.current = false
    setDone(false)
    setAt(Math.min(from, Math.max(0, o.r.script.length - 1)))
    setOpen(o)
    void play(o, from)
  }

  const pickBook = (o: Open) => {
    sfx.pop()
    if (!o.isNew) return start(o)
    void toldAt(o.r.date).then((from) => start(o, from))
  }

  const books: Open[] = [...(fresh ? [{ r: fresh, isNew: true }] : []), ...(rows ?? []).map((r) => ({ r, isNew: false }))]
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
          <BookDone r={open.r} onAgain={() => pickBook({ r: open.r, isNew: false })} onShelf={toShelf} />
        ) : open ? (
          <Replay r={open.r} at={at} onClose={toShelf} />
        ) : (
          <Shelf ready={rows != null} shown={shown} page={page} pages={pages} onPick={pickBook} onTurn={turn} />
        )}
      </Scenes>
    </div>
  )
}

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

function Shelf({ ready, shown, page, pages, onPick, onTurn }: { ready: boolean; shown: Open[]; page: number; pages: number; onPick: (o: Open) => void; onTurn: (d: number) => void }) {
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
              {/* 聽過的書：書角一顆星；今天的新書沒有星，整本微微亮著 */}
              {!o.isNew && (
                <span className="book-star" aria-hidden="true">
                  <Emoji name="glowing-star" />
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
  // 停著沒動作（AI 小男生 T-77：不知道下一步點哪裡）：8 秒、20 秒時「再聽一次」的箭頭轉一圈，告訴他這個可以點
  useEffect(() => {
    const ts = [8000, 20000].map((ms) => window.setTimeout(() => again.current && void spin(again.current, { rotate: [0, 360] }, { duration: 0.9, ease: 'easeInOut' }), ms))
    return () => ts.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="book-replay book-done" style={{ background: look?.tint }}>
      <BookBack onClose={onShelf} />
      <div className="story-home-card" style={{ '--deep': look?.deep } as CSSProperties}>
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
      {/* 封面旁邊幾顆靜止的小星星（不閃、不轉，MOTION-2） */}
      <div className="book-done-sky" aria-hidden="true">
        {DONE_SKY.map(([x, y, w], i) => (
          <span key={i} style={{ left: `${x}%`, top: `${y}%`, width: `${w}vmin` }}>
            <Emoji name="star" />
          </span>
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

/** 講故事的畫面（新章節、重聽都是這個）：大大的圖（一句換一張）、說話的恐龍、講到第幾句 */
function Replay({ r, at, onClose }: { r: ToldChapter; at: number; onClose: () => void }) {
  const [card, animate] = useAnimate<HTMLDivElement>()
  const [wiggles, setWiggles] = useState(0)
  const ch = chapterOf(r.ref)
  const look = ch ? chapterLook(ch, r.door as ThemeId | undefined) : null
  // 這一句沒有圖就沿用前面最近的一張；一開始都沒有就用封面
  let pic: Pic = coverOf(r).pic
  for (let i = 0; i <= at && i < r.script.length; i++) if (r.script[i].pic) pic = r.script[i].pic!
  const k = r.script[at]?.k
  const who = k && hasLine(k) ? line(k).speaker : (look?.host ?? 'momo')
  return (
    <div className="book-replay" style={{ background: look?.tint }}>
      <BookBack onClose={onClose} />
      <div className="book-progress" aria-hidden="true">
        {r.script.map((_, i) => (
          <i key={i} className={i <= at ? 'is-done' : undefined} />
        ))}
      </div>
      {/* 點圖：圖動一下（不跳過正在念的這一句） */}
      <motion.div
        ref={card}
        className="story-home-card"
        style={{ '--deep': look?.deep } as CSSProperties}
        data-wiggle={wiggles}
        onPointerDown={() => {
          sfx.tap()
          setWiggles((n) => n + 1)
          void animate(card.current!, { rotate: [0, -5, 5, -3, 0], scale: [1, 1.05, 1] }, { duration: 0.5 })
        }}
      >
        <Swap id={pic} className="swap-pic" arm={false}>
          <StoryPic pic={pic} />
        </Swap>
      </motion.div>
      <div className="story-home-dino">
        <Dino who={who} mood="happy" size="100%" />
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Dino } from '../art/Dino'
import { BackButton } from '../ui/Back'
import { StoryPic } from '../ui/StoryPic'
import { Scenes, Swap, type SceneMove } from '../ui/Scenes'
import { useBack } from '../lib/nav'
import { say, sfx, hushSpeech, stopSpeech } from '../lib/audio'
import { toldChapters, type ToldChapter } from '../lib/story'
import { arcOf, chapterLook, chapterOf, type Pic } from '../content/story'
import { theme as themeDef, type ThemeId } from '../content/themes'
import { line, hasLine } from '../content/lines'
import { wait } from '../games/lines'
import './story.css'

/** 一頁幾本書（平板 3×2；手機直式 2×3，一樣 6 本） */
const PER_PAGE = 6
/** 旁白開始多久之後才能點畫面跳過（跟冒險一樣，避免剛點書的那隻手直接跳過第一句） */
const SKIP_AFTER_MS = 700

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

/**
 * 我的故事書：講過的章節都在這裡，點一本就重聽（成長系統 §3、G-8）。
 * 重聽照當天念的那一版（依主線挑過、朋友換過的），一句一張圖，下面是說話的那隻恐龍；點畫面跳過這一句。
 * 返回：重聽中 → 書架；書架 → 魔法屋。
 */
export function StoryBook() {
  const [rows, setRows] = useState<ToldChapter[] | null>(null)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<ToldChapter | null>(null)
  const [at, setAt] = useState(0)
  const backing = useRef(false)
  const run = useRef(0)
  const skipped = useRef(false)
  const skipFrom = useRef(0)

  useEffect(() => {
    let live = true
    toldChapters().then((r) => {
      if (!live) return
      setRows(r)
      void say(r.length ? 'story.book.hello' : 'story.book.empty')
    })
    return () => {
      live = false
      run.current++
      stopSpeech()
    }
  }, [])

  const close = () => {
    run.current++
    stopSpeech()
    backing.current = true
    setOpen(null)
  }

  // 返回鍵、Android 的返回：重聽中先回書架，書架才回魔法屋
  useBack(() => {
    if (!open) return false
    close()
  })

  const hold = async (ms: number) => {
    const end = performance.now() + ms
    while (!skipped.current && performance.now() < end) await wait(Math.min(80, end - performance.now()))
  }

  const play = async (r: ToldChapter) => {
    const me = ++run.current
    const gone = () => run.current !== me
    await wait(500)
    for (let i = 0; i < r.script.length; i++) {
      if (gone()) return
      skipped.current = false
      skipFrom.current = performance.now() + SKIP_AFTER_MS
      setAt(i)
      const k = r.script[i].k
      if (hasLine(k)) await say(k)
      if (gone()) return
      await hold(450)
    }
    if (gone()) return
    sfx.done()
    await wait(1200)
    if (!gone()) close()
  }

  const pickBook = (r: ToldChapter) => {
    sfx.pop()
    backing.current = false
    setAt(0)
    setOpen(r)
    void play(r)
  }

  const skip = () => {
    if (!open || skipped.current || performance.now() < skipFrom.current) return
    skipped.current = true
    hushSpeech()
  }

  const pages = Math.max(1, Math.ceil((rows?.length ?? 0) / PER_PAGE))
  const shown = (rows ?? []).slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  const turn = (d: number) => {
    sfx.tap()
    setPage((p) => Math.min(pages - 1, Math.max(0, p + d)))
  }

  const move = (): SceneMove => ({ back: backing.current })

  return (
    <div className="screen book-screen" onPointerDown={skip}>
      <Scenes id={open ? `replay-${open.id}` : 'shelf'} move={move} className="scene is-clear">
        {open ? (
          <Replay r={open} at={at} onClose={close} />
        ) : (
          <Shelf rows={rows} shown={shown} page={page} pages={pages} onPick={pickBook} onTurn={turn} />
        )}
      </Scenes>
    </div>
  )
}

/**
 * 返回鍵：每一段（書架、重聽）都放在自己那一層裡，位置一樣（跟冒險的每一段一樣，NAV-1）。
 * 重聽 → 書架（畫成書架）；書架 → 魔法屋（畫成魔法屋，照路由回上一層）
 */
function BookBack({ onClose }: { onClose?: () => void }) {
  return (
    <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 6 }}>
      <BackButton label={onClose ? '回書架' : '回魔法屋'} onTap={onClose}>
        <svg viewBox="0 0 48 48" width={40} aria-hidden="true">
          {onClose ? (
            // 書架
            <>
              <rect x={8} y={8} width={32} height={34} rx={3} fill="#C9A57E" stroke="#2E2A25" strokeWidth={3} />
              <path d="M8 25 H40" stroke="#2E2A25" strokeWidth={3} />
              <rect x={13} y={12} width={5} height={11} fill="#E8907E" />
              <rect x={20} y={13} width={5} height={10} fill="#9FCB9A" />
              <rect x={27} y={29} width={5} height={11} fill="#8DB8D8" />
            </>
          ) : (
            // 魔法屋
            <>
              <path d="M6 22 L24 7 L42 22 Z" fill="#E7B9A2" stroke="#2E2A25" strokeWidth={3} strokeLinejoin="round" />
              <rect x={10} y={22} width={28} height={19} rx={2} fill="#F1E3CC" stroke="#2E2A25" strokeWidth={3} />
              <path d="M24 22 V41 M10 31 H38" stroke="#2E2A25" strokeWidth={2.4} />
            </>
          )}
        </svg>
      </BackButton>
    </div>
  )
}

function Shelf({ rows, shown, page, pages, onPick, onTurn }: { rows: ToldChapter[] | null; shown: ToldChapter[]; page: number; pages: number; onPick: (r: ToldChapter) => void; onTurn: (d: number) => void }) {
  if (!rows) return <BookBack />
  if (!rows.length)
    return (
      <div className="screen">
        <BookBack />
        <div className="book-empty">
          <StoryPic pic="books" />
        </div>
      </div>
    )
  return (
    <div className="screen">
      <BookBack />
      <div className="book-shelf">
        {shown.map((r) => {
          const c = coverOf(r)
          return (
            <button key={r.id} className="book-card" style={{ '--spine': c.spine } as CSSProperties} aria-label={c.title} onClick={() => onPick(r)}>
              <StoryPic pic={c.pic} />
              <span className="book-card-title">{c.title}</span>
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

function Arrow({ dir }: { dir: 1 | -1 }) {
  return (
    <svg viewBox="0 0 48 48" width={42} aria-hidden="true" style={{ transform: dir < 0 ? 'scaleX(-1)' : undefined }}>
      <path d="M14 24 H34 M26 14 L36 24 L26 34" fill="none" stroke="#2E2A25" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 重聽的畫面：大大的圖（一句換一張）、說話的恐龍、講到第幾句 */
function Replay({ r, at, onClose }: { r: ToldChapter; at: number; onClose: () => void }) {
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
      <div className="story-home-card" style={{ '--deep': look?.deep } as CSSProperties}>
        <Swap id={pic} className="swap-pic" arm={false}>
          <StoryPic pic={pic} />
        </Swap>
      </div>
      <div className="story-home-dino">
        <Dino who={who} mood="happy" size="100%" />
      </div>
    </div>
  )
}

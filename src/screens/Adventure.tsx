import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Ride } from '../art/Ride'
import { Egg } from '../art/Egg'
import { Emoji } from '../art/Emoji'
import { Scenery } from '../ui/Scenery'
import { ThemeScenery } from '../ui/ThemeScenery'
import { Sparkles } from '../ui/Sparkles'
import { PlayGame } from '../games/PlayGame'
import { HomeIcon, PlayingGame, RouteIcon } from '../games/Shell'
import { BackButton } from '../ui/Back'
import { station as stationDef } from '../content/games'
import { opensAtHome, stopPic, type RoomId, type Said, type Script } from '../content/story'
import type { ThemeId } from '../content/themes'
import { MagicHouseArt } from '../ui/MagicHouseArt'
import { StoryPic } from '../ui/StoryPic'
import { Dino } from '../art/Dino'
import { Swap } from '../ui/Scenes'
import { finishChapter, friendFor, houseItems, scriptForPlan, startChapter, warmStory } from '../lib/story'
import { STORY_EGG_COUNT } from '../content/lines-friends'
import { hasLine } from '../content/lines'
import { afterEntering, go, useBack } from '../lib/nav'
import { say, sfx, hushSpeech, stopSpeech } from '../lib/audio'
import { cachedPlan, todayPlan, savePlan, planDone, hatchFriend, type Plan } from '../lib/plan'
import { noteActivity, isBreakDue, holdBedtime, bedtimeIfDue } from '../lib/session'
import { pendingPicks } from '../lib/achievements'
import { EyeBreak } from '../ui/EyeBreak'
import { wait } from '../games/lines'
import { RouteMap, RouteStrip } from './Route'
import { DayRecap } from './DayRecap'
import { Scenes, type SceneMove } from '../ui/Scenes'
import './story.css'
import { DUR, EASE, RANGE } from '../ui/motion'

type Phase = 'open' | 'route' | 'travel' | 'play' | 'egg' | 'finale' | 'close' | 'hatch' | 'finish' | 'rest'

/** 開局的路線至少展示這麼久（毫秒），讓孩子看得到「今天有 4 站」 */
const ROUTE_MS = 3000
/** 旁白開始多久之後才能點畫面跳過（避免轉場時手還放在螢幕上就跳過） */
const SKIP_AFTER_MS = 700
/** 魔法屋多了一樣東西：整間屋子亮起來、新東西發光，停這麼久再去孵蛋 */
const HOUSE_ADD_MS = 2600

/** 一進冒險在哪一段：走完了 → 孵蛋／回顧；長篇、故事時間剛開始 → 魔法屋的開場；其他 → 路線圖 */
function firstPhase(p: Plan | null): Phase {
  if (p && planDone(p)) return donePhase(p)
  const s = p && scriptForPlan(p)
  return s && opensAtHome(s.chapter) && p!.items.every((i) => !i.done) ? 'open' : 'route'
}

/** 站都走完了再進來：孵過蛋就回顧；故事（長篇、故事時間）的終點還沒念完就從終點接著講，不然去孵蛋 */
function donePhase(p: Plan): Phase {
  if (p.hatched) return 'finish'
  const s = scriptForPlan(p)
  return s && s.chapter.kind !== 'evergreen' && !p.told ? 'finale' : 'hatch'
}

/**
 * 今日冒險：今天的路線 → 轉場 → 遊戲 → 蛋裂開一點 → 下一站…最後孵出新朋友。
 * 每日時間到了不在題目中途結束，而是在兩站之間（蛋裂開之後）才去睡覺。
 *
 * 主題式冒險（plan.theme，2026-10-28 起每天都是）：路線是故事的一格一格（公車站牌 → 公車 → …→ 動物園），
 * 轉場不報站名，而是說故事的恐龍念一句旁白；最後一站之後先到故事的終點（We made it to the zoo!），再孵蛋、回顧。
 * 孩子端看不到也聽不到任何科目或站名；旁白都很短，點一下畫面就跳過。
 *
 * 故事（G-8，content/story、lib/story.ts）：每天是一章。通用章節（12 扇魔法門）就是上面這樣，台詞和以前一模一樣；
 * 長篇和故事時間多兩段在魔法屋：開場（open：剖面圖亮著門廊或書房，念開場、開門口令）、結尾（close：回到魔法屋念結尾，
 * 這一篇講完了魔法屋多一樣東西）。每站之前念的是依主線挑的那一句（scriptOf）。
 *
 * 返回（NAV-1／NAV-2）：每一段左上角都有返回鍵（護眼休息除外，它會自己結束）。
 * 走到一半（旁白卡、遊戲、蛋裂開）按返回 → 回到路線圖，看得到今天走到哪，停在那裡等孩子按「出發」或再返回回首頁；
 * 路線圖、故事終點、孵蛋、回顧按返回 → 回首頁。走完的站都存好了，下次按出發從沒走完的那一站繼續。
 */
export function Adventure() {
  // 首頁已經讀過今天的冒險：第一幀就畫得出路線，不會先閃一張空白
  const [plan, setPlan] = useState<Plan | null>(cachedPlan)
  const [phase, setPhase] = useState<Phase>(() => firstPhase(cachedPlan()))
  /** 今天上場的朋友（故事裡「一位朋友」的句子換成牠）：讀到之前先用通用句 */
  const [friendToday, setFriendToday] = useState<string | null>(null)
  /** 魔法屋開場、結尾、多段旁白：現在念到這一段的第幾句（換圖用） */
  const [beat, setBeat] = useState(0)
  /** 魔法屋裡的東西（只會變多）；這一章講完新加的那一樣 */
  const [house, setHouse] = useState<string[]>([])
  const [added, setAdded] = useState<string | null>(null)
  const [taps, setTaps] = useState(0)
  /** 走到一半按返回回到路線圖：路線圖停著等孩子按出發，不自己往下走 */
  const [paused, setPaused] = useState(false)
  /** 旁白卡上的車開到定位就停（不一直彈跳、轉輪子：畫面靜止時不留循環動畫，V-17） */
  const [driving, setDriving] = useState(true)
  /** 等孩子敲蛋時偶爾晃一下蛋（提示可以點），不一直脈動 */
  const [nudge, setNudge] = useState(false)
  /** 每按一次返回加一：還在跑的流程（蛋裂開之後要去下一站）看到變了就停下來 */
  const epoch = useRef(0)
  /** 這一次換段是返回（上面那段淡出、露出路線圖） */
  const backing = useRef(false)
  const [friend, setFriend] = useState<string | null>(null)
  const live = useRef(true)
  /** 畫面上現在是哪一段：換段的那一次 render 用它決定往前還是往回 */
  const shownPhase = useRef<Phase>(phase)
  useEffect(() => {
    shownPhase.current = phase
    backing.current = false
  }, [phase])
  /** 點畫面跳過旁白：這個階段後面的等待也一起略過 */
  const skipped = useRef(false)
  const skipFrom = useRef(0)

  const cur = plan?.items.findIndex((i) => !i.done) ?? -1
  const item = plan && cur >= 0 ? plan.items[cur] : null
  const doneCount = plan?.items.filter((i) => i.done).length ?? 0
  // 今天這一章要念的句子（通用章節、長篇、故事時間都是同一個格式）；舊的存檔沒有主題是 null，走舊的站點流程
  const script: Script | null = useMemo(() => (plan ? scriptForPlan(plan, friendToday) : null), [plan, friendToday])
  const th = script?.look ?? null

  useEffect(() => {
    live.current = true
    todayPlan().then((p) => {
      // 跟一開始用的那份一樣就不換：換了物件，路線那一段的旁白會被打斷重來
      setPlan((cur) => {
        if (cur && JSON.stringify(cur) === JSON.stringify(p)) return cur
        // 沒有快取（直接重新整理進來）：照讀到的這一份決定從哪一段開始
        if (!cur) setPhase(firstPhase(p))
        return p
      })
      if (planDone(p)) setPhase(donePhase(p))
      void friendFor(p.date).then((f) => live.current && setFriendToday(f))
    })
    void houseItems().then((h) => live.current && setHouse(h))
    return () => {
      live.current = false
      stopSpeech()
    }
  }, [])

  // 開發時（npm run dev）截圖、檢查畫面用：直接跳到某一段（正式版沒有）
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __advPhase: (p: Phase) => setPhase(p) })
  }, [])

  // 每換一個階段，重新開始算「可以跳過」的時間
  useEffect(() => {
    skipped.current = false
    skipFrom.current = performance.now() + SKIP_AFTER_MS
  }, [phase])

  /** 等一下；被點畫面跳過時立刻結束 */
  const hold = async (ms: number) => {
    const end = performance.now() + ms
    while (!skipped.current && performance.now() < end) await wait(Math.min(80, end - performance.now()))
  }

  /** 路線、轉場、故事終點：點一下畫面就跳過旁白（say 被 hushSpeech 打斷會提早結束；字幕留著等下一句） */
  const skip = () => {
    if (skipped.current || performance.now() < skipFrom.current) return
    if (phase !== 'open' && phase !== 'route' && phase !== 'travel' && phase !== 'finale' && phase !== 'close') return
    skipped.current = true
    hushSpeech()
  }

  // 冒險在畫面上就先擋住「時間到」：由冒險自己在兩站之間檢查。
  // 收尾畫面（finish）說完那句話才放開，之後一般的計時就會送去睡覺
  useEffect(() => {
    const release = holdBedtime()
    if (phase !== 'finish') return release
    let cancelled = false
    // 成就感：說完「今天好棒」，邀請孩子拿給爸爸看（回顧畫面上有爸爸的按鈕）
    // 還有集滿了沒挑的貼紙（之前按了等一下再選）：提醒一句，回顧上有一張發光的卡片
    void say('adv.done', 'ach.showdad', ...(pendingPicks() > 0 ? ['stk.wait'] : [])).then(() => !cancelled && release())
    return () => {
      cancelled = true
      release()
    }
  }, [phase])

  /**
   * 一段旁白：一句的話直接念（跟以前一樣是一次 say）；好幾句的話一句一句念，每一句換成那一句的圖（beat）。
   * 回傳 false 表示中途被取消（換段、返回）
   */
  const sayAll = async (xs: Said[], gone: () => boolean): Promise<boolean> => {
    setBeat(0)
    if (xs.length <= 1) {
      if (xs.length) await say(xs[0].key)
      return !gone()
    }
    for (let i = 0; i < xs.length; i++) {
      if (gone()) return false
      setBeat(i)
      await say(xs[i].key)
      if (i < xs.length - 1) await hold(250)
    }
    return !gone()
  }

  // 今天這一章開始講（第一次看到開場或路線圖）：記一筆章節、先把這一篇的語音存進快取（依篇快取，沒網路也講得完）
  const startedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!plan || !script || planDone(plan) || (phase !== 'open' && phase !== 'route')) return
    const k = `${plan.date}|${script.chapter.id}`
    if (startedRef.current === k) return
    startedRef.current = k
    void startChapter(plan, script)
    warmStory(script)
  }, [plan, script, phase])

  // 魔法屋的開場（長篇、故事時間）：剖面圖亮著門廊（今天的門）或書房，一句一句念開場，最後是開門口令，再去路線圖
  useEffect(() => {
    if (phase !== 'open' || !script) return
    let cancelled = false
    ;(async () => {
      await wait(600)
      if (cancelled) return
      if (!(await sayAll(script.intro, () => cancelled || !live.current))) return
      sfx.whoosh()
      await hold(600)
      if (!cancelled && live.current) setPhase('route')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, script?.chapter.id])

  // 開局：先看今天的路線（約 3 秒）。主題式冒險念故事的標題與開場（開場在魔法屋念過的章節只念標題）；中途回來只念標題
  useEffect(() => {
    if (phase !== 'route' || paused || !plan || planDone(plan)) return
    let cancelled = false
    ;(async () => {
      const t = performance.now()
      await wait(500)
      if (cancelled) return
      if (script) {
        const intro = doneCount === 0 && !opensAtHome(script.chapter) ? script.intro : []
        const keys = [...script.title, ...intro].map((x) => x.key)
        if (keys.length) await say(...keys)
      } else {
        const k = `route.stops.${plan.items.length}`
        await say(...(doneCount === 0 && hasLine(k) ? [k] : []), 'adv.go')
      }
      await hold(Math.max(0, ROUTE_MS - (performance.now() - t)))
      if (!cancelled && live.current) setPhase('travel')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, plan, paused])

  // 轉場：主持的恐龍開車進場、報站名（主題式冒險：說故事的一句；故事時間可能是好幾句），說完自動開始
  useEffect(() => {
    if (phase !== 'travel' || !item) return
    let cancelled = false
    ;(async () => {
      sfx.whoosh()
      setBeat(0)
      await hold(700)
      if (cancelled) return
      if (script) {
        if (!(await sayAll(script.stops[cur] ?? [], () => cancelled || !live.current))) return
      } else await say(`station.${item.station}`)
      await hold(500)
      if (!cancelled && live.current) setPhase('play')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, item])

  // 故事的終點：目的地大大地出現、說故事的恐龍開到、念結尾（通用章節：門原本的結尾；
  // 站比故事段落少時，沒講到的段落在這裡講完）。有魔法屋的結尾就回魔法屋，不然去孵蛋
  useEffect(() => {
    if (phase !== 'finale' || !script) return
    let cancelled = false
    ;(async () => {
      await hold(900)
      if (cancelled) return
      sfx.done()
      if (!(await sayAll(script.finale, () => cancelled || !live.current))) return
      // 終點念完了：之後離開再進來就不用重講（不 setPlan，免得今天的 script 重算、這一段重來）
      if (plan && planDone(plan)) void savePlan({ ...plan, told: true })
      await hold(script.finale.length ? 700 : 1200)
      if (cancelled || !live.current) return
      if (script.end.length) return setPhase('close')
      if (plan) void finishChapter(plan, script)
      setPhase('hatch')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, script?.chapter.id])

  // 回到魔法屋（長篇、故事時間）：念結尾；這一篇講完了，整間屋子亮起來，新的東西發光，再去孵蛋
  useEffect(() => {
    if (phase !== 'close' || !script || !plan) return
    let cancelled = false
    ;(async () => {
      await wait(600)
      if (cancelled) return
      if (!(await sayAll(script.end, () => cancelled || !live.current))) return
      const item = await finishChapter(plan, script)
      if (cancelled || !live.current) return
      if (item) {
        setHouse((h) => (h.includes(item) ? h : [...h, item]))
        setAdded(item)
        sfx.milestone()
        await wait(HOUSE_ADD_MS)
      } else await hold(700)
      if (!cancelled && live.current) setPhase('hatch')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, script?.chapter.id])

  // 今天的站都走完了（孵蛋、回顧，或是直接重新整理進來）：這一章算講完（重複呼叫只算一次）
  useEffect(() => {
    if ((phase === 'hatch' || phase === 'finish') && plan && script && planDone(plan)) void finishChapter(plan, script)
  }, [phase, plan, script])

  useEffect(() => {
    if (phase === 'hatch') void say('egg.ready')
  }, [phase])

  useEffect(() => {
    setDriving(true)
  }, [phase, cur])

  // 等敲蛋：沒動靜時每 6 秒晃一下蛋，晃 4 次就停（之後靜止等孩子）
  useEffect(() => {
    if (phase !== 'hatch' || taps > 0) return
    let n = 0
    const timers: number[] = []
    const iv = window.setInterval(() => {
      if (++n > 4) return clearInterval(iv)
      setNudge(true)
      timers.push(window.setTimeout(() => setNudge(false), 800))
    }, 6000)
    return () => {
      clearInterval(iv)
      timers.forEach(clearTimeout)
    }
  }, [phase, taps])

  const onGameDone = async () => {
    if (!plan || !item) return
    const index = cur
    const next = { ...plan, items: plan.items.map((it, i) => (i === index ? { ...it, done: true } : it)) }
    noteActivity(item.game, item.station, true)
    await savePlan(next)
    setPlan(next)
    void afterGame(next)
  }

  /** 一站結束：蛋在車上晃一下、多一道裂痕（旅程的劇情，不是付款），再決定下一步 */
  const afterGame = async (next: Plan) => {
    const e = epoch.current
    // 這段時間裡返回了（首頁或路線圖）：不要再蛋裂開、念故事、往下一站
    const gone = () => !live.current || epoch.current !== e
    setPhase('egg')
    await wait(500)
    if (gone()) return
    sfx.crack()
    const done = next.items.filter((i) => i.done).length
    await say(`story.egg.${(done - 1 + STORY_EGG_COUNT) % STORY_EGG_COUNT}`)
    await wait(500)
    if (gone()) return
    // 全部走完就到故事的終點、孵蛋（故事的結尾一定讓它說完）；時間到了就在兩站之間去睡覺
    if (planDone(next)) return setPhase(script ? 'finale' : 'hatch')
    if (bedtimeIfDue()) return
    setPhase(isBreakDue() ? 'rest' : 'travel')
  }

  const tapEgg = async () => {
    if (!plan || friend) return
    sfx.crack()
    const n = taps + 1
    setTaps(n)
    if (n < 3) return
    const id = await hatchFriend()
    const next = { ...plan, hatched: id }
    await savePlan(next)
    setPlan(next)
    if (!live.current) return
    setFriend(id)
    sfx.hatch()
    // 新朋友一出來就自我介紹：I'm a fox!
    await say('egg.hatch', ...[`friend.name.${id}`, `friend.sound.${id}`].filter(hasLine))
    await wait(900)
    if (live.current) setPhase('finish')
  }

  /** 這一段按返回會回首頁（不是回路線圖）：路線圖本身、護眼休息，以及今天的站都走完了（終點、孵蛋、回顧） */
  const upIsHome = phase === 'open' || phase === 'route' || phase === 'rest' || !plan || planDone(plan)

  /**
   * 回上一層：返回鍵、Android 的返回手勢都走這裡。
   * 走到一半 → 路線圖（停著等孩子）；其他 → 首頁。玩到一半離開記一筆沒玩完；已經走完的站都存好了。
   */
  const up = () => {
    if (item && phase === 'play') noteActivity(item.game, item.station, false)
    if (upIsHome) {
      // 故事的結尾（回到魔法屋）念到一半離開：故事已經講到最後，這一章算講完。
      // 還沒念到終點（最後一站蛋裂開時、終點念到一半）就不算：再進來從終點接著講（donePhase）
      const early = (phase === 'egg' || phase === 'finale') && script?.chapter.kind !== 'evergreen'
      if (plan && script && planDone(plan) && !early) void finishChapter(plan, script)
      // 淡出回首頁的這一下，冒險不再往下走（不然淡出中的畫面會從路線圖換成旁白卡，閃一下）
      live.current = false
      epoch.current++
      return go({ name: 'home' }, { back: true })
    }
    epoch.current++
    // 跟換整頁一樣：新的一段還在淡入就等它蓋好再往回（lib/nav.ts 的 afterEntering）
    afterEntering(() => {
      if (!live.current) return
      stopSpeech()
      backing.current = true
      setPaused(true)
      setPhase('route')
    })
  }
  useBack(up)

  /** 停著的路線圖按「出發」：從沒走完的那一站繼續 */
  const resume = () => {
    sfx.pop()
    setPaused(false)
    setPhase('travel')
  }

  // ── 轉場：每一段是一層（ui/Scenes.tsx） ──────────────────────
  const sceneId =
    phase === 'route'
      ? 'route'
      : phase === 'travel'
        ? `travel-${cur}`
        : phase === 'play'
          ? `play-${cur}`
          : phase === 'egg' || phase === 'hatch'
            ? `egg-${doneCount}`
            : phase === 'rest'
              ? `rest-${doneCount}`
              : phase === 'close' && added
                ? 'close-added'
                : phase
  /** 遊戲（含護眼休息）結束回到旅程、按返回回到路線圖：往回（上面那段淡出、下面的淡回來）；其他都往前 */
  const move = (): SceneMove => {
    if (backing.current) return { back: true }
    if (phase === 'play') return { back: false }
    const from = shownPhase.current
    return { back: from === 'play' || from === 'rest' }
  }

  if (!plan) return <div className="screen" />

  const st = item ? stationDef(item.station) : null
  // 背景：主題式冒險整趟都是主題的顏色與場景；舊的冒險照站點換顏色
  const bg = th ? th.tint : phase === 'route' ? 'var(--paper)' : (st?.tint ?? 'var(--paper)')
  return (
    <div className="screen travel" style={{ background: bg, transition: 'background .6s' } as CSSProperties} onPointerDown={skip}>
      {th ? <ThemeScenery def={th} /> : phase !== 'route' && <Scenery station="home" />}
      {/* 每一段（路線、旁白卡、遊戲、蛋、終點、回顧）都是一層：新的蓋好了舊的才退，故事背景一直都在，不會露出空白 */}
      <Scenes id={sceneId} move={move} className="scene is-clear">
        {scene()}
      </Scenes>
    </div>
  )

  function scene() {
    if (!plan) return null
    if (phase === 'rest')
      return (
        <EyeBreak
          onDone={() => {
            if (!bedtimeIfDue()) setPhase('travel')
          }}
        />
      )

    if (phase === 'play' && item)
      return (
        <PlayingGame.Provider value={item.game}>
          <PlayGame gameId={item.game} theme={plan.theme} onDone={onGameDone} onExit={up} />
        </PlayingGame.Provider>
      )

    return (
      <>
        {/* 返回鍵：每一段同一個位置（跟地圖、站點一樣），圖示畫成上一層的樣子 */}
        <div style={{ position: 'absolute', left: 26, top: 18, zIndex: 6 }}>
          <BackButton label={upIsHome ? '回首頁' : '回路線圖'} onTap={up}>
            {upIsHome ? <HomeIcon /> : <RouteIcon />}
          </BackButton>
        </div>

        {(phase === 'open' || phase === 'close') && script && (
          <StoryHome
            script={script}
            lines={phase === 'open' ? script.intro : script.end}
            beat={beat}
            focus={script.chapter.kind === 'classic' ? 'book' : added && phase === 'close' ? null : phase === 'open' ? 'hall' : 'living'}
            door={phase === 'open' ? (script.chapter.door ?? null) : null}
            items={house}
            added={phase === 'close' ? added : null}
          />
        )}

        {phase === 'route' && (
          <div className="screen">
            <RouteMap plan={plan} script={script} />
            {/* 走到一半回來的路線圖：停著等孩子，按了才繼續 */}
            {paused && (
              <button
                className="go-btn"
                style={{ top: 'auto', right: '5vw', bottom: 110, width: 'clamp(170px, 23vmin, 240px)' }}
                aria-label="出發"
                onClick={resume}
              >
                <svg viewBox="0 0 48 48" width="40%" aria-hidden="true">
                  <path d="M16 9 Q14 8 14 11 V37 Q14 40 16 39 L38 26 Q40 24 38 22 Z" fill="#FBF8F2" />
                </svg>
                <span>出發</span>
              </button>
            )}
          </div>
        )}

        {phase === 'travel' && th && item && (
          <div className="screen">
            <RouteStrip plan={plan} script={script} />
            {/* 故事的這一格：大大的圖在一張紙卡上，後面一圈淡淡的光。跟著這一段一起出現（不另外淡入），只多一點點長大 */}
            <motion.div className="story-card" style={{ '--deep': th.deep, '--tint': th.tint } as CSSProperties} initial={{ scale: RANGE.settle, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ duration: DUR.enter, ease: EASE.out }}>
              <span className="story-card-halo" />
              <TravelPic script={script!} cur={cur} beat={beat} />
            </motion.div>
            <motion.div style={{ position: 'absolute', bottom: '7vh', left: '50%', width: '40vmin', marginLeft: '-20vmin' }} initial={{ x: '-80vw' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 45, damping: 12 }} onAnimationComplete={() => setDriving(false)}>
              <Ride who={th.host} width="100%" moving={driving} mood="happy" />
            </motion.div>
          </div>
        )}

        {phase === 'travel' && !th && st && item && (
          <div className="screen">
            <RouteStrip plan={plan} />
            <motion.div className="travel-badge" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.3 }}>
              <Emoji name={st.icon} />
            </motion.div>
            <motion.div className="travel-name" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              {st.name}
            </motion.div>
            <motion.div style={{ position: 'absolute', bottom: '8vh', left: '50%', width: '40vmin', marginLeft: '-20vmin' }} initial={{ x: '-80vw' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 45, damping: 12 }} onAnimationComplete={() => setDriving(false)}>
              <Ride who={st.host} width="100%" moving={driving} mood="happy" />
            </motion.div>
          </div>
        )}

        {phase === 'finale' && th && (
          <div className="screen">
            <div className="story-finale" style={{ '--deep': th.deep, '--tint': th.tint } as CSSProperties}>
              <motion.span className="story-finale-ring" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 16 }} />
              {th.finale.map((ic, i) => (
                <motion.span
                  key={ic}
                  className={`story-finale-pic n${th.finale.length} i${i}`}
                  initial={{ scale: 0, y: 40, rotate: i % 2 ? 12 : -12 }}
                  animate={{ scale: 1, y: 0, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 240, damping: 13, delay: 0.25 + i * 0.18 }}
                >
                  <Emoji name={ic} />
                </motion.span>
              ))}
              <Sparkles count={14} />
            </div>
            <motion.div style={{ position: 'absolute', bottom: '6vh', left: '50%', width: '34vmin', marginLeft: '-34vmin' }} initial={{ x: '-70vw' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 45, damping: 12, delay: 0.2 }}>
              <Ride who={th.host} width="100%" moving={false} mood="cheer" />
            </motion.div>
          </div>
        )}

        {(phase === 'egg' || phase === 'hatch') && (
          <div className="screen" style={{ display: 'grid', placeItems: 'center' }}>
            <div style={{ position: 'relative' }} onPointerDown={phase === 'hatch' ? tapEgg : undefined}>
              <AnimatePresence>
                {!friend && (
                  <motion.div key="e" exit={{ scale: 1.6, opacity: 0, transition: { duration: 0.35 } }}>
                    <Egg cracks={Math.min(5, doneCount + taps)} wobble={phase === 'egg' || taps > 0 || nudge} size="34vmin" />
                  </motion.div>
                )}
              </AnimatePresence>
              {friend && (
                <motion.div style={{ width: '30vmin' }} initial={{ scale: 0, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }}>
                  <Emoji name={friend} />
                  <Sparkles count={18} />
                </motion.div>
              )}
            </div>
          </div>
        )}

        {phase === 'finish' && (
          <div className="screen" style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: '4vh' }}>
            <DayRecap plan={plan} />
            <div style={{ display: 'flex', gap: '3vmin', alignItems: 'flex-end' }}>
              <div style={{ width: '18vmin' }}>{plan.hatched && <Emoji name={plan.hatched} />}</div>
              <div style={{ width: '36vmin' }}>
                <Ride who="dodo" width="100%" mood="cheer" />
              </div>
            </div>
            <button className="go-btn" style={{ position: 'static', width: '18vmin' }} aria-label="回首頁" onClick={() => go({ name: 'home' })}>
              <svg viewBox="0 0 48 48" width="46%" aria-hidden="true">
                <path d="M8 22 L24 8 L40 22 V38 Q40 41 37 41 H11 Q8 41 8 38 Z" fill="#FBF8F2" />
              </svg>
            </button>
          </div>
        )}
      </>
    )
  }
}

/**
 * 旁白卡上的圖：這一站念到的那一句的圖（故事時間一站有好幾句，一句換一張，原地交叉淡化）。
 * 只有一張一般圖示的（通用章節）畫法跟以前一樣
 */
function TravelPic({ script, cur, beat }: { script: Script; cur: number; beat: number }) {
  const xs = script.stops[cur] ?? []
  const pic = xs[Math.min(beat, xs.length - 1)]?.pic ?? stopPic(script, cur)
  const plain = !pic.includes('+') && !pic.startsWith('@')
  if (plain && xs.length <= 1)
    return (
      <span className="story-card-pic">
        <Emoji name={pic} />
      </span>
    )
  return (
    <span className="story-card-pic" style={{ position: 'relative', aspectRatio: '1' }}>
      <Swap id={pic} className="swap-pic" arm={false} style={{ position: 'absolute', inset: 0 }}>
        <StoryPic pic={pic} />
      </Swap>
    </span>
  )
}

/**
 * 冒險裡的魔法屋（開場、結尾）：剖面圖淡淡的在後面，亮著今天用到的房間（門廊的門開著、書房、客廳）；
 * 前面一張故事卡放這一句的圖，下面是說這一句的恐龍（嘴巴跟著語音動）。
 * 這一篇講完了（added）：故事卡收起來，整間屋子亮起來，新的東西發著光。
 */
function StoryHome({ script, lines, beat, focus, door, items, added }: { script: Script; lines: Said[]; beat: number; focus: RoomId | null; door: ThemeId | null; items: string[]; added: string | null }) {
  const x = lines[Math.min(beat, Math.max(0, lines.length - 1))]
  const pic = x?.pic ?? lines.find((l) => l.pic)?.pic ?? script.look.icon
  // 彩虹蛋不會說話（用豆豆的聲音咕嚕咕嚕）：畫面上還是今天主持的恐龍
  const who = x && x.who !== 'egg' ? x.speaker : script.look.host
  return (
    <div className={`story-home${added ? ' is-added' : ''}`}>
      {!added && (
        <div className="story-home-side">
          <div className="story-home-card" style={{ '--deep': script.look.deep } as CSSProperties}>
            <Swap id={pic} className="swap-pic" arm={false}>
              <StoryPic pic={pic} />
            </Swap>
          </div>
          <div className="story-home-dino">
            <Dino who={who} mood="happy" size="100%" />
          </div>
        </div>
      )}
      <div className="house-frame">
        <MagicHouseArt focus={focus} door={door} items={items} fresh={added} celebrate dinos={false} />
      </div>
    </div>
  )
}

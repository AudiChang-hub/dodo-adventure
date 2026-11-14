import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../../games/lines'
import { useFlow } from '../../games/barge'
import { PACE } from '../../games/pace'
import { logTeach } from '../../lib/record'
import { noteTaught } from '../../lib/words'
import { wordKey } from '../../content/lexicon'
import { hasLine } from '../../content/lines'
import { bridgeKey, zhClip, zhWord } from '../../content/zh-words'
import { getSettings } from '../../lib/settings'
import { wordId, type LessonLetter } from './data'
import { Word } from './Word'
import { taughtWords } from './abc'
import { firstFinger } from '../../games/NotYet'

/** 產生好的中文音檔（public/audio/zh/index.json）：沒產生的詞只念英文，不留一段空白 */
let zhReady: Promise<Set<string>> | null = null
const loadZh = () =>
  (zhReady ??= fetch(`${import.meta.env.BASE_URL}audio/zh/index.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((j) => new Set(Object.keys(j).map((f) => `zh/${f}`)))
    .catch(() => new Set<string>()))

/** 一個字要念的台詞：Apple. → 蘋果 → Apple.（中文三明治）；家長關掉中文、或這個詞的中文音檔還沒產生，就只念 Apple. */
async function linesOf(w: string): Promise<string[]> {
  const head = `ph.word.${wordId(w)}`
  const key = wordKey(w)
  const b = bridgeKey(key, 'dodo')
  const zh = zhWord(key)?.zh ?? null
  const ready = await loadZh()
  const ok = getSettings().zhBridge !== false && hasLine(b) && !!zh && ready.has(zhClip(zh))
  return ok ? [head, b] : [head]
}

/**
 * 單字範例（英文課第 3 段）：兩個代表字（T-147，家長 2026-11-14：一個字母教 2 個；data.ts 每個字母 words 的前 2 個），每個念「Apple → 蘋果 → Apple」，念到哪一個哪一個亮起來。
 * 三張圖一進這一段就跟字幕一起出來（2026-11-01 PM：以前念「These words start with A!」的兩秒多畫面中間是空的，
 * 三歲孩子盯著空白超過一秒就會開始亂點）。
 * 念完自己往下走；念完之後點圖可以再聽一次。
 * 搶點（T-108，games/barge.ts）：三個字還沒念完就點圖：停掉介紹，直接念他點的那一個，念完照常停一下就往下走。
 * 正在念他點的那一個時又點：圖跳一下、有聲音，不重念。
 */
export function Words({ letter, onDone, onLit }: { letter: LessonLetter; onDone: () => void; /** 正在念第幾個字（陪玩小字跟著換，T-149 E3） */ onLit?: (i: number) => void }) {
  const words = taughtWords(letter)
  const [lit, setLit] = useState(-1)
  useEffect(() => {
    if (lit >= 0) onLit?.(lit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lit])
  const [bump, setBump] = useState<{ i: number; n: number } | null>(null)
  const talking = useRef(true)
  /** 開頭三個字的介紹還在念（可以被搶掉） */
  const intro = useRef(true)
  const live = useRef(true)
  const leaveAt = useRef(0)
  const flow = useFlow()
  const mountAt = useRef(performance.now())
  /** 介紹念完（或被搶掉）：開始倒數往下走（只開一次） */
  const settle = useRef<() => void>(() => {})

  useEffect(() => {
    live.current = true
    mountAt.current = performance.now()
    let timer = 0
    let ticking = false
    settle.current = () => {
      if (ticking || !live.current) return
      ticking = true
      intro.current = false
      noteTaught(words.map((w) => wordKey(w.w)))
      leaveAt.current = performance.now() + 1500
      const tick = () => {
        if (!live.current) return
        if (!talking.current && performance.now() >= leaveAt.current) return onDone()
        timer = window.setTimeout(tick, 200)
      }
      tick()
    }
    void (async () => {
      const ok = flow.begin(live)
      await wait(300)
      if (!ok()) return
      await say(`ph.${letter.l}.words`)
      for (let i = 0; i < words.length; i++) {
        if (!ok()) return
        const t = performance.now()
        setLit(i)
        await wait(350)
        const ls = await linesOf(words[i].w)
        if (!ok()) return
        await say(...ls)
        if (!ok()) return
        void logTeach({ station: 'english', game: 'lesson-en', itemId: `word:${wordKey(words[i].w)}`, skill: `word:${wordKey(words[i].w)}`, level: 1, ms: Math.round(performance.now() - t) })
        await wait(250)
      }
      if (!ok()) return
      setLit(-1)
      talking.current = false
      settle.current()
    })()
    return () => {
      live.current = false
      clearTimeout(timer)
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async (i: number) => {
    // 介紹還沒念完就點：停掉介紹，直接念他點的那一個
    // 剛出來的 0.5 秒（PACE.BARGE_ARM）：上一段連點的手指先不算
    if (intro.current && performance.now() - mountAt.current < PACE.BARGE_ARM) return void sfx.notYet()
    if (intro.current) {
      flow.cut()
      talking.current = false
      settle.current()
    }
    if (talking.current) return void sfx.notYet()
    // 真的要念了才跳一下；念到一半又點只有很輕的一聲「嗯？」，不跳（T-109：亂點沒有好玩的反應）
    setBump((b) => ({ i, n: (b?.n ?? 0) + 1 }))
    talking.current = true
    setLit(i)
    await say(...(await linesOf(words[i].w)))
    if (!live.current) return
    setLit(-1)
    talking.current = false
    leaveAt.current = performance.now() + 1500
  }

  return (
    <div className="en-words">
      {words.map((w, i) => (
        <motion.button
          key={w.w}
          type="button"
          className={`en-word-card${lit === i ? ' is-lit' : ''}`}
          aria-label={w.w}
          // 手指一按下就有反應（T-112：以前用 click，手指滑一下就被取消）；鍵盤照樣可以按
          onPointerDown={(e) => {
            if (firstFinger(e.nativeEvent)) void tap(i)
          }}
          onClick={(e) => {
            if (e.detail === 0) void tap(i)
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 + i * 0.12 }}
        >
          <span key={bump?.i === i ? bump.n : 0} className={bump?.i === i ? 'en-hop' : undefined}>
            <Emoji name={w.icon} />
          </span>
          <Word w={w.w} l={letter.l} />
        </motion.button>
      ))}
    </div>
  )
}

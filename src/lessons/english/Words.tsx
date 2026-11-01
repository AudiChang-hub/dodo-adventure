import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../../games/lines'
import { logTeach } from '../../lib/record'
import { noteTaught } from '../../lib/words'
import { wordKey } from '../../content/lexicon'
import { hasLine } from '../../content/lines'
import { bridgeKey, zhClip, zhWord } from '../../content/zh-words'
import { getSettings } from '../../lib/settings'
import { wordId, type LessonLetter } from './data'
import { Word } from './Word'

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
 * 單字範例（英文課第 3 段）：三個今天字母開頭的字，一個一個出來，每個念「Apple → 蘋果 → Apple」。
 * 念完自己往下走；念完之後點圖可以再聽一次。念的時候點圖：圖跳一下、有聲音，不打斷。
 */
export function Words({ letter, onDone }: { letter: LessonLetter; onDone: () => void }) {
  const [shown, setShown] = useState(0)
  const [lit, setLit] = useState(-1)
  const [bump, setBump] = useState<{ i: number; n: number } | null>(null)
  const talking = useRef(true)
  const live = useRef(true)
  const leaveAt = useRef(0)

  useEffect(() => {
    live.current = true
    let timer = 0
    void (async () => {
      await wait(300)
      if (!live.current) return
      await say(`ph.${letter.l}.words`)
      for (let i = 0; i < letter.words.length; i++) {
        if (!live.current) return
        const t = performance.now()
        setShown(i + 1)
        setLit(i)
        await wait(450)
        const ls = await linesOf(letter.words[i].w)
        if (!live.current) return
        await say(...ls)
        if (!live.current) return
        void logTeach({ station: 'english', game: 'lesson-en', itemId: `word:${wordKey(letter.words[i].w)}`, skill: `word:${wordKey(letter.words[i].w)}`, level: 1, ms: Math.round(performance.now() - t) })
        await wait(250)
      }
      noteTaught(letter.words.map((w) => wordKey(w.w)))
      setLit(-1)
      talking.current = false
      leaveAt.current = performance.now() + 1500
      const tick = () => {
        if (!live.current) return
        if (!talking.current && performance.now() >= leaveAt.current) return onDone()
        timer = window.setTimeout(tick, 200)
      }
      tick()
    })()
    return () => {
      live.current = false
      clearTimeout(timer)
      stopSpeech()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = async (i: number) => {
    setBump((b) => ({ i, n: (b?.n ?? 0) + 1 }))
    if (talking.current) return void sfx.pop()
    talking.current = true
    setLit(i)
    await say(...(await linesOf(letter.words[i].w)))
    if (!live.current) return
    setLit(-1)
    talking.current = false
    leaveAt.current = performance.now() + 1500
  }

  return (
    <div className="en-words">
      {letter.words.map((w, i) => (
        <motion.button
          key={w.w}
          type="button"
          className={`en-word-card${lit === i ? ' is-lit' : ''}`}
          aria-label={w.w}
          onClick={() => void tap(i)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: i < shown ? 1 : 0, y: i < shown ? 0 : 20 }}
          transition={{ duration: 0.5 }}
          style={{ pointerEvents: i < shown ? 'auto' : 'none' }}
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

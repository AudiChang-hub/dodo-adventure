import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Emoji } from '../../art/Emoji'
import { say, sfx, stopSpeech } from '../../lib/audio'
import { wait } from '../../games/lines'
import { logTeach } from '../../lib/record'
import { noteTaught } from '../../lib/words'
import { wordKey } from '../../content/lexicon'
import { wordId, type LessonLetter } from './data'
import { Word } from './Word'


/**
 * 單字範例（英文課第 3 段）：三個今天字母開頭的字，每個只念英文（Apple.；中文三明治 2026-11-03 拿掉了），念到哪一個哪一個亮起來。
 * 三張圖一進這一段就跟字幕一起出來（2026-11-01 PM：以前念「These words start with A!」的兩秒多畫面中間是空的，
 * 三歲孩子盯著空白超過一秒就會開始亂點）。
 * 念完自己往下走；念完之後點圖可以再聽一次。念的時候點圖：圖跳一下、有聲音，不打斷。
 */
export function Words({ letter, onDone }: { letter: LessonLetter; onDone: () => void }) {
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
        setLit(i)
        await wait(350)
        await say(`ph.word.${wordId(letter.words[i].w)}`)
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
    await say(`ph.word.${wordId(letter.words[i].w)}`)
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

import { line, plainText, segments, type Line, type Speaker } from '../content/lines'
import { clipName, segmentGap } from './clip'

const BASE = import.meta.env.BASE_URL

let ctx: AudioContext | null = null
let master: GainNode
let voiceGain: GainNode
let sfxGain: GainNode
let analyser: AnalyserNode
let levelBuf: Uint8Array<ArrayBuffer>

function ensure(): AudioContext {
  if (ctx) return ctx
  ctx = new AudioContext({ latencyHint: 'interactive' })
  master = ctx.createGain()
  master.connect(ctx.destination)
  voiceGain = ctx.createGain()
  sfxGain = ctx.createGain()
  sfxGain.gain.value = 0.55
  analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  levelBuf = new Uint8Array(analyser.fftSize)
  voiceGain.connect(analyser)
  analyser.connect(master)
  sfxGain.connect(master)
  return ctx
}

/** 必須在使用者第一次點擊時呼叫，瀏覽器才允許出聲 */
export async function unlockAudio() {
  const c = ensure()
  if (c.state !== 'running') await c.resume()
}

export function setVolume(v: number) {
  ensure()
  master.gain.value = v
}

// ── 說話者與嘴巴開合 ───────────────────────────────────────
type LevelListener = (speaker: Speaker | null, level: number) => void
const listeners = new Set<LevelListener>()
let speaking: Speaker | null = null
let fakeLevel = false
let rafId = 0

export function onSpeakLevel(fn: LevelListener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function tick() {
  let level = 0
  if (speaking) {
    if (fakeLevel) {
      const t = performance.now() / 1000
      level = 0.35 + 0.35 * Math.abs(Math.sin(t * 9)) * (0.6 + 0.4 * Math.sin(t * 3.3))
    } else {
      analyser.getByteTimeDomainData(levelBuf)
      let sum = 0
      for (let i = 0; i < levelBuf.length; i++) {
        const d = (levelBuf[i] - 128) / 128
        sum += d * d
      }
      level = Math.min(1, Math.sqrt(sum / levelBuf.length) * 5.5)
    }
  }
  listeners.forEach((fn) => fn(speaking, level))
  if (speaking) rafId = requestAnimationFrame(tick)
}

function startLevel(s: Speaker, fake: boolean) {
  speaking = s
  fakeLevel = fake
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(tick)
}

function stopLevel() {
  speaking = null
  cancelAnimationFrame(rafId)
  listeners.forEach((fn) => fn(null, 0))
}

// ── 音檔載入 ───────────────────────────────────────────────
const buffers = new Map<string, Promise<AudioBuffer | null>>()

function load(name: string): Promise<AudioBuffer | null> {
  let p = buffers.get(name)
  if (!p) {
    p = fetch(`${BASE}audio/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((b) => (b.byteLength ? ensure().decodeAudioData(b) : null))
      .catch(() => null)
    buffers.set(name, p)
  }
  return p
}

export function preload(keys: string[]) {
  for (const k of keys) {
    const l = line(k)
    for (const s of segments(l)) load(clipName(l, s))
  }
}

// ── 字幕用的逐字時間（gen_audio.py 產生，與音檔放在一起）──────
/** [開始毫秒, 結束毫秒, 字]，相對於該段音檔開頭 */
export type WordTiming = [number, number, string]

let timings: Promise<Record<string, WordTiming[]>> | null = null

function loadTimings() {
  timings ??= fetch(`${BASE}audio/timings.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return timings
}

// ── 播放事件：給字幕用 ───────────────────────────────────────
export type SpeechEvent =
  /** 一句台詞的第 seg 段在 AudioContext 時間 at（秒）開始播放；words 為 null 表示沒有時間資料 */
  | { type: 'seg'; key: string; line: Line; seg: number; at: number; dur: number; words: WordTiming[] | null }
  /** 平板內建語音備援：沒有時間資料，整句一次亮起 */
  | { type: 'whole'; key: string; line: Line }
  /** 這句唸完了 */
  | { type: 'end'; key: string }
  /** 被 stopSpeech 打斷（離開畫面、遊戲結束），字幕要收起來 */
  | { type: 'stop' }
  /** 被 hushSpeech 打斷（同一個畫面裡點一下跳過）：聲音停了，字幕留著等下一句 */
  | { type: 'cut' }

type SpeechListener = (e: SpeechEvent) => void
const speechListeners = new Set<SpeechListener>()

export function onSpeech(fn: SpeechListener) {
  speechListeners.add(fn)
  return () => {
    speechListeners.delete(fn)
  }
}

const emit = (e: SpeechEvent) => speechListeners.forEach((fn) => fn(e))

/** 喇叭此刻正在播出的 AudioContext 時間（秒），已扣掉輸出延遲 */
export function audioClock(): number {
  if (!ctx) return 0
  const ts = ctx.getOutputTimestamp?.()
  if (ts?.contextTime && ts.performanceTime) return ts.contextTime + (performance.now() - ts.performanceTime) / 1000
  return ctx.currentTime - (ctx.outputLatency || 0) - ctx.baseLatency
}

// ── 播放 ───────────────────────────────────────────────────
let current: { stop: () => void } | null = null
let token = 0
/** 正在進行的那一次 say 的 token；0 表示現在沒在說話（給「點字幕重播」判斷） */
let busy = 0

function halt() {
  token++
  busy = 0
  current?.stop()
  current = null
  speechSynthesis?.cancel()
  stopLevel()
}

export function stopSpeech() {
  halt()
  emit({ type: 'stop' })
}

/** 同一個畫面裡跳過正在說的話（點一下跳過、換一張貼紙）：聲音停下，字幕留著，等下一句來取代 */
export function hushSpeech() {
  halt()
  emit({ type: 'cut' })
}

/** 現在有沒有在說話（包含正在載入音檔、段與段之間的停頓） */
export const isSpeaking = () => busy !== 0

/**
 * 點字幕重播：把這一句再唸一次。只在沒有說話的時候才唸，不會打斷遊戲正在等的台詞；
 * 之後遊戲要說新的話時，照常把重播打斷。回傳有沒有開始唸。
 */
export function replayLine(key: string): boolean {
  if (busy) return false
  void say(key)
  return true
}

/** 依序說出多句台詞；被新的 say 或 stopSpeech 打斷時提早結束 */
export async function say(...keys: string[]): Promise<void> {
  // 不發 stop：字幕要接著顯示下一句，問題句的答案也要能補上
  halt()
  const my = token
  busy = my
  try {
    for (const k of keys) {
      if (my !== token) return
      await playLine(k, line(k), my)
    }
  } finally {
    if (busy === my) busy = 0
  }
}

/** 一句台詞可能分成幾段（感嘆詞、鋪陳段、加重的目標字），段與段之間停一下（長度見 clip.ts 的 segmentGap） */
async function playLine(key: string, l: Line, my: number) {
  const segs = segments(l)
  const names = segs.map((s) => clipName(l, s))
  const [bufs, times] = await Promise.all([Promise.all(names.map(load)), loadTimings()])
  if (my !== token) return
  if (bufs.some((b) => !b)) return speakFallback(key, l, my)
  for (let i = 0; i < bufs.length; i++) {
    if (my !== token) return
    if (i > 0) await new Promise((r) => setTimeout(r, segmentGap(l, i)))
    if (my !== token) return
    const buf = bufs[i]!
    const words = times[names[i]] ?? null
    const dur = audibleDuration(buf, words)
    await playBuffer(buf, l.speaker, dur, (at) => emit({ type: 'seg', key, line: l, seg: i, at, dur, words }))
  }
  if (my === token) emit({ type: 'end', key })
}

/** Edge TTS 的音檔結尾約有 1.1 秒靜音，會讓「目標字前停 0.1 秒」變成停一秒多，也拖長教學卡 */
const TAIL_PAD_S = 0.08
const trimCache = new WeakMap<AudioBuffer, number>()

/** 實際有聲音的長度：有逐字時間就用最後一個字的結束點，沒有就掃描波形 */
function audibleDuration(buf: AudioBuffer, words: WordTiming[] | null): number {
  if (words?.length) return Math.min(buf.duration, words[words.length - 1][1] / 1000 + TAIL_PAD_S)
  const cached = trimCache.get(buf)
  if (cached !== undefined) return cached
  const data = buf.getChannelData(0)
  let last = data.length - 1
  while (last > 0 && Math.abs(data[last]) < 0.01) last--
  const dur = Math.min(buf.duration, last / buf.sampleRate + TAIL_PAD_S)
  trimCache.set(buf, dur)
  return dur
}

function playBuffer(buf: AudioBuffer, speaker: Speaker, dur: number, onStart: (at: number) => void) {
  const c = ensure()
  return new Promise<void>((resolve) => {
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(voiceGain)
    src.onended = () => {
      if (current?.stop === stop) current = null
      stopLevel()
      resolve()
    }
    const stop = () => {
      src.onended = null
      try {
        src.stop()
      } catch {
        /* 已經結束 */
      }
      resolve()
    }
    current = { stop }
    startLevel(speaker, false)
    const at = c.currentTime
    src.start(at, 0, dur)
    onStart(at)
  })
}

/** 沒有音檔時，用平板內建語音頂替 */
function speakFallback(key: string, l: Line, my: number): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve()
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(plainText(l))
    u.lang = 'en-US'
    u.rate = 0.85
    u.pitch = l.speaker === 'momo' ? 1 : 1.25
    const done = () => {
      if (my === token) {
        stopLevel()
        emit({ type: 'end', key })
      }
      resolve()
    }
    u.onend = done
    u.onerror = done
    current = { stop: () => { speechSynthesis.cancel(); resolve() } }
    startLevel(l.speaker, true)
    emit({ type: 'whole', key, line: l })
    speechSynthesis.speak(u)
  })
}

// ── 音效：全部即時合成，不需要檔案 ──────────────────────────
function tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slideTo?: number) {
  const c = ensure()
  const t = c.currentTime + at
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(sfxGain)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, gain: number, at = 0, freq = 1800) {
  const c = ensure()
  const t = c.currentTime + at
  const len = Math.floor(c.sampleRate * dur)
  const b = c.createBuffer(1, len, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const s = c.createBufferSource()
  s.buffer = b
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  const g = c.createGain()
  g.gain.value = gain
  s.connect(f).connect(g).connect(sfxGain)
  s.start(t)
}

export const sfx = {
  tap: () => tone(660, 0.08, 'sine', 0.25, 0, 880),
  pop: () => tone(420, 0.12, 'sine', 0.35, 0, 980),
  correct: () => {
    tone(784, 0.16, 'triangle', 0.3)
    tone(1047, 0.22, 'triangle', 0.28, 0.09)
    tone(1568, 0.28, 'sine', 0.12, 0.16)
  },
  gentle: () => tone(330, 0.18, 'sine', 0.18, 0, 262),
  whoosh: () => noise(0.35, 0.5, 0, 900),
  crack: () => {
    noise(0.06, 0.9, 0, 3200)
    noise(0.05, 0.7, 0.08, 2600)
  },
  hatch: () => {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.22, i * 0.08))
    noise(0.4, 0.25, 0.1, 5000)
  },
  count: (n: number) => tone(440 * Math.pow(2, (n % 12) / 12), 0.14, 'triangle', 0.25),
  ink: () => noise(0.04, 0.08, 0, 4000),
  done: () => {
    ;[392, 523, 659, 784].forEach((f, i) => tone(f, 0.35, 'triangle', 0.22, i * 0.11))
  },
  // 成就感：星星落進進度列（很輕的一聲叮）、每局回顧的一張張小圖（一張比一張高一點）、里程碑（柔和的鈴聲，不用嘹亮的號角）
  star: () => tone(1319, 0.16, 'sine', 0.14, 0, 1760),
  chime: (i: number) => tone(659 * Math.pow(2, (Math.min(i, 9) * 2) / 12), 0.2, 'sine', 0.13),
  milestone: () => {
    ;[523, 784, 1047, 1319].forEach((f, i) => tone(f, 0.55, 'sine', 0.13, i * 0.13))
    tone(262, 0.9, 'triangle', 0.08, 0)
  },
}

import { line, segments, type Line, type Speaker } from '../content/lines'
import { SEGMENT_GAP_MS } from '../content/voices'
import { clipName } from './clip'

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

// ── 播放 ───────────────────────────────────────────────────
let current: { stop: () => void } | null = null
let token = 0

export function stopSpeech() {
  token++
  current?.stop()
  current = null
  speechSynthesis?.cancel()
  stopLevel()
}

/** 依序說出多句台詞；被新的 say 或 stopSpeech 打斷時提早結束 */
export async function say(...keys: string[]): Promise<void> {
  stopSpeech()
  const my = token
  for (const k of keys) {
    if (my !== token) return
    await playLine(line(k), my)
  }
}

/** 一句台詞可能分成兩段（目標字另外加重），兩段之間停一下 */
async function playLine(l: Line, my: number) {
  const segs = segments(l)
  const bufs = await Promise.all(segs.map((s) => load(clipName(l, s))))
  if (my !== token) return
  if (bufs.some((b) => !b)) return speakFallback(l, my)
  for (let i = 0; i < bufs.length; i++) {
    if (my !== token) return
    if (i > 0) await new Promise((r) => setTimeout(r, SEGMENT_GAP_MS))
    if (my !== token) return
    await playBuffer(bufs[i]!, l.speaker)
  }
}

function playBuffer(buf: AudioBuffer, speaker: Speaker) {
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
    src.start()
  })
}

/** 沒有音檔時，用平板內建語音頂替 */
function speakFallback(l: Line, my: number): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve()
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(l.text.replace('|', ' '))
    u.lang = 'en-US'
    u.rate = 0.85
    u.pitch = l.speaker === 'momo' ? 1 : 1.25
    const done = () => {
      if (my === token) stopLevel()
      resolve()
    }
    u.onend = done
    u.onerror = done
    current = { stop: () => { speechSynthesis.cancel(); resolve() } }
    startLevel(l.speaker, true)
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
}

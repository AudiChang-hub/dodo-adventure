// 鼓聲停的鼓（T-160）：Web Audio 即時合成，不用音檔、不唱歌。8 種音色（大鼓、邦哥鼓、小鼓、通鼓、木魚、沙鈴、太鼓、鋼鼓），
// 每種一個低音、一個高音、一個重音；節奏照 ./plan.ts 的 PATTERNS 打。聲音走 lib/audio 的音效出口（跟著家長區的音量）。
import { sfxBus } from '../../lib/audio'
import { hitsOf, type DrumSegment, type KitId } from './plan'

let noiseBuf: AudioBuffer | null = null
function noiseBuffer(ctx: AudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf
  const len = Math.floor(ctx.sampleRate * 0.8)
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}

/** 一個音：從 f0 滑到 f1（鼓皮被打下去音高往下掉） */
function osc(t: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: number) {
  const { ctx, out } = sfxBus()
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.03)
}

/** 一陣沙沙聲（小鼓的響線、沙鈴、太鼓的鼓面） */
function hiss(t: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
  const { ctx, out } = sfxBus()
  const s = ctx.createBufferSource()
  s.buffer = noiseBuffer(ctx)
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(out)
  s.start(t)
  s.stop(t + dur + 0.03)
}

type Voice = (t: number) => void
interface Kit {
  low: Voice
  high: Voice
  accent: Voice
}

export const KITS: Record<KitId, Kit> = {
  bass: {
    low: (t) => osc(t, 'sine', 120, 48, 0.36, 0.9),
    high: (t) => (osc(t, 'sine', 190, 95, 0.18, 0.45), hiss(t, 0.03, 0.25, 'highpass', 3000)),
    accent: (t) => (osc(t, 'sine', 140, 42, 0.5, 1), hiss(t, 0.06, 0.4, 'bandpass', 1500)),
  },
  bongo: {
    low: (t) => osc(t, 'sine', 270, 205, 0.18, 0.6),
    high: (t) => osc(t, 'sine', 420, 340, 0.13, 0.55),
    accent: (t) => (osc(t, 'sine', 300, 210, 0.25, 0.75), osc(t, 'sine', 450, 340, 0.18, 0.4)),
  },
  snare: {
    low: (t) => osc(t, 'sine', 130, 52, 0.28, 0.8),
    high: (t) => (hiss(t, 0.16, 0.5, 'bandpass', 1900), osc(t, 'triangle', 200, 170, 0.08, 0.3)),
    accent: (t) => (osc(t, 'sine', 130, 50, 0.35, 0.9), hiss(t, 0.24, 0.6, 'bandpass', 1700)),
  },
  tom: {
    low: (t) => osc(t, 'triangle', 150, 92, 0.32, 0.75),
    high: (t) => osc(t, 'triangle', 230, 150, 0.24, 0.65),
    accent: (t) => (osc(t, 'triangle', 180, 90, 0.42, 0.85), hiss(t, 0.05, 0.25, 'lowpass', 900)),
  },
  wood: {
    low: (t) => osc(t, 'sine', 720, 690, 0.08, 0.6),
    high: (t) => osc(t, 'sine', 1150, 1100, 0.06, 0.5),
    accent: (t) => (osc(t, 'sine', 620, 600, 0.12, 0.7), osc(t, 'sine', 1240, 1200, 0.08, 0.3)),
  },
  shaker: {
    low: (t) => osc(t, 'sine', 95, 50, 0.22, 0.65),
    high: (t) => hiss(t, 0.07, 0.45, 'highpass', 6500),
    accent: (t) => (osc(t, 'sine', 100, 45, 0.3, 0.8), hiss(t, 0.14, 0.5, 'highpass', 5000)),
  },
  taiko: {
    low: (t) => (osc(t, 'sine', 80, 40, 0.6, 1), hiss(t, 0.08, 0.3, 'lowpass', 300)),
    high: (t) => osc(t, 'square', 880, 860, 0.03, 0.12),
    accent: (t) => (osc(t, 'sine', 90, 38, 0.8, 1), hiss(t, 0.12, 0.4, 'lowpass', 400)),
  },
  steel: {
    low: (t) => (osc(t, 'sine', 392, 392, 0.42, 0.45), osc(t, 'sine', 784, 784, 0.25, 0.12)),
    high: (t) => (osc(t, 'sine', 587, 587, 0.32, 0.4), osc(t, 'sine', 1174, 1174, 0.2, 0.1)),
    accent: (t) => (osc(t, 'sine', 523, 523, 0.5, 0.5), osc(t, 'sine', 659, 659, 0.5, 0.3), osc(t, 'sine', 1046, 1046, 0.3, 0.1)),
  },
}

/** 加重的最後一下之後多久才算「停了」（那一聲的尾巴） */
export const ACCENT_TAIL = 0.2

/**
 * 打一段鼓：排程（往前看 0.15 秒）、每一下叫 onHit（畫面上的鼓跟著動）。
 * 回傳這一段在 performance.now 的開始、停的時間（毫秒）。cancel 停掉還沒打的。
 */
export function playSegment(seg: DrumSegment, kit: KitId, accentEnd: boolean, onHit: (role: number) => void): { start: number; stop: number; cancel: () => void } {
  const { ctx } = sfxBus()
  const t0 = ctx.currentTime + 0.12
  const hits = hitsOf(seg, accentEnd)
  const k = KITS[kit]
  let next = 0
  const timers: number[] = []
  const pump = () => {
    const until = ctx.currentTime + 0.15
    while (next < hits.length && t0 + hits[next].t < until) {
      const h = hits[next++]
      const at = t0 + h.t
      ;(h.role === 3 ? k.accent : h.role === 2 ? k.high : k.low)(at)
      timers.push(window.setTimeout(() => onHit(h.role), Math.max(0, (at - ctx.currentTime) * 1000)))
    }
  }
  pump()
  const iv = window.setInterval(pump, 30)
  const perf0 = performance.now() + (t0 - ctx.currentTime) * 1000
  const end = seg.play + (accentEnd ? ACCENT_TAIL : 0)
  return {
    start: perf0,
    stop: perf0 + end * 1000,
    cancel: () => {
      clearInterval(iv)
      timers.forEach(clearTimeout)
      next = hits.length
    },
  }
}

/** 停的時候還在點：滑哨一樣「咻～」往下又往上（好笑，不是答錯的聲音） */
export function whoa() {
  const { ctx } = sfxBus()
  const t = ctx.currentTime
  const { out } = sfxBus()
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(820, t)
  o.frequency.exponentialRampToValueAtTime(330, t + 0.32)
  o.frequency.exponentialRampToValueAtTime(700, t + 0.6)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.03)
  g.gain.setValueAtTime(0.22, t + 0.5)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.7)
}

/** 跳一下舞（點角色）：很輕的一聲「嘟」，音高跟著第幾下變（不蓋過鼓） */
export function step(n: number) {
  const { ctx } = sfxBus()
  osc(ctx.currentTime, 'triangle', 523 * Math.pow(2, ((n % 5) * 2) / 12), 523 * Math.pow(2, ((n % 5) * 2) / 12), 0.1, 0.12)
}

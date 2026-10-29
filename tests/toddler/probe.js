// 三歲模擬測試的頁內探針：在 App 的程式碼之前注入（page.addInitScript），只觀察、不改變行為。
// 例外：Math.random 換成固定 seed 的版本，題目才能重現（seed 由測試端寫進 window.__toddlerSeed）。
;(() => {
  if (window.__toddler) return
  const now = () => performance.now()
  const P = (window.__toddler = {
    episodes: [], // 逐幀異常（閃動、空白、縮放），連續的幀合併成一段
    voices: [], // 每一段語音：開始、預計結束、字幕
    overlaps: [], // 兩句語音同時在播
    tts: [], // 退回平板內建語音（代表音檔缺漏）
    errors: [], // window.onerror / unhandledrejection
    mut: 0, // DOM 結構變動次數（新增、移除節點）
    lastMut: 0,
    resp: 0, // TOUCH-6「每一下都有回應」：結構、class 變動，或點到的元素附近的 style 變動
    sfx: 0, // 音效（合成的 oscillator、非語音的 buffer）
    frames: 0,
    navMarks: [], // 測試端標記的時間點
  })

  // ── 固定 seed 的 Math.random ─────────────────────────────
  let s = Number(sessionStorage.getItem('toddler.seed') || 0) >>> 0
  if (s) {
    // 每次載入（重新整理）都換一段，但同一個 seed 序列相同
    const n = Number(sessionStorage.getItem('toddler.loads') || 0) + 1
    sessionStorage.setItem('toddler.loads', String(n))
    s = (s + n * 0x9e3779b9) >>> 0
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  // ── 錯誤 ────────────────────────────────────────────────
  addEventListener('error', (e) => P.errors.push({ t: now(), msg: String(e.message || e.error || e), src: e.filename ? `${e.filename}:${e.lineno}` : '' }))
  addEventListener('unhandledrejection', (e) => P.errors.push({ t: now(), msg: 'unhandledrejection: ' + String(e.reason && (e.reason.stack || e.reason.message || e.reason)) }))

  // ── 語音：接到 AnalyserNode 的那個 GainNode 是說話的聲道（lib/audio.ts 的 voiceGain） ──
  const voiceBus = new WeakSet()
  const connect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (typeof AnalyserNode !== 'undefined' && dest instanceof AnalyserNode) voiceBus.add(this)
    if (this instanceof AudioBufferSourceNode && voiceBus.has(dest)) this.__voice = true
    return connect.call(this, dest, ...rest)
  }
  const subtitle = () => {
    const ws = document.querySelectorAll('.sub-pill .sub-text .sub-w')
    const t = ws.length ? [...ws].map((w) => w.textContent.trim()).filter(Boolean).join(' ') : document.querySelector('.sub-pill .sub-text')?.textContent
    return t?.replace(/\s+/g, ' ').trim() || null
  }
  const start = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (when, offset, dur) {
    if (this.__voice) {
      const t = now()
      const d = ((dur ?? this.buffer?.duration ?? 0) - (offset || 0)) * 1000
      const rec = { t, end: t + d, dur: Math.round(d), text: null, stopped: null }
      const playing = P.voices.filter((v) => v.stopped == null && v.end > t + 40)
      if (playing.length) P.overlaps.push({ t, a: playing.map((v) => v.text), b: rec })
      P.voices.push(rec)
      const stop = this.stop
      this.stop = (...a) => {
        if (rec.stopped == null) rec.stopped = now()
        return stop.apply(this, a)
      }
      this.addEventListener('ended', () => {
        if (rec.stopped == null) rec.stopped = now()
      })
      setTimeout(() => (rec.text = subtitle()), 120)
    }
    else P.sfx++
    return start.call(this, when, offset, dur)
  }
  const oscStart = OscillatorNode.prototype.start
  OscillatorNode.prototype.start = function (...a) {
    P.sfx++
    return oscStart.apply(this, a)
  }
  if ('speechSynthesis' in window) {
    const speak = speechSynthesis.speak.bind(speechSynthesis)
    speechSynthesis.speak = (u) => {
      P.tts.push({ t: now(), text: u.text })
      // 測試瀏覽器沒有語音引擎：照常交給它，再補一個結束事件，免得流程等不到
      speak(u)
      setTimeout(() => u.onend && u.onend(new Event('end')), 1200)
    }
  }

  // ── DOM 結構變動：判斷畫面「有沒有在往下走」 ───────────────
  let down = null
  addEventListener('pointerdown', (e) => (down = { t: now(), el: e.target }), true)
  const near = (a, b) => {
    // a 是 b 或 b 往上 4 層以內的祖先，或 a 在 b 裡面
    if (!a || !b) return false
    if (b.contains && b.contains(a)) return true
    for (let n = b, i = 0; n && i < 4; n = n.parentElement, i++) if (n === a) return true
    return false
  }
  const mo = new MutationObserver((list) => {
    const t = now()
    for (const m of list) {
      if (m.type === 'childList' || m.attributeName === 'class') P.resp++
      else if (down && t - down.t < 400 && near(m.target, down.el)) P.resp++
    }
    for (const m of list) if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
      P.mut++
      P.lastMut = now()
      return
    }
  })
  const watch = () => mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-demo'] })
  if (document.body) watch()
  else addEventListener('DOMContentLoaded', watch)

  // ── 現在是不是在教（教學卡、示範） ──────────────────────────
  const shown = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    // 實際看到的透明度：一路乘上祖先（淡出中的手、收起來的卡片不算）
    let o = 1
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.visibility === 'hidden' || cs.display === 'none') return false
      o *= Number(cs.opacity)
      if (n.classList.contains('scene')) break
    }
    return o > 0.3
  }
  P.teaching = () => {
    // 只看現在這一層畫面
    const live = [...document.querySelectorAll('.scene')].filter((e) => !e.inert).pop() || document
    const card = live.querySelector('.teach-layer, .card-fg .teach-card')
    if (shown(card)) return card.classList.contains('ready') || card.querySelector('.teach-card.ready') ? 'teach-card-ready' : 'teach-card'
    const demo = live.querySelector('[data-demo="1"], [data-phase="demo"]')
    if (demo) return 'demo'
    // 示範、說明、念題目中（還不收作答）：作答區上的擋板或畫布標著 data-accepting="false"（T-51）
    if ([...live.querySelectorAll('[data-accepting="false"]')].some((e) => e.getBoundingClientRect().width > 2)) return 'wait'
    // 示範的手（數數、選擇、排順序）；一起練時指著答案的手也是這個，測試端只把「自己答」的紀錄當成誤記
    if ([...live.querySelectorAll('.demo-hand, [data-demo-hand]')].some(shown)) return 'hand'
    return null
  }
  P.phase = () => {
    const live = [...document.querySelectorAll('.scene')].filter((e) => !e.inert).pop() || document
    return live.querySelector('[data-phase]')?.getAttribute('data-phase') || null
  }

  // ── 逐幀檢查：空白、透明度來回、縮放 ─────────────────────────
  const PTS = [
    [0.03, 0.03], [0.5, 0.03], [0.97, 0.03],
    [0.03, 0.5], [0.5, 0.5], [0.97, 0.5],
    [0.03, 0.97], [0.5, 0.97], [0.97, 0.97],
  ]
  const scaleOf = (cs) => {
    const m = cs.transform
    if (!m || m === 'none') return 1
    const v = new DOMMatrixReadOnly(m)
    return Math.hypot(v.a, v.b)
  }
  const open = new Map() // kind → 正在進行的那一段
  function note(kind, t, data) {
    let ep = open.get(kind)
    if (ep && t - ep.last < 80 && ep.key === data.key) {
      ep.last = t
      ep.frames++
      if (data.worst != null && data.worst < ep.worst) Object.assign(ep, { worst: data.worst, at: data })
      if (data.peak != null && data.peak > ep.peak) Object.assign(ep, { peak: data.peak, at: data })
      return
    }
    ep = { kind, key: data.key, t, last: t, frames: 1, worst: data.worst ?? Infinity, peak: data.peak ?? -Infinity, at: data, route: currentScene() }
    open.set(kind, ep)
    if (P.episodes.length < 400) P.episodes.push(ep)
  }
  const currentScene = () => [...document.querySelectorAll('.scene')].map((e) => `${e.dataset.scene}:${e.dataset.role}`).join(' ')
  const series = new WeakMap()
  function track(el, op, t, label) {
    let s = series.get(el)
    if (!s) series.set(el, (s = { last: op, dir: 0, flips: 0, path: [round(op)], at: t }))
    const d = op - s.last
    if (Math.abs(d) < 0.03) {
      // 停住超過 0.25 秒：上一段轉場結束了，下一段重新比較方向（卡片淡入、之後再淡出不算來回）
      if (t - s.at > 250 && s.dir) Object.assign(s, { dir: 0, path: [round(op)] })
      return
    }
    s.at = t
    const dir = Math.sign(d)
    if (s.dir && dir !== s.dir) {
      s.flips++
      note('opacity-flip', t, { key: label, peak: s.flips, path: s.path.slice(-6).concat(round(op)) })
    }
    s.dir = dir
    s.last = op
    s.path.push(round(op))
    if (s.path.length > 20) s.path.shift()
  }
  const round = (x) => Math.round(x * 100) / 100
  // 動畫走到一半被打斷又往回走，在 settle 之後清掉歷史：只比較「同一段轉場」裡的方向
  function frame() {
    const t = now()
    P.frames++
    const W = innerWidth
    const H = innerHeight
    // 只看最外層的整頁圖層（今日冒險裡面還有一疊自己的 .scene）
    const scenes = [...document.querySelectorAll('.scene')].filter((e) => !e.parentElement.closest('.scene'))
    if (scenes.length) {
      const info = scenes.map((el) => {
        const cs = getComputedStyle(el)
        return { el, id: el.dataset.scene, role: el.dataset.role, op: Number(cs.opacity), sc: scaleOf(cs), r: el.getBoundingClientRect(), clear: el.classList.contains('is-clear') }
      })
      for (const l of info) {
        if (l.op > 0.05 && (l.sc < 0.97 - 1e-3 || l.sc > 1 + 1e-3)) note('zoom', t, { key: `${l.id}:${l.role}`, worst: Math.min(l.sc, 2 - l.sc), scale: round(l.sc), op: round(l.op) })
        track(l.el, l.op, t, `scene ${l.id}`)
      }
      // 九個點的覆蓋率：每一點被不透明的畫面蓋住多少（今日冒險裡透明的層不算）
      let worst = 1
      let where = null
      for (const [fx, fy] of PTS) {
        const x = fx * W
        const y = fy * H
        let miss = 1
        for (const l of info) if (!l.clear && x >= l.r.left && x <= l.r.right && y >= l.r.top && y <= l.r.bottom) miss *= 1 - l.op
        if (1 - miss < worst) {
          worst = 1 - miss
          where = [fx, fy]
        }
      }
      const clearOnly = info.every((l) => l.clear)
      if (!clearOnly && worst < 0.85) note('blank', t, { key: 'scene', worst: round(worst), where, layers: info.map((l) => `${l.id}:${l.role}@${round(l.op)}x${round(l.sc)}`).join(' ') })
      if (scenes.length >= 2) {
        if (!open.get('multi') || t - open.get('multi').last > 80) note('multi', t, { key: 'multi', layers: info.map((l) => `${l.id}:${l.role}`).join(' ') })
        else note('multi', t, { key: 'multi' })
      } else {
        // 只剩一層：重新開始比較方向
        for (const l of info) {
          const s = series.get(l.el)
          if (s && Math.abs(l.op - 1) < 0.01) Object.assign(s, { dir: 0, path: [1] })
        }
      }
    } else if (document.getElementById('root')?.childElementCount === 0 && t > 4000) {
      note('no-scene', t, { key: 'root-empty' })
    }
    // 遊戲裡的教學卡、題目層：只看透明度來回
    for (const el of document.querySelectorAll('.card-fg, .card-bg, .overlay-layer, .cheer')) {
      const cs = getComputedStyle(el)
      track(el, Number(cs.opacity), t, el.className.split(' ')[0])
      if (el.classList.contains('card-bg')) {
        const sc = scaleOf(cs)
        if (Number(cs.opacity) > 0.05 && (sc < 0.97 - 1e-3 || sc > 1 + 1e-3)) note('card-zoom', t, { key: 'card-bg', worst: Math.min(sc, 2 - sc), scale: round(sc) })
      }
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})()

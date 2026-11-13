// AI 小男生測試的頁內腳本（page.addInitScript 注入，在 App 之前）：記下每一段開始播的音檔名字，和每一聲音效。
// 中文課文沒有字幕條，所以不靠 .sub-pill：把音檔名字貼在解碼出來的 AudioBuffer 上，開始播時記到 window.__heard。
// 音效（T-144C）：App 的音效全部即時合成（src/lib/audio.ts 的 sfx：振盪器、短的雜訊），開始播時記到 window.__sfx
// （振盪器的波形、起始和滑到的頻率；雜訊的長度），run.ts 對照成「啵」「咚」。
// 放在獨立的 .js 檔：tsx 轉譯 run.ts 時會在函式外面包 __name()，直接寫在 run.ts 裡丟進頁面會壞掉。
;(() => {
  if (window.__heard) return
  const heard = (window.__heard = [])
  const sfx = (window.__sfx = [])
  const abName = new WeakMap()
  const bufName = new WeakMap()
  const ab = Response.prototype.arrayBuffer
  Response.prototype.arrayBuffer = async function () {
    const m = /\/audio\/(.+)\.mp3(?:$|\?)/.exec(this.url)
    const r = await ab.call(this)
    if (m) abName.set(r, decodeURIComponent(m[1]))
    return r
  }
  const dec = BaseAudioContext.prototype.decodeAudioData
  BaseAudioContext.prototype.decodeAudioData = function (data, ok, bad) {
    const name = abName.get(data)
    const tag = (b) => {
      if (name && b) bufName.set(b, name)
      return b
    }
    return dec.call(this, data, ok ? (b) => ok(tag(b)) : ok, bad).then(tag)
  }
  const start = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (...a) {
    const name = this.buffer && bufName.get(this.buffer)
    if (name) heard.push({ t: performance.now(), name })
    // 沒有名字的短 buffer：音效的雜訊（咻、喀、沙沙）
    else if (this.buffer && this.buffer.duration <= 0.6) sfx.push({ t: performance.now(), k: 'noise', dur: Math.round(this.buffer.duration * 100) / 100 })
    return start.apply(this, a)
  }
  // 振盪器的頻率：記下第一個設定的值和滑到的值（sfx 的 tone() 是 setValueAtTime → exponentialRampToValueAtTime → start）
  const freq = new WeakMap()
  const setV = AudioParam.prototype.setValueAtTime
  AudioParam.prototype.setValueAtTime = function (v, t) {
    if (!freq.has(this)) freq.set(this, { f0: v })
    return setV.call(this, v, t)
  }
  const ramp = AudioParam.prototype.exponentialRampToValueAtTime
  AudioParam.prototype.exponentialRampToValueAtTime = function (v, t) {
    const f = freq.get(this)
    if (f && f.f1 == null) f.f1 = v
    return ramp.call(this, v, t)
  }
  const oscStart = OscillatorNode.prototype.start
  OscillatorNode.prototype.start = function (...a) {
    const f = freq.get(this.frequency) || { f0: this.frequency.value }
    sfx.push({ t: performance.now(), k: 'osc', type: this.type, f0: Math.round(f.f0), f1: f.f1 == null ? null : Math.round(f.f1) })
    return oscStart.apply(this, a)
  }
})()

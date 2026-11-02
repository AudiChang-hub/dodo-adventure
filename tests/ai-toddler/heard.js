// AI 小男生測試的頁內腳本（page.addInitScript 注入，在 App 之前）：記下每一段開始播的音檔名字。
// 中文課文沒有字幕條，所以不靠 .sub-pill：把音檔名字貼在解碼出來的 AudioBuffer 上，開始播時記到 window.__heard。
// 放在獨立的 .js 檔：tsx 轉譯 run.ts 時會在函式外面包 __name()，直接寫在 run.ts 裡丟進頁面會壞掉。
;(() => {
  if (window.__heard) return
  const heard = (window.__heard = [])
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
    return start.apply(this, a)
  }
})()

// AI 小男生測試的頁內腳本，只有中文課注入（T-144C）。中文課 App 不出聲，回饋是音效＋短動畫：
// - window.__moves：記下畫面上動了什麼（圖跳一下、轉一圈、撒星星、星星飛到上面、角色探出頭…），
//   大腦想一步要好幾秒，截圖時動作早就停了，run.ts 用這份補一句「剛剛小豬跳了一下」。
// - window.__zh.ctx()：現在是念課文、聊一聊還是選圖，亮的那一行的圖、聊一聊的主角、選圖的題目和每張圖是什麼（媽媽回應用）。
// - window.__zh.busy()：畫面上還有沒有在播的動作（截圖前等它播完）。
// - window.__zh.handAt()：選圖時「點一下」的手在第幾張圖上（看手是不是在一張一張掃過去）。
// 放在獨立的 .js 檔：tsx 會在函式外面包 __name()，直接寫在 run.ts 裡丟進頁面會壞掉。
;(() => {
  if (window.__zh) return
  const moves = (window.__moves = [])
  let lastStyle = 0
  const ACT = { 'zh-act-hop': '跳了一下', 'turn-hop': '跳了一下', 'zh-act-spin': '轉了一圈', 'zh-act-wiggle': '搖了搖', 'zh-act-squish': '壓扁又彈回來', 'zh-act-peek': '躲起來又冒出來', 'zh-star-in': '下面多了一顆小星星' }
  const wordOf = (el) => {
    const w = el && el.closest && el.closest('[data-word]')
    return w ? w.getAttribute('data-word') : null
  }
  // React 把 key 放在 fiber 上：選圖每一張的 key 就是那張圖的詞（Quiz.tsx 的 key={o.word}），畫面上沒有寫
  const keyOf = (el) => {
    const k = el && Object.keys(el).find((x) => x.startsWith('__reactFiber$'))
    for (let f = k ? el[k] : null, i = 0; f && i < 8; f = f.return, i++) if (f.key != null) return String(f.key)
    return null
  }
  addEventListener(
    'animationstart',
    (e) => {
      const what = ACT[e.animationName]
      if (!what) return
      const tile = e.target.closest && e.target.closest('.zh-options .tile')
      moves.push({ t: performance.now(), what, word: wordOf(e.target) || (tile ? keyOf(tile) : null) })
    },
    true,
  )
  const watch = () =>
    new MutationObserver((list) => {
      const t = performance.now()
      for (const m of list) {
        if (m.type === 'attributes') {
          lastStyle = t
          continue
        }
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue
          const c = n.classList
          if (c.contains('star-flight')) moves.push({ t, what: '一顆星星飛到上面', word: null })
          else if (c.contains('zh-peek')) moves.push({ t, what: '從課本外面探出頭來', word: n.getAttribute('aria-label') })
          else if (c.contains('zh-bits')) moves.push({ t, what: '冒出小愛心、小星星', word: wordOf(n) })
          else if (c.contains('zh-yes')) moves.push({ t, what: '打了一個勾', word: keyOf(n.closest('.tile')) })
          else if (n.querySelector && n.querySelector('path[d^="M10 0 L12.6"]')) {
            const tile = n.closest('.zh-options .tile')
            moves.push({ t, what: '撒出一把星星', word: wordOf(n) || (tile ? keyOf(tile) : null) })
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
  if (document.body) watch()
  else addEventListener('DOMContentLoaded', watch)

  const top = () => [...document.querySelectorAll('.scene')].filter((e) => !e.inert).pop() || document
  window.__zh = {
    ctx() {
      const root = top()
      const talk = root.querySelector('.zh-talk')
      const ask = root.querySelector('.zh-ask-word')
      const read = root.querySelector('.zh-read')
      const model = root.querySelector('.zh-talk-model')
      // 找一樣的字（Glyph.tsx）：上面一個大字，下面兩、三張字卡（key 就是那個字）
      const glyph = root.querySelector('.zh-glyph')
      const target = root.querySelector('.zh-glyph-target')
      return {
        mode: talk ? 'talk' : ask ? 'quiz' : glyph ? 'glyph' : read && root.querySelector('.zh-line.on') ? 'read' : null,
        glyph: target ? target.getAttribute('data-char') : null,
        // 手正在示範（第一次上「找一樣的字」先看手做一次）
        demo: !!(glyph && glyph.hasAttribute('data-demo')),
        at: read ? read.getAttribute('data-at') : null,
        lit: [...root.querySelectorAll('.zh-line.on .zh-pic')].map((e) => e.getAttribute('data-word')),
        star: root.querySelector('.zh-talk-pic') ? root.querySelector('.zh-talk-pic').getAttribute('data-word') : null,
        // 聊一聊字條上「答不出來就說「…」」的那一句（大人照字條說給他聽）
        model: model ? ((/「(.+)」/.exec(model.textContent || '') || [])[1] ?? null) : null,
        ask: ask ? ask.textContent : null,
        tiles: [...root.querySelectorAll('.zh-options .tile')].map((e) => {
          const r = e.getBoundingClientRect()
          return { word: keyOf(e), x: r.left, y: r.top, w: r.width, h: r.height }
        }),
      }
    },
    /** 還在播的動作（有限長度的 CSS／WAAPI 動畫），或 150 ms 內還有 style 在變（motion 用 JS 跑的彈簧） */
    busy() {
      const run = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false
        const end = a.effect && a.effect.getComputedTiming().endTime
        return end != null && end !== Infinity
      }).length
      return run + (performance.now() - lastStyle < 150 ? 1 : 0)
    },
    handAt() {
      const tiles = [...top().querySelectorAll('.zh-options .tile')]
      return tiles.findIndex((e) => e.querySelector('.demo-hand'))
    },
  }
})()

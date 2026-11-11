import { test } from '@playwright/test'
import { homeButton } from './lib/app'
import { pressBack, waitLive } from './lib/flows'
import { enter, finish, pickOf, quizNow, recordsOf, setup, shot, stageOf, untilDemo, untilEnd, untilTurn, want } from './lib/english-play'

/**
 * 英文課選擇題的玩法二：泡泡（T-127，src/lessons/english/Bubbles.tsx）的三歲模擬測試。
 * 示範時搶著點、亂點空白、連點錯的那一顆、兩根手指一起點、上完一堂、念題目時按返回。
 */
test.describe('英文課：泡泡', () => {
  test('泡泡：示範時搶著點、亂點、連點、多指，一樣上得完、紀錄記成泡泡', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '泡泡', { quiz: 'bubbles', stage: 'quiz' })
    try {
      if (!(await enter(k, c))) return
      const box = await page.waitForSelector('.en-quiz.is-bubbles', { timeout: 15_000 }).catch(() => null)
      c.outcome('選擇題是泡泡', !!box, box ? '' : `停在 ${await stageOf(page)}`)
      if (!box) return void (await c.once('no-bubbles', '卡死', '選擇題沒有出現泡泡', ''))

      // 1. 示範時（手正在指）兩根手指搶著點：第一根點對的泡泡、第二根點錯的。示範收掉、照常判對，只算第一根
      k.behavior = '示範時兩根手指搶著點'
      const q0 = await untilDemo(page)
      c.outcome('有手示範（關掉聲音也看得到）', !!q0)
      if (!q0) await c.once('no-demo', '困惑', '泡泡第一題沒有手示範', '')
      await shot(page, info, '泡泡-示範')
      const p0 = q0 && pickOf(q0)
      if (p0?.right && p0.wrong) await k.twoFinger([p0.right], p0.wrong, 200)
      const solved0 = await page.waitForSelector('.en-bubbles.is-solved', { timeout: 5000 }).catch(() => null)
      const r0 = await recordsOf(page, 'lesson-en-bubbles')
      const one = r0.length === 1 && r0[0].taps === 1
      c.outcome('示範時搶著點：馬上判對，兩根手指只算第一根', !!solved0 && one, `${solved0 ? '答完了' : '沒答完'}；紀錄 ${r0.length} 筆、點了 ${r0[0]?.taps ?? 0} 下`)
      if (!solved0 || !one) await c.once('barge', '困惑', '泡泡示範時兩根手指點，沒有馬上判、或第二根也算進去', '')
      await shot(page, info, '泡泡-答對')

      // 2. 亂點空白（天空、地上）：不會壞、還在選擇題
      k.behavior = '亂點空白'
      const vp = page.viewportSize()!
      for (let i = 0; i < 4; i++) await k.tap({ x: vp.width * (0.3 + 0.12 * i), y: vp.height * (i % 2 ? 0.25 : 0.82) }, '空白')
      c.outcome('亂點空白：不會壞', (await stageOf(page)) === 'quiz')

      // 3. 第二題：先點錯一次（那一顆淡掉、手指著答案），再連點對的那一顆（只記一筆）
      const q = await untilTurn(page, 30_000)
      if (q) {
        const { right: first, wrong } = pickOf(q)
        await shot(page, info, '泡泡-第2題')
        if (wrong) {
          k.behavior = '點錯的泡泡'
          await k.tap(wrong, `錯的泡泡 ${wrong.label}`)
          await page.waitForTimeout(400)
          const dim = (await quizNow(page))?.opts.find((o) => o.label === wrong.label)?.cls.includes('is-no')
          c.outcome('點錯：那一顆淡掉、不打叉', !!dim)
        }
        // 點錯以後重新看一次對的那一顆在哪裡（不沿用點錯之前量的座標）
        const now = await untilTurn(page, 8000)
        const right = (now && pickOf(now).right) ?? first
        if (right) {
          k.behavior = '連點對的泡泡'
          const n0 = (await recordsOf(page, 'lesson-en-bubbles')).length
          await k.spam(right, 5, `連點 ${right.label}`)
          await page.waitForTimeout(1500)
          const n1 = (await recordsOf(page, 'lesson-en-bubbles')).length
          c.outcome('連點對的泡泡：只記一筆', n1 - n0 === 1, `多了 ${n1 - n0} 筆`)
          if (n1 - n0 !== 1) await c.once('spam', '誤記作答', '連點泡泡，記了不只一筆', `${n1 - n0} 筆`)
        }
      }
      const ended = await untilEnd(page)
      c.outcome('泡泡：上得完（到下課）', ended, ended ? '' : `停在 ${await stageOf(page)}`)
      if (!ended) await c.once('end', '卡死', '泡泡選擇題做不完、到不了下課', '')
      const rs = await recordsOf(page, 'lesson-en-bubbles')
      c.outcome('作答紀錄記成泡泡（lesson-en-bubbles）', rs.length >= 2, `${rs.length} 筆：${rs.map((r) => r.itemId).join('、')}`)
      if (rs.length < 2) await c.once('records', '誤記作答', '泡泡的作答沒有寫進紀錄', `${rs.length} 筆`)
      await c.flush()
    } finally {
      finish(k, c, '泡泡')
    }
  })

  test('泡泡：念題目時按返回 → 回首頁', async ({ page }, info) => {
    test.skip(!want() || info.project.name !== 'tab1200')
    test.setTimeout(2 * 60_000)
    const { k, c } = await setup(page, info, '泡泡返回', { quiz: 'bubbles', stage: 'quiz' })
    try {
      if (!(await enter(k, c))) return
      await page.waitForSelector('.en-quiz.is-bubbles', { timeout: 15_000 })
      await page.waitForTimeout(1500)
      k.behavior = '念題目時按返回'
      const h = await homeButton(page)
      if (h) await pressBack(k, h, '念題目時按返回')
      const back = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('泡泡：按返回回首頁', back === 'home', `到 ${back}`)
      if (back !== 'home') await c.once('back', '無法返回', '泡泡選擇題按返回沒有回首頁', `停在 ${back}`)
      await c.flush()
    } finally {
      finish(k, c, '泡泡返回')
    }
  })
})

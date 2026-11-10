import { test } from '@playwright/test'
import { homeButton } from './lib/app'
import { pressBack, waitLive } from './lib/flows'
import { enter, finish, pickOf, quizNow, recordsOf, setup, shot, stageOf, untilEnd, untilTurn, want } from './lib/english-play'

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

      // 1. 示範時（手正在指）搶著點一顆泡泡：示範收掉、照常判，不卡住
      k.behavior = '示範時搶著點'
      const hand = await page.waitForSelector('.en-quiz .demo-hand', { timeout: 10_000 }).catch(() => null)
      c.outcome('有手示範（關掉聲音也看得到）', !!hand)
      if (!hand) await c.once('no-demo', '困惑', '泡泡第一題沒有手示範', '')
      await page.waitForSelector('.en-bubble:not(.is-wait)', { timeout: 10_000 }).catch(() => null)
      const q0 = await quizNow(page)
      // 點錯的那一顆（點對的話這一題就答完了，後面的連點、多指測不到）
      const any = (q0 && pickOf(q0).wrong) ?? q0?.opts.find((o) => !o.wait)
      if (any) await k.tap(any, `示範中點泡泡 ${any.label}`)
      await page.waitForTimeout(1200)
      const after = await quizNow(page)
      c.outcome('示範時搶著點：手收起來、不卡住', !!after && !after.demo, after?.demo ? '手還在示範' : '')
      if (after?.demo) await c.once('barge', '困惑', '泡泡示範時點了，示範沒有收起來', '')

      // 2. 亂點空白（天空、地上）：不會壞、還在選擇題
      k.behavior = '亂點空白'
      const vp = page.viewportSize()!
      for (let i = 0; i < 5; i++) await k.tap({ x: vp.width * (0.3 + 0.12 * i), y: vp.height * (i % 2 ? 0.25 : 0.82) }, '空白')
      c.outcome('亂點空白：還在選擇題', (await stageOf(page)) === 'quiz')

      // 3. 一題一題答：第一題兩根手指（第一根點對的、第二根點錯的：只算第一根）；第二題連點錯的那一顆（錯兩次手帶著做，照樣往下）
      let n = 0
      while ((await stageOf(page)) === 'quiz' && n < 4) {
        const q = await untilTurn(page)
        if (!q) break
        n++
        const { right, wrong } = pickOf(q)
        if (!right) break
        await shot(page, info, `泡泡-第${n}題`)
        if (n === 1 && wrong) {
          k.behavior = '兩根手指：第一根點對的、第二根點錯的'
          await k.twoFinger([right], wrong, 200)
          await page.waitForTimeout(400)
          const q2 = await quizNow(page)
          const okRight = q2?.opts.find((o) => o.label === right.label)?.cls.includes('is-yes')
          const noWrong = !q2?.opts.find((o) => o.label === wrong.label)?.cls.includes('is-no')
          c.outcome('兩根手指：只算第一根（點對的）', !!okRight && noWrong, `${okRight ? '對的亮了' : '對的沒亮'}、${noWrong ? '錯的沒被算' : '錯的也被算了'}`)
          if (!okRight || !noWrong) await c.once('two', '困惑', '兩根手指點泡泡，第二根也被算進去', '')
          await shot(page, info, '泡泡-答對')
        } else if (wrong) {
          k.behavior = '連點錯的泡泡'
          await k.spam(wrong, 5, `錯的泡泡 ${wrong.label}`)
          await page.waitForTimeout(300)
          const q2 = await quizNow(page)
          const dim = q2?.opts.find((o) => o.label === wrong.label)?.cls.includes('is-no')
          c.outcome('連點錯的泡泡：那一顆淡掉（錯兩次手帶著做，往下走）', !!dim)
          if (!dim) await c.once('wrong', '困惑', '連點錯的泡泡，看不出點錯了', '')
        } else await k.tap(right, `對的泡泡 ${right.label}`)
        // 下一題：等這一題答完，大箭頭由測試自動點（autoNext）
        await page.waitForSelector('.en-options.is-solved', { timeout: 15_000 }).catch(() => null)
        await page.waitForFunction(() => document.querySelector('.en-lesson')?.getAttribute('data-phase') !== 'quiz' || !document.querySelector('.en-options.is-solved'), null, { timeout: 20_000 }).catch(() => null)
      }
      const ended = await untilEnd(page)
      c.outcome('泡泡：上得完（到下課）', ended, ended ? '' : `停在 ${await stageOf(page)}`)
      if (!ended) await c.once('end', '卡死', '泡泡選擇題做不完、到不了下課', `答了 ${n} 題`)
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

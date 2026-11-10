import { test } from '@playwright/test'
import { homeButton } from './lib/app'
import { pressBack, waitLive } from './lib/flows'
import { enter, finish, pickOf, quizNow, recordsOf, setup, shot, stageOf, untilEnd, untilTurn, want, type Pt } from './lib/english-play'

/** 從 a 拖到 b 的路徑（三歲的手：一路小抖） */
const path = (a: Pt, b: Pt, n = 8): Pt[] => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n + (i % 2 ? 3 : -3), y: a.y + ((b.y - a.y) * i) / n }))

/**
 * 英文課選擇題的玩法三：餵豆豆（T-127，src/lessons/english/Feed.tsx）的三歲模擬測試。
 * 手示範（帶著卡片餵豆豆）、示範時搶著拖、拖到一半在別的地方放手、餵錯、兩根手指、連點卡片、上完一堂、按返回。
 */
test.describe('英文課：餵豆豆', () => {
  test('餵豆豆：拖到一半放手、餵錯、多指、連點，一樣上得完、紀錄記成餵豆豆', async ({ page }, info) => {
    test.skip(!want())
    test.setTimeout(4 * 60_000)
    const { k, c } = await setup(page, info, '餵豆豆', { quiz: 'feed', stage: 'quiz' })
    try {
      if (!(await enter(k, c))) return
      const box = await page.waitForSelector('.en-quiz.is-feed', { timeout: 15_000 }).catch(() => null)
      c.outcome('選擇題是餵豆豆', !!box, box ? '' : `停在 ${await stageOf(page)}`)
      if (!box) return void (await c.once('no-feed', '卡死', '選擇題沒有出現餵豆豆', ''))

      // 1. 手示範：手帶著答案卡走到豆豆嘴巴（卡片被吃一口），關掉聲音也看得懂
      k.behavior = '看示範'
      const carried = await page.waitForSelector('.en-food.is-eaten', { timeout: 15_000 }).catch(() => null)
      const hand = await page.$('.en-quiz .demo-hand')
      c.outcome('示範：手帶著卡片餵豆豆', !!carried && !!hand)
      if (!carried) await c.once('no-demo', '困惑', '餵豆豆第一題沒有示範把卡片拖給豆豆', '')
      await shot(page, info, '餵豆豆-示範')

      // 2. 拖到一半、在別的地方放手：卡片回到原位，不算答
      const q1 = await untilTurn(page, 20_000, true)
      if (!q1 || !q1.dodo) return void (await c.once('turn', '卡死', '餵豆豆示範完沒有輪到他', ''))
      const { right, wrong } = pickOf(q1)
      if (!right || !wrong) return
      const before = (await recordsOf(page, 'lesson-en-feed')).length
      k.behavior = '拖到一半放手'
      await k.drag(path(right, { x: right.x, y: right.y - 160 }, 5), { label: '拖到一半往上放手' })
      await page.waitForTimeout(900)
      const q1b = await quizNow(page)
      const home = q1b?.opts.find((o) => o.label === right.label)
      const back = !!home && Math.hypot(home.x - right.x, home.y - right.y) < 12
      const none = (await recordsOf(page, 'lesson-en-feed')).length === before && !q1b?.solved
      c.outcome('拖到一半放手：卡片回到原位、不算答', back && none, `${back ? '回到原位' : '沒回到原位'}、${none ? '沒算' : '被算成答了'}`)
      if (!back || !none) await c.once('half', '困惑', '餵豆豆拖到一半放手，卡片沒回去或被算成答了', '')

      // 3. 把錯的拖給豆豆：那一張淡掉、豆豆搖頭，這一題還沒完
      k.behavior = '餵錯'
      await k.drag(path(wrong, q1.dodo), { label: `錯的 ${wrong.label} 拖給豆豆` })
      await page.waitForTimeout(500)
      const q1c = await quizNow(page)
      const dim = q1c?.opts.find((o) => o.label === wrong.label)?.cls.includes('is-no')
      c.outcome('餵錯：那一張淡掉、這一題還沒完', !!dim && !q1c?.solved)
      await shot(page, info, '餵豆豆-餵錯')

      // 4. 兩根手指：第一根把對的拖給豆豆，同時第二根按住錯的那張（只算第一根）
      k.behavior = '兩根手指'
      const q1d = await untilTurn(page, 12_000)
      const r1 = q1d && pickOf(q1d).right
      if (r1 && q1d?.dodo) await k.twoFinger(path(r1, q1d.dodo), wrong, 200)
      const solved1 = await page.waitForSelector('.en-feed.is-solved .en-food.is-eaten', { timeout: 8000 }).catch(() => null)
      c.outcome('兩根手指：第一根拖的對的卡被吃掉', !!solved1)
      if (!solved1) await c.once('two', '困惑', '兩根手指時，拖給豆豆的對的卡沒有被吃掉', '')
      await shot(page, info, '餵豆豆-吃掉')
      await page.waitForFunction(() => document.querySelector('.en-lesson')?.getAttribute('data-phase') !== 'quiz' || !document.querySelector('.en-options.is-solved'), null, { timeout: 20_000 }).catch(() => null)

      // 5. 連點對的卡（點一下也算餵）：吃掉一次，只記一筆
      if ((await stageOf(page)) === 'quiz') {
        const q2 = await untilTurn(page)
        const r2 = q2 && pickOf(q2).right
        if (r2) {
          k.behavior = '連點卡片'
          const n0 = (await recordsOf(page, 'lesson-en-feed')).length
          await k.spam(r2, 5, `連點 ${r2.label}`)
          await page.waitForTimeout(1500)
          const n1 = (await recordsOf(page, 'lesson-en-feed')).length
          c.outcome('連點卡片：點一下也算餵，只記一筆', n1 - n0 === 1, `多了 ${n1 - n0} 筆`)
          if (n1 - n0 !== 1) await c.once('spam', '誤記作答', '連點餵豆豆的卡片，記了不只一筆', `${n1 - n0} 筆`)
        }
      }
      const ended = await untilEnd(page)
      c.outcome('餵豆豆：上得完（到下課）', ended, ended ? '' : `停在 ${await stageOf(page)}`)
      if (!ended) await c.once('end', '卡死', '餵豆豆選擇題做不完、到不了下課', '')
      const rs = await recordsOf(page, 'lesson-en-feed')
      c.outcome('作答紀錄記成餵豆豆（lesson-en-feed）', rs.length >= 2, `${rs.length} 筆：${rs.map((r) => r.itemId).join('、')}`)
      if (rs.length < 2) await c.once('records', '誤記作答', '餵豆豆的作答沒有寫進紀錄', `${rs.length} 筆`)
      await c.flush()
    } finally {
      finish(k, c, '餵豆豆')
    }
  })

  test('餵豆豆：拖著卡片時按返回 → 回首頁', async ({ page }, info) => {
    test.skip(!want() || info.project.name !== 'tab1200')
    test.setTimeout(2 * 60_000)
    const { k, c } = await setup(page, info, '餵豆豆返回', { quiz: 'feed', stage: 'quiz' })
    try {
      if (!(await enter(k, c))) return
      const q = await untilTurn(page, 30_000)
      const h = await homeButton(page)
      k.behavior = '拖著卡片時按返回'
      if (q && h) {
        const r = pickOf(q).right
        // 第一根手指拖著卡片，第二根按返回（holdHome）
        if (r) await k.twoFinger(path(r, { x: r.x, y: r.y - 120 }, 4), h, 150)
      }
      if ((await waitLive(page, (l) => l === 'home', 2500)) !== 'home' && h) await pressBack(k, h, '再按一次返回')
      const back = await waitLive(page, (l) => l === 'home', 4000)
      c.outcome('餵豆豆：拖著卡片時按返回回首頁', back === 'home', `到 ${back}`)
      if (back !== 'home') await c.once('back', '無法返回', '餵豆豆時按返回沒有回首頁', `停在 ${back}`)
      await c.flush()
    } finally {
      finish(k, c, '餵豆豆返回')
    }
  })
})

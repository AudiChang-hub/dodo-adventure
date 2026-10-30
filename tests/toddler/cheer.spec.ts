import { test, expect, type Page } from '@playwright/test'
import { attempts, boot, homeButton, snap } from './lib/app'
import { Toddler, hashSeed } from './lib/toddler'
import { Checker, enterGame, pressBack, waitLive } from './lib/flows'
import { GAMES } from './catalog'

/**
 * 慶祝中點返回鍵（G-2 的三歲模擬測試找到的：慶祝的遮罩蓋住返回鍵，點返回只會跳過慶祝，接著又是熟練的慶祝，孩子還在遊戲裡）。
 * 三歲亂玩不一定會玩完一局，games.spec 的「慶祝中按首頁」常常是「—」沒測到；這裡照著提示一題一題答完，一定會走到慶祝：
 * 1. 慶祝蓋著遊戲時，返回鍵所在的那一點最上層就是返回鍵（不是遮罩）。
 * 2. 上方那一排除了返回鍵以外的地方，最上層還是慶祝（點了照舊是跳過，不會誤觸返回、也不會點不到東西）。
 *    點遮罩跳過慶祝本來就會在最後一段結束這一局、回到站點（跟慶祝自己結束一樣），所以這裡不實際點，只看最上層是誰。
 * 3. 點返回鍵一次：4 秒內離開遊戲；作答紀錄不重複、不少（點之前記下的一筆都不少，之後沒有多出來）。
 * 兩個站的選擇題各跑一次（自然發音一開始是學習循環的畫面，自動作答走不完）；所有遊戲的慶祝都是 games/PlayGame.tsx 同一套。
 */
const BASE_SEED = Number(process.env.TODDLER_SEED || 20261029)
const CASES = ['m-match', 'z-find']
const only = (process.env.TODDLER_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const want = (id: string) => !only.length || only.includes(id) || only.includes('cheer') || only.includes('screens')

/** 照提示答：發光、淡淡亮起、標出來的那一個；都沒有就照順序點（答錯兩次會標出答案或重教） */
async function answer(page: Page, k: Toddler, turn: number) {
  const card = await page.evaluate(() => {
    const live = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
    const el = live?.querySelector('.teach-card')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (card) return k.tap(card, '教學卡')
  const p = await page.evaluate((turn) => {
    const live = [...document.querySelectorAll<HTMLElement>('.scene')].filter((e) => !e.inert).pop()
    const tiles = [...(live?.querySelectorAll<HTMLElement>('.options .tile') ?? [])]
    if (!tiles.length) return null
    const pick = tiles.find((t) => /\b(guide|soft|hint)\b/.test(t.className)) ?? tiles[turn % tiles.length]
    const r = pick.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, turn)
  if (p) await k.tap(p, '作答')
}

const cheerUp = (page: Page) => page.evaluate(() => !!document.querySelector('.cheer'))

for (const id of CASES.filter(want)) {
  const g = GAMES.find((x) => x.id === id)!
  test(`慶祝中點返回鍵：${g.id} ${g.title}`, async ({ page }, info) => {
    test.setTimeout(8 * 60_000)
    const seed = hashSeed(BASE_SEED, 'cheer', g.id, info.project.name)
    const k = new Toddler(page, info, seed, info.project.name)
    const c = new Checker(k, page)
    k.where = `慶祝中點返回鍵／${g.title}（${g.id}）`
    await boot(page, seed)
    await k.init()
    k.behavior = '答完一局'
    expect(await enterGame(k, c, g)).toBe(true)

    // 一題一題答到慶祝出現（最多 6 分鐘）
    const end = Date.now() + 6 * 60_000
    let turn = 0
    while (!(await cheerUp(page)) && Date.now() < end) {
      const s = await snap(page)
      if (s.live !== `play-${g.id}`) break
      await answer(page, k, turn++)
      await k.wait(700)
    }
    const reached = await cheerUp(page)
    c.outcome('答完一局', reached, reached ? `${turn} 個動作後出現慶祝` : '沒有走到慶祝')
    expect(reached, '答完一局要出現慶祝').toBe(true)

    // 1. 慶祝中，返回鍵在最上層
    const h = await homeButton(page)
    expect(h, '慶祝中找得到返回鍵').not.toBeNull()
    const top = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-back]'), h!)
    c.outcome('返回鍵在遮罩上面', top, top ? '' : '返回鍵那一點最上層是遮罩')
    expect(top, '慶祝的遮罩不能蓋住返回鍵').toBe(true)

    // 2. 上方那一排的其他地方（返回鍵右邊、正中間、右上角）：最上層是慶祝（右上角是家長入口），不是返回鍵、也不是被抬上來的那一排
    const others = await page.evaluate(({ x, y }) => {
      const at = (px: number, py: number) => {
        const el = document.elementFromPoint(px, py)
        // 家長入口（右上角）本來就永遠在最上層（NAV-7），算對
        return el?.closest('[data-back]') ? 'back' : el?.closest('.cheer, .cheer-scrim, .parent-corner') ? 'cheer' : (el?.className?.toString() ?? '?')
      }
      return [at(x + 120, y), at(innerWidth / 2, y), at(innerWidth - 60, y)]
    }, h!)
    const okOthers = others.every((o) => o === 'cheer')
    c.outcome('上方一排的其他地方', okOthers, others.join('、'))
    expect(others, '上方一排除了返回鍵，點到的都是慶祝').toEqual(['cheer', 'cheer', 'cheer'])

    // 3. 點返回鍵一次：離開，作答紀錄不重複、不少
    k.behavior = '慶祝中點返回鍵'
    const before = (await attempts(page)).filter((a) => a.game === g.id)
    const h2 = (await homeButton(page))!
    await pressBack(k, h2)
    const live = await waitLive(page, (l) => !!l && !l.startsWith('play-'), 4000)
    const left = !!live && !live.startsWith('play-')
    c.outcome('慶祝中點返回鍵', left, left ? `回到 ${live}` : `停在 ${live}`)
    if (!left) await c.once('cheer-back', '無法返回', `慶祝中點返回沒有回去（${g.id}）`, `之後畫面停在 ${live}`)
    await k.wait(1500)
    const after = (await attempts(page)).filter((a) => a.game === g.id)
    const ids = new Set(after.map((a) => a.id))
    const missing = before.filter((a) => !ids.has(a.id)).length
    const keys = after.map((a) => `${a.itemId}|${a.phase}|${a.ts}`)
    const dup = keys.length - new Set(keys).size
    c.outcome('作答紀錄', !missing && !dup && after.length === before.length, `點之前 ${before.length} 筆、之後 ${after.length} 筆，少了 ${missing}、重複 ${dup}`)
    expect(left, '慶祝中點返回鍵一次就離開').toBe(true)
    expect({ missing, dup, added: after.length - before.length }, '作答紀錄不重複、不少').toEqual({ missing: 0, dup: 0, added: 0 })

    await c.flush()
    k.save(`screen-cheer-${g.id}`, { screen: `慶祝中點返回鍵（${g.id}）`, base: BASE_SEED, outcomes: c.outcomes, stats: c.stats, rules: c.rules })
    expect.soft(k.findings.map((f) => `${f.severity}：${f.title}`), '全部問題').toEqual([])
  })
}

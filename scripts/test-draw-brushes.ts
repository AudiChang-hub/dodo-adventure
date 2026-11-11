// 自由畫畫的魔法筆、印章（src/games/draw/brushes.ts）、發呆時今天的一句（draw/lines.ts）：T-127 B 案第 1 輪。
// 橡皮擦（brushes.ts 的 eraser）：T-132。
// 執行：npx tsx scripts/test-draw-brushes.ts
import assert from 'node:assert/strict'
import '../src/games/draw/lines'
import { hasLine, line } from '../src/content/registry'
import { EMOJI } from '../src/art/emoji.generated'
import { WORLDS } from '../src/lib/today-world'
import { chooseVariety, type VarietyState } from '../src/lib/variety'
import { BRUSHES, BRUSH_VARIETY, ERASER, ERASE_SIZE, along, brushOfDay, brushPool, isEraser, isStampTap, makePaint, rainbowAt } from '../src/games/draw/brushes'
import { DRAW_IDEA, ideaKey } from '../src/games/draw/lines'
import type { Stroke } from '../src/games/draw/Ink'

let n = 0
const ok = (s: string) => console.log(`ok ${++n} ${s}`)

// ── 今天的魔法筆 ─────────────────────────────
{
  for (let d = 20000; d < 20400; d++) {
    assert.notEqual(brushOfDay(d), brushOfDay(d + 1), `第 ${d} 天和隔天的魔法筆一樣`)
    assert.notEqual(brushOfDay(d, brushPool(false)), brushOfDay(d + 1, brushPool(false)), `沒有世界時第 ${d} 天和隔天一樣`)
  }
  assert.ok(!brushPool(false).includes('trail'), '沒有今天的世界時不能有蓋印筆（沒有小圖）')
  assert.deepEqual([...brushPool(true)].sort(), [...BRUSHES].sort())
  ok('照日期的魔法筆：連續兩天不一樣（有世界 4 種、沒有世界 3 種）')
}
{
  // 輪換紀錄：每天挑一次，連續 40 天沒有相鄰兩天一樣；隔幾天才玩也不會跟上一次一樣
  let st: VarietyState = {}
  let prev = ''
  for (let i = 0; i < 40; i++) {
    const day = `day-${i}`
    const r = chooseVariety(st, BRUSH_VARIETY, BRUSHES, day)
    assert.notEqual(r.kind, prev, `第 ${i} 次跟上一次一樣（${r.kind}）`)
    prev = r.kind
    st = r.state
  }
  const same = chooseVariety(st, BRUSH_VARIETY, BRUSHES, 'day-39')
  assert.equal(same.kind, prev, '同一天再進來用同一支筆')
  ok('輪換紀錄（lib/variety.ts）：每次玩都跟上一次不一樣，同一天再進來不換')
}

// ── 沿著筆跡取點 ─────────────────────────────
{
  const pts = [
    { x: 0, y: 0, p: 0.5 },
    { x: 100, y: 0, p: 0.5 },
    { x: 100, y: 100, p: 0.5 },
  ]
  const a = along(pts, 50)
  assert.equal(a.length, 5, `200 長、每 50 一個：0、50、100、150、200（拿到 ${a.length}）`)
  assert.deepEqual(
    a.map((p) => [Math.round(p.x), Math.round(p.y)]),
    [
      [0, 0],
      [50, 0],
      [100, 0],
      [100, 50],
      [100, 100],
    ],
  )
  assert.equal(along([{ x: 5, y: 5, p: 0.5 }], 30).length, 1, '點一下也要有一個')
  // 很多很短的小段（手指慢慢移）：間距照樣是 gap
  const slow = Array.from({ length: 301 }, (_, i) => ({ x: i, y: 0, p: 0.5 }))
  assert.equal(along(slow, 60).length, 6)
  ok('沿著筆跡每隔一段取一個點（點一下也有、慢慢畫的小段累積起來）')
}

// ── 每種筆都畫得出來 ─────────────────────────
{
  const calls: string[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_, k) => (typeof k === 'string' && ['beginPath', 'arc', 'fill', 'moveTo', 'lineTo', 'stroke', 'drawImage'].includes(k) ? () => calls.push(k) : undefined),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D
  const paint = makePaint(1000)
  const pts = Array.from({ length: 30 }, (_, i) => ({ x: 100 + i * 10, y: 200, p: 0.5 }))
  const stroke = (brush?: string): Stroke => ({ color: '#E58A7B', size: 16, pts, brush })
  const plain: Stroke[] = []
  const run = (b?: string) => {
    calls.length = 0
    plain.length = 0
    return paint(ctx, stroke(b), true, (s) => plain.push(s))
  }
  assert.equal(run('rainbow'), true)
  assert.ok(calls.filter((c) => c === 'stroke').length >= 29, '彩虹筆一段一段畫')
  assert.equal(run('mirror'), true)
  assert.equal(plain.length, 2, '對稱筆畫兩次（原來的和鏡像）')
  assert.deepEqual(
    plain[1].pts.map((p) => p.x),
    pts.map((p) => 1000 - p.x),
    '鏡像以畫紙正中間（500）為軸',
  )
  assert.equal(run('dots'), true)
  assert.ok(calls.filter((c) => c === 'arc').length >= 5, '點點筆畫出好幾顆點')
  // 沒有載入圖（node 裡沒有 Image）：蓋印筆、印章先畫淡淡的圓，不會整個沒反應
  assert.equal(run('trail:cow,pig'), true)
  assert.ok(calls.filter((c) => c === 'arc').length >= 3, '蓋印筆沿著筆跡蓋好幾個')
  // 拿著印章拖遠了（30 個點、290 長）：是在畫線，照一般的筆
  assert.equal(run('stamp:cow'), false, '拿著印章拖遠了照一般的筆畫線')
  assert.equal(isStampTap(stroke('stamp:cow')), false)
  const tap: Stroke = { color: '#E58A7B', size: 16, pts: [pts[0], { ...pts[0], x: pts[0].x + 30 }], brush: 'stamp:cow' }
  calls.length = 0
  assert.equal(paint(ctx, tap, true, () => {}), true)
  assert.equal(calls.filter((c) => c === 'arc').length, 1, '點一下（挪一點點）蓋一個印章')
  assert.equal(isStampTap(tap), true)
  assert.equal(isStampTap({ ...tap, brush: 'dots' }), false, '不是印章的筆不算蓋章')
  assert.equal(run(undefined), false, '沒有 brush 的照一般的筆')
  assert.equal(run('stamp:'), false)
  assert.equal(run('trail:'), false)
  assert.equal(run('nope'), false, '不認得的筆照一般的筆')
  assert.match(rainbowAt(0), /^rgb\(\d+,\d+,\d+\)$/)
  assert.notEqual(rainbowAt(0.1), rainbowAt(0.5), '彩虹筆畫越長顏色會變')
  assert.equal(rainbowAt(0.25), rainbowAt(1.25), '一輪之後重來')
  ok('四種魔法筆、印章都畫得出來；對稱筆以正中間為軸；拿著印章拖遠了是畫線；不認得的照一般的筆')
}

// ── 橡皮擦 ───────────────────────────────────
{
  // 記下畫了什麼、畫的時候 globalCompositeOperation 是什麼
  const calls: string[] = []
  const state: Record<string, unknown> = { globalCompositeOperation: 'source-over' }
  const saved: Record<string, unknown>[] = []
  const ctx = new Proxy(state, {
    get: (t, k) => {
      if (k === 'save') return () => saved.push({ ...t })
      if (k === 'restore') return () => Object.assign(t, saved.pop())
      if (typeof k === 'string' && ['beginPath', 'arc', 'fill', 'moveTo', 'lineTo', 'stroke'].includes(k)) return () => calls.push(`${k}:${t.globalCompositeOperation}`)
      return t[k as string]
    },
    set: (t, k, v) => ((t[k as string] = v), true),
  }) as unknown as CanvasRenderingContext2D
  const paint = makePaint(1000)
  const pts = Array.from({ length: 12 }, (_, i) => ({ x: 100 + i * 20, y: 300, p: 0.5 }))
  const er = { color: '#E58A7B', size: ERASE_SIZE, pts, brush: ERASER }
  assert.equal(paint(ctx, er, false, () => assert.fail('橡皮擦不能照一般的筆畫（會畫出一條顏色）')), true)
  assert.ok(calls.includes('stroke:destination-out'), `橡皮擦要用 destination-out 擦成透明（${calls.join(' ')}）`)
  assert.ok(!calls.some((c) => !c.endsWith(':destination-out')), '橡皮擦畫的每一下都是擦，不是畫')
  assert.equal(state.globalCompositeOperation, 'source-over', '擦完要還原，之後畫的線照常出墨')
  assert.equal(state.lineWidth, ERASE_SIZE, '擦的寬度就是筆畫的粗細')
  calls.length = 0
  assert.equal(paint(ctx, { ...er, pts: [pts[0]] }, true, () => {}), true)
  assert.deepEqual(calls.filter((c) => c.startsWith('fill') || c.startsWith('arc')), ['arc:destination-out', 'fill:destination-out'], '點一下擦掉一個圓')
  assert.ok(ERASE_SIZE >= 80, `三歲的手不準，擦的比手指寬很多（現在 ${ERASE_SIZE}）`)
  assert.equal(isEraser(er), true)
  assert.equal(isEraser({ brush: 'rainbow' }), false)
  assert.equal(isEraser({}), false, '一般的筆不是橡皮擦')
  assert.equal(isStampTap({ ...er, pts: [pts[0]] }), false, '橡皮擦點一下不算蓋章')
  ok('橡皮擦：用 destination-out 擦成透明、擦完還原、點一下擦一個圓、比手指寬很多')
}

// ── 每個世界的印章和今天的一句 ───────────────
{
  for (const w of WORLDS) {
    for (const s of w.stamps) assert.ok(EMOJI[s], `${w.id} 的印章 ${s} 沒有圖`)
    assert.ok(DRAW_IDEA[w.id], `${w.id} 沒有發呆時今天的一句`)
    const id = ideaKey(w.id)
    assert.ok(hasLine(id), `${id} 沒有台詞`)
    assert.equal(line(id).speaker, 'dodo')
    const words = line(id).text.trim().split(/\s+/)
    assert.ok(words.length <= 6, `${id} 超過 6 個字：${line(id).text}`)
    assert.ok(/^[\x20-\x7e]+$/.test(line(id).text), `${id} 只能是英文：${line(id).text}`)
  }
  ok('每個世界的印章都有圖、發呆時今天的一句（英文、≤ 6 個字、豆豆說）')
}

console.log('ALL PASS')

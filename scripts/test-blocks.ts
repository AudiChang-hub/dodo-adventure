// 遊戲角的積木蓋蓋看（T-162，src/games/blocks）的單元測試。
// 執行：npx tsx scripts/test-blocks.ts（npm run verify 的「單元：積木蓋蓋看」）
// 驗收：模型 ≥ 200 個、分 ≥ 6 個主題；每個模型塊數、大小對；樣子（不看顏色、鏡像也算）兩兩不一樣；平面版和前後兩排版都放得完（撐得住）；
// 顏色 ≥ 8 種；連續出 300 個不跟最近 10 個重複、不跟上一個同主題；托盤有每一塊要用的、多放的不會是答案；
// 第 4 級的步驟每塊剛好一次、一步 ≤ 3 塊、照步驟放得上去；照提示一直放一定蓋得完；升降級跟拼圖一樣；
// 平板橫向每一個模型的托盤格子 ≥ 2 公分、不重疊、不超出，手機直式放得下；自由蓋的掉落、疊高、拿得起來；選單有它；家長區；台詞和音檔。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { COLORS, buildOrder, kindOf, overlaps, parseRows, signature, sizeOfModel, splitRun, supported, to3d, type Brick } from '../src/games/blocks/bricks'
import { MODELS, modelBricks } from '../src/games/blocks/models'
import { THEME_ZH } from '../src/games/blocks/model-kit'
import {
  BLOCKS_MAX,
  FREE_COLS,
  FREE_MAX,
  FREE_ROWS,
  LEVELS,
  RECENT_MODELS,
  STEP_MAX,
  afterBlocks,
  blocksRound,
  blocksSkill,
  covered,
  dropFree,
  extras,
  nextTarget,
  normalizeBlocks,
  pickModel,
  placeable,
  spotsFor,
  stepsOf,
  type BlocksLevel,
  type BlocksState,
} from '../src/games/blocks/plan'
import { TOUCH, boardGeo, freeGeo, trayLayout } from '../src/games/blocks/geometry'
import { MASTER_OF } from '../src/games/logic/sort-plan'
import { LOGIC_GAME_NAME, LOGIC_SKILLS, logicSkillLabel } from '../src/games/logic/report'
import { PICK_GROUPS, groupLayout } from '../src/games/logic/pick-grid'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'
import { segments } from '../src/content/lines'
import { clipName } from '../src/lib/clip'
import { modelLineKey } from '../src/games/blocks/lines'

function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}
const words = (s: string) => s.split(/\s+/).filter(Boolean).length
/** 照提示一直放（nextTarget），放得完嗎 */
function autoBuild(target: readonly Brick[], steps: number[][] | null) {
  const placed = target.map(() => false)
  for (let s = 0; s < (steps?.length ?? 1); s++) {
    const allowed = steps ? steps[s] : undefined
    for (;;) {
      const i = nextTarget(target, placed, allowed)
      if (i == null) break
      placed[i] = true
    }
    if (steps) assert.ok(steps[s].every((i) => placed[i]), `第 ${s + 1} 步放不完`)
  }
  return placed.every(Boolean)
}

function main() {
  // ── 格式 ──
  {
    assert.deepEqual(splitRun(4, 4), [4])
    assert.deepEqual(splitRun(5, 4), [3, 2])
    assert.deepEqual(splitRun(6, 4), [3, 3])
    assert.deepEqual(splitRun(8, 4), [4, 4])
    const a = parseRows(['RRrr', '1@.2'], '1Ge 2B/')
    assert.equal(a.length, 5)
    assert.deepEqual(
      a.map((b) => `${b.x},${b.z},${b.w},${b.color},${b.shape}`),
      ['0,1,2,R,brick', '2,1,2,R,brick', '0,0,1,G,eyeL', '1,0,1,D,wheel', '3,0,1,B,slopeR'],
    )
    // 立體版：輪子、圓柱前後各一個，其他兩排深
    const d = to3d(parseRows(['1R', '@@'], '1Yo'))
    assert.equal(d.length, 7)
    assert.equal(d.filter((b) => b.d === 2).length, 1)
    // 只換顏色、左右鏡像：樣子一樣
    assert.equal(signature(parseRows(['.BB.', 'RRRR', '@..@'])), signature(parseRows(['.GG.', 'YYYY', '@..@'])))
    assert.equal(signature(parseRows(['1RRR'], '1R/')), signature(parseRows(['RRR1'], '1B\\')))
    assert.notEqual(signature(parseRows(['.BB.', 'RRRR'])), signature(parseRows(['BB..', 'RRRR'])))
    // 撐住：浮在空中的放不上去；旁邊黏著（被撐住的那塊旁邊）可以
    assert.equal(buildOrder(parseRows(['R..', '...', 'BBB'])), null)
    assert.ok(buildOrder(parseRows(['GRG', '.N.'])))
    assert.equal(supported({ x: 0, z: 1, y: 0, w: 1, d: 1, color: 'R', shape: 'brick' }, parseRows(['1'], '1R/')), false, '一格寬的斜坡上面不能疊')
    console.log('ok 1 模型的文字格式：大小寫分塊、太長平均切、key、立體版、樣子的指紋（換色、鏡像都算一樣）、撐得住')
  }

  // ── 內容量 ──
  const S = MODELS.filter((m) => m.size === 'S')
  const M = MODELS.filter((m) => m.size === 'M')
  {
    assert.ok(MODELS.length >= 200, `模型 ${MODELS.length} 個（要 ≥ 200）`)
    assert.ok(S.length >= 60 && M.length >= 130, `小 ${S.length}、中 ${M.length}`)
    const ids = MODELS.map((m) => m.id)
    assert.equal(new Set(ids).size, ids.length, 'id 重複')
    const themes = Object.keys(THEME_ZH)
    for (const t of themes) assert.ok(MODELS.filter((m) => m.theme === t).length >= 5, `主題 ${t} 太少`)
    const colors = new Set(MODELS.flatMap((m) => m.bricks.map((b) => b.color)))
    assert.ok(colors.size >= 8, `顏色 ${colors.size} 種`)
    assert.ok(Object.keys(COLORS).length >= 8)
    const sigs = new Map<string, string>()
    for (const m of MODELS) {
      const n = m.bricks.length
      const sz = sizeOfModel(m.bricks)
      if (m.size === 'S') assert.ok(n >= 3 && n <= 4 && sz.w <= 5 && sz.h <= 4, `${m.id}：小的要 3～4 塊、≤ 5×4（${n} 塊、${sz.w}×${sz.h}）`)
      else assert.ok(n >= 6 && n <= 8 && sz.w <= 8 && sz.h <= 6, `${m.id}：中的要 6～8 塊、≤ 8×6（${n} 塊、${sz.w}×${sz.h}）`)
      for (const deep of [false, true]) {
        const bs = modelBricks(m, deep)
        for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) assert.ok(!overlaps(bs[i], bs[j]), `${m.id}：積木重疊`)
        assert.ok(buildOrder(bs), `${m.id}${deep ? '（立體）' : ''}：有積木撐不住，放不完`)
      }
      const s = signature(m.bricks)
      assert.ok(!sigs.has(s), `${m.id} 跟 ${sigs.get(s)} 樣子一樣（只換顏色或鏡像）`)
      sigs.set(s, m.id)
      assert.ok(m.zh && m.en, `${m.id}：沒有名字`)
      assert.ok(words(m.en) <= 6, `${m.id}：句子太長`)
    }
    const byTheme = themes.map((t) => `${THEME_ZH[t as keyof typeof THEME_ZH]} ${MODELS.filter((m) => m.theme === t).length}`).join('、')
    console.log(`ok 2 模型 ${MODELS.length} 個（小 ${S.length}、中 ${M.length}；${byTheme}）、顏色 ${colors.size} 種；樣子兩兩不同、平面和立體都放得完`)
  }

  // ── 出題 ──
  {
    for (const lv of [1, 2, 3, 4] as BlocksLevel[]) {
      const rnd = seeded(7 + lv)
      const recent: string[] = []
      for (let k = 0; k < 300; k++) {
        const m = pickModel(lv, recent, rnd)
        assert.equal(m.size, LEVELS[lv].size)
        assert.ok(!recent.slice(-RECENT_MODELS).includes(m.id), `第 ${lv} 級：${m.id} 在最近 ${RECENT_MODELS} 個裡`)
        const prev = MODELS.find((x) => x.id === recent[recent.length - 1])
        if (prev) assert.notEqual(m.theme, prev.theme, '跟上一個同主題')
        recent.push(m.id)
      }
      const seen = new Set(recent)
      assert.ok(seen.size >= (LEVELS[lv].size === 'S' ? 50 : 100), `第 ${lv} 級 300 次只出了 ${seen.size} 種`)
    }
    console.log(`ok 3 每一級連續 300 次：不跟最近 ${RECENT_MODELS} 個重複、不跟上一個同主題，出得到大部分的模型`)
  }

  {
    const rnd = seeded(99)
    for (const lv of [1, 2, 3, 4] as BlocksLevel[]) {
      for (let k = 0; k < 120; k++) {
        const r = blocksRound(lv, [], rnd)
        assert.equal(r.deep, LEVELS[lv].deep)
        assert.equal(r.target.length, modelBricks(r.model, r.deep).length)
        const real = r.tray.filter((t) => t.step !== -1)
        const more = r.tray.filter((t) => t.step === -1)
        assert.deepEqual(real.map((t) => t.kind).sort(), r.target.map(kindOf).sort(), '托盤要有每一塊')
        assert.equal(more.length, LEVELS[lv].extra, '多放的塊數')
        for (const t of more) assert.ok(!r.target.some((b) => kindOf(b) === t.kind), `多放的 ${t.kind} 是要用的`)
        assert.equal(new Set(r.tray.map((t) => t.id)).size, r.tray.length)
        if (lv === 4) {
          const steps = r.steps!
          assert.ok(steps.length >= 2)
          assert.deepEqual(steps.flat().sort((a, b) => a - b), r.target.map((_, i) => i), '每塊剛好一步')
          for (const s of steps) assert.ok(s.length >= 1 && s.length <= STEP_MAX)
          for (const t of real) assert.ok(steps[t.step].includes(t.id))
        } else assert.equal(r.steps, null)
        assert.ok(autoBuild(r.target, r.steps), `${r.model.id}：照提示放不完`)
      }
    }
    // 每一個模型（立體版）的步驟都照得完
    for (const m of M) assert.ok(autoBuild(modelBricks(m, true), stepsOf(modelBricks(m, true))), `${m.id} 的步驟放不完`)
    // 拿錯：下面還沒放的（太早）不能放；多放的那一塊沒有位置
    const car = parseRows(['.BB.', 'RRRR', '@..@'])
    const placed = car.map(() => false)
    const top = car.findIndex((b) => b.color === 'B')
    assert.equal(placeable(car, placed, top), false)
    assert.deepEqual(spotsFor(car, placed, kindOf({ ...car[top], color: 'Y' })), [])
    assert.equal(spotsFor(car, placed, kindOf(car[car.length - 1])).length, 2, '兩個輪子都可以放')
    assert.equal(extras(car, 5, seeded(1)).length, 5)
    console.log('ok 4 每一局：托盤有每一塊、多放的不會是答案；第 4 級每塊剛好一步、一步 ≤ 3 塊；照提示一直放一定蓋得完（每個模型的步驟都試過）')
  }

  // ── 升降級 ──
  {
    let s: BlocksState = normalizeBlocks(null)
    assert.equal(s.level, 1)
    const day = (i: number) => `2026-11-${String(10 + (i % 15)).padStart(2, '0')}`
    s = afterBlocks(s, { model: 'car', date: day(0), wrongs: 0, shown: false, counted: true })
    assert.equal(s.level, 2, '順利蓋完一個就升一級')
    s = afterBlocks(s, { model: 'sedan', date: day(1), wrongs: 3, shown: false, counted: true })
    assert.equal(s.level, 2, '放錯 3 次不升')
    s = afterBlocks(s, { model: 'house', date: day(1), wrongs: 0, shown: true, counted: true })
    assert.equal(s.level, 2, '手帶著放的不升')
    s = afterBlocks(s, { model: 'barn', date: day(1), wrongs: 0, shown: false, counted: false })
    assert.equal(s.level, 2, '示範、一起做的不升')
    s = afterBlocks(s, { model: 'cow', date: day(1), wrongs: 0, shown: false, counted: true })
    s = afterBlocks(s, { model: 'cow2', date: day(1), wrongs: 0, shown: false, counted: true })
    s = afterBlocks(s, { model: 'cow3', date: day(1), wrongs: 0, shown: false, counted: true })
    assert.equal(s.level, BLOCKS_MAX)
    for (let i = 0; i < 6; i++) s = afterBlocks(s, { model: `m${i}`, date: day(i), wrongs: 4, shown: false, counted: true })
    assert.equal(s.level, BLOCKS_MAX - 1, '最近 6 個都不順：退一級')
    for (let i = 0; i < 30; i++) s = afterBlocks(s, { model: `x${i}`, date: day(i), wrongs: 0, shown: false, counted: true })
    assert.ok(s.models.length <= RECENT_MODELS)
    assert.ok(s.recent.length <= MASTER_OF)
    const bad = normalizeBlocks({ level: 99, recent: 'x', taught: [1, 'a'], models: [3, 'car'] })
    assert.deepEqual(bad, { level: BLOCKS_MAX, recent: [], taught: [1], models: ['car'] })
    for (let lv = 1; lv <= BLOCKS_MAX; lv++) assert.ok(logicSkillLabel(blocksSkill(lv as BlocksLevel)), `家長區缺 ${blocksSkill(lv as BlocksLevel)}`)
    console.log('ok 5 升降級：順利蓋完升一級（放錯 > 1、手帶著、示範的不升）、最近 6 個不順退一級；讀到壞資料會補好')
  }

  // ── 版面 ──
  {
    // 平板橫向 1200×786：作答區約 1200×558（上面的返回鍵一排、最下緣 2 公分不放）；手機直式 390×844：約 390×616
    let minU = Infinity
    let minCell = Infinity
    for (const [W, H, tablet] of [
      [1200, 558, true],
      [1280, 572, true],
      [390, 616, false],
    ] as const) {
      for (const lv of [1, 2, 3, 4] as BlocksLevel[]) {
        const L = LEVELS[lv]
        for (const m of MODELS.filter((x) => x.size === L.size)) {
          const target = modelBricks(m, L.deep)
          const sz = sizeOfModel(target)
          const margin = Math.max(1, Math.ceil((5 - sz.w) / 2))
          const g = boardGeo(W, H, sz.w + 2 * margin, sz.h + 1, L.deep ? 2 : 1, L.deep)!
          assert.ok(g, '版面')
          // 底板在作答區裡、不跟參考圖、托盤重疊
          for (const b of [g.ref, g.board, g.tray]) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= W + 0.5 && b.y + b.h <= H + 0.5, `${m.id}：超出作答區`)
          if (!g.portrait) assert.ok(g.ref.x + g.ref.w <= g.board.x && g.board.x + g.board.w <= g.tray.x, '三欄不重疊')
          // 托盤：這一局最多的時候（第 4 級每一步、其他級整盤）
          const r = blocksRound(lv, [], seeded(m.id.length * 31 + lv))
          const groups = r.steps ? r.steps.map((s, k) => r.tray.filter((t) => t.step === k || t.step === -1)) : [r.tray]
          for (const items of groups) {
            const lay = trayLayout(g.tray, items.map((t) => t.b), g.u, L.deep)
            for (const c of lay.cells) {
              if (tablet) assert.ok(c.w >= TOUCH - 0.01 && c.h >= TOUCH - 0.01, '格子 ≥ 2 公分')
              assert.ok(c.x - c.w / 2 >= g.tray.x - 1 && c.x + c.w / 2 <= g.tray.x + g.tray.w + 1 && c.y - c.h / 2 >= g.tray.y - 1 && c.y + c.h / 2 <= g.tray.y + g.tray.h + 1, `${m.id}：托盤格子超出`)
              if (tablet) minCell = Math.min(minCell, c.w, c.h)
            }
            for (let i = 0; i < lay.cells.length; i++)
              for (let j = i + 1; j < lay.cells.length; j++) {
                const a = lay.cells[i]
                const b = lay.cells[j]
                assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 0.5 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 - 0.5, `${m.id}：托盤格子重疊`)
              }
            if (tablet) assert.ok(lay.ut >= 20, `${m.id}：托盤的積木太小（一格 ${lay.ut.toFixed(1)} px）`)
          }
          if (tablet) minU = Math.min(minU, g.u)
        }
      }
    }
    assert.ok(minU >= 40, `平板上底板一格至少 40 px（約 0.9 公分），實際最小 ${minU.toFixed(1)}`)
    // 自由蓋
    for (const [W, H] of [
      [1200, 558],
      [390, 616],
    ]) {
      const f = freeGeo(W, H, FREE_COLS, FREE_ROWS, 10, 9)!
      const all = [...f.colors, ...f.shapes, f.check, f.clear]
      for (const c of all) {
        if (W > H) assert.ok(c.w >= TOUCH - 0.01 && c.h >= TOUCH - 0.01, '自由蓋的格子 ≥ 2 公分')
        assert.ok(c.x - c.w / 2 >= -1 && c.x + c.w / 2 <= W + 1 && c.y - c.h / 2 >= -1 && c.y + c.h / 2 <= H + 1, `自由蓋超出作答區（${W}×${H}）`)
      }
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i]
          const b = all[j]
          assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 0.5 || Math.abs(a.y - b.y) >= (a.h + b.h) / 2 - 0.5, '自由蓋的格子重疊')
        }
      if (W > H) assert.ok(f.u >= 40)
    }
    console.log(`ok 6 版面：平板橫向（1200、1280 寬）和手機直式，每一個模型的底板、參考圖、托盤都在作答區裡、不重疊；托盤每一格 ≥ ${TOUCH} px（平板最小 ${minCell.toFixed(0)}；手機直式放不下時格子才縮小）；平板底板一格最小 ${minU.toFixed(0)} px；自由蓋的顏色、積木、按鍵在作答區裡、不重疊（平板 ≥ ${TOUCH} px）`)
  }

  // ── 自由蓋 ──
  {
    const b2: Brick = { x: 0, z: 0, y: 0, w: 2, d: 1, color: 'R', shape: 'brick' }
    let list: Brick[] = []
    const a = dropFree(list, b2, 3)!
    assert.deepEqual([a.x, a.z], [3, 0])
    list = [a]
    const c = dropFree(list, { ...b2, w: 4 }, 2)!
    assert.deepEqual([c.x, c.z], [2, 1], '疊在下面那塊上面')
    list.push(c)
    assert.deepEqual([dropFree(list, b2, -5)!.x, dropFree(list, b2, 99)!.x], [0, FREE_COLS - 2], '夾在底板裡')
    assert.equal(covered(list, a), true)
    assert.equal(covered(list, c), false)
    let tower: Brick[] = []
    for (let i = 0; i < FREE_ROWS; i++) tower.push(dropFree(tower, b2, 0)!)
    assert.equal(dropFree(tower, b2, 0), null, '太高放不下')
    assert.ok(FREE_MAX >= 40)
    tower = []
    console.log('ok 7 自由蓋：放手就掉下來疊在最高的那塊上、夾在底板裡、太高放不下、壓著的拿不起來')
  }

  // ── 選單、家長區、台詞 ──
  {
    assert.ok(PICK_GROUPS.some((g) => g.games.includes('blocks')), '選單有積木蓋蓋看')
    assert.ok(groupLayout(PICK_GROUPS.map((g) => g.games.length)).card.w >= 112, '選單的卡片 ≥ 2.5 公分')
    assert.equal(LOGIC_GAME_NAME['logic-blocks'], '積木蓋蓋看')
    assert.ok(LOGIC_SKILLS.filter((s) => s.skill.startsWith('blocks:')).length === 4)
    console.log('ok 8 選玩法有積木蓋蓋看、卡片 ≥ 2.5 公分（分類見 test-logic-pick）；家長區有遊戲名和四級的技能')
  }
  const keys = ['bk.pick', 'bk.intro', 'bk.ask', 'bk.look', 'bk.here', 'bk.bottom', 'bk.praise', 'bk.step', 'bk.again', 'bk.free.intro', 'bk.free.done', 'bk.free.empty', 'bk.free.again', 'teach.watch.dodo', 'teach.turn.dodo', 'd.next.home', ...MODELS.map((m) => modelLineKey(m.id))]
  {
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    for (const k of keys.filter((k) => k.startsWith('bk.'))) {
      assert.ok(words(line(k).text.replace(/\|/g, ' ')) <= 6, `一句 ≤ 6 個字：${k}`)
      assert.ok(!/[一-鿿]/.test(line(k).text), `不念中文：${k}`)
      assert.ok(!/lego/i.test(line(k).text), `不說品牌名：${k}`)
    }
    console.log(`ok 9 台詞都有（${keys.length} 句）、每句 ≤ 6 個字、全部英文、不說品牌名`)
  }
  {
    if (existsSync('public/audio')) {
      const miss = keys.flatMap((k) => segments(line(k)).map((s) => clipName(line(k), s))).filter((n) => !existsSync(`public/audio/${n}.mp3`))
      assert.deepEqual(miss, [], `缺音檔：${miss.length} 個（python scripts/gen_audio.py --only bk.）`)
      console.log(`ok 10 ${keys.length} 句台詞都有音檔`)
    } else console.log('ok 10 （跳過）沒有 public/audio，不檢查音檔')
  }

  console.log('ALL PASS')
}

main()

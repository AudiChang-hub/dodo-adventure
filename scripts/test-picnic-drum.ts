// 遊戲角的小熊野餐、鼓聲停（T-160，src/games/picnic、src/games/drum）和選玩法的排法的單元測試。
// 執行：npx tsx scripts/test-picnic-drum.ts（npm run verify 的「單元：小熊野餐、鼓聲停」）
// 驗收：內容量（食物 ≥ 30、客人 ≥ 15、組合 ≥ 200、角色 ≥ 10、舞台 ≥ 10、鼓的音色和節奏各 ≥ 6）；連開 300 次野餐不跟最近幾次重複、數量在這一級的範圍；
// 給太多太少的判斷、手幫忙拿的步驟；升降級；版面在平板和手機上都放得下、鈴鐺和食物不在最下面 2 cm；
// 鼓：每一級的長度、停的時間、整小節／突然停、有快有慢；停住了沒的判斷；台詞都有、每句 ≤ 6 個字、音檔都在。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { EMOJI } from '../src/art/emoji.generated'
import { ITEMS } from '../src/art/storybook/meta'
import { line, segments } from '../src/content/lines'
import { clipName } from '../src/lib/clip'
import { PICNIC_FOOD_ART } from '../src/games/picnic/food.generated'
import {
  BASKET_IDS,
  CLOTH_IDS,
  FOODS,
  GUEST_IDS,
  GUESTS_PER_PICNIC,
  MAX_TRAY,
  PICNIC_COMBOS,
  PICNIC_LEVELS,
  PICNIC_MAX,
  PICNIC_START,
  PLACE_IDS,
  PLATE_IDS,
  RECENT,
  fixMoves,
  judge,
  makePicnic,
  normalizePicnic,
  picnicSkill,
  rememberPicnic,
  sceneSig,
  stepPicnic,
  type PicnicLevel,
  type PicnicState,
} from '../src/games/picnic/plan'
import { BOTTOM_SAFE, onPlate, picnicGeo, plateSpots } from '../src/games/picnic/geometry'
import { askKey, numKey } from '../src/games/picnic/lines'
import '../src/games/drum/lines'
import {
  DANCER_IDS,
  DRUM_COMBOS,
  DRUM_LEVELS,
  DRUM_MAX,
  DRUM_START,
  KIT_IDS,
  PATTERNS,
  PATTERN_IDS,
  RECENT as DRUM_RECENT,
  STAGE_IDS,
  judgeStop,
  makeSong,
  normalizeDrum,
  rememberSong,
  songOk,
  stepDrum,
  type DrumLevel,
} from '../src/games/drum/plan'
import { hitsOf } from '../src/games/drum/plan'
import { PICK_GROUPS, groupLayout } from '../src/games/logic/pick-grid'
import { LOGIC_GAME_NAME, LOGIC_SKILLS } from '../src/games/logic/report'

/** 可重現的亂數（mulberry32） */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const words = (key: string) =>
  line(key)
    .text.replace(/\|/g, ' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w)).length

function main() {
  // ── 小熊野餐 ──
  {
    assert.ok(FOODS.length >= 30, `食物 ${FOODS.length} 種`)
    assert.equal(new Set(FOODS.map((f) => f.icon)).size, FOODS.length, '食物不重複')
    const noArt = FOODS.filter((f) => !EMOJI[f.icon] && !PICNIC_FOOD_ART[f.icon]).map((f) => f.icon)
    assert.deepEqual(noArt, [], `食物沒有圖：${noArt.join('、')}`)
    assert.ok(GUEST_IDS.length >= 15, `客人 ${GUEST_IDS.length} 個`)
    const noGuest = GUEST_IDS.filter((g) => !ITEMS[g])
    assert.deepEqual(noGuest, [], `客人不在繪本角色庫：${noGuest.join('、')}`)
    assert.ok(PICNIC_COMBOS >= 200, `組合 ${PICNIC_COMBOS}`)
    console.log(`ok 1 野餐的內容：食物 ${FOODS.length} 種、客人 ${GUEST_IDS.length} 個、地方 ${PLACE_IDS.length}、桌布 ${CLOTH_IDS.length}、盤子 ${PLATE_IDS.length}、籃子 ${BASKET_IDS.length}，共 ${PICNIC_COMBOS.toLocaleString()} 種組合`)
  }
  {
    // 每一級連開 300 次：客人、食物不重複、不跟最近幾次一樣；場地、桌布、盤子不跟最近 3 次一樣；整組不跟最近 12 次一樣；數量在範圍、不連續一樣
    for (const lv of [1, 2, 3, 4] as PicnicLevel[]) {
      const rnd = seeded(lv * 101)
      let s: PicnicState = { ...PICNIC_START, level: lv, taught: [1, 2, 3, 4] }
      for (let k = 0; k < 300; k++) {
        const p = makePicnic(s, rnd)
        assert.equal(p.demo, false)
        assert.equal(p.guests.length, GUESTS_PER_PICNIC)
        assert.equal(new Set(p.guests.map((g) => g.who)).size, p.guests.length, '同一次客人不重複')
        assert.equal(new Set(p.guests.map((g) => g.food.icon)).size, p.guests.length, '同一次食物不重複')
        for (const g of p.guests) {
          assert.ok(!s.guests.slice(-RECENT.guests).includes(g.who), `客人 ${g.who} 跟最近幾次一樣`)
          assert.ok(!s.foods.slice(-RECENT.foods).includes(g.food.icon), `食物 ${g.food.icon} 跟最近幾次一樣`)
          assert.ok(PICNIC_LEVELS[lv].wants.includes(g.want), `第 ${lv} 級要 ${g.want} 個`)
          assert.ok(g.want < PICNIC_LEVELS[lv].tray, '籃子裡比要的多')
        }
        for (let i = 1; i < p.guests.length; i++) assert.notEqual(p.guests[i].want, p.guests[i - 1].want, '連續兩個客人要的數量不一樣')
        assert.ok(!s.places.slice(-RECENT.places).includes(p.place), '地方跟最近 3 次一樣')
        assert.ok(!s.cloths.slice(-RECENT.cloths).includes(p.cloth), '桌布跟最近 3 次一樣')
        assert.ok(!s.plates.slice(-RECENT.plates).includes(p.plate), '盤子跟最近 3 次一樣')
        assert.ok(!s.scenes.includes(sceneSig(p)), '整組跟最近 12 次一樣')
        assert.ok(PICNIC_LEVELS[lv].tray <= MAX_TRAY)
        s = rememberPicnic(s, p)
      }
    }
    // 第一次到這一級：多一個示範的客人，要 2 個
    const d = makePicnic({ ...PICNIC_START }, seeded(7))
    assert.equal(d.demo, true)
    assert.equal(d.guests.length, GUESTS_PER_PICNIC + 1)
    assert.equal(d.guests[0].want, 2)
    console.log('ok 2 野餐每一級連開 300 次：不跟最近幾次重複、數量在範圍；第一次到這一級多一個示範的客人')
  }
  {
    assert.equal(judge(0, 3), 'empty')
    assert.equal(judge(3, 3), 'ok')
    assert.equal(judge(5, 3), 'over')
    assert.equal(judge(1, 3), 'under')
    assert.deepEqual(fixMoves([4, 1, 0, 2, 3], [5, 6], 3), { back: [3, 2], add: [] })
    assert.deepEqual(fixMoves([4], [0, 1, 2, 3], 3), { back: [], add: [0, 1] })
    assert.deepEqual(fixMoves([], [0, 1, 2], 2), { back: [], add: [0, 1] })
    console.log('ok 3 給了以後：空的、剛好、太多、太少；手幫忙拿回最後放的、從籃子補前面的')
  }
  {
    const d = '2026-11-17'
    let s: PicnicState = { ...PICNIC_START }
    for (let i = 0; i < 5; i++) s = stepPicnic(s, { date: d, first: true, counted: true })
    assert.equal(s.level, 1, '5 個還不升')
    s = stepPicnic(s, { date: d, first: true, counted: true })
    assert.equal(s.level, 2, '最近 6 個 5 個對就升級')
    s = stepPicnic(s, { date: d, first: true, counted: false })
    assert.equal(s.recent.length, 0, '示範、手帶著的不算')
    for (let i = 0; i < 3; i++) s = stepPicnic(s, { date: d, first: false, counted: true })
    assert.equal(s.level, 2)
    s = stepPicnic(s, { date: d, first: true, counted: true })
    assert.equal(s.level, 1, '最近 4 個只對 1 個（錯、錯、錯、對）就退級')
    s = { ...PICNIC_START, level: 3 }
    for (let i = 0; i < 4; i++) s = stepPicnic(s, { date: d, first: false, counted: true })
    assert.equal(s.level, 2, '最近 4 個都沒對就退級')
    let top: PicnicState = { ...PICNIC_START, level: PICNIC_MAX }
    for (let i = 0; i < 10; i++) top = stepPicnic(top, { date: d, first: true, counted: true })
    assert.equal(top.level, PICNIC_MAX)
    assert.deepEqual(normalizePicnic(null), PICNIC_START)
    const n = normalizePicnic({ level: 99, recent: [{ date: 'x', ok: 1 }, 3], guests: ['teddy', 'dragon'], places: ['beach', 5] })
    assert.equal(n.level, PICNIC_MAX)
    assert.deepEqual(n.guests, ['teddy'])
    assert.deepEqual(n.places, ['beach'])
    assert.equal(n.recent.length, 1)
    assert.deepEqual([1, 2, 3, 4].map((l) => picnicSkill(l as PicnicLevel)), ['picnic:1-3', 'picnic:2-4', 'picnic:3-5', 'picnic:3-5-scatter'])
    console.log('ok 4 野餐升降級：最近 6 個 5 個對升級、最近 4 個 ≤ 1 個對退級、示範不算；壞掉的進度補預設')
  }
  {
    // 版面：平板橫的（作答區約 1200×640）、手機直的（約 375×690），每一級的籃子數量
    const sizes = [
      { w: 1200, h: 640, tablet: true },
      { w: 1180, h: 600, tablet: true },
      { w: 375, h: 690, tablet: false },
      { w: 390, h: 620, tablet: false },
    ]
    const inside = (b: { x: number; y: number; w: number; h: number }, W: number, H: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W + 0.5 && b.y + b.h <= H + 0.5
    const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (const z of sizes)
      for (const lv of [1, 2, 3, 4] as PicnicLevel[]) {
        const n = PICNIC_LEVELS[lv].tray
        const g = picnicGeo(z.w, z.h, n)!
        for (const k of ['basket', 'plate', 'bell', 'guest'] as const) assert.ok(inside(g[k], z.w, z.h), `${z.w}×${z.h} 第 ${lv} 級 ${k} 超出畫面`)
        assert.ok(g.bell.y + g.bell.h <= z.h - BOTTOM_SAFE, `${z.w}×${z.h} 鈴鐺在最下面 2 cm`)
        assert.ok(!overlap(g.bell, g.plate) && !overlap(g.bell, g.basket) && !overlap(g.plate, g.basket), `${z.w}×${z.h} 鈴鐺、盤子、籃子重疊`)
        if (z.tablet) {
          assert.ok(g.item >= 90, `${z.w}×${z.h} 第 ${lv} 級食物只有 ${g.item.toFixed(0)}px`)
          assert.ok(g.bell.w >= 112, `鈴鐺只有 ${g.bell.w.toFixed(0)}px`)
        }
        assert.equal(g.tray.length, n)
        for (const t of g.tray) {
          assert.ok(t.y + g.item / 2 <= z.h - BOTTOM_SAFE + 1, `${z.w}×${z.h} 第 ${lv} 級籃子的食物在最下面 2 cm`)
          assert.ok(t.x - g.item / 2 >= g.basket.x - 1 && t.x + g.item / 2 <= g.basket.x + g.basket.w + 1, '食物在籃子裡')
        }
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) assert.ok(Math.hypot(g.tray[i].x - g.tray[j].x, g.tray[i].y - g.tray[j].y) >= g.item * 0.99, '籃子裡的食物不疊在一起')
        for (let m = 1; m <= n; m++) {
          const sp = plateSpots(g, m)
          assert.equal(sp.pts.length, m)
          for (const p of sp.pts) assert.ok(onPlate(g, p, 0) && p.x - sp.size / 2 >= g.plate.x - 1 && p.x + sp.size / 2 <= g.plate.x + g.plate.w + 1, `盤子上 ${m} 個超出盤子`)
          for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) assert.ok(Math.hypot(sp.pts[i].x - sp.pts[j].x, sp.pts[i].y - sp.pts[j].y) >= sp.size * 0.99, '盤子上的不疊在一起')
        }
      }
    console.log('ok 5 野餐的版面：平板、手機都放得下，不重疊；平板上食物 ≥ 90px、鈴鐺 ≥ 112px；鈴鐺和籃子不在最下面 2 cm')
  }
  {
    const keys = ['pn.intro', 'pn.bell', 'pn.back', 'pn.praise', 'pn.again']
    for (let n = 1; n <= MAX_TRAY; n++) keys.push(numKey(n))
    const maxWant = Math.max(...Object.values(PICNIC_LEVELS).flatMap((l) => l.wants))
    for (let n = 1; n <= maxWant; n++) keys.push(`pn.got.${n}`, `pn.over.${n}`, `pn.under.${n}`)
    for (const f of FOODS) for (let n = 1; n <= maxWant; n++) keys.push(askKey(f.icon, n))
    keys.push('dr.rule', 'dr.tap', 'dr.dance', 'dr.freeze', 'dr.whoa', 'dr.praise', 'dr.end', 'dr.again', 'teach.watch.dodo', 'teach.turn.dodo', 'd.next.home')
    for (const k of keys) {
      assert.ok(line(k), `缺台詞 ${k}`)
      assert.ok(words(k) <= 6, `${k}「${line(k).text}」超過 6 個字`)
    }
    assert.equal(line(askKey('red-apple', 3)).text, 'I want three apples!')
    assert.equal(line(askKey('red-apple', 1)).text, 'I want one apple!')
    console.log(`ok 6 台詞都有、每句 ≤ 6 個字（${keys.length} 句）`)
    if (existsSync('public/audio')) {
      const miss = keys.flatMap((k) => segments(line(k)).map((s) => clipName(line(k), s))).filter((n) => !existsSync(`public/audio/${n}.mp3`))
      assert.deepEqual(miss, [], `缺音檔：${miss.slice(0, 20).join('、')}${miss.length > 20 ? `…共 ${miss.length} 個` : ''}`)
      console.log('ok 7 野餐、鼓聲停的台詞都有音檔')
    } else console.log('ok 7 （跳過）沒有 public/audio，不檢查音檔')
  }

  // ── 鼓聲停 ──
  {
    assert.ok(DANCER_IDS.length >= 10, `角色 ${DANCER_IDS.length}`)
    const noArt = DANCER_IDS.filter((d) => !ITEMS[d])
    assert.deepEqual(noArt, [], `角色不在繪本角色庫：${noArt.join('、')}`)
    assert.ok(STAGE_IDS.length >= 10, `舞台 ${STAGE_IDS.length}`)
    assert.ok(KIT_IDS.length >= 6, `音色 ${KIT_IDS.length}`)
    assert.ok(PATTERN_IDS.length >= 6, `節奏 ${PATTERN_IDS.length}`)
    console.log(`ok 8 鼓聲停的內容：角色 ${DANCER_IDS.length}、舞台 ${STAGE_IDS.length}、音色 ${KIT_IDS.length}、節奏 ${PATTERN_IDS.length}（${DRUM_COMBOS.toLocaleString()} 種組合）`)
  }
  {
    for (const lv of [1, 2, 3, 4] as DrumLevel[]) {
      const spec = DRUM_LEVELS[lv]
      const rnd = seeded(lv * 31)
      let s = { ...DRUM_START, level: lv }
      let changes = 0
      for (let k = 0; k < 300; k++) {
        const song = makeSong(s, rnd)
        assert.equal(song.segments.length, spec.stops)
        assert.ok(!s.dancers.slice(-DRUM_RECENT.dancers).includes(song.dancer), '角色跟最近 5 次一樣')
        assert.ok(!s.stages.slice(-DRUM_RECENT.stages).includes(song.stage), '舞台跟最近 4 次一樣')
        assert.ok(!s.kits.slice(-DRUM_RECENT.kits).includes(song.kit), '鼓跟最近 3 次一樣')
        song.segments.forEach((seg, i) => {
          const beat = 60 / seg.bpm[0]
          const bar = (PATTERNS[seg.pattern].length / 4) * beat
          // 對齊到一小節（或半拍）時最多差半小節（或一拍）
          const slack = spec.onBar ? bar / 2 : beat
          const lo = spec.onBar ? Math.min(spec.play[0] - slack, bar) : spec.play[0] - slack
          assert.ok(seg.play >= lo - 1e-6 && seg.play <= spec.play[1] + slack + 1e-6, `第 ${lv} 級鼓響 ${seg.play.toFixed(2)} 秒`)
          assert.ok(seg.freeze >= spec.freeze[0] && seg.freeze <= spec.freeze[1], '停的時間')
          for (const b of seg.bpm) assert.ok(b >= spec.bpm[0] && b <= spec.bpm[1], '速度在範圍')
          const bars = seg.play / bar
          if (spec.onBar) assert.ok(Math.abs(bars - Math.round(bars)) < 1e-6, '整小節才停')
          else assert.ok(Math.abs(bars - Math.round(bars)) > 1e-6, '突然停：不在小節的頭')
          if (!spec.tempoShift) assert.equal(seg.bpm[0], seg.bpm[1], '這一級速度不變')
          if (seg.bpm[0] !== seg.bpm[1]) changes++
          if (i > 0) assert.notEqual(seg.pattern, song.segments[i - 1].pattern, '連續兩段節奏不一樣')
          const hits = hitsOf(seg, spec.accent)
          assert.ok(hits.length >= 3, '一段至少打 3 下')
          assert.ok(hits.every((h) => h.t <= seg.play + 1e-6), '鼓停之後不再打')
          if (spec.accent) assert.deepEqual(hits[hits.length - 1], { t: seg.play, role: 3 }, '最後一下加重')
        })
        s = rememberSong(s, song)
      }
      if (DRUM_LEVELS[lv].tempoShift) assert.ok(changes > 100, '速度會變的級真的有變')
    }
    console.log('ok 9 鼓聲停每一級連開 300 首：長度、停的時間、速度在範圍；前兩級整小節才停、後兩級突然停；角色、舞台、鼓不跟最近幾次一樣')
  }
  {
    // 時間（毫秒）：鼓 0～5000 響，5000 停，停到 8000；grace 1000
    assert.equal(judgeStop([], 0, 5000, 8000, 1000), 'idle', '沒跳舞不算')
    assert.equal(judgeStop([1000, 2000], 0, 5000, 8000, 1000), 'held')
    assert.equal(judgeStop([1000, 5500], 0, 5000, 8000, 1000), 'held', '停了以後手還沒收回來（grace 內）不算動')
    assert.equal(judgeStop([1000, 6500], 0, 5000, 8000, 1000), 'moved')
    assert.equal(judgeStop([1000, 8200], 0, 5000, 8000, 1000), 'held', '下一段鼓響了才點不算')
    assert.deepEqual(songOk(['held', 'held', 'moved']), { counted: true, ok: true, held: 2, moved: 1 })
    assert.equal(songOk(['held', 'moved', 'moved']).ok, false)
    assert.equal(songOk(['idle', 'idle', 'held']).counted, false, '只停了一次（其他在發呆）不算')
    const d = '2026-11-17'
    let s = { ...DRUM_START }
    for (let i = 0; i < 2; i++) s = stepDrum(s, { date: d, ok: true, counted: true })
    assert.equal(s.level, 1)
    s = stepDrum(s, { date: d, ok: true, counted: true })
    assert.equal(s.level, 2, '3 首都順利升級')
    s = stepDrum(s, { date: d, ok: false, counted: true })
    s = stepDrum(s, { date: d, ok: true, counted: false })
    s = stepDrum(s, { date: d, ok: false, counted: true })
    assert.equal(s.level, 2, '3 首還沒滿')
    s = stepDrum(s, { date: d, ok: true, counted: true })
    assert.equal(s.level, 1, '最近 3 首壞 2 首（壞、壞、好）就退級')
    let t = { ...DRUM_START, level: 3 }
    for (const ok of [false, true, false]) t = stepDrum(t, { date: d, ok, counted: true })
    assert.equal(t.level, 2, '最近 3 首有 2 首沒停住就退級')
    let top = { ...DRUM_START, level: DRUM_MAX }
    for (let i = 0; i < 6; i++) top = stepDrum(top, { date: d, ok: true, counted: true })
    assert.equal(top.level, DRUM_MAX)
    assert.deepEqual(normalizeDrum(undefined), DRUM_START)
    assert.equal(normalizeDrum({ level: -3, plays: 'x', dancers: ['dodo', 'nope'] }).level, 1)
    assert.deepEqual(normalizeDrum({ dancers: ['dodo', 'nope'] }).dancers, ['dodo'])
    console.log('ok 10 鼓聲停：停住了沒（沒跳的不算、手還沒收回來不算、下一段才點不算）；3 首順利升級、3 首壞 2 首退級')
  }

  // ── 選玩法、家長區 ──
  {
    assert.ok(['picnic', 'drum'].every((id) => PICK_GROUPS.some((g) => g.games.includes(id as 'picnic'))), '選單有野餐、鼓聲停')
    // 每一類多加幾張也排得下（分類、排法的細項在 test-logic-pick）
    for (let extra = 0; extra <= 3; extra++) {
      const sizes = PICK_GROUPS.map((g) => g.games.length + extra)
      const l = groupLayout(sizes)
      sizes.forEach((s, i) => assert.ok(l.cols[i] * Math.ceil(s / l.cols[i]) >= s && l.pcols[i] * Math.ceil(s / l.pcols[i]) >= s, `每類多 ${extra} 張排得下`))
    }
    assert.equal(LOGIC_GAME_NAME['logic-picnic'], '小熊野餐')
    assert.equal(LOGIC_GAME_NAME['logic-drum'], '鼓聲停')
    for (const lv of [1, 2, 3, 4] as PicnicLevel[]) assert.ok(LOGIC_SKILLS.some((s) => s.skill === picnicSkill(lv)), `家長區缺 ${picnicSkill(lv)}`)
    for (let lv = 1; lv <= DRUM_MAX; lv++) assert.ok(LOGIC_SKILLS.some((s) => s.skill === `drum:${lv}`), `家長區缺 drum:${lv}`)
    console.log('ok 11 選玩法有野餐、鼓聲停，每類多幾張也排得下；家長區有遊戲名和每一級的技能')
  }

  console.log('ALL PASS')
}

main()

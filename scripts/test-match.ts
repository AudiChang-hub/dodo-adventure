// 遊戲角的翻翻牌、影子配對（T-160，src/games/memory、src/games/shadow、共用圖庫 src/games/match）的單元測試。
// 執行：npx tsx scripts/test-match.ts（npm run verify 的「單元：翻翻牌、影子配對」）
// 驗收：圖庫 ≥ 150 種、影子圖 ≥ 150 種、牌背 ≥ 8 種、背景場景 ≥ 10 種（家長 2026-11-17：內容量要夠大）；圖示都抽出來了、名字 ≤ 3 個字；
// 每一級連續出 300 局：張數／影子數對、每張牌剛好兩張、主題／牌背／場景不跟最近幾局一樣、圖不跟上一局重複；
// 影子：第 1～3 級沒有輪廓很像的、第 4 級起有一組、第 5 級影子翻過來，托盤每一樣都不在自己影子正下方；
// 升降級（連續 2 局順利升一級、示範不算、表現差退一級）；家長區的名字；台詞和音檔都在；
// 第一次玩的示範：手翻牌不能作廢示範自己的流程（翻完一對、孩子可以點），孩子點的照舊搶掉之前的流程。
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { MATCH_PICS, MATCH_THEMES, matchPic } from '../src/games/match/catalog'
import { MATCH_ICONS } from '../src/games/match/icons.generated'
import { nameKey } from '../src/games/match/lines'
import { BACK_STYLES } from '../src/games/memory/backs'
import {
  BACK_COUNT,
  MEMORY_MAX,
  PAIRS,
  RECENT_BACKS,
  RECENT_THEMES,
  UP_AFTER,
  afterMemory,
  memoryRound,
  memorySkill,
  normalizeMemory,
  okSlips,
  pickPics,
  type MemoryLevel,
  type MemoryState,
} from '../src/games/memory/plan'
import {
  FLIP_FROM,
  LOOKALIKE_FROM,
  RECENT_SCENES,
  SHADOW_COUNT,
  SHADOW_MAX,
  SHADOW_PICS,
  SHADOW_SCENES,
  afterShadow,
  normalizeShadow,
  shadowRound,
  shadowSkill,
  type ShadowLevel,
  type ShadowState,
} from '../src/games/shadow/plan'
import { SCENES } from '../src/art/storybook/layout'
import { LOGIC_GAME_NAME, logicSkillLabel } from '../src/games/logic/report'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'
import { segments } from '../src/content/lines'
import { clipName } from '../src/lib/clip'
import { flipFlow } from '../src/games/memory/turn'

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

function main() {
  // ── 圖庫 ──
  {
    const ids = MATCH_PICS.map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length, 'id 不重複')
    assert.ok(MATCH_PICS.length >= 150, `翻翻牌圖庫 ≥ 150（${MATCH_PICS.length}）`)
    assert.ok(SHADOW_PICS.length >= 150, `影子圖 ≥ 150（${SHADOW_PICS.length}）`)
    assert.ok(MATCH_THEMES.length >= 6, '主題 ≥ 6')
    for (const p of MATCH_PICS) {
      assert.ok(MATCH_ICONS[p.id], `圖示有抽出來：${p.id}（npx tsx scripts/build-match-icons.ts）`)
      assert.ok(words(p.en) <= 3 && p.en.length <= 20, `名字短：${p.en}`)
      assert.ok(p.zh, `中文名：${p.id}`)
    }
    for (const t of MATCH_THEMES) {
      const got = pickPics(t.id, PAIRS[MEMORY_MAX], [], seeded(7))
      assert.equal(got.length, PAIRS[MEMORY_MAX], `主題 ${t.id} 夠一局 ${PAIRS[MEMORY_MAX]} 對`)
    }
    // 輪廓很像的一組，至少兩樣能當影子（不然第 4 級湊不出來）
    const groups = new Map<string, number>()
    for (const p of SHADOW_PICS) if (p.look) groups.set(p.look, (groups.get(p.look) ?? 0) + 1)
    const pairs = [...groups.values()].filter((n) => n >= 2).length
    assert.ok(pairs >= 15, `輪廓很像的組 ≥ 15（${pairs}）`)
    console.log(`ok 1 圖庫 ${MATCH_PICS.length} 種、${MATCH_THEMES.length} 個主題；影子圖 ${SHADOW_PICS.length} 種、輪廓很像的 ${pairs} 組`)
  }
  {
    assert.ok(BACK_COUNT >= 8 && BACK_STYLES === BACK_COUNT, `牌背 ≥ 8 種、出題和畫的數量一樣（${BACK_COUNT}／${BACK_STYLES}）`)
    assert.ok(SHADOW_SCENES.length >= 10, `背景場景 ≥ 10（${SHADOW_SCENES.length}）`)
    for (const s of SHADOW_SCENES) assert.ok(s.id in SCENES, `場景存在：${s.id}`)
    assert.equal(new Set(SHADOW_SCENES.map((s) => s.id)).size, SHADOW_SCENES.length, '場景不重複')
    console.log(`ok 2 牌背 ${BACK_COUNT} 種、背景場景 ${SHADOW_SCENES.length} 種`)
  }

  // ── 翻翻牌 ──
  {
    const rnd = seeded(11)
    for (let lv = 1; lv <= MEMORY_MAX; lv++) {
      const level = lv as MemoryLevel
      let s: MemoryState = normalizeMemory({ level })
      let prev: string[] = []
      for (let k = 0; k < 300; k++) {
        const r = memoryRound(level, s, rnd)
        assert.equal(r.cards.length, PAIRS[level] * 2, '張數')
        assert.equal(r.cols * r.rows, r.cards.length, '排得剛好')
        const pics = [...new Set(r.cards)]
        assert.equal(pics.length, PAIRS[level], '幾對')
        for (const p of pics) assert.equal(r.cards.filter((c) => c === p).length, 2, '每樣剛好兩張')
        const ps = pics.map((p) => matchPic(p)!)
        assert.ok(ps.every((p) => p.theme === r.theme), '同一個主題')
        assert.equal(new Set(ps.map((p) => p.en)).size, ps.length, '名字不重複')
        assert.ok(ps.every((p, i) => !p.look || ps.every((q, j) => i === j || q.look !== p.look)), '同一局沒有長得像的兩樣')
        assert.ok(!s.themes.slice(-RECENT_THEMES).includes(r.theme), '主題不跟最近幾局一樣')
        assert.ok(!s.backs.slice(-RECENT_BACKS).includes(r.back), '牌背不跟最近幾局一樣')
        assert.ok(!pics.some((p) => prev.includes(p)), '圖不跟上一局重複')
        prev = pics
        s = afterMemory(s, { round: r, date: '2026-11-17', slips: 0, shown: false, counted: false })
      }
    }
    console.log(`ok 3 翻翻牌每一級 300 局：張數、每樣兩張、主題／牌背／圖不重複`)
  }
  {
    const r = memoryRound(1, normalizeMemory(null), seeded(3))
    let s = normalizeMemory(null)
    s = afterMemory(s, { round: r, date: '2026-11-17', slips: 0, shown: false, counted: false })
    assert.equal(s.level, 1, '示範的那一局不算')
    for (let k = 0; k < UP_AFTER - 1; k++) s = afterMemory(s, { round: r, date: '2026-11-17', slips: 0, shown: false, counted: true })
    assert.equal(s.level, 1, `還沒連續 ${UP_AFTER} 局`)
    s = afterMemory(s, { round: r, date: '2026-11-17', slips: okSlips(1), shown: false, counted: true })
    assert.equal(s.level, 2, `連續 ${UP_AFTER} 局順利升一級`)
    s = afterMemory(s, { round: r, date: '2026-11-17', slips: 0, shown: true, counted: true })
    assert.equal(s.streak, 0, '手帶著翻的不算順利')
    for (let k = 0; k < 6; k++) s = afterMemory(s, { round: r, date: '2026-11-17', slips: 9, shown: false, counted: true })
    assert.equal(s.level, 1, '一直記錯退一級')
    let top = normalizeMemory({ level: MEMORY_MAX })
    for (let k = 0; k < 5; k++) top = afterMemory(top, { round: r, date: '2026-11-17', slips: 0, shown: false, counted: true })
    assert.equal(top.level, MEMORY_MAX, '最難的那一級不再往上')
    assert.equal(normalizeMemory({ level: 99, backs: [99, 2], themes: [1, 'farm'] }).level, MEMORY_MAX, '壞掉的進度夾回範圍')
    assert.deepEqual(normalizeMemory({ backs: [99, 2], themes: [1, 'farm'] }).backs, [2])
    console.log('ok 4 翻翻牌升降級：連續 2 局順利升一級、示範不算、記錯多退一級')
  }

  // ── 影子配對 ──
  {
    const rnd = seeded(29)
    for (let lv = 1; lv <= SHADOW_MAX; lv++) {
      const level = lv as ShadowLevel
      let s: ShadowState = normalizeShadow({ level })
      let prev: string[] = []
      for (let k = 0; k < 300; k++) {
        const r = shadowRound(level, s, rnd)
        assert.equal(r.items.length, SHADOW_COUNT[level], '影子數')
        assert.equal(new Set(r.items).size, r.items.length, '不重複')
        const ps = r.items.map((p) => matchPic(p)!)
        assert.ok(ps.every((p) => p.shadow), '都是輪廓認得出來的')
        assert.equal(new Set(ps.map((p) => p.en)).size, ps.length, '名字不重複')
        const alike = ps.flatMap((p, i) => ps.filter((q, j) => j > i && p.look && q.look === p.look)).length
        if (level < LOOKALIKE_FROM) assert.equal(alike, 0, `第 ${level} 級沒有輪廓很像的`)
        else assert.equal(alike, 1, `第 ${level} 級剛好一組輪廓很像的`)
        assert.equal(r.flip, level >= FLIP_FROM, '影子翻過來')
        assert.ok(r.tray.every((x, i) => x !== i) && [...r.tray].sort().join() === r.items.map((_, i) => i).join(), '托盤每一樣都不在自己影子正下方')
        assert.ok(!s.scenes.slice(-RECENT_SCENES).includes(r.scene), '場景不跟最近幾局一樣')
        assert.ok(!r.items.some((p) => prev.includes(p)), '東西不跟上一局重複')
        prev = r.items
        s = afterShadow(s, { round: r, date: '2026-11-17', wrongs: 0, shown: false, counted: false })
      }
    }
    console.log('ok 5 影子配對每一級 300 局：影子數、輪廓很像的只在第 4 級起、第 5 級翻過來、托盤錯開、場景和東西不重複')
  }
  {
    const r = shadowRound(1, normalizeShadow(null), seeded(5))
    let s = normalizeShadow(null)
    s = afterShadow(s, { round: r, date: '2026-11-17', wrongs: 0, shown: false, counted: false })
    assert.equal(s.level, 1, '示範的那一局不算')
    for (let k = 0; k < UP_AFTER; k++) s = afterShadow(s, { round: r, date: '2026-11-17', wrongs: 1, shown: false, counted: true })
    assert.equal(s.level, 2, `連續 ${UP_AFTER} 局順利（放錯 ≤ 1）升一級`)
    for (let k = 0; k < 6; k++) s = afterShadow(s, { round: r, date: '2026-11-17', wrongs: 3, shown: false, counted: true })
    assert.equal(s.level, 1, '一直放錯退一級')
    assert.equal(normalizeShadow({ level: -3 }).level, 1, '壞掉的進度夾回範圍')
    console.log('ok 6 影子配對升降級')
  }

  // ── 家長區、台詞、音檔 ──
  {
    assert.equal(LOGIC_GAME_NAME['logic-memory'], '翻翻牌')
    assert.equal(LOGIC_GAME_NAME['logic-shadow'], '影子配對')
    for (let lv = 1; lv <= MEMORY_MAX; lv++) assert.ok(logicSkillLabel(memorySkill(lv as MemoryLevel)), `技能名：${memorySkill(lv as MemoryLevel)}`)
    for (let lv = 1; lv <= SHADOW_MAX; lv++) assert.ok(logicSkillLabel(shadowSkill(lv as ShadowLevel)), `技能名：${shadowSkill(lv as ShadowLevel)}`)
    console.log('ok 7 家長區：遊戲名稱、技能名稱')
  }
  const keys = ['mm.intro', 'mm.pair', 'mm.here', 'mm.done', 'mm.again', 'sh.intro', 'sh.ask', 'sh.look', 'sh.here', 'sh.praise', 'sh.done', 'sh.again', 'teach.watch.dodo', 'teach.turn.dodo', 'd.next.home', ...MATCH_PICS.map((p) => nameKey(p.id))]
  {
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    for (const k of keys.filter((k) => k.startsWith('mm.') || k.startsWith('sh.'))) assert.ok(words(line(k).text.replace(/\|/g, ' ')) <= 6, `一句 ≤ 6 個字：${k}`)
    console.log(`ok 8 台詞都有（${keys.length} 句）、每句 ≤ 6 個字`)
  }
  {
    if (existsSync('public/audio')) {
      const miss = keys.flatMap((k) => segments(line(k)).map((s) => clipName(line(k), s))).filter((n) => !existsSync(`public/audio/${n}.mp3`))
      assert.deepEqual(miss, [], `缺音檔：${miss.length} 個（python scripts/gen_audio.py --only mm. sh.）`)
      console.log(`ok 9 ${keys.length} 句台詞都有音檔`)
    } else console.log('ok 9 （跳過）沒有 public/audio，不檢查音檔')
  }
  {
    // 第一次玩的示範（正式站回報：示範翻完第一張就停住、牌都不能點）：走一遍示範的流程。
    // games/barge 的 useFlow 會載入音效（import.meta.env，node 跑不了），這裡用一樣的規則：begin 開一段、cut 和之後的 begin 都讓之前的作廢
    let run = 0
    const f = {
      begin(live: { current: boolean }) {
        const my = ++run
        return () => live.current && run === my
      },
      cut() {
        run++
      },
    }
    const live = { current: true }
    const demo = f.begin(live)
    for (const _card of [0, 1]) {
      flipFlow(f, live, 'hand')
      assert.ok(demo(), `示範的手翻第 ${_card + 1} 張之後，示範的流程還要算數（不然示範停住、牌永遠不能點）`)
    }
    // 示範完：孩子點牌，每一次點都搶掉之前的流程（T-108 搶點照舊）
    const kid1 = flipFlow(f, live, 'kid')
    assert.ok(kid1(), '孩子點的這一張自己的流程算數')
    assert.ok(!demo(), '孩子點牌會搶掉之前的流程')
    const kid2 = flipFlow(f, live, 'kid')
    assert.ok(kid2() && !kid1(), '孩子再點一張：上一張的話（例如稱讚）作廢')
    live.current = false
    assert.ok(!kid2(), '離開畫面就不算數')
    console.log('ok 10 第一次玩的示範：手翻完一對示範還算數、之後孩子點牌照常搶點')
  }

  console.log('ALL PASS')
}

main()

// 遊戲角的拼圖、迷宮（T-156，src/games/puzzle、src/games/maze）的單元測試。
// 執行：npx tsx scripts/test-puzzle-maze.ts（npm run verify 的「單元：拼圖、迷宮」）
// 驗收：圖庫 ≥ 10 張、擺法沒問題；連續開 200 次，新的一張不在最近 5 張裡；托盤順序不跟板子一樣；
// 迷宮每一級出 300 個：一定走得到終點、大小對、路夠長、岔路不超過上限、不跟最近 5 個一樣、主題和終點的東西不跟上一次一樣；
// 手指拖過去／點格子的走法（walkTo）不會穿牆；升降級照邏輯遊戲同一套；台詞都有。
// T-158（迷宮加難度到 4～5 歲）：10 級、越高越大、路越長、岔路和轉彎越多；第 9 級鑰匙、第 10 級星星一定走得到、要繞進岔路才拿得到；
// 照提示走一定拿完再到終點；順利走完直接升一級、「難一點」往上跳一級、示範只在新玩法第一次。
import assert from 'node:assert/strict'
import { problemsOf } from '../src/art/storybook/layout'
import { GRID, OK_WRONGS, PUZZLE_MAX, PUZZLE_PICS, RECENT_PICS, afterPuzzle, normalizePuzzle, pickPic, puzzleRound, puzzleSkill, trayOrder, type PuzzleLevel } from '../src/games/puzzle/plan'
import {
  DETOUR,
  GOAL_IDS,
  ITEM_OFF,
  MAZE_LEVELS,
  MAZE_MAX,
  RECENT_MAZES,
  SMOOTH_BASE_MS,
  SMOOTH_STEP_MS,
  STAR_COUNT,
  THEME_IDS,
  afterMaze,
  bestTour,
  choicesOf,
  distances,
  fitsLevel,
  harderMaze,
  linked,
  makeMaze,
  mazeOk,
  mazeSkill,
  mazeSmooth,
  needsDemo,
  nextStep,
  nextToward,
  normalizeMaze,
  offPath,
  readyFor,
  shortest,
  turnsOf,
  walkTo,
  type MazeLevel,
} from '../src/games/maze/plan'
import { MASTER_OF } from '../src/games/logic/sort-plan'
import { logicSkillLabel, logicSummary, LOGIC_GAME_NAME } from '../src/games/logic/report'
import '../src/content/lines'
import { hasLine } from '../src/content/registry'
import { picLineKey } from '../src/games/puzzle/lines'
import { findKey, gotKey } from '../src/games/maze/lines'

function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_000) / 1_000_000
  }
}

function main() {
  // ── 拼圖 ──
  {
    assert.ok(PUZZLE_PICS.length >= 10, `圖庫至少 10 張，現在 ${PUZZLE_PICS.length}`)
    assert.equal(new Set(PUZZLE_PICS.map((p) => p.id)).size, PUZZLE_PICS.length, '圖的 id 不重複')
    for (const p of PUZZLE_PICS) {
      const r = problemsOf(p.art)
      assert.deepEqual(r.blocking, [], `${p.id} 的擺法：${r.blocking.join('；')}`)
      assert.deepEqual(r.newChars, [], `${p.id} 只用角色庫已經畫好的角色`)
      assert.ok(p.en.split(/\s+/).length <= 6, `${p.id} 的句子 ≤ 6 個字：${p.en}`)
    }
    console.log(`ok 1 圖庫 ${PUZZLE_PICS.length} 張，擺法都沒問題`)
  }
  {
    const rnd = seeded(7)
    let recent: string[] = []
    for (let i = 0; i < 200; i++) {
      const p = pickPic(recent, rnd)
      assert.ok(!recent.slice(-RECENT_PICS).includes(p.id), `第 ${i} 張 ${p.id} 跟最近 ${RECENT_PICS} 張重複`)
      recent = [...recent, p.id].slice(-RECENT_PICS)
    }
    // 圖庫的每一張都輪得到
    const seen = new Set<string>()
    recent = []
    for (let i = 0; i < 400; i++) {
      const p = pickPic(recent, rnd)
      seen.add(p.id)
      recent = [...recent, p.id].slice(-RECENT_PICS)
    }
    assert.equal(seen.size, PUZZLE_PICS.length, '每一張都輪得到')
    console.log('ok 2 連續 200 張：新的一張不在最近 5 張裡；每一張都輪得到')
  }
  {
    for (let lv = 1; lv <= PUZZLE_MAX; lv++) {
      for (let k = 0; k < 200; k++) {
        const r = puzzleRound(lv as PuzzleLevel, [], seeded(k + 1))
        const n = GRID[lv as PuzzleLevel].cols * GRID[lv as PuzzleLevel].rows
        assert.equal(r.tray.length, n)
        assert.deepEqual([...r.tray].sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i), '托盤剛好每一片一次')
        assert.ok(r.tray.every((x, i) => x !== i), `每一片都不在跟拼盤一樣的位置：${r.tray}`)
        assert.equal(r.spread.length, n)
        assert.ok(r.spread.every((p) => Math.abs(p.dx) <= 1 && Math.abs(p.dy) <= 1), '散開在 -1～1')
      }
    }
    // 亂數一直給一樣的（最壞的情況）：還是每一片都不在原位
    for (const n of [4, 6]) assert.ok(trayOrder(n, () => 0).every((x, i) => x !== i), `trayOrder(${n}) 保險`)
    assert.deepEqual(trayOrder(2, () => 0), [1, 0])
    assert.equal(puzzleSkill(1), 'puzzle:4')
    assert.equal(puzzleSkill(2), 'puzzle:6')
    console.log('ok 3 片數：2×2 四片、3×2 六片；托盤打散、每片一次、每一片都不在跟拼盤一樣的位置')
  }
  {
    // 升級：8 張裡 ≥ 7 張（放錯 ≤ 1 次）、分布 ≥ 3 天
    let s = normalizePuzzle(null)
    assert.equal(s.level, 1)
    const days = ['2026-11-16', '2026-11-17', '2026-11-18']
    for (let i = 0; i < MASTER_OF; i++) s = afterPuzzle(s, { pic: PUZZLE_PICS[i % PUZZLE_PICS.length].id, date: days[i % 3], wrongs: i === 0 ? 3 : OK_WRONGS, shown: false, counted: true })
    assert.equal(s.level, 2, '8 張裡 7 張放錯 ≤ 1 次、分 3 天：升到 6 片')
    assert.ok(s.pics.length <= RECENT_PICS)
    // 手帶著放的、一起做的不算
    let t = normalizePuzzle({ level: 1 })
    for (let i = 0; i < 12; i++) t = afterPuzzle(t, { pic: 'park', date: days[i % 3], wrongs: 0, shown: false, counted: false })
    assert.equal(t.level, 1, '一起做的不算熟練')
    // 一直放錯：退回 4 片
    let u = normalizePuzzle({ level: 2 })
    for (let i = 0; i < 6; i++) u = afterPuzzle(u, { pic: 'park', date: days[0], wrongs: 4, shown: false, counted: true })
    assert.equal(u.level, 1, '最近 6 張 ≤ 3 張對：退一級')
    // 壞掉的資料
    assert.deepEqual(normalizePuzzle({ level: 9, pics: [1, 'sea'], recent: 'x' }), { level: PUZZLE_MAX, recent: [], taught: [], pics: ['sea'] })
    console.log('ok 4 拼圖升降級：熟練升 6 片、一起做不算、一直放錯退回 4 片、壞資料補預設')
  }

  // ── 迷宮 ──
  {
    for (let lv = 1; lv <= MAZE_MAX; lv++) {
      const L = MAZE_LEVELS[lv as MazeLevel]
      const rnd = seeded(100 + lv)
      let sigs: string[] = []
      let last: { theme?: string; goal?: string } = {}
      for (let k = 0; k < 300; k++) {
        const m = makeMaze(lv as MazeLevel, { sigs, ...last }, rnd)
        assert.equal(m.cols, L.cols)
        assert.equal(m.rows, L.rows)
        assert.ok(lv <= 5 ? m.cols <= 5 && m.rows <= 5 : m.cols <= 10 && m.rows <= 7, '第 1～5 級最大 5×5、最高 10×7')
        assert.ok(m.cols >= m.rows, '橫的平板：欄 ≥ 列')
        // 每一格都走得到（完美迷宮），終點一定走得到
        const dist = distances(m, m.start)
        assert.ok(dist.every((d) => d >= 0), '每一格都走得到')
        assert.ok(dist[m.goal] > 0, '終點走得到、不是起點')
        // 通的路兩邊一致（a 通 b ⇔ b 通 a）
        for (let c = 0; c < m.cols * m.rows; c++) for (let c2 = 0; c2 < m.cols * m.rows; c2++) assert.equal(linked(m, c, c2), linked(m, c2, c))
        // 完美迷宮：通道數 = 格子數 − 1（沒有環，岔路少）
        const edges = m.links.reduce((a, b) => a + [1, 2, 4, 8].filter((x) => b & x).length, 0) / 2
        assert.equal(edges, m.cols * m.rows - 1)
        assert.deepEqual(m.path, shortest(m, m.start, m.goal))
        assert.ok(m.path.length >= L.minLen, `路至少 ${L.minLen} 格`)
        assert.ok(choicesOf(m.links, m.path) <= L.choices, `第 ${lv} 級岔路 ≤ ${L.choices}`)
        assert.ok(choicesOf(m.links, m.path) >= (L.minChoices ?? 0), `第 ${lv} 級岔路 ≥ ${L.minChoices}（${choicesOf(m.links, m.path)}）`)
        assert.ok(turnsOf(m.cols, m.rows, m.path) >= (L.minTurns ?? 0), `第 ${lv} 級轉彎 ≥ ${L.minTurns}（${turnsOf(m.cols, m.rows, m.path)}）`)
        assert.ok(fitsLevel(lv as MazeLevel, m))
        // 鑰匙、星星（只有第 9、10 級）：個數對、不在起點終點、不在主要的路上（要繞進岔路）、一定走得到；最短的走法 = 拿完再到終點
        assert.equal(m.extra, L.extra, `第 ${lv} 級的玩法`)
        assert.equal(m.items.length, L.extra === 'key' ? 1 : L.extra === 'stars' ? STAR_COUNT : 0, `第 ${lv} 級東西的個數`)
        assert.equal(new Set(m.items).size, m.items.length, '東西不放在同一格')
        const { off } = offPath(m, m.path)
        for (const c of m.items) {
          assert.ok(c !== m.start && c !== m.goal, '東西不在起點、終點')
          assert.ok(dist[c] > 0, '東西走得到')
          assert.ok(off[c] >= ITEM_OFF, `東西離主要的路 ≥ ${ITEM_OFF} 格（${off[c]}）`)
        }
        assert.equal(m.tour, m.items.length ? bestTour(m, m.start, m.items, m.goal).len : m.path.length - 1)
        if (m.items.length) assert.ok(m.tour >= m.path.length - 1 + 2 * ITEM_OFF, '拿東西要多繞')
        assert.ok(!sigs.slice(-RECENT_MAZES).includes(m.sig), '不跟最近 5 個一樣')
        if (last.theme) assert.notEqual(m.theme, last.theme, '主題不跟上一次一樣')
        if (last.goal) assert.notEqual(m.goalId, last.goal, '終點的東西不跟上一次一樣')
        assert.ok(THEME_IDS.includes(m.theme) && GOAL_IDS.includes(m.goalId))
        sigs = [...sigs, m.sig].slice(-RECENT_MAZES)
        last = { theme: m.theme, goal: m.goalId }
      }
    }
    console.log('ok 5 迷宮每一級 300 個：走得到、大小對、路夠長、岔路和轉彎在範圍內、鑰匙星星走得到要繞路、不跟最近 5 個一樣、主題和吃的跟上一次不同')
  }
  {
    // 越高越難：格子不變少、路越來越長、岔路上限不變少；最高 2 級才有鑰匙、星星；平板上一格 ≥ 70px（作答區約 1200×558，右邊留 240）
    const lvs = Array.from({ length: MAZE_MAX }, (_, i) => MAZE_LEVELS[(i + 1) as MazeLevel])
    for (let i = 1; i < lvs.length; i++) {
      assert.ok(lvs[i].cols * lvs[i].rows >= lvs[i - 1].cols * lvs[i - 1].rows, `第 ${i + 1} 級格子不比上一級少`)
      assert.ok(lvs[i].minLen > lvs[i - 1].minLen, `第 ${i + 1} 級路比上一級長`)
      assert.ok(lvs[i].choices >= lvs[i - 1].choices, `第 ${i + 1} 級岔路上限不比上一級少`)
      assert.ok((lvs[i].minChoices ?? 0) >= (lvs[i - 1].minChoices ?? 0) && (lvs[i].minTurns ?? 0) >= (lvs[i - 1].minTurns ?? 0))
    }
    assert.deepEqual(
      lvs.map((l) => l.extra ?? null),
      [null, null, null, null, null, null, null, null, 'key', 'stars'],
    )
    const top = MAZE_LEVELS[MAZE_MAX]
    assert.ok((558 - 20) / (top.rows + 0.24) >= 70 && (1200 - 240 - 16) / (top.cols + 0.24) >= 70, '最高級一格 ≥ 70px')
    console.log(`ok 11 越高越難（最高 ${top.cols}×${top.rows}、路 ≥ ${top.minLen} 格、岔路 ${top.minChoices}～${top.choices}、轉彎 ≥ ${top.minTurns}），最高 2 級才有鑰匙、星星`)
  }
  {
    // 起點、終點會換（不是每次都在角落）
    const rnd = seeded(5)
    const starts = new Set<number>()
    const goals = new Set<number>()
    for (let k = 0; k < 200; k++) {
      const m = makeMaze(1, {}, rnd)
      starts.add(m.start)
      goals.add(m.goal)
    }
    assert.ok(starts.size >= 6 && goals.size >= 6, `起點 ${starts.size} 種、終點 ${goals.size} 種`)
    console.log(`ok 6 起點、終點都會換（3×3：起點 ${starts.size} 種、終點 ${goals.size} 種）`)
  }
  {
    // walkTo：只沿著通的路走，不穿牆
    for (let lv = 1; lv <= MAZE_MAX; lv++) {
      const m = makeMaze(lv as MazeLevel, {}, seeded(40 + lv))
      const n = m.cols * m.rows
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++) {
          const w = walkTo(m, a, b)
          let c = a
          for (const x of w) {
            assert.ok(linked(m, c, x), `${a}→${b} 穿牆（${c}→${x}）`)
            c = x
          }
          if (w.length) assert.equal(c, b, '走到手指指的那一格')
          if (linked(m, a, b)) assert.deepEqual(w, [b], '相鄰相通：走一步')
        }
      // 照提示一直走：先拿完鑰匙、星星，再到終點，步數剛好是最短的
      let at = m.start
      let got: number[] = []
      let steps = 0
      while (!(at === m.goal && readyFor(m, got)) && steps <= 4 * n) {
        at = nextStep(m, at, got)
        steps++
        if (m.items.includes(at) && !got.includes(at)) got = [...got, at]
      }
      assert.equal(at, m.goal, '照提示走得到終點')
      assert.ok(readyFor(m, got), '照提示走：鑰匙、星星都拿到了')
      assert.equal(steps, m.tour, '照提示走的步數 = 最短的')
      assert.equal(nextStep(m, m.goal, m.items), -1)
      assert.equal(nextToward(m, m.goal), -1)
    }
    console.log('ok 7 拖著走、點格子：只沿著通的路走、不穿牆；照提示一定走得到終點')
  }
  {
    assert.equal(mazeSkill(1), 'maze:3x3')
    assert.equal(mazeSkill(5), 'maze:5x5')
    assert.equal(mazeSkill(10), 'maze:10x7')
    assert.ok(mazeOk({ steps: 6, shortest: 4, led: false }))
    assert.ok(!mazeOk({ steps: 4 + DETOUR + 1, shortest: 4, led: false }), '繞太遠不算第一次就對')
    assert.ok(!mazeOk({ steps: 4, shortest: 4, led: true }), '靠提示的不算')
    const days = ['2026-11-16', '2026-11-17', '2026-11-18']
    let s = normalizeMaze(null)
    const m = makeMaze(1, {}, seeded(9))
    for (let i = 0; i < MASTER_OF; i++) s = afterMaze(s, m, { date: days[i % 3], ok: true, counted: true })
    assert.equal(s.level, 2, '8 個都順、分 3 天：升一級')
    assert.equal(s.theme, m.theme)
    assert.ok(s.sigs.includes(m.sig))
    let t = normalizeMaze({ level: 3 })
    for (let i = 0; i < 6; i++) t = afterMaze(t, m, { date: days[0], ok: false, counted: true })
    assert.equal(t.level, 2, '一直繞遠、靠提示：退一級')
    assert.equal(normalizeMaze({ level: 99 }).level, MAZE_MAX)
    console.log('ok 8 迷宮升降級：順利走完 8 個分 3 天升一級、一直靠提示退一級')
  }
  {
    // T-158 升級加快：自己走、第一次就對、沒有走很久 → 直接升一級；靠提示、走很久、示範的照原本的規則；已經有的進度照用
    const m = makeMaze(1, {}, seeded(11))
    const d = '2026-11-16'
    assert.ok(mazeSmooth({ ok: true, ms: SMOOTH_BASE_MS + SMOOTH_STEP_MS * 4, shortest: 4 }))
    assert.ok(!mazeSmooth({ ok: true, ms: SMOOTH_BASE_MS + SMOOTH_STEP_MS * 4 + 1, shortest: 4 }), '走很久不算順利')
    assert.ok(!mazeSmooth({ ok: false, ms: 1000, shortest: 4 }), '靠提示、繞遠不算順利')
    let s = normalizeMaze({ level: 3, recent: [{ date: d, ok: false }], taught: [1, 2, 3], sigs: [] })
    s = afterMaze(s, m, { date: d, ok: true, counted: true, smooth: true })
    assert.equal(s.level, 4, '順利走完一個：直接升一級')
    assert.deepEqual(s.recent, [], '升級後這一級重新算')
    s = afterMaze(s, m, { date: d, ok: true, counted: true, smooth: false })
    assert.equal(s.level, 4, '第一次就對但走很久：照原本的規則（還不升）')
    s = afterMaze(s, m, { date: d, ok: true, counted: false, smooth: true })
    assert.equal(s.level, 4, '示範、一起做的不算')
    let top = normalizeMaze({ level: MAZE_MAX })
    top = afterMaze(top, m, { date: d, ok: true, counted: true, smooth: true })
    assert.equal(top.level, MAZE_MAX, '最高級不再升')
    // 一路順利：9 個就從第 1 級到最高級
    let run = normalizeMaze(null)
    for (let i = 0; i < MAZE_MAX - 1; i++) run = afterMaze(run, m, { date: d, ok: true, counted: true, smooth: true })
    assert.equal(run.level, MAZE_MAX)
    // 「難一點」：往上跳一級、最高不超過
    assert.equal(harderMaze(normalizeMaze({ level: 5 })).level, 6)
    assert.equal(harderMaze(normalizeMaze({ level: MAZE_MAX })).level, MAZE_MAX)
    // 第一次就對：大迷宮可以多繞幾步
    assert.ok(mazeOk({ steps: 20 + 4, shortest: 20, led: false, detour: MAZE_LEVELS[6].detour }))
    assert.ok(!mazeOk({ steps: 20 + 4, shortest: 20, led: false }), '沒給 detour：照 DETOUR')
    // 示範：一般的迷宮教過一次就好，鑰匙、星星第一次各一次
    assert.ok(needsDemo([], 1))
    assert.ok(!needsDemo([1], 6), '教過一般的：第 6 級不再示範')
    assert.ok(needsDemo([1, 2, 3], 9), '鑰匙第一次：示範')
    assert.ok(!needsDemo([1, 9], 9))
    assert.ok(needsDemo([1, 9], 10), '星星第一次：示範')
    console.log('ok 12 順利走完直接升一級（走很久、靠提示照原本的規則）、「難一點」往上跳一級、示範只在新玩法第一次')
  }

  // ── 家長區、台詞 ──
  {
    assert.equal(LOGIC_GAME_NAME['logic-puzzle'], '拼圖')
    assert.equal(LOGIC_GAME_NAME['logic-maze'], '迷宮')
    for (let lv = 1; lv <= PUZZLE_MAX; lv++) assert.ok(logicSkillLabel(puzzleSkill(lv as PuzzleLevel), 'logic'))
    for (let lv = 1; lv <= MAZE_MAX; lv++) assert.ok(logicSkillLabel(mazeSkill(lv as MazeLevel), 'logic'))
    const row = (ok: boolean, date: string, i: number) => ({ station: 'logic' as const, skill: 'puzzle:4', phase: 'quiz' as const, metrics: {}, firstTryCorrect: ok, date, ts: i })
    const sum = logicSummary(Array.from({ length: 8 }, (_, i) => row(true, ['2026-11-16', '2026-11-17', '2026-11-18'][i % 3], i)))
    assert.deepEqual(sum.map((x) => [x.skill, x.status]), [['puzzle:4', 'ok']])
    console.log('ok 9 家長區：遊戲名稱、技能名稱、會了沒')
  }
  {
    const keys = ['pz.intro', 'pz.ask', 'pz.look', 'pz.here', 'pz.praise', 'pz.again', 'mz.ask', 'mz.way', 'mz.again', 'mz.harder', 'mz.key.first', 'mz.key.got', 'mz.stars.first', 'mz.stars.got', 'lg.pick.intro', 'teach.watch.dodo', 'teach.turn.dodo', 'd.next.home']
    for (const p of PUZZLE_PICS) keys.push(picLineKey(p.id))
    for (const g of GOAL_IDS) keys.push(findKey(g), gotKey(g))
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    console.log(`ok 10 台詞都有（${keys.length} 句）`)
  }

  console.log('ALL PASS')
}

main()

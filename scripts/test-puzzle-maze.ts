// 遊戲角的拼圖、迷宮（T-156，src/games/puzzle、src/games/maze）的單元測試。
// 執行：npx tsx scripts/test-puzzle-maze.ts（npm run verify 的「單元：拼圖、迷宮」）
// 驗收：圖庫 ≥ 10 張、擺法沒問題；連續開 200 次，新的一張不在最近 5 張裡；托盤順序不跟板子一樣；
// 迷宮每一級出 300 個：一定走得到終點、大小對、路夠長、岔路不超過上限、不跟最近 5 個一樣、主題和終點的東西不跟上一次一樣；
// 手指拖過去／點格子的走法（walkTo）不會穿牆；升降級照邏輯遊戲同一套；台詞都有。
import assert from 'node:assert/strict'
import { problemsOf } from '../src/art/storybook/layout'
import { GRID, OK_WRONGS, PUZZLE_MAX, PUZZLE_PICS, RECENT_PICS, afterPuzzle, normalizePuzzle, picOf, pickPic, puzzleRound, puzzleSkill, themeOf, trayOrder, type PuzzleLevel } from '../src/games/puzzle/plan'
import { emptyCells } from '../src/games/puzzle/coverage'
import { freeProblems } from '../src/games/puzzle/coverage-free'
import { HAND_PICS } from '../src/games/puzzle/pics-hand'
import { FREE_PICS } from '../src/games/puzzle/pics-free'
import { geometry } from '../src/games/puzzle/geometry'
import {
  DETOUR,
  GOAL_IDS,
  MAZE_LEVELS,
  MAZE_MAX,
  RECENT_MAZES,
  THEME_IDS,
  afterMaze,
  choicesOf,
  distances,
  linked,
  makeMaze,
  mazeOk,
  mazeSkill,
  nextToward,
  normalizeMaze,
  shortest,
  walkTo,
  type MazeLevel,
} from '../src/games/maze/plan'
import { MASTER_OF } from '../src/games/logic/sort-plan'
import { logicSkillLabel, logicSummary, LOGIC_GAME_NAME } from '../src/games/logic/report'
import '../src/content/lines'
import { hasLine, line } from '../src/content/registry'
import { segments } from '../src/content/lines'
import { clipName } from '../src/lib/clip'
import { EMOJI } from '../src/art/emoji.generated'
import { ITEMS } from '../src/art/storybook/meta'
import { existsSync } from 'node:fs'
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
    // T-159：圖庫至少 200 張（家長 2026-11-16：圖太少）
    assert.ok(PUZZLE_PICS.length >= 200, `圖庫至少 200 張，現在 ${PUZZLE_PICS.length}`)
    assert.equal(new Set(PUZZLE_PICS.map((p) => p.id)).size, PUZZLE_PICS.length, '圖的 id 不重複')
    for (const p of PUZZLE_PICS) {
      assert.ok(p.en.split(/\s+/).length <= 6, `${p.id} 的句子 ≤ 6 個字：${p.en}`)
      assert.ok(!!p.art !== !!p.free, `${p.id} 只有一種畫法（手排的 art 或組合圖的 free）`)
      if (p.art) {
        const r = problemsOf(p.art)
        assert.deepEqual(r.blocking, [], `${p.id} 的擺法：${r.blocking.join('；')}`)
        // 角色庫沒有的東西用專案已經在用的 Fluent Emoji（emoji.generated.ts 裡要有）
        for (const c of r.newChars) assert.ok(EMOJI[c], `${p.id} 的 ${c} 不在角色庫、也不在 emoji.generated.ts`)
        // T-159：切成 3×3（還有 2×2、3×2）每一片都有東西，不會整片只有天空或草地
        for (const [c, r] of [[3, 3], [3, 2], [2, 2]]) assert.deepEqual(emptyCells(p.art, c, r), [], `${p.id} 切成 ${c}×${r} 有空的片`)
      } else {
        const f = p.free!
        for (const it of f.items) assert.ok(ITEMS[it.who] || EMOJI[it.who], `${p.id} 的 ${it.who} 不在角色庫、也不在 emoji.generated.ts`)
        // 組合圖：切成 3×3、3×2、2×2 每一片都有東西，只有背景的兩片不能一樣（像素層級的檢查在 scripts/gen-puzzle-pics.mjs 產生時做）
        for (const [c, r] of [[3, 3], [3, 2], [2, 2]]) assert.deepEqual(freeProblems(f, c, r), [], `${p.id} 切成 ${c}×${r}`)
      }
    }
    // T-159 第二版（PM 退件：一成不變）：組合圖至少 8 種版型，沒有一種超過組合圖的 1/5
    const kinds = new Map<string, number>()
    for (const p of FREE_PICS) kinds.set(p.free!.kind, (kinds.get(p.free!.kind) ?? 0) + 1)
    assert.ok(kinds.size >= 8, `組合圖的版型 ${kinds.size} 種`)
    for (const [k, n] of kinds) assert.ok(n <= FREE_PICS.length / 5, `版型 ${k} 有 ${n} 張，太多`)
    console.log(`ok 1 圖庫 ${PUZZLE_PICS.length} 張（手排 ${HAND_PICS.length}、組合圖 ${FREE_PICS.length} 張 ${kinds.size} 種版型），擺法都沒問題，切成 3×3 每一片都有東西`)
  }
  {
    const rnd = seeded(7)
    let recent: string[] = []
    for (let i = 0; i < 500; i++) {
      const p = pickPic(recent, rnd)
      assert.ok(!recent.slice(-RECENT_PICS).includes(p.id), `第 ${i} 張 ${p.id} 跟最近 ${RECENT_PICS} 張重複`)
      // 同一個主題（場景）不連續出現
      const prev = picOf(recent[recent.length - 1] ?? '')
      if (prev) assert.notEqual(themeOf(p), themeOf(prev), `第 ${i} 張 ${p.id} 跟上一張 ${prev.id} 同一個主題`)
      recent = [...recent, p.id].slice(-RECENT_PICS)
    }
    // 圖庫的每一張都輪得到
    const seen = new Set<string>()
    recent = []
    for (let i = 0; i < 4000; i++) {
      const p = pickPic(recent, rnd)
      seen.add(p.id)
      recent = [...recent, p.id].slice(-RECENT_PICS)
    }
    assert.equal(seen.size, PUZZLE_PICS.length, '每一張都輪得到')
    console.log(`ok 2 連續 500 張：新的一張不在最近 ${RECENT_PICS} 張裡、不跟上一張同一個主題；每一張都輪得到`)
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
    for (const n of [4, 6, 9]) assert.ok(trayOrder(n, () => 0).every((x, i) => x !== i), `trayOrder(${n}) 保險`)
    assert.deepEqual(trayOrder(2, () => 0), [1, 0])
    assert.equal(puzzleSkill(1), 'puzzle:4')
    assert.equal(puzzleSkill(2), 'puzzle:6')
    assert.equal(puzzleSkill(3), 'puzzle:9')
    assert.deepEqual(GRID[3], { cols: 3, rows: 3 })
    // 3×3 九片：托盤的位置在作答區裡、片不疊在一起、不蓋到拼盤和參考圖；每一片都有它自己的一格，九格放滿就是整張圖
    // 作答區：平板橫向 1200×786（扣掉上面一排和手腕區），也看小一點的筆電、手機橫向
    for (const [w, h] of [[1200, 640], [1100, 600], [800, 380]]) {
      const r = puzzleRound(3, [], seeded(w))
      const g = geometry(w, h, 3, 3, r.spread)!
      const cw = g.pw * g.s
      const ch = g.ph * g.s
      for (const [k, p] of g.tray.entries()) {
        assert.ok(p.x - cw / 2 >= 0 && p.x + cw / 2 <= w && p.y - ch / 2 >= 0 && p.y + ch / 2 <= h, `${w}×${h} 托盤第 ${k} 格超出作答區`)
        assert.ok(p.x - cw / 2 >= g.board.x + g.board.w, `${w}×${h} 托盤第 ${k} 格蓋到拼盤`)
        assert.ok(p.y - ch / 2 >= g.ref.y + g.ref.h, `${w}×${h} 托盤第 ${k} 格蓋到參考圖`)
        for (const [j, q] of g.tray.entries()) if (j > k) assert.ok(Math.abs(p.x - q.x) >= cw || Math.abs(p.y - q.y) >= ch, `${w}×${h} 托盤第 ${k}、${j} 格疊在一起`)
      }
      if (w === 1200) assert.ok(ch >= 90 && g.ph >= 110, `平板上 3×3 的片要好拖：托盤裡 ${Math.round(ch)} px 高、拼盤上 ${Math.round(g.ph)} px 高`)
      const board = Array<number | null>(9).fill(null)
      for (const piece of r.tray) {
        assert.equal(board[piece], null, `第 ${piece} 片的位置已經有片了`)
        board[piece] = piece
      }
      assert.deepEqual(board, [0, 1, 2, 3, 4, 5, 6, 7, 8], '九片都放得進去，放滿就是整張圖')
    }
    console.log('ok 3 片數：2×2 四片、3×2 六片、3×3 九片；托盤打散、每片一次、每一片都不在跟拼盤一樣的位置；3×3 托盤放得下、九片都放得進去')
  }
  {
    // 升級（T-159）：順利拼完一張（放錯 ≤ 1 次、沒有手帶著放、自己拼的）就升一級：4 片 → 6 片 → 9 片
    const day = '2026-11-16'
    let s = normalizePuzzle(null)
    assert.equal(s.level, 1)
    s = afterPuzzle(s, { pic: PUZZLE_PICS[0].id, date: day, wrongs: OK_WRONGS, shown: false, counted: true })
    assert.equal(s.level, 2, '順利拼完一張：升到 6 片')
    s = afterPuzzle(s, { pic: PUZZLE_PICS[1].id, date: day, wrongs: 0, shown: false, counted: true })
    assert.equal(s.level, 3, '再順利拼完一張：升到 9 片')
    s = afterPuzzle(s, { pic: PUZZLE_PICS[2].id, date: day, wrongs: 0, shown: false, counted: true })
    assert.equal(s.level, PUZZLE_MAX, '9 片是最難的')
    assert.ok(s.pics.length <= RECENT_PICS)
    // 不算的：放錯 2 次（對的位置亮起來了）、手帶著放、示範或發呆時手帶著的
    for (const r of [{ wrongs: 2, shown: false, counted: true }, { wrongs: 0, shown: true, counted: true }, { wrongs: 0, shown: false, counted: false }])
      assert.equal(afterPuzzle(normalizePuzzle({ level: 1 }), { pic: 'park', date: day, ...r }).level, 1, `不升級：${JSON.stringify(r)}`)
    // 已經有的進度不用重設：舊的 6 片進度照舊
    assert.equal(normalizePuzzle({ level: 2, recent: [{ date: day, ok: true }], taught: [1, 2], pics: ['park'] }).level, 2)
    // 一直放錯：退一級（9 片 → 6 片 → 4 片）
    let u = normalizePuzzle({ level: 3 })
    for (let i = 0; i < 6; i++) u = afterPuzzle(u, { pic: 'park', date: day, wrongs: 4, shown: false, counted: true })
    assert.equal(u.level, 2, '最近 6 張 ≤ 3 張對：退一級')
    for (let i = 0; i < 6; i++) u = afterPuzzle(u, { pic: 'park', date: day, wrongs: 4, shown: false, counted: true })
    assert.equal(u.level, 1)
    // 壞掉的資料
    assert.deepEqual(normalizePuzzle({ level: 9, pics: [1, 'sea'], recent: 'x' }), { level: PUZZLE_MAX, recent: [], taught: [], pics: ['sea'] })
    console.log('ok 4 拼圖升降級：順利拼完一張就升一級（4 → 6 → 9 片）、手帶著放和一起做不算、一直放錯退一級、舊進度照舊、壞資料補預設')
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
        assert.ok(m.cols <= 5 && m.rows <= 5, '最大 5×5')
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
        assert.ok(!sigs.slice(-RECENT_MAZES).includes(m.sig), '不跟最近 5 個一樣')
        if (last.theme) assert.notEqual(m.theme, last.theme, '主題不跟上一次一樣')
        if (last.goal) assert.notEqual(m.goalId, last.goal, '終點的東西不跟上一次一樣')
        assert.ok(THEME_IDS.includes(m.theme) && GOAL_IDS.includes(m.goalId))
        sigs = [...sigs, m.sig].slice(-RECENT_MAZES)
        last = { theme: m.theme, goal: m.goalId }
      }
    }
    console.log('ok 5 迷宮每一級 300 個：走得到、大小對、路夠長、岔路不超過上限、不跟最近 5 個一樣、主題和吃的跟上一次不同')
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
      // 照提示一直走一定走到終點
      let at = m.start
      for (let i = 0; i < n && at !== m.goal; i++) at = nextToward(m, at)
      assert.equal(at, m.goal, '照提示走得到終點')
      assert.equal(nextToward(m, m.goal), -1)
    }
    console.log('ok 7 拖著走、點格子：只沿著通的路走、不穿牆；照提示一定走得到終點')
  }
  {
    assert.equal(mazeSkill(1), 'maze:3x3')
    assert.equal(mazeSkill(5), 'maze:5x5')
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
    const keys = ['pz.intro', 'pz.ask', 'pz.look', 'pz.here', 'pz.praise', 'pz.again', 'mz.ask', 'mz.way', 'mz.again', 'lg.pick.intro', 'teach.watch.dodo', 'teach.turn.dodo', 'd.next.home']
    for (const p of PUZZLE_PICS) keys.push(picLineKey(p.id))
    for (const g of GOAL_IDS) keys.push(findKey(g), gotKey(g))
    for (const k of keys) assert.ok(hasLine(k), `台詞：${k}`)
    console.log(`ok 10 台詞都有（${keys.length} 句）`)
  }
  {
    // T-159：每張圖拼完念的那一句都有音檔（public/audio 沒有的環境，例如 CI 沒產音檔，就跳過、照實印出來）
    if (existsSync('public/audio')) {
      const miss = PUZZLE_PICS.flatMap((p) => segments(line(picLineKey(p.id))).map((s) => clipName(line(picLineKey(p.id)), s))).filter((n) => !existsSync(`public/audio/${n}.mp3`))
      assert.deepEqual(miss, [], `拼圖的台詞缺音檔：${miss.join('、')}`)
      console.log(`ok 11 拼圖 ${PUZZLE_PICS.length} 張圖的台詞都有音檔`)
    } else console.log('ok 11 （跳過）沒有 public/audio，不檢查拼圖音檔')
  }

  console.log('ALL PASS')
}

main()

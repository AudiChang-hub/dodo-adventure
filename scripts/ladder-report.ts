// 成長階梯試算（G-2）：用模擬的作答資料，示範「舊資料第一次開成長系統時，算出來每條支線在第幾階」。
// 三種虛構的孩子：剛開始（玩了 1 週）、一般（玩了 10 週）、數學特別快（10 週，數與規律答得又對又快）。
//
// 怎麼造資料：每天玩 4 個遊戲、一回合 5 題，出題照 App 的規則簡化——
// 先教再考、一回合最多 1 個新概念、每條主線每週 2 個新概念（剛開始的頭 7 天 5 個）、內容所在的階開了才教、
// 到期複習優先；熟練度和到期複習照 lib/adaptive.ts 的 recordSkill（不看速度）。
// 算階梯用的是 App 真正的 lib/growth.ts（stepLadder，舊資料升級那一條路：migrate），和孩子第一次開新版時一樣。
//
// 執行：npx tsx scripts/ladder-report.ts > 報告.md
import { stepLadder, emptyLadder, addDays, type LadderFacts, type SkillView, type LadderView } from '../src/lib/growth'
import { REVIEW_DAYS, MASTERED_BOX } from '../src/lib/engine'
import { RUNGS, STRANDS, rung, unitOfSkill, entryRung, levelRung, type StrandId } from '../src/content/ladder'
import { TRACKS, conceptOf, trackOf, type TrackId } from '../src/content/tracks'
import { PHONICS } from '../src/content/letters'
import { VOCAB } from '../src/content/vocab'
import { COLORS, SHAPES } from '../src/content/park'
import { STORIES, seqSkill } from '../src/content/code'
import { DOTS_PICS } from '../src/content/dots'
import { PART_LEVELS, GLYPH_LEVELS } from '../src/games/draw/glyphs'

process.on('unhandledRejection', () => {})

// ── 每個遊戲的內容（依教的順序；難度型的遊戲依級數）────────────────
const range = (a: number, b: number, f: (n: number) => string) => Array.from({ length: b - a + 1 }, (_, i) => f(a + i))
const CONTENT: Record<string, string[]> = {
  'ph-start': PHONICS.map((u) => `phonics:${u.letter}`),
  'ph-letter': PHONICS.map((u) => `phonics:${u.letter}`),
  'z-find': VOCAB.map((v) => `vocab:${v.id}`),
  'z-sound': VOCAB.filter((v) => v.sound).map((v) => `sound:${v.id}`),
  'p-color': COLORS.map((c) => `color:${c.id}`),
  'm-count': range(1, 10, (n) => `count:${n}`),
  'm-match': range(1, 10, (n) => `count:${n}`),
  'm-find': range(1, 20, (n) => `num:${n}`),
  'm-give': range(1, 10, (n) => `give:${n}`),
  'm-compare': ['compare:more', 'compare:less'],
  'p-size': ['size:big', 'size:small'],
  'c-pattern': ['pattern:AB', 'pattern:AABB', 'pattern:ABC'],
  'p-shape': SHAPES.map((s) => `shape:${s.id}`),
  'p-solid': ['all:cube', 'all:sphere'],
  'c-seq': [...STORIES].sort((a, b) => a.icons.length - b.icons.length).map(seqSkill),
  'm-order': range(3, 8, (n) => `order:${n}`),
  'z-category': ['fly', 'water', 'wheels', 'eat', 'legs4'].map((k) => `cat:${k}`),
  'z-use': ['rain', 'eat', 'wear', 'bath', 'bed'].map((k) => `all:${k}`),
  'c-drive': ['arrow:up', 'arrow:down', 'arrow:left', 'arrow:right', 'route:2', 'route:3'],
  'd-trace': range(1, 7, (n) => `trace:${n}`),
  'd-dots': [1, 2, 3, 4].flatMap((lv) => DOTS_PICS.filter((p) => p.level === lv).map((p) => `dots:${p.id}`)),
  'd-glyph': [...PART_LEVELS.flat().map((p) => `part:${p}`), ...GLYPH_LEVELS.join('').split('').map((g) => `glyph:${g}`)],
  'p-lasso': ['apple', 'red', 'circle', 'car'].map((x) => `lasso:${x}`),
}
const GAMES = Object.keys(CONTENT)

// ── 一個孩子 ─────────────────────────────────────────────────
interface Kid {
  name: string
  who: string
  days: number
  ability: Record<TrackId, number>
  /** 每天的自由探索選哪條線（null 是隨便選） */
  free: (TrackId | null)[]
}

interface Sk extends SkillView {
  due?: number
}

function simulate(kid: Kid, seed: number) {
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const skills = new Map<string, Sk>()
  const okGames = new Map<string, Set<string>>()
  const intros = new Map<string, { date: string; track: TrackId }>()
  const lastPlayed = new Map<string, number>()
  const first = new Map<string, string>()
  const last = new Map<string, string>()
  const start = '2026-08-03'
  // 每天結束時照「已經上線的引擎」走一步，決定隔天哪些階開著（造資料用；報告的階梯是最後用升級那一條路重算的）
  let ladder = emptyLadder()
  let day = 0
  let date = start
  const factsNow = (): LadderFacts => ({ skills, okGames })
  const open = (key: string) => {
    const u = unitOfSkill(key)
    return !u || !!ladder.rungs[u.rung]?.open
  }
  const budgetLeft = (t: TrackId) => {
    const from = addDays(date, -6)
    const firstDay = [...intros.values()].filter((x) => x.track === t).map((x) => x.date).sort()[0]
    const starter = !firstDay || firstDay > addDays(date, -7)
    const used = [...intros.values()].filter((x) => x.track === t && x.date >= from).length
    return (starter ? 5 : 2) - used
  }
  const quiz = (game: string, key: string) => {
    const t = trackOf(game)!
    const sk: Sk = { ...(skills.get(key) ?? { box: 0, seen: 0 }) }
    const p = Math.min(0.98, kid.ability[t] * (sk.box >= MASTERED_BOX ? 1.06 : 0.9))
    const ok = rnd() < p
    const was = sk.box >= MASTERED_BOX
    const due = was && (sk.due ?? 0) <= day
    sk.seen++
    sk.box = ok ? Math.min(5, sk.box + 1) : Math.max(0, sk.box - 1)
    if (sk.box >= MASTERED_BOX) {
      if (!was) {
        sk.rev = 0
        sk.due = day + REVIEW_DAYS[0]
      } else if (!ok) {
        sk.rev = 0
        sk.due = day + 1
        if (due) sk.lastReview = { ts: day, result: 'no' }
      } else if (due) {
        sk.rev = Math.min(REVIEW_DAYS.length - 1, (sk.rev ?? 0) + 1)
        sk.due = day + REVIEW_DAYS[sk.rev]
        sk.lastReview = { ts: day, result: 'ok' }
      }
    } else if (was) {
      if (due) sk.lastReview = { ts: day, result: 'no' }
      delete sk.rev
      delete sk.due
    }
    if (sk.box < MASTERED_BOX) delete sk.firmAt
    else if (!sk.firmAt && (sk.rev ?? 0) >= 2) sk.firmAt = day
    skills.set(key, sk)
    if (ok) okGames.set(key, (okGames.get(key) ?? new Set()).add(game))
    const u = unitOfSkill(key)
    if (u) {
      if (!first.has(u.rung)) first.set(u.rung, date)
      last.set(u.rung, date)
    }
  }
  // 一回合：照 App 的規則挑 5 題（先教再考、一回合最多 1 個新概念、每週額度、階開了才教、到期複習優先）
  const playRound = (game: string, t: TrackId) => {
    lastPlayed.set(game, ++clock)
    let roundNew = false
    for (let i = 0; i < 5; i++) {
      const pool = CONTENT[game].filter(open)
      const known = pool.filter((k) => (skills.get(k)?.seen ?? 0) > 0)
      const fresh = pool.find((k) => {
        if ((skills.get(k)?.seen ?? 0) > 0) return false
        const c = conceptOf(game, k)
        if (!c || intros.has(c)) return true
        return !roundNew && budgetLeft(t) > 0
      })
      let key: string | undefined
      if (fresh && (i % 2 === 1 || !known.length)) {
        key = fresh
        const c = conceptOf(game, fresh)
        if (c && !intros.has(c)) {
          intros.set(c, { date, track: t })
          roundNew = true
        }
      } else if (known.length) {
        const due = known.filter((k) => skills.get(k)!.box >= MASTERED_BOX && (skills.get(k)!.due ?? 0) <= day)
        const list = due.length ? due : known
        key = list.sort((a, b) => skills.get(a)!.box - skills.get(b)!.box)[Math.floor(rnd() * Math.min(3, list.length))]
      }
      if (key) quiz(game, key)
    }
  }
  // 這條線現在能玩的遊戲裡最久沒玩的：起點那一階開了才排；本週不能再教新的，就先不排還沒有學過東西的遊戲（和 planDay 一樣）
  const pickGame = (t: TrackId) => {
    let cand = GAMES.filter((g) => trackOf(g) === t && (lastPlayed.has(g) || !entryRung(g) || ladder.rungs[entryRung(g)!]?.open))
    const hasKnown = (g: string) => CONTENT[g].some((k) => (skills.get(k)?.seen ?? 0) > 0)
    if (budgetLeft(t) <= 0 && cand.some(hasKnown)) cand = cand.filter(hasKnown)
    return cand.sort((a, b) => (lastPlayed.get(a) ?? 0) - (lastPlayed.get(b) ?? 0))[0]
  }
  let clock = 0
  ladder = stepLadder(ladder, factsNow(), start).state
  for (day = 1; day <= kid.days; day++) {
    date = addDays(start, Math.floor((day - 1) / 5) * 7 + ((day - 1) % 5))
    // 今天的冒險：每條主線一站；再加上自由探索（孩子自己挑的）
    const tracks: TrackId[] = [...TRACKS.map((x) => x.id), ...Array.from({ length: kid.free.length }, (_, i) => kid.free[i] ?? TRACKS[Math.floor(rnd() * 4)].id)]
    for (const t of tracks) {
      const game = pickGame(t)
      if (game) playRound(game, t)
    }
    ladder = stepLadder(ladder, factsNow(), date).state
  }
  // 升級那一天：從空的階梯，用作答資料重算（和 App 第一次開新版一樣）
  const r = stepLadder(emptyLadder(), factsNow(), addDays(date, 1), { migrate: { first: (id) => first.get(id), last: (id) => last.get(id) } })
  return { view: r.view, log: r.log, date: addDays(date, 1), skills: skills.size }
}

// ── 印成報告 ─────────────────────────────────────────────────
const KIDS: Kid[] = [
  { name: '小樹', who: '剛開始：玩了 1 週（5 天），各條線答對率約 75%', days: 5, ability: { lang: 0.75, num: 0.75, think: 0.75, hand: 0.75 }, free: [null, null] },
  { name: '小河', who: '一般：玩了 10 週（50 天），各條線答對率約 82%，自由探索隨便挑', days: 50, ability: { lang: 0.82, num: 0.82, think: 0.82, hand: 0.82 }, free: [null, null] },
  {
    name: '小山',
    who: '數學特別快：玩了 10 週，數與規律約 97%（其他約 78%），自由探索都挑數學',
    days: 50,
    ability: { lang: 0.78, num: 0.97, think: 0.78, hand: 0.78 },
    free: ['num', 'num'],
  },
]

const ym = (months: number) => `${Math.floor(months / 12)}:${months % 12}`
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

function strandRows(v: LadderView) {
  const out: string[] = []
  for (const t of TRACKS) {
    out.push(`\n**${t.id === 'think' ? '邏輯與程式' : t.name}**\n`)
    out.push('| 支線 | 完成的階 | 正在練（穩固／單位，遷移） | 下一階（等什麼） |')
    out.push('|---|---|---|---|')
    for (const s of STRANDS.filter((x) => x.track === t.id)) {
      const sv = v.strands.find((x) => x.id === s.id)!
      const built = RUNGS.filter((r) => r.strand === s.id)
      if (!built.some((r) => v.rungs.get(r.id)!.total > 0 || r.free)) {
        out.push(`| ${s.name} | — | 還沒有內容（§2 的 ✗） | — |`)
        continue
      }
      const done = sv.done.length ? sv.done.join('、') : '—'
      const cur = sv.current.length
        ? sv.current
            .map((id) => {
              const x = v.rungs.get(id)!
              const tr = x.transferable ? `，遷移 ${x.transferred}/${x.transferable}` : ''
              return `${id} ${x.firm}/${x.total}（${pct(x.firm, x.total)}${tr}）${x.by === 'legacy' ? '［以前就玩到了］' : ''}`
            })
            .join('；')
        : sv.out
          ? '都完成了'
          : '—'
      const nx = sv.next ? `${sv.next}（等 ${rung(sv.next)!.prereq.filter((p) => !v.rungs.get(p)!.complete).join('、') || '—'}）` : sv.out ? '新內容都教過了：之後橫向加深，家長區提醒' : '下一階還沒有內容'
      out.push(`| ${s.name} | ${done} | ${cur} | ${nx} |`)
    }
  }
  return out.join('\n')
}

const lines: string[] = []
const p = (s = '') => lines.push(s)
p('# 成長階梯試算（G-2）')
p()
p('> 日期：2026-10-30｜給：家長確認「算出來的階合不合理」｜產生：`npx tsx scripts/ladder-report.ts`')
p('> 資料：三個**虛構**的孩子，作答是模擬出來的（不是孩子的真實紀錄）。真實資料在平板上：新版第一次打開時，App 會用同一套規則算一次，結果寫進成長時間軸（標「補記」；家長區的「成長」分頁是 G-6，做好之後看得到）。')
p()
p('## 規則（設計 §1.4，數字在 `src/content/ladder.ts`）')
p()
p('- **穩固**：熟練度 3 格以上，而且通過 2 次到期複習（隔 1 天、再隔 2 天都還記得）。')
p('- **階完成**：這一階 80% 的單位穩固；能在 2 種以上遊戲練到的單位（數字、字母音、詞彙主題），要有一半以上「遷移」（在 2 種遊戲都第一次就答對）。')
p('- **開放下一階**：前置的階都完成，或觸發**卡關保險**（前一階 60% 穩固、開了滿 3 週）。不看年齡。')
p('- **回補**：完成的階有 30% 以上掉出已熟，或連續 2 次到期複習失敗 → 那條支線停教新概念 1 週、到期複習加倍、掉的重教一次；已經開的下一階不收回。孩子端看不出來。')
p('- **舊資料**：以前就玩到的階（例如已經在練左右、已經學到第 8 個字母音）直接算開放，不會收回；時間軸用作答日期補記。')
p('- **一回合最多 1 個新概念**（FRAME-8，三個年段都一樣）。')
p()
for (const [i, kid] of KIDS.entries()) {
  const r = simulate(kid, 20261030 + i)
  p(`## ${i + 1}. ${kid.name}：${kid.who}`)
  p()
  p(`算的那天：${r.date}；出現過的技能點 ${r.skills} 個；補記的時間軸 ${r.log.length} 筆。`)
  p(strandRows(r.view))
  p()
  if (i === 1) {
    p('<details><summary>小河的補記時間軸（前 12 筆）</summary>')
    p()
    p('| 日期 | 支線 | 事件 |')
    p('|---|---|---|')
    for (const x of [...r.log].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 12))
      p(`| ${x.date} | ${STRANDS.find((s) => s.id === x.strand)!.name} | ${x.data.rung} ${x.kind === 'reopen' ? '回補' : x.data.event === 'done' ? '完成' : '開放'}（補記） |`)
    p()
    p('</details>')
    p()
  }
}
p('## 要請家長確認的地方')
p()
p('1. **80% 在單位少的階等於全部**：N7（比多少、比大小 4 個）、H6（直線、橫線、圓、十字 4 個）、H2（連點成圖 4 級）都要 4 個全部穩固才算完成。')
p('2. **描字母比 G-33 的暫時門檻晚**：暫時門檻是「運筆小路 4 級、連點成圖 2 級、最近 5 次都第一次就完成」；正式的是運筆小路約 5 級以上穩固、連點成圖 4 級都穩固、斜線半圓轉角也穩固。上面三個孩子 10 週都還沒開。已經用暫時門檻開過的，升級時算開放，不會收回。')
p('3. **字母音第 7 個以後（n d c r…）要等前 6 個（m s a t b f）完成**：80% 穩固，而且一半以上在兩個字母森林的遊戲都答對過。以前是「同時最多 3 個不熟的音」就往下開。')
p('4. **數字的分段照現有遊戲**：1–5（N1）→ 6–10（N2）→ 11–20（N3）；§2 的「認數字 1–5」併進 N1。照順序（T2）、連點成圖（H2）的前置改成 N1（認得 1–5），照 §2 原文寫 N2 會擋住連點成圖、連帶擋住描字母。')
p('5. **整個遊戲的起點階還沒開時，今天的冒險先不排它**：例如新的孩子要等 1–5 穩固才排連點成圖、照順序；用筆圈起來要等運筆小路完成。孩子自己從地圖點進去還是可以玩（自由探索不擋）。')
p('6. **穩固記住了**：通過 2 次到期複習之後，偶爾答錯一題（到期複習從頭排）仍然算穩固；掉出已熟才不算。')
p()
p('## 參考年齡（只給家長看「比一般早／還在練」，不是門檻）')
p()
p('| 階 | 參考年齡 | 內容 |')
p('|---|---|---|')
for (const r of RUNGS.filter((x) => x.games.length && !x.with)) p(`| ${r.id} | ${ym(r.age)} | ${r.what} |`)
p()
// 只在報告用的提醒：levelRung 對得到的遊戲
void levelRung
console.log(lines.join('\n'))

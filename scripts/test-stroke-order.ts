// 英文字母筆順的單元測試（T-153，家長 2026-11-16：M 一筆畫完，一般人不會這樣寫）。
// 標準：台灣課本常見的印刷體筆順表（筆數、每筆從哪裡開始、往哪裡寫），方向和先後再對照 Zaner-Bloser 印刷體的筆畫說明；
// 對照表和來源在主 repo docs/T-153-字母筆順對照.md。
// 每一筆檢查：起點在字的哪一區（上中下 × 左中右，用整個字的範圍切三等分）、一開始往哪個方向寫。
// 數字（數學課描數字也用 GLYPHS）：家長 2026-11-16 決定一起改，照台灣國小課本常見的寫法。
// 執行：npx tsx scripts/test-stroke-order.ts（失敗就 exit 1）
import assert from 'node:assert/strict'
import { GLYPHS } from '../src/games/draw/glyphs'
import { LESSON_LETTERS, LOWER, onLines } from '../src/lessons/english/data'

let n = 0
const ok = (name: string) => console.log(`ok ${++n} ${name}`)

type Zone = `${'T' | 'M' | 'B'}${'L' | 'C' | 'R'}`
/** 方向：d 下、u 上、l 左、r 右，斜的兩個字（dr 右下…） */
type Dir = 'd' | 'u' | 'l' | 'r' | 'dl' | 'dr' | 'ul' | 'ur'
/** 一筆：起點可以在哪幾區、一開始往哪裡寫；end 是終點要在哪一區（有需要才寫） */
type S = [Zone | Zone[], Dir, (Zone | Zone[])?]

// ── 標準（台灣課本常見的印刷體筆順表；跟 Zaner-Bloser 不一樣的地方在對照表裡）──────────
const UPPER: Record<string, S[]> = {
  A: [['TC', 'dl'], ['TC', 'dr'], ['ML', 'r']],
  B: [['TL', 'd'], ['TL', 'r', 'BL']],
  C: [['TR', 'ul']],
  D: [['TL', 'd'], ['TL', 'r', 'BL']],
  E: [['TL', 'd'], ['TL', 'r'], ['ML', 'r'], ['BL', 'r']],
  F: [['TL', 'd'], ['TL', 'r'], ['ML', 'r']],
  G: [['TR', 'ul'], ['MC', 'r']],
  H: [['TL', 'd'], ['TR', 'd'], ['ML', 'r']],
  I: [['TC', 'd'], ['TL', 'r'], ['BL', 'r']],
  J: [['TR', 'd']],
  K: [['TL', 'd'], ['TR', 'dl'], ['ML', 'dr']],
  L: [['TL', 'd'], ['BL', 'r']],
  M: [['TL', 'd'], ['TL', 'dr'], ['MC', 'ur'], ['TR', 'd']],
  N: [['TL', 'd'], ['TL', 'dr'], ['BR', 'u']],
  O: [['TC', 'l']],
  P: [['TL', 'd'], ['TL', 'r']],
  Q: [['TC', 'l'], [['MC', 'MR', 'BC', 'BR'], 'dr']],
  R: [['TL', 'd'], ['TL', 'r'], ['MC', 'dr']],
  S: [['TR', 'ul']],
  // T 照家長習慣先橫後直（2026-11-16）；台灣筆順表和 Zaner-Bloser 都是先直後橫
  T: [['TL', 'r'], ['TC', 'd']],
  U: [['TL', 'd', 'TR']],
  V: [['TL', 'dr'], ['BC', 'ur']],
  W: [['TL', 'dr'], ['BL', 'ur'], [['TC', 'MC'], 'dr'], ['BR', 'ur']],
  X: [['TL', 'dr'], ['TR', 'dl']],
  Y: [['TL', 'dr'], ['TR', 'dl'], ['MC', 'd']],
  Z: [['TL', 'r'], ['TR', 'dl'], ['BL', 'r']],
}
const LOWER_STD: Record<string, S[]> = {
  a: [['TR', 'ul'], ['TR', 'd']],
  b: [['TL', 'd'], [['ML', 'BL'], 'ur']],
  c: [['TR', 'ul']],
  d: [[['TR', 'MR'], 'ul'], ['TR', 'd']],
  e: [['ML', 'r']],
  f: [['TR', 'ul'], ['ML', 'r']],
  g: [['TR', 'ul'], ['TR', 'd']],
  h: [['TL', 'd'], [['ML', 'BL'], 'ur']],
  i: [['MC', 'd'], ['TC', 'd']],
  j: [['TR', 'd'], ['TR', 'd']],
  k: [['TL', 'd'], ['MR', 'dl'], [['MC', 'BC'], 'dr']],
  l: [['TC', 'd']],
  m: [['TL', 'd'], ['ML', 'ur'], ['MC', 'ur']],
  n: [['TL', 'd'], ['ML', 'ur']],
  o: [['TC', 'l']],
  p: [['TL', 'd'], [['TL', 'ML'], 'ur']],
  q: [['TR', 'ul'], ['TR', 'd']],
  r: [['TL', 'd'], ['ML', 'ur']],
  s: [['TR', 'ul']],
  t: [['TC', 'd'], ['ML', 'r']],
  u: [['TL', 'd', 'TR'], ['TR', 'd']],
  v: [['TL', 'dr'], ['BC', 'ur']],
  w: [['TL', 'dr'], ['BL', 'ur'], [['TC', 'MC'], 'dr'], ['BR', 'ur']],
  x: [['TL', 'dr'], ['TR', 'dl']],
  y: [['TL', 'dr'], ['TR', 'dl']],
  z: [['TL', 'r'], ['TR', 'dl'], ['BL', 'r']],
}

// ── 路徑的幾何（只有 M、L、C 絕對座標，跟 data.ts 的 yRange 一樣）──────────────────
type P = { x: number; y: number }
type Seg = { cmd: 'M' | 'L' | 'C'; v: number[] }
function segs(d: string): Seg[] {
  const out: Seg[] = []
  for (const [, cmd, args] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    assert.ok(cmd === 'M' || cmd === 'L' || cmd === 'C', `只能用 M、L、C 絕對座標：${d}`)
    const v = args.trim().split(/[\s,]+/).filter(Boolean).map(Number)
    out.push({ cmd: cmd as Seg['cmd'], v })
  }
  assert.equal(out[0]?.cmd, 'M', `要從 M 開始：${d}`)
  return out
}
const pts = (d: string): P[] => segs(d).flatMap((s) => Array.from({ length: s.v.length / 2 }, (_, i) => ({ x: s.v[2 * i], y: s.v[2 * i + 1] })))
const startOf = (d: string): P => pts(d)[0]
const endOf = (d: string): P => pts(d).at(-1)!
/** 一開始往哪裡寫：直線看第一段的終點，曲線看 t = 0.15 的位置 */
function headOf(d: string): P {
  const s = segs(d)
  const a = { x: s[0].v[0], y: s[0].v[1] }
  const nx = s[1]
  if (nx.cmd === 'L') return { x: nx.v[0], y: nx.v[1] }
  const t = 0.15
  const u = 1 - t
  const c = (i: number, z: number) => u * u * u * z + 3 * u * u * t * nx.v[i] + 3 * u * t * t * nx.v[i + 2] + t * t * t * nx.v[i + 4]
  return { x: c(0, a.x), y: c(1, a.y) }
}
function dirOf(d: string): Dir {
  const a = startOf(d)
  const b = headOf(d)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const v = Math.abs(dy) > 0.15 * len ? (dy > 0 ? 'd' : 'u') : ''
  const h = Math.abs(dx) > 0.15 * len ? (dx > 0 ? 'r' : 'l') : ''
  return (v + h) as Dir
}
/** 整個字（所有筆、含曲線的控制點）的範圍切成三等分，點在哪一區 */
function zoneOf(p: P, strokes: string[]): Zone {
  const all = strokes.flatMap(pts)
  const xs = all.map((q) => q.x)
  const ys = all.map((q) => q.y)
  const fx = (p.x - Math.min(...xs)) / (Math.max(...xs) - Math.min(...xs) || 1)
  const fy = (p.y - Math.min(...ys)) / (Math.max(...ys) - Math.min(...ys) || 1)
  const w = Math.max(...xs) === Math.min(...xs) ? 'C' : fx < 1 / 3 ? 'L' : fx > 2 / 3 ? 'R' : 'C'
  const h = fy < 1 / 3 ? 'T' : fy > 2 / 3 ? 'B' : 'M'
  return `${h}${w}` as Zone
}
const zones = (z: Zone | Zone[]) => (Array.isArray(z) ? z : [z])

function check(ch: string, strokes: string[], std: S[]) {
  const bad: string[] = []
  if (strokes.length !== std.length) bad.push(`筆數 ${strokes.length}，標準 ${std.length}`)
  std.forEach(([z, dir, end], i) => {
    const d = strokes[i]
    if (!d) return
    const sz = zoneOf(startOf(d), strokes)
    if (!zones(z).includes(sz)) bad.push(`第 ${i + 1} 筆起點在 ${sz}，標準 ${zones(z).join('/')}`)
    const dd = dirOf(d)
    if (dd !== dir) bad.push(`第 ${i + 1} 筆往 ${dd} 寫，標準 ${dir}`)
    if (end) {
      const ez = zoneOf(endOf(d), strokes)
      if (!zones(end).includes(ez)) bad.push(`第 ${i + 1} 筆終點在 ${ez}，標準 ${zones(end).join('/')}`)
    }
  })
  return bad.length ? `${ch}：${bad.join('；')}` : null
}

// ── 大寫、小寫照標準 ──────────────────────────────────────────
{
  const bad = Object.entries(UPPER).map(([L, std]) => check(L, GLYPHS[L], std)).filter(Boolean)
  assert.equal(Object.keys(UPPER).length, 26)
  assert.deepEqual(bad, [], `大寫筆順不對：\n${bad.join('\n')}`)
}
ok('大寫 26 個：筆數、每筆的起點和方向照標準（M 左豎 → 斜下 → 斜上 → 右豎）')

{
  const bad = Object.entries(LOWER_STD).map(([l, std]) => check(l, LOWER[l], std)).filter(Boolean)
  assert.equal(Object.keys(LOWER_STD).length, 26)
  assert.deepEqual(bad, [], `小寫筆順不對：\n${bad.join('\n')}`)
}
ok('小寫 26 個：筆數、每筆的起點和方向照標準')

// M 寫明白：左豎由上往下、斜下、斜上、右豎由上往下（家長回報的那個字）
{
  const [a, b, c, d] = GLYPHS.M
  assert.equal(GLYPHS.M.length, 4)
  assert.ok(startOf(a).y < endOf(a).y && Math.abs(startOf(a).x - endOf(a).x) < 1, 'M 第 1 筆：左豎由上往下')
  assert.ok(Math.hypot(startOf(b).x - startOf(a).x, startOf(b).y - startOf(a).y) < 1, 'M 第 2 筆：從左上角開始')
  assert.ok(Math.hypot(startOf(c).x - endOf(b).x, startOf(c).y - endOf(b).y) < 1, 'M 第 3 筆：從第 2 筆的尖角往右上')
  assert.ok(startOf(d).y < endOf(d).y, 'M 第 4 筆：右豎由上往下')
}
ok('M：左豎（上 → 下）→ 斜下 → 斜上 → 右豎（上 → 下）')

// ── 英文課描字用的都跟著變（四線格的大寫、塗字母、小寫）────────────────────
for (const x of LESSON_LETTERS) {
  assert.equal(x.upper, GLYPHS[x.L])
  assert.equal(x.upperLined.length, GLYPHS[x.L].length, `${x.L} 四線格版的筆數`)
  assert.deepEqual(x.upperLined, onLines(x.L, GLYPHS[x.L]))
  assert.equal(x.lower, LOWER[x.l])
  for (const d of [...x.upperLined, ...x.lower]) {
    for (const p of pts(d)) assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 140, `${x.L}${x.l} 超出 100 × 140：${d}`)
    assert.ok(Math.hypot(endOf(d).x - startOf(d).x, endOf(d).y - startOf(d).y) > 0 || pts(d).length > 2, `${x.L}${x.l} 有一筆長度是 0：${d}`)
  }
}
ok('英文課的四線格大寫、小寫：筆數跟 GLYPHS、LOWER 一樣，座標在描字板裡')

// ── 數字（家長 2026-11-16：數字也改）：台灣國小課本常見的寫法 ──────────────────
// 1 一筆直線、4 兩筆（開口）、5 兩筆（直下來接肚子，最後補上面的橫）、7 一筆（沒有橫槓）、8 一筆從右上開始
const DIGITS: Record<string, S[]> = {
  '0': [['TC', 'dl']],
  '1': [['TC', 'd']],
  '2': [['TL', 'ur']],
  '3': [['TL', 'ur']],
  '4': [['TC', 'dl'], ['TC', 'd']],
  '5': [['TL', 'd'], ['TL', 'r']],
  '6': [['TR', 'ul']],
  '7': [['TL', 'r']],
  '8': [['TR', 'ul', 'TR']],
  '9': [[['TR', 'MR'], 'ul']],
}
{
  const bad = Object.entries(DIGITS).map(([d, std]) => check(d, GLYPHS[d], std)).filter(Boolean)
  assert.deepEqual(bad, [], `數字筆順不對：\n${bad.join('\n')}`)
}
ok('數字 0～9：筆數、每筆的起點和方向照台灣課本（5 兩筆、最後寫上面的橫；8 從右上開始）')

console.log('ALL PASS')

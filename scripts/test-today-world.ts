// 今天的世界（src/lib/today-world.ts）和玩法輪替（src/lib/variety.ts）：T-127 B 案第 1 輪。
// 執行：npx tsx scripts/test-today-world.ts
import assert from 'node:assert/strict'
import '../src/content/lines-world'
import { hasLine, line } from '../src/content/registry'
import { EMOJI } from '../src/art/emoji.generated'
import { SCENES } from '../src/art/storybook/layout'
import { THING_NOUNS, WORLDS, dayNumber, getTodayWorld, worldById, worldOn } from '../src/lib/today-world'
import { chooseVariety, nextKind, pickVariety, type VarietyState } from '../src/lib/variety'

const day0 = new Date(2026, 10, 10)
const plus = (d: Date, k: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k, 9, 30)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function main() {
  // ── 今天的世界 ─────────────────────────────────
  {
    const ids = new Set(WORLDS.map((w) => w.id))
    assert.equal(ids.size, WORLDS.length, '世界 id 不能重複')
    assert.ok(WORLDS.length >= 8 && WORLDS.length <= 12, `大約 10 個世界（現在 ${WORLDS.length}）`)
    for (const w of WORLDS) {
      assert.ok(w.scene in SCENES, `${w.id} 的背景 ${w.scene} 不在 SCENES`)
      assert.ok(w.things.length >= 4 && w.things.length <= 6, `${w.id} 可以數的東西要 4～6 樣`)
      assert.equal(new Set(w.things).size, w.things.length, `${w.id} 的東西重複`)
      assert.ok(w.stamps.length >= 2 && w.stamps.length <= 3, `${w.id} 印章要 2～3 個`)
      for (const e of [...w.things, ...w.stamps]) assert.ok(EMOJI[e], `${w.id} 的 ${e} 不在 emoji.generated.ts`)
      for (const e of w.things) assert.ok(THING_NOUNS[e], `${w.id} 的 ${e} 沒有英文名字（THING_NOUNS）`)
      for (const [s, id] of Object.entries(w.hi)) {
        assert.ok(hasLine(id), `${w.id} 的開場句 ${id} 沒有台詞`)
        assert.equal(line(id).speaker, s)
        const words = line(id).text.replace(/\|/g, ' ').trim().split(/\s+/)
        assert.ok(words.length <= 6, `${id} 超過 6 個字：${line(id).text}`)
        assert.ok((line(id).text.match(/\|/g) ?? []).length <= 1, `${id} 只能有一個加重的地方`)
      }
      assert.equal(worldById(w.id), w)
    }
    console.log('ok 1 世界：背景在 SCENES、東西 4～6 樣、印章 2～3 個都在 emoji.generated.ts，東西有英文名字，三隻恐龍都有開場句')
  }
  {
    // 30 天內相鄰兩天不重複（再往後看 10 年，輪和輪的交界也不重複）
    for (let k = 1; k < 30; k++) assert.notEqual(worldOn(plus(day0, k)).id, worldOn(plus(day0, k - 1)).id, `${ymd(plus(day0, k))} 和前一天一樣`)
    for (let k = 1; k < 3650; k++) assert.notEqual(worldOn(plus(day0, k)).id, worldOn(plus(day0, k - 1)).id, `${ymd(plus(day0, k))} 和前一天一樣`)
    console.log('ok 2 世界：30 天內（以及之後 10 年）相鄰兩天都不一樣')
  }
  {
    // 每一輪（WORLDS.length 天）每個世界都出現一次：兩週內不會一直是同幾個
    const n = WORLDS.length
    const start = Math.ceil(dayNumber(day0) / n) * n
    for (let b = 0; b < 50; b++) {
      const seen = new Set<string>()
      for (let i = 0; i < n; i++) {
        const d = new Date(1970, 0, 1 + start + b * n + i, 12)
        assert.equal(dayNumber(d), start + b * n + i)
        seen.add(worldOn(d).id)
      }
      assert.equal(seen.size, n, `第 ${b} 輪只出現 ${seen.size} 個世界`)
    }
    // 同一天的早上、晚上是同一個世界
    assert.equal(worldOn(new Date(2026, 10, 10, 0, 1)).id, worldOn(new Date(2026, 10, 10, 23, 59)).id)
    // 30 天裡每個世界都出現過
    assert.equal(new Set(Array.from({ length: 30 }, (_, k) => worldOn(plus(day0, k)).id)).size, n)
    console.log('ok 3 世界：每 10 天一輪、每個世界各一次；同一天整天同一個')
  }
  {
    // getTodayWorld：預設看日期；localStorage 的 dodo:world 可以固定或關掉（關掉回傳 null，各處用原本的東西）
    assert.equal(getTodayWorld(day0)?.id, worldOn(day0).id)
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null }
    store.set('dodo:world', 'zoo')
    assert.equal(getTodayWorld(day0)?.id, 'zoo')
    store.set('dodo:world', 'off')
    assert.equal(getTodayWorld(day0), null)
    store.set('dodo:world', 'nope')
    assert.equal(getTodayWorld(day0)?.id, worldOn(day0).id, '不認得的 id 不理它，照日期')
    store.delete('dodo:world')
    assert.equal(getTodayWorld(day0)?.id, worldOn(day0).id)
    delete (globalThis as { localStorage?: unknown }).localStorage
    console.log('ok 4 getTodayWorld：看日期；dodo:world 可以固定一個世界或關掉（null）')
  }

  // ── 玩法輪替 ─────────────────────────────────
  {
    const kinds = ['give', 'train', 'plant'] as const
    // 30 天、每天上一次：連續兩天不一樣，每 3 天每一種各一次
    let state: VarietyState = {}
    const seq: string[] = []
    for (let k = 0; k < 30; k++) {
      const r = chooseVariety(state, 'math.give', kinds, ymd(plus(day0, k)))
      state = r.state
      seq.push(r.kind)
    }
    for (let k = 1; k < seq.length; k++) assert.notEqual(seq[k], seq[k - 1], `第 ${k} 天和前一天一樣：${seq.join(',')}`)
    for (let k = 2; k < seq.length; k++) assert.equal(new Set(seq.slice(k - 2, k + 1)).size, 3, `連續 3 天要各玩一種：${seq.join(',')}`)
    console.log('ok 5 玩法：連續兩天不一樣，3 種玩法每 3 天各一次')
  }
  {
    const kinds = ['give', 'train', 'plant'] as const
    // 同一天再進來：同一種、不寫入
    const a = chooseVariety({}, 'math.give', kinds, '2026-11-10', () => 0.99)
    const b = chooseVariety(a.state, 'math.give', kinds, '2026-11-10', () => 0)
    assert.equal(b.kind, a.kind)
    assert.equal(b.changed, false)
    // 不同課分開記
    const c = chooseVariety(a.state, 'english.quiz', ['cards', 'bubbles'] as const, '2026-11-10')
    assert.equal(c.state['math.give'].kind, a.kind)
    // 跳過幾天沒上：還是跟上一次不一樣
    const d = chooseVariety(a.state, 'math.give', kinds, '2026-11-20')
    assert.notEqual(d.kind, a.kind)
    // 只有一種玩法：一直是那一種
    assert.equal(nextKind(['only'] as const, ['only']), 'only')
    // 兩種玩法：輪流
    assert.equal(nextKind(['a', 'b'] as const, ['a']), 'b')
    // 舊紀錄裡的玩法拿掉了：不影響
    assert.ok(['give', 'plant'].includes(nextKind(['give', 'plant'] as const, ['train', 'give'])))
    assert.equal(nextKind(['give', 'plant'] as const, ['train', 'give']), 'plant')
    // 紀錄被刪掉：從頭開始，不會壞
    assert.ok(kinds.includes(chooseVariety({}, 'math.give', kinds, '2026-11-21').kind))
    console.log('ok 6 玩法：同一天沿用、各課分開記、只有一兩種玩法、玩法拿掉、紀錄被刪掉都不會壞')
  }
  {
    // node 沒有 IndexedDB：讀不到、存不了也照樣挑一種，不擋住上課
    const k = await pickVariety('math.give', ['give', 'train', 'plant'] as const, day0)
    assert.ok(['give', 'train', 'plant'].includes(k))
    console.log('ok 7 玩法：資料庫讀不到也照樣挑一種')
  }
  console.log('ALL PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

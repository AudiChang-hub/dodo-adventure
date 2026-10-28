// 重置學習進度的雲端刪除（src/lib/reset-cloud.ts）：用假的 Firestore 驗證，不連 Firebase。
// 執行：npx tsx scripts/test-reset-cloud.ts
// 驗證：每批 ≤ 500、只刪 users/{uid} 底下的學習資料、保留畫作時不刪 drawings、別的帳號不動、中途失敗會丟錯且可以重跑刪完
import assert from 'node:assert/strict'
import { wipeCloudLearning, type WipeFs } from '../src/lib/reset-cloud'

function makeFs(seed: Record<string, number>, failAt = -1) {
  const docs = new Set<string>()
  for (const [path, n] of Object.entries(seed)) for (let i = 0; i < n; i++) docs.add(`${path}/${i}`)
  const batches: number[] = []
  let commits = 0
  const fs: WipeFs = {
    collection: (_s, ...p) => ({ col: p.join('/') }),
    doc: (_s, ...p) => ({ path: p.join('/') }),
    query: (q, ...c) => ({ ...(q as object), lim: (c[0] as { n: number }).n }),
    limit: (n) => ({ n }),
    async getDocsFromServer(q) {
      const { col, lim } = q as { col: string; lim: number }
      const depth = col.split('/').length + 1
      const hit = [...docs].filter((k) => k.startsWith(col + '/') && k.split('/').length === depth).slice(0, lim)
      return { docs: hit.map((path) => ({ ref: { path } })) }
    },
    writeBatch() {
      const ops: string[] = []
      return {
        delete: (r) => ops.push((r as { path: string }).path),
        async commit() {
          if (commits++ === failAt) throw Object.assign(new Error('unavailable'), { code: 'unavailable' })
          assert.ok(ops.length <= 500, `一批超過 500 筆：${ops.length}`)
          batches.push(ops.length)
          ops.forEach((p) => docs.delete(p))
        },
      }
    },
  }
  docs.add('users/me/meta/state')
  return { fs, docs, batches }
}

const under = (docs: Set<string>, prefix: string) => [...docs].filter((k) => k.startsWith(prefix)).length

const SEED = { 'users/me/attempts': 1234, 'users/me/sessions': 3, 'users/me/drawings': 10, 'users/other/attempts': 7, 'users/other/meta': 1 }

async function main() {
  {
    const m = makeFs(SEED)
    const r = await wipeCloudLearning(m.fs, {}, 'me', { keepDrawings: false })
    assert.deepEqual(r.deleted, { attempts: 1234, sessions: 3, drawings: 10, meta: 1 })
    assert.deepEqual(m.batches, [500, 500, 234, 3, 10, 1])
    assert.equal(under(m.docs, 'users/me/'), 0)
    assert.equal(under(m.docs, 'users/other/'), 8, '別的帳號不能動')
    console.log('ok 1 全部清（含畫作）', r)
  }
  {
    const m = makeFs(SEED)
    const r = await wipeCloudLearning(m.fs, {}, 'me', { keepDrawings: true })
    assert.equal(r.deleted.drawings, undefined)
    assert.equal(under(m.docs, 'users/me/drawings/'), 10)
    assert.equal(under(m.docs, 'users/me/attempts/') + under(m.docs, 'users/me/sessions/') + under(m.docs, 'users/me/meta/'), 0)
    console.log('ok 2 保留畫作', r)
  }
  {
    const m = makeFs({ 'users/me/attempts': 500 })
    const r = await wipeCloudLearning(m.fs, {}, 'me', { keepDrawings: false })
    assert.equal(r.deleted.attempts, 500)
    assert.deepEqual(m.batches, [500, 1])
    assert.equal(under(m.docs, 'users/me/'), 0)
    console.log('ok 3 剛好 500 筆')
  }
  {
    const m = makeFs(SEED, 1)
    await assert.rejects(wipeCloudLearning(m.fs, {}, 'me', { keepDrawings: false }), /unavailable/)
    assert.equal(under(m.docs, 'users/me/attempts/'), 734, '第二批失敗：第一批已刪、其他都還在')
    assert.ok(m.docs.has('users/me/meta/state'))
    const r = await wipeCloudLearning(m.fs, {}, 'me', { keepDrawings: false })
    assert.equal(r.deleted.attempts, 734)
    assert.equal(under(m.docs, 'users/me/'), 0)
    console.log('ok 4 中途失敗會丟錯，重跑可以刪完')
  }
  {
    const m = makeFs({ 'users/me/attempts': 1200 })
    await wipeCloudLearning(m.fs, {}, 'me', { keepDrawings: false, batchSize: 9999 })
    assert.deepEqual(m.batches, [500, 500, 200, 1])
    console.log('ok 5 batchSize 上限 500')
  }
  {
    const m = makeFs({})
    const r = await wipeCloudLearning(m.fs, {}, 'me', { keepDrawings: false })
    assert.deepEqual(r.deleted, { attempts: 0, sessions: 0, drawings: 0, meta: 1 })
    console.log('ok 6 沒有資料的帳號')
  }
  {
    // 離線時 commit 永遠不回應：要逾時丟錯，不能卡住
    const m = makeFs({ 'users/me/attempts': 3 })
    m.fs.writeBatch = () => ({ delete: () => undefined, commit: () => new Promise<void>(() => {}) })
    await assert.rejects(wipeCloudLearning(m.fs, {}, 'me', { keepDrawings: false, timeoutMs: 50 }), /網路太慢/)
    assert.equal(under(m.docs, 'users/me/attempts/'), 3)
    console.log('ok 7 寫入沒回應會逾時')
  }
  console.log('ALL PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

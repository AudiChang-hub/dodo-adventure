import { db, getKV, setKV } from '../../lib/db'
import { loadAdaptive, skill } from '../../lib/adaptive'
import { PHONICS, phonicsSkill, upper } from '../../content/letters'

const DONE = 'phonics:migrated'

/**
 * 舊版字母森林的熟練度（letter:B 認字母名稱、word:B 字母配圖 B → bus）怎麼沿用：
 * - 舊紀錄全部保留，家長區的字母音格子也會標出「已認得字母名」。
 * - 字母名稱不等於字母音（PRD §6.1b：熟練是看能不能分辨開頭音），所以不直接搬分數。
 * - 但 word:B 熟了（3 格以上）代表孩子已經把 B 和 bus 連在一起，這正是 b 的關鍵字，
 *   所以 phonics:b 從 1 格（學習中）起步，不是 0。
 * - 不寫 seen：學習循環照樣會完整教一次（先教再考），只是複習的權重比全新的音低一點。
 * 只做一次（kv 記錄 phonics:migrated）。
 */
export async function migrateLegacy() {
  if (await getKV(DONE, false)) return
  const seeds = PHONICS.filter((u) => skill(phonicsSkill(u.letter)).box === 0 && skill(`word:${upper(u.letter)}`).box >= 3)
  if (seeds.length) {
    await db.skills.bulkPut(seeds.map((u) => ({ ...skill(phonicsSkill(u.letter)), box: 1 })))
    await loadAdaptive()
  }
  await setKV(DONE, true)
}

// 翻翻牌、影子配對（T-160）共用的台詞：每樣東西的英文名字（翻開牌、影子放對時念）。全部英文、豆豆說，不念中文、不唱歌。
// content/lines.ts import 這個檔；只產這兩個遊戲的音檔：python scripts/gen_audio.py --only mm. sh.
import { def } from '../../content/registry'
import { MATCH_PICS } from './catalog'

/** 一樣東西的名字（./catalog.ts 的 en） */
export const nameKey = (id: string) => `mm.n.${id}`
for (const p of MATCH_PICS) def(nameKey(p.id), 'dodo', `${p.en}!`)

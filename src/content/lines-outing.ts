// 出門任務卡（PRD §5.11）回到 App 時的台詞：豆豆問「你有看到 bus 嗎？」，孩子點了就開心地回應。
// 全部是豆豆說；給 3 歲聽的美式英文短句，`|` 之後是加重的目標字。
// 問句不是考題（點哪張都對），字幕不挖空，所以不用加進 subtitles.ts。
// 答對句把狀聲詞放前面（Beep beep! You saw a | bus!）：`|` 後整段都會放慢加重，目標字要在最後。
import { def } from './registry'
import { vocab } from './vocab'
import { FINDABLE } from './outing'

for (const f of FINDABLE) {
  const en = vocab(f.id).en
  def(`out.saw.${f.id}`, 'dodo', `Did you see ${f.art} | ${en}?`)
  def(`out.yes.${f.id}`, 'dodo', `${f.cry} You saw ${f.art} | ${en}!`)
}

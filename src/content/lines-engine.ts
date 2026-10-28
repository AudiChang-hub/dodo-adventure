// 學習引擎的台詞（第二批・工作線 A）：Sam 教豆豆、程度校準、功文式小練習
import { CHILD_EN } from '../lib/env'
import { def, hasLine, type Speaker } from './registry'
import { LETTERS } from './letters'
import { VOCAB } from './vocab'
import { COLORS, SHAPES } from './park'

const N = CHILD_EN
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
const SPEAKERS: Speaker[] = ['dodo', 'bobo', 'momo']

// ── Sam 教豆豆（benchmark 手法 9）────────────────────────────
// 主持的恐龍故意指錯：「Hmm... is this B?」（指著 D），孩子點真正的 B 來糾正。
// 語氣是疑問、不是肯定；加重的目標字和題目句同一段音檔（Where is | B?），不會多出新音檔。
// 舊版字母表的 tease.word.*（Hmm... is this the | queen?）沒有遊戲會唸，2026-10-28 單字盤點時刪掉
for (const { letter } of LETTERS) def(`tease.letter.${letter}`, 'dodo', `Hmm... is this | ${letter}?`)
for (let n = 1; n <= 20; n++) def(`tease.num.${n}`, 'bobo', `Hmm... is this | ${NUM[n]}?`)
for (const c of COLORS) def(`tease.color.${c.id}`, 'bobo', `Hmm... is this | ${c.en}?`)
for (const s of SHAPES) def(`tease.shape.${s.id}`, 'bobo', `Hmm... is this the | ${s.en}?`)
for (const v of VOCAB) def(`tease.vocab.${v.id}`, 'momo', v.id === 'grapes' ? `Hmm... are these the | ${v.en}?` : `Hmm... is this the | ${v.en}?`)

const tease: Record<Speaker, { try: string; thanks: string; oops: string; show: string }> = {
  dodo: { try: 'Let me try!', thanks: `Oh! Thank you, ${N}!`, oops: "Hmm... I don't think so. Let's look again!", show: 'Let me show you!' },
  bobo: { try: 'Let me try!', thanks: `Oh! You're right, ${N}! Thank you!`, oops: "Hmm... I don't think so. Let's look again!", show: 'Let me show you!' },
  momo: { try: 'Let me try.', thanks: `Oh, thank you, ${N}.`, oops: "Hmm... I don't think so. Let's look again.", show: 'Let me show you.' },
}
for (const s of SPEAKERS) {
  def(`tease.try.${s}`, s, tease[s].try)
  def(`tease.thanks.${s}`, s, tease[s].thanks)
  def(`tease.oops.${s}`, s, tease[s].oops)
  // 程度校準：探測題沒答對，表示還沒學過，直接教
  def(`probe.show.${s}`, s, tease[s].show)
}

/** 這個技能有沒有「豆豆說錯」的台詞（只有「這是 X 嗎？」說得通的題型才有） */
export const teaseKey = (skill: string) => `tease.${skill.replace(':', '.')}`
export const canTease = (skill: string) => hasLine(teaseKey(skill))

// ── 功文式小練習（數字工地）──────────────────────────────────
// 沒有計時、沒有分數：波波隨著一題接一題答對越來越開心
def('quick.intro', 'bobo', "Ready? Let's go, go, go!")
export const QUICK_CHEERS = ['Yes!', 'Yes, yes!', 'Woo-hoo!', 'Wow, wow, wow!', `Hooray! You did it, ${N}!`]
QUICK_CHEERS.forEach((t, i) => def(`quick.cheer.${i}`, 'bobo', t))
def('quick.done', 'bobo', 'That was so much fun! High five!')

// 拉長的開頭音（自然發音）：字幕寫成「Sss… snake!」，拉長的音和單字分開，單字用正確拼法
// （2026-10-29 家長回饋：舊寫法 Ssssnake 一堆字母黏在一起，看起來像錯字）。
//
// 聲音是「拉長音 → 停一下 → 整個單字」。TTS 單獨唸 Sss…、Nnn… 一定拼成字母名稱（ess ess ess、en en en，
// 實測見 letters.ts 的【語音】），所以這種段不直接交給 edge-tts：scripts/gen_audio.py 只合成後面的單字（snake!），
// 從這個字的開頭切出子音、延長成 STRETCH.holdMs，停 STRETCH.gapMs，再接整個單字；逐字時間也照這個順序寫進 timings.json。

/** 延長後的長度、停頓（毫秒）；改了數字或做法就把 version 加一，音檔會重新產生 */
export const STRETCH = { holdMs: 700, gapMs: 400, version: 2 }

/** 字幕上的拉長音：字母重複 3 次＋…（Sss…） */
export const stretchSay = (letter: string) => `${letter.toUpperCase()}${letter}${letter}…`

/** 一段台詞是不是「拉長音＋單字」（Sss… snake!）；是的話拆成 Sss… 和 snake! */
export function stretchOf(text: string): { letter: string; say: string; word: string } | null {
  const m = text.match(/^(([a-z])\2\2…) ([a-z].*)$/i)
  if (!m || m[3][0].toLowerCase() !== m[2].toLowerCase()) return null
  return { letter: m[2].toLowerCase(), say: m[1], word: m[3] }
}

/** 段裡有拉長音、但不在段的開頭（gen_audio.py 只會處理整段是「Sss… snake!」的情況） */
export const misplacedStretch = (text: string) => /([a-z])\1\1…/i.test(text) && !stretchOf(text)

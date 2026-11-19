/**
 * 點錯後的短鎖（T-168，2026-11-19）：躲在哪裡、躲起來了幾隻、聽指令、故事排順序、恐龍賽跑棋共用。
 *
 * 作答選項改用 ui/tap 的 ANSWER_TAP 以後，每一下按壓都會進 choose（三歲測試 B02：不再被 0.7 秒的防連點吞掉）。
 * 點錯之後先鎖這麼久（參考豆豆收拾點錯後 busy 0.45 秒）：鎖住時再點沒有反應，不重複算錯、不重播 boing、
 * 不讓跳一下／晃一下的動畫從頭重來、不打斷剛開始念的提示；鎖解開後的下一下點錯照樣算（錯 2 次亮、錯 3 次手帶著做）。
 *
 * 用法：st 裡放 missAt: -Infinity；choose 一開頭 if (missLocked(s.missAt, performance.now())) return；點錯時 s.missAt = performance.now()。
 */
export const MISS_LOCK_MS = 450

/** 上一次點錯（missAt）到現在還在鎖裡嗎 */
export const missLocked = (missAt: number, now: number) => now - missAt < MISS_LOCK_MS

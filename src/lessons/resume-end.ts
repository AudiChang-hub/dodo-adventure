// 上完了、還沒說完晚安就離開，同一天回來（T-122、T-125）：課直接叫 onDone 回到下課畫面，但這一堂上完時已經算過了。
// 課在叫 onDone 之前先叫 resumeEnd()，LessonScreen 的 onDone 就直接回到晚安道別：不再算一堂、不會因為貼紙的間隔剛好到了變成挑貼紙
// （盲測 0f3363f 英文 seed 2：晚安道別出來時按返回，去畫畫，回來直接出現挑貼紙）。
// 不改 types.ts 的 LessonProps（三堂課共用、定好不改）；沒叫 resumeEnd 的課（數學、中文）跟以前完全一樣。
let pending = false

/** 下一次 onDone 是「回到還沒說完的晚安道別」，不是又上完一堂 */
export const resumeEnd = () => {
  pending = true
}

/** LessonScreen 的 onDone 用：這一次是不是回到晚安道別（讀了就清掉） */
export const takeResumeEnd = () => {
  const p = pending
  pending = false
  return p
}

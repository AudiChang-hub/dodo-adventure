import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Brain } from './brain'
import type { Touch } from './finger'

export interface Step {
  n: number
  /** 開始後第幾秒 */
  t: number
  live: string | null
  /** 探針看到的示範狀態（teach-card、demo、wait、hand；null 是沒在示範） */
  teaching: string | null
  heard: string[]
  sub: string | null
  shot: string
  see: string
  think: string
  feeling: string
  understood: boolean
  action: 'tap' | 'drag' | 'wait' | 'back' | 'quit'
  x?: number
  y?: number
  to?: { x: number; y: number }[]
  times: number
  seconds: number
  touch?: Touch
  thinkMs: number
  costUsd?: number
  tokens?: { in: number; out: number }
  brainError?: string
  result: string
  events: string[]
}

export interface AppIssue {
  kind: '卡住' | '無法返回' | '誤記作答' | '閃動' | '主控台錯誤' | '點了沒反應'
  title: string
  detail: string
  steps: number[]
}

export interface Run {
  lesson: string
  lessonId: string
  doneMeans: string
  seed: number
  model: string
  brain: string
  brainNote?: string
  version: string
  started: string
  ended?: string
  minutes: number
  maxSteps: number
  out: string
  steps: Step[]
  issues: AppIssue[]
  consoleErrors: { t: number; msg: string }[]
  completed: { step: number; t: number; what: string } | null
  endReason: string
  tapsWhileTeaching: number
  tapsTotal: number
  analysis?: Analysis | null
  analysisError?: string
  analysisCost?: number
}

interface Analysis {
  summary?: string
  understood?: { steps?: number[]; what?: string }[]
  stuck?: { steps?: number[]; what?: string; why?: string }[]
  impatient?: { step?: number; why?: string } | null
  suggestions?: { severity?: string; title?: string; detail?: string; steps?: number[] }[]
}

const FEEL: Record<string, string> = { happy: '😀 開心', curious: '🧐 好奇', confused: '😕 看不懂', bored: '😐 無聊', frustrated: '😣 挫折', excited: '🤩 興奮' }
const FACE: Record<string, string> = { happy: '😀', curious: '🧐', confused: '😕', bored: '😐', frustrated: '😣', excited: '🤩' }
const TEACH: Record<string, string> = { 'teach-card': '教學卡', 'teach-card-ready': '教學卡', demo: '示範中', wait: '念題目中', hand: '示範的手' }
const pad = (n: number) => String(n).padStart(3, '0')
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
/** 表格裡的字：| 和換行會弄壞表格 */
const cell = (s: string | undefined | null) => (s ?? '').replace(/\|/g, '｜').replace(/\r?\n/g, ' ')
const stepLinks = (ns: number[] | undefined) => (ns ?? []).map((n) => `[第 ${n} 步](#s${n})`).join('、')

function actionText(s: Step) {
  const t = s.touch
  if (s.action === 'tap') return `點${(t?.times ?? s.times) > 1 ? ` ${t?.times ?? s.times} 下` : ''} 想 (${s.x},${s.y})${t ? ` → 實際 (${t.got[0].x},${t.got[0].y})` : ''}${t?.extraTap ? '（手多點一下）' : ''}`
  if (s.action === 'drag') return `拖 ${1 + (s.to?.length ?? 0)} 點${t?.early ? '（拖到一半放手）' : ''}`
  if (s.action === 'wait') return `等 ${s.seconds} 秒`
  if (s.action === 'back') return 'Android 返回'
  return '不玩了'
}

/** 給分析師的時間軸（純文字） */
function timelineText(R: Run) {
  return R.steps
    .map((s) =>
      [
        `第 ${s.n} 步（${mmss(s.t)}）畫面=${s.live}${s.teaching ? `［${TEACH[s.teaching] ?? s.teaching}］` : ''}`,
        s.heard.length ? `聽到：${s.heard.map((h) => `「${h}」`).join('')}` : '',
        `看到：${s.see}`,
        `心裡想：${s.think}（${FEEL[s.feeling] ?? s.feeling}${s.understood ? '，知道要做什麼' : '，不知道要做什麼'}）`,
        `動作：${actionText(s)}`,
        `結果：${s.result}`,
        s.events.length ? `事件：${s.events.join('；')}` : '',
      ]
        .filter(Boolean)
        .join('\n  '),
    )
    .join('\n')
}

export async function writeReport(R: Run, brain: Brain, analystFile: string) {
  const OUT = R.out
  // 縮圖
  fs.mkdirSync(path.join(OUT, '縮圖'), { recursive: true })
  for (const s of R.steps) {
    const src = path.join(OUT, s.shot)
    if (fs.existsSync(src)) await sharp(src).resize(320).jpeg({ quality: 70 }).toFile(path.join(OUT, '縮圖', `${pad(s.n)}.jpg`)).catch(() => {})
  }

  // 分析
  const S = R.steps
  const backs = S.filter((s) => s.action === 'back' || s.touch?.hit === '返回鍵')
  const firstImpatient = S.find((s) => s.feeling === 'bored' || s.feeling === 'frustrated')
  const confused = S.filter((s) => !s.understood)
  const thinkAvg = S.length ? S.reduce((a, s) => a + s.thinkMs, 0) / S.length / 1000 : 0
  const cost = S.reduce((a, s) => a + (s.costUsd ?? 0), 0)
  const issueText = R.issues.length ? R.issues.map((i) => `- [${i.kind}] ${i.title}（第 ${i.steps.join('、')} 步）${i.detail ? `：${i.detail}` : ''}`).join('\n') : '（程式沒抓到 App 錯誤）'
  if (S.length && R.analysis === undefined) {
    const analyst = fs.readFileSync(analystFile, 'utf8')
    const text = [
      `課：${R.lesson}（完成的意思：${R.doneMeans}）`,
      `結果：${R.completed ? `第 ${R.completed.step} 步完成（${R.completed.what}）` : '沒有完成'}；結束原因：${R.endReason}`,
      `按返回 ${backs.length} 次；不知道要做什麼的步數 ${confused.length}/${S.length}；示範中點了 ${R.tapsWhileTeaching} 下（全部 ${R.tapsTotal} 下）；大腦平均想 ${thinkAvg.toFixed(1)} 秒`,
      '',
      '程式抓到的 App 錯誤：',
      issueText,
      '',
      '時間軸：',
      timelineText(R),
    ].join('\n')
    const a = await brain.ask({ id: 'analysis', system: analyst, systemFile: analystFile, text, maxTokens: 2500 })
    R.analysis = (a.json as Analysis) ?? null
    if (!a.json) R.analysisError = a.error ?? `分析沒有回 JSON：${a.raw.slice(0, 200)}`
    R.analysisCost = a.costUsd
  }
  const A = R.analysis ?? {}
  const totalCost = cost + (R.analysisCost ?? 0)
  const lastT = S.length ? S[S.length - 1].t : 0

  // 去過哪些畫面（連續同一個畫面合成一段）
  const LIVE: Record<string, string> = { home: '首頁', 'lesson-english': '英文字母', 'lesson-chinese': '中文課文', 'lesson-math': '數學數字', 'play-d-free': '畫畫', shelf: '故事書架', storybook: '故事書', stickers: '貼紙本' }
  // 故事裡的畫面（T-129）：英文版課文 en-<篇>、念完 endone-<篇>；以前的故事 replay-<id>、讀完了 done-<id>
  const STORY_LIVE: [RegExp, string][] = [[/^replay-/, '聽故事'], [/^en-/, '聽英文故事'], [/^(done|endone)-/, '故事讀完了']]
  const liveName = (l: string | null) => (l ? LIVE[l] ?? STORY_LIVE.find(([re]) => re.test(l))?.[1] ?? l : '?')
  const route: { name: string; from: number; to: number }[] = []
  for (const s of S) {
    const name = liveName(s.live)
    const last = route[route.length - 1]
    if (last?.name === name) last.to = s.n
    else route.push({ name, from: s.n, to: s.n })
  }
  const inLesson = S.filter((s) => liveName(s.live) === R.lesson || (R.lessonId === 'story' && /故事/.test(liveName(s.live)))).length
  const leftAt = route.find((r, i) => i > 0 && r.name !== route[0].name)

  const thumb = (n: number) => `[![第 ${n} 步](縮圖/${pad(n)}.jpg)](截圖/${pad(n)}.jpg)`
  const md: string[] = []
  md.push(`# AI 小男生測試：${R.lesson}（${R.started.slice(0, 10)}）`, '')
  md.push('> 3 歲 3 個月的小男生（由 Claude 扮演，角色設定 `tests/ai-toddler/persona.md`）自己玩，看截圖決定下一步，手指照三歲孩子的誤差偏開。', '> 這是探索測試：「真的孩子看得懂嗎」。固定腳本的回歸測試是 `npm run test:toddler`。', '')
  md.push('| 項目 | 結果 |', '|---|---|')
  md.push(`| 完成這一課 | ${R.completed ? `✅ 第 ${R.completed.step} 步（${mmss(R.completed.t)}）${R.completed.what}` : `❌ 沒有（完成的意思：${R.doneMeans}）`} |`)
  md.push(`| 玩了多久 | ${mmss(lastT)}、${S.length} 步；結束原因：${cell(R.endReason)} |`)
  md.push(`| 去過的畫面 | ${route.map((r) => `${r.name}（${r.from === r.to ? `第 ${r.from} 步` : `${r.from}～${r.to}`}）`).join(' → ')} |`)
  md.push(`| 在這一課的步數 | ${inLesson}／${S.length}${leftAt ? `；第 ${leftAt.from} 步離開（[第 ${leftAt.from - 1} 步](#s${leftAt.from - 1})想：「${cell(S[leftAt.from - 2]?.think)}」）` : ''} |`)
  md.push(`| 開始不耐煩 | ${firstImpatient ? `[第 ${firstImpatient.n} 步](#s${firstImpatient.n})（${mmss(firstImpatient.t)}）「${cell(firstImpatient.think)}」` : '沒有'}${A.impatient?.why ? `：${cell(A.impatient.why)}` : ''} |`)
  md.push(`| 按返回 | ${backs.length} 次（返回鍵 ${backs.filter((s) => s.action !== 'back').length}、Android 返回 ${backs.filter((s) => s.action === 'back').length}）${backs.length ? `：${stepLinks(backs.map((s) => s.n))}` : ''} |`)
  md.push(`| 不知道要做什麼 | ${confused.length}／${S.length} 步 |`)
  md.push(`| 示範中搶著點 | ${R.tapsWhileTeaching} 下（全部 ${R.tapsTotal} 下，探針記的） |`)
  md.push(`| 心情 | ${S.map((s) => FACE[s.feeling] ?? '·').join('')} |`)
  md.push(`| App 錯誤 | ${R.issues.length ? R.issues.map((i) => `${i.kind} ${i.steps.length} 處`).join('、') : '沒有發現'} |`)
  md.push(`| 大腦 | ${R.brain}（${R.model}），平均每步想 ${thinkAvg.toFixed(1)} 秒${totalCost ? `，約 US$${totalCost.toFixed(2)}` : ''}${R.brainNote ? `；${cell(R.brainNote)}` : ''} |`)
  md.push(`| 版本、seed | ${cell(R.version)}；seed ${R.seed} |`, '')

  md.push('## 一句話', '', A.summary ?? `（沒有分析：${R.analysisError ?? '沒有步驟'}）`, '')

  md.push('## 給開發的修正建議（依嚴重程度）', '')
  const order = { 嚴重: 0, 重要: 1, 小: 2 } as Record<string, number>
  const sug = [...(A.suggestions ?? [])].sort((a, b) => (order[a.severity ?? '小'] ?? 3) - (order[b.severity ?? '小'] ?? 3))
  if (sug.length) sug.forEach((x, i) => md.push(`${i + 1}. **［${x.severity ?? '?'}］${x.title ?? ''}**：${x.detail ?? ''}${x.steps?.length ? `（${stepLinks(x.steps)}）` : ''}`))
  else md.push('（沒有）')
  md.push('')

  md.push('## App 本身的錯誤（程式自動抓的）', '')
  if (R.issues.length) {
    md.push('| 種類 | 內容 | 哪幾步 | 細節 |', '|---|---|---|---|')
    for (const i of R.issues) md.push(`| ${i.kind} | ${cell(i.title)} | ${stepLinks(i.steps)} | ${cell(i.detail)} |`)
  } else md.push('沒有發現卡住、無法返回、誤記作答、閃動或主控台錯誤。')
  if (R.consoleErrors.length) {
    md.push('', '<details><summary>主控台錯誤（全部）</summary>', '', ...R.consoleErrors.map((e) => `- ${mmss(e.t)} ${cell(e.msg)}`), '', '</details>')
  }
  md.push('')

  md.push('## 看得懂的地方', '')
  if (A.understood?.length) for (const u of A.understood) md.push(`- ${u.what}（${stepLinks(u.steps)}）`)
  else md.push('（沒有）')
  md.push('', '## 看不懂、卡住的地方', '')
  if (A.stuck?.length)
    for (const u of A.stuck) {
      md.push(`- **${u.what}**：${u.why ?? ''}（${stepLinks(u.steps)}）`)
      if (u.steps?.[0]) md.push('', `  ${thumb(u.steps[0])}`, '')
    }
  else md.push('（沒有）')
  md.push('')

  md.push('## 時間軸', '', '| 步 | 時間 | 畫面 | 聽到 | 看到／心裡想 | 心情 | 動作 | 結果 |', '|---|---|---|---|---|---|---|---|')
  for (const s of S) {
    md.push(
      `| <a id="s${s.n}"></a>${s.n} | ${mmss(s.t)} | ${thumb(s.n)}<br>${cell(s.live)}${s.teaching ? `［${TEACH[s.teaching] ?? s.teaching}］` : ''} | ${cell(s.heard.join(' / '))} | ${cell(s.see)}<br>💭「${cell(s.think)}」 | ${FEEL[s.feeling] ?? cell(s.feeling)}${s.understood ? '' : '<br>（不知道要做什麼）'} | ${cell(actionText(s))} | ${cell(s.result)}${s.events.length ? `<br>⚠ ${cell(s.events.join('；'))}` : ''} |`,
    )
  }
  md.push('', `<sub>想一步的時間：${S.map((s) => (s.thinkMs / 1000).toFixed(0)).join(' ')} 秒。大腦想的時候 App 照常在跑，「錯過了」「示範已經結束才點」這類跟時間有關的現象可能是測試造成的。</sub>`, '')

  fs.writeFileSync(path.join(OUT, '報告.md'), md.join('\n'))
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(R, null, 2))
}

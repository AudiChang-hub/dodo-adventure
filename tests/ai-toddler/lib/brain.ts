import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 小男生的「大腦」：把截圖和提示交給 Claude，拿回一個 JSON。三種接法：
 *
 * - api：環境變數本來就有 ANTHROPIC_API_KEY 時，直接打 Messages API（圖片放在訊息裡，一次來回）。
 *        不會叫家長提供金鑰，也不會把金鑰寫進任何檔案；打失敗會自動退回 cli。
 * - cli：本機已登入的 Claude Code 無頭模式 `claude -p`（訂閱帳號的額度）。用 Read 讀截圖檔，只回 JSON。
 *        沒登入時清楚說要跑一次 `npm run ai-toddler:login`。
 * - relay：交接模式，不呼叫任何東西：把題目寫成 relay/req-NNN.json，等別人寫 relay/res-NNN.json。
 *        給已經在跑的 Claude Code 工作階段（或它的子代理）扮演小男生用，見 README〈交接模式〉。
 * - mock：不叫 Claude，亂點亂等。只用來測執行器本身（開 App、送觸控、寫報告），不花額度。
 */
export type BrainKind = 'api' | 'cli' | 'relay' | 'mock'

export interface Ask {
  /** 第幾步（檔名、交接用）；分析用 'analysis' */
  id: string
  system: string
  /** system 的檔案路徑（cli 用 --system-prompt-file，relay 給對方讀） */
  systemFile: string
  text: string
  /** 截圖的絕對路徑（沒有就只有文字） */
  image?: string
  maxTokens?: number
}

export interface Answer {
  raw: string
  json: Record<string, unknown> | null
  ms: number
  brain: BrainKind
  costUsd?: number
  inTokens?: number
  outTokens?: number
  error?: string
}

/** 從回覆裡挖出第一個完整的 JSON 物件（前後有說明文字、```json 也可以） */
export function pickJson(s: string): Record<string, unknown> | null {
  const t = s.replace(/```(?:json)?/g, '')
  for (let i = t.indexOf('{'); i >= 0; i = t.indexOf('{', i + 1)) {
    let depth = 0
    let str = false
    for (let j = i; j < t.length; j++) {
      const c = t[j]
      if (str) {
        if (c === '\\') j++
        else if (c === '"') str = false
      } else if (c === '"') str = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        try {
          return JSON.parse(t.slice(i, j + 1))
        } catch {
          break
        }
      }
    }
  }
  return null
}

// ── claude 執行檔 ─────────────────────────────────────────────

/**
 * 找 claude：CLAUDE_BIN → PATH 上的 claude → 桌面版帶的 claude.exe（CLAUDE_CODE_EXECPATH，
 * 或 %LOCALAPPDATA%\Claude-Data\*\claude-code\<版本>\*\claude.exe 最新的那個）。
 */
export function findClaude(): string | null {
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' })
  const onPath = which.status === 0 ? which.stdout.split(/\r?\n/).find((l) => l.trim() && !/\.ps1$/i.test(l)) : null
  if (onPath) return onPath.trim()
  if (process.env.CLAUDE_CODE_EXECPATH && fs.existsSync(process.env.CLAUDE_CODE_EXECPATH)) return process.env.CLAUDE_CODE_EXECPATH
  const base = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Claude-Data')
  const found: { p: string; t: number }[] = []
  const ls = (d: string) => {
    try {
      return fs.readdirSync(d)
    } catch {
      return []
    }
  }
  for (const a of ls(base))
    for (const v of ls(path.join(base, a, 'claude-code')))
      for (const h of ls(path.join(base, a, 'claude-code', v))) {
        const p = path.join(base, a, 'claude-code', v, h, 'claude.exe')
        if (fs.existsSync(p)) found.push({ p, t: fs.statSync(p).mtimeMs })
      }
  return found.sort((a, b) => b.t - a.t)[0]?.p ?? null
}

/** 子程序的環境：拿掉桌面版這個工作階段的連線資訊（不然無頭的 claude 會以為自己是這個工作階段的一部分） */
function cliEnv() {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^CLAUDE_CODE_(SESSION_ID|HOST_SESSION_ID|CHILD_SESSION|MESSAGING_|ENTRYPOINT|SIMPLE)|^CLAUDECODE$|^CLAUDE_PID$/.test(k)) delete env[k]
  return env
}

export function cliLoggedIn(bin: string): { ok: boolean; detail: string } {
  const r = spawnSync(bin, ['auth', 'status'], { encoding: 'utf8', env: cliEnv(), cwd: os.tmpdir(), timeout: 30_000 })
  const j = pickJson(r.stdout ?? '')
  if (j) return { ok: !!j.loggedIn, detail: `${j.authMethod ?? ''}` }
  return { ok: false, detail: (r.stderr || r.stdout || '').slice(0, 200) }
}

// ── 三種大腦 ───────────────────────────────────────────────

export class Brain {
  kind: BrainKind
  private bin: string | null = null
  /** 退回 cli 的原因（報告寫上） */
  note = ''
  constructor(
    want: 'auto' | BrainKind,
    readonly model: string,
    /** cli 的工作目錄（截圖要在這下面，Read 才讀得到）、relay 的交接資料夾的上一層 */
    readonly dir: string,
  ) {
    if (want === 'auto') this.kind = process.env.ANTHROPIC_API_KEY ? 'api' : 'cli'
    else this.kind = want
    if (this.kind === 'api' && !process.env.ANTHROPIC_API_KEY) throw new Error('--brain api：環境變數裡沒有 ANTHROPIC_API_KEY（不需要另外申請，用預設的 cli 就好）')
  }

  /** 開跑前檢查：cli 要找得到、要已登入 */
  check() {
    if (this.kind !== 'cli') return
    this.bin = findClaude()
    if (!this.bin) throw new Error('找不到 claude（Claude Code）。裝了桌面版的話設 CLAUDE_BIN 指到 claude.exe；或改用 --brain relay（交接模式）')
    const st = cliLoggedIn(this.bin)
    if (!st.ok)
      throw new Error(
        `本機的 claude 沒有登入（${this.bin}）。\n` +
          '請在終端機跑一次：npm run ai-toddler:login（用訂閱帳號登入，不需要 API key），\n' +
          '或改用 --brain relay（交接模式：由正在跑的 Claude Code 工作階段扮演小男生）。',
      )
  }

  async ask(q: Ask): Promise<Answer> {
    const t = Date.now()
    try {
      const r = this.kind === 'api' ? await this.api(q) : this.kind === 'cli' ? await this.cli(q) : this.kind === 'relay' ? await this.relay(q) : this.mock(q)
      return { ...r, json: pickJson(r.raw), ms: Date.now() - t, brain: this.kind }
    } catch (e) {
      const msg = String((e as Error).message ?? e)
      if (this.kind === 'api') {
        // API 不通（金鑰過期、額度、網路）：這一次和之後都改用 cli
        this.kind = 'cli'
        this.note = `API 失敗，改用 claude -p（${msg.slice(0, 120)}）`
        console.log(`[大腦] ${this.note}`)
        try {
          this.check()
          return this.ask(q)
        } catch (e2) {
          return { raw: '', json: null, ms: Date.now() - t, brain: 'cli', error: String((e2 as Error).message ?? e2) }
        }
      }
      return { raw: '', json: null, ms: Date.now() - t, brain: this.kind, error: msg }
    }
  }

  private mock(q: Ask) {
    if (!q.image) return { raw: JSON.stringify({ summary: '（mock：沒有分析）', suggestions: [] }) }
    const r = Math.random()
    const x = Math.round(80 + Math.random() * 1120)
    const y = Math.round(80 + Math.random() * 640)
    const action = r < 0.6 ? { action: 'tap', x, y } : r < 0.75 ? { action: 'drag', x, y, to: [{ x: x + 120, y: y + 40 }, { x: x + 60, y: y + 120 }] } : r < 0.95 ? { action: 'wait', seconds: 2 } : { action: 'back' }
    return { raw: JSON.stringify({ see: '（mock）', think: '（mock 亂點）', feeling: 'curious', understood: false, ...action }) }
  }

  private async api(q: Ask) {
    const content: unknown[] = []
    if (q.image) content.push({ type: 'image', source: { type: 'base64', media_type: q.image.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(q.image).toString('base64') } })
    content.push({ type: 'text', text: q.text })
    const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '')
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.model, max_tokens: q.maxTokens ?? 600, system: q.system, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(90_000),
    })
    const j = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens: number; output_tokens: number }; error?: { message: string } }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${j.error?.message ?? ''}`)
    return { raw: (j.content ?? []).map((c) => c.text ?? '').join(''), inTokens: j.usage?.input_tokens, outTokens: j.usage?.output_tokens }
  }

  private cli(q: Ask) {
    if (!this.bin) this.check()
    const prompt = q.image
      ? `先用 Read 讀這張平板截圖：${q.image}\n讀完以後照系統提示，只回一個 JSON 物件（不要其他文字）。\n\n${q.text}`
      : `${q.text}\n\n只回一個 JSON 物件（不要其他文字）。`
    const args = [
      '-p',
      '--model', this.model,
      '--output-format', 'json',
      '--system-prompt-file', q.systemFile,
      '--tools', q.image ? 'Read' : '',
      '--allowedTools', 'Read',
      '--max-turns', q.image ? '3' : '1',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--disable-slash-commands',
    ]
    return new Promise<{ raw: string; costUsd?: number; inTokens?: number; outTokens?: number }>((resolve, reject) => {
      // 提示從 stdin 送（Windows 的命令列長度有限，中文還會被轉碼）
      // npm 裝的是 claude.cmd：Windows 要經過 shell，參數加引號
      const cmd = /\.cmd$/i.test(this.bin!)
      const qa = (a: string) => (cmd ? `"${a}"` : a)
      const p = spawn(cmd ? `"${this.bin}"` : this.bin!, args.map(qa), { cwd: this.dir, env: cliEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: cmd })
      let out = ''
      let err = ''
      const timer = setTimeout(() => {
        p.kill()
        reject(new Error('claude -p 超過 120 秒沒回'))
      }, 120_000)
      p.stdout.on('data', (d) => (out += d))
      p.stderr.on('data', (d) => (err += d))
      p.on('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      p.on('exit', () => {
        clearTimeout(timer)
        const j = pickJson(out) as { result?: string; is_error?: boolean; total_cost_usd?: number; usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number } } | null
        if (!j) return reject(new Error(`claude -p 沒有回 JSON：${(err || out).slice(0, 300)}`))
        if (j.is_error) return reject(new Error(`claude -p 錯誤：${String(j.result).slice(0, 300)}`))
        const u = j.usage ?? {}
        resolve({ raw: j.result ?? '', costUsd: j.total_cost_usd, inTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), outTokens: u.output_tokens })
      })
      p.stdin.end(prompt)
    })
  }

  /** 交接：寫 req，等 res（對方用 node tests/ai-toddler/relay.mjs 拿題目、交答案） */
  private async relay(q: Ask) {
    const dir = path.join(this.dir, 'relay')
    fs.mkdirSync(dir, { recursive: true })
    const req = path.join(dir, `req-${q.id}.json`)
    const res = path.join(dir, `res-${q.id}.json`)
    fs.writeFileSync(req, JSON.stringify({ id: q.id, system: q.systemFile, image: q.image ?? null, text: q.text, answerTo: res, at: new Date().toISOString() }, null, 2))
    const limit = Number(process.env.AI_TODDLER_RELAY_TIMEOUT || 240)
    const end = Date.now() + limit * 1000
    while (Date.now() < end) {
      if (fs.existsSync(res)) {
        await new Promise((r) => setTimeout(r, 100))
        const raw = fs.readFileSync(res, 'utf8')
        if (raw.trim()) return { raw }
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    throw new Error(`交接模式：${limit} 秒內沒有人回答 ${path.basename(req)}`)
  }
}

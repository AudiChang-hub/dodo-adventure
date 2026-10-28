import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { useHold } from '../../ui/Hold'
import { useSync, syncConfigured } from '../../lib/sync'
import { resetCounts, resetLearning, type ResetCounts, type ResetStep } from '../../lib/reset'
import { CHILD_ZH } from '../../lib/env'
import './reset.css'

/** 按住多久才重置 */
const HOLD_MS = 3000

function useOnline() {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener('online', f)
      window.addEventListener('offline', f)
      return () => {
        window.removeEventListener('online', f)
        window.removeEventListener('offline', f)
      }
    },
    () => navigator.onLine,
  )
}

const STEP_LABEL: Record<ResetStep, string> = {
  cloud: '刪除雲端的學習資料',
  local: '清除這台平板的學習資料',
  reload: '重新載入，回到全新開始',
}
const STEPS: ResetStep[] = ['cloud', 'local', 'reload']

/** 按住才觸發的確認鈕：放開就歸零；鍵盤按住空白鍵或 Enter 也可以 */
function HoldToReset({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  const { progress, handlers } = useHold(HOLD_MS, onDone)
  const [nudge, setNudge] = useState(false)
  const held = useRef(false)
  const left = Math.max(1, Math.ceil((HOLD_MS / 1000) * (1 - progress)))
  const text = progress > 0 ? `繼續按住… ${left}` : `按住 ${HOLD_MS / 1000} 秒重置`

  const down = () => {
    if (disabled) return
    held.current = true
    setNudge(false)
    handlers.onPointerDown()
  }
  const up = () => {
    // 沒按滿就放開：提示要按住不放
    if (held.current && progress > 0 && progress < 1) setNudge(true)
    held.current = false
    handlers.onPointerUp()
  }
  const key = (e: KeyboardEvent, isDown: boolean) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (isDown && !e.repeat) down()
    if (!isDown) up()
  }

  return (
    <div className="hold-reset-wrap">
      <button
        type="button"
        className={`hold-reset${progress > 0 ? ' holding' : ''}`}
        style={{ ['--p' as string]: progress }}
        disabled={disabled}
        aria-label={`按住 ${HOLD_MS / 1000} 秒，重置學習進度`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
        onKeyDown={(e) => key(e, true)}
        onKeyUp={(e) => key(e, false)}
        onBlur={up}
      >
        <span className="hold-reset-label">{text}</span>
        <span className="hold-reset-fill" aria-hidden="true">
          {text}
        </span>
      </button>
      <span className={`hold-reset-nudge${nudge ? ' on' : ''}`} role="status">
        {nudge ? '要一直按住，等進度跑滿才會重置' : ''}
      </span>
    </div>
  )
}

export function ResetCard() {
  const sync = useSync()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [keepDrawings, setKeepDrawings] = useState(false)
  const [counts, setCounts] = useState<ResetCounts | null>(null)
  const [step, setStep] = useState<ResetStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const busy = step !== null

  useEffect(() => {
    if (!open) return
    let alive = true
    void resetCounts().then((c) => alive && setCounts(c))
    // 打開確認卡片：捲到看得見的地方，焦點移到標題（讀屏也會唸出來）
    requestAnimationFrame(() => {
      panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      panel.current?.querySelector<HTMLElement>('h4')?.focus({ preventScroll: true })
    })
    return () => {
      alive = false
    }
  }, [open])

  const close = () => {
    if (busy) return
    setOpen(false)
    setError(null)
    setKeepDrawings(false)
  }

  // 雲端：有登入就一起刪，所以要有網路；登入狀態還在確認時先等一下
  const signedIn = syncConfigured && !!sync.user
  const checking = syncConfigured && sync.status === 'loading'
  const needNet = signedIn && !online
  const blocked = checking || needNet

  const run = async () => {
    setError(null)
    try {
      await resetLearning({ keepDrawings, onStep: setStep })
    } catch (e) {
      setStep(null)
      setError((e as Error).message || String(e))
    }
  }

  const n = (v: number | undefined, unit: string) => (counts ? <em>{`${v} ${unit}`}</em> : null)

  return (
    <div className="card reset-card">
      <h3>重置學習進度</h3>
      <p className="sub" style={{ marginTop: 0, marginBottom: 14 }}>
        家長自己試玩過的話，交給{CHILD_ZH}之前清乾淨：作答紀錄、熟練度、收集的朋友和貼紙都會歸零，下次打開就是第一次玩、從頭教起。家長設定會留著。
      </p>
      {!open && (
        <button type="button" className="btn reset-open" onClick={() => setOpen(true)}>
          重置學習進度…
        </button>
      )}

      {open && (
        <div
          ref={panel}
          className="reset-confirm"
          role="group"
          aria-labelledby={titleId}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
          }}
        >
          <h4 id={titleId} tabIndex={-1}>
            確定要重置嗎？清掉的資料無法復原。
          </h4>

          <div className="reset-cols">
            <section className="reset-col wipe">
              <h5>
                <span className="reset-mark" aria-hidden="true" />
                會清掉
              </h5>
              <ul>
                <li>
                  作答紀錄 {n(counts?.attempts, '題')}、遊玩紀錄 {n(counts?.sessions, '次')}
                </li>
                <li>熟練度、難度與程度校準 {n(counts?.skills, '個技能')}</li>
                <li>
                  收集的朋友 {n(counts?.friends, '位')}、貼紙與里程碑
                </li>
                <li>今日冒險進度、主題輪替、每週新概念額度</li>
                <li>出門任務卡勾選、今天已玩的時間</li>
                {!keepDrawings && <li>畫畫作品 {n(counts?.drawings, '張')}</li>}
              </ul>
            </section>
            <section className="reset-col keep">
              <h5>
                <span className="reset-mark" aria-hidden="true" />
                會保留
              </h5>
              <ul>
                <li>家長設定：每日時間、站數、本週主題、音量、護眼</li>
                {syncConfigured && <li>{signedIn ? `雲端登入（${sync.user?.email}）` : '雲端登入狀態'}</li>}
                <li>App 安裝與版本更新</li>
                {keepDrawings && <li>畫畫作品 {n(counts?.drawings, '張')}</li>}
              </ul>
            </section>
          </div>

          <label className="reset-keep">
            <input type="checkbox" checked={keepDrawings} disabled={busy} onChange={(e) => setKeepDrawings(e.target.checked)} />
            <span>
              保留畫畫作品
              <small>勾選後作品集的畫留著，其他照樣清掉</small>
            </span>
          </label>

          <p className={`reset-cloud${needNet ? ' warn' : ''}`}>
            {!syncConfigured
              ? '這台平板沒有設定雲端同步，只會清這台平板。'
              : checking
                ? '正在確認雲端登入狀態…'
                : needNet
                  ? '目前沒有網路。已登入雲端時要連上網路才能重置，雲端上的紀錄才會一起刪掉，不然手機上看到的還是舊的。'
                  : signedIn
                    ? `雲端（${sync.user?.email}）上的作答紀錄、遊玩紀錄、${keepDrawings ? '' : '畫畫作品、'}進度備份也會一起刪掉。`
                    : '目前沒有登入雲端，只會清這台平板；之前同步到雲端的紀錄不會被刪。'}
          </p>

          {busy ? (
            <ol className="reset-steps" aria-live="polite">
              {STEPS.filter((s) => s !== 'cloud' || signedIn).map((s) => {
                const at = STEPS.indexOf(step!)
                const i = STEPS.indexOf(s)
                return (
                  <li key={s} className={i < at ? 'done' : i === at ? 'now' : undefined}>
                    {STEP_LABEL[s]}
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="reset-actions">
              <HoldToReset disabled={blocked} onDone={() => void run()} />
              <button type="button" className="btn" onClick={close}>
                取消
              </button>
            </div>
          )}

          {error && (
            <p className="reset-error" role="alert">
              重置沒有完成：{error.replace(/[。.]$/, '')}。這台平板的資料都還在，可以再試一次。
            </p>
          )}
        </div>
      )}
    </div>
  )
}

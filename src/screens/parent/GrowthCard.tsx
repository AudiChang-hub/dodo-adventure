// 家長區「設定與同步」的生日與年段（成長系統 G-1 的最簡單版本；完整的「成長」分頁是 G-6）
import { useState } from 'react'
import { BAND_ZH, BANDS, type Band } from '../../content/growth'
import { today } from '../../lib/db'
import { ageLabel, getGrowthState, getProfile, setBirth, setOverride, useGrowth, type Override } from '../../lib/growth'
import { requestSync } from '../../lib/sync'
import { CHILD_ZH } from '../../lib/env'

/** 年段選單的值：age 跟著年齡；fix:small 固定某段；shift:+1／shift:-1 提早、延後一段 */
type Mode = 'age' | `fix:${Band}` | 'shift:+1' | 'shift:-1'

function modeOf(ov: Override | undefined): Mode {
  if (ov?.band) return `fix:${ov.band}`
  if (ov?.shift) return ov.shift > 0 ? 'shift:+1' : 'shift:-1'
  return 'age'
}

function overrideOf(mode: Mode): Omit<Override, 'setAt'> | null {
  if (mode === 'age') return null
  if (mode.startsWith('fix:')) return { band: mode.slice(4) as Band }
  return { shift: mode === 'shift:+1' ? 1 : -1 }
}

export function GrowthCard({ onChanged }: { onChanged: () => void }) {
  const g = useGrowth()
  const profile = getProfile()
  const [y, setY] = useState(profile?.birth.slice(0, 4) ?? '')
  const [m, setM] = useState(profile?.birth.slice(5, 7) ?? '')
  const [error, setError] = useState<string | null>(null)
  const thisYear = Number(today().slice(0, 4))
  const years = Array.from({ length: 10 }, (_, i) => String(thisYear - i))
  const mode = modeOf(getGrowthState().override)

  const after = (p: Promise<void>) =>
    p
      .then(() => {
        setError(null)
        requestSync()
        onChanged()
      })
      .catch((e) => setError(String((e as Error).message ?? e)))

  const pickBirth = (ny: string, nm: string) => {
    setY(ny)
    setM(nm)
    if (ny && nm && `${ny}-${nm}` !== profile?.birth) void after(setBirth(`${ny}-${nm}`))
  }

  const clearBirth = () => {
    setY('')
    setM('')
    void after(setBirth(null))
  }

  const now = g.source === 'default' ? `${BAND_ZH[g.band]}（還沒設生日）` : `${BAND_ZH[g.band]}${g.months !== undefined ? `・${ageLabel(g.months)}` : ''}`
  const why =
    g.source === 'override' ? `家長設定的；照年齡是${BAND_ZH[g.ageBand]}。` : g.ramp ? `正在從${BAND_ZH[g.ramp.from]}慢慢放寬到${BAND_ZH[g.ramp.to]}，第 ${g.ramp.week}／4 週。` : ''

  return (
    <div className="card">
      <h3>年齡與年段</h3>
      <p className="sub" style={{ marginTop: 0 }}>
        現在：<b>{now}</b>
        {why && <>。{why}</>}
      </p>
      <div className="field">
        <div>生日（年月）</div>
        <div className="growth-birth">
          <select aria-label="出生年" value={y} onChange={(e) => pickBirth(e.target.value, m)}>
            <option value="">年</option>
            {years.map((v) => (
              <option key={v} value={v}>
                {v} 年
              </option>
            ))}
          </select>
          <select aria-label="出生月" value={m} onChange={(e) => pickBirth(y, e.target.value)}>
            <option value="">月</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((v) => (
              <option key={v} value={v}>
                {Number(v)} 月
              </option>
            ))}
          </select>
          {profile && (
            <button className="btn" onClick={clearBirth}>
              清除
            </button>
          )}
        </div>
        <div className="hint">
          只記年和月，用來算{CHILD_ZH}現在是小班、中班還是大班段。請在{CHILD_ZH}用的平板上設定：只存在那台平板和你登入的雲端帳號裡，別人讀不到，也不會寫進程式。沒設定時當作小班段，就是 App 現在的樣子。
        </div>
      </div>
      <div className="field">
        <div>年段</div>
        <div>
          <select aria-label="年段" value={mode} onChange={(e) => void after(setOverride(overrideOf(e.target.value as Mode)))}>
            <option value="age">跟著年齡（建議）</option>
            {BANDS.map((b) => (
              <option key={b} value={`fix:${b}`}>
                固定在{BAND_ZH[b]}
              </option>
            ))}
            <option value="shift:+1">比年齡提早一段</option>
            <option value="shift:-1">比年齡延後一段</option>
          </select>
        </div>
        <div className="hint">
          年段只決定「怎麼操作、看多少、玩多久」：按鈕多大、一畫面幾個選項、一句話多長、一回合幾題、故事多長。學什麼還是照{CHILD_ZH}自己的程度，沒有上限。跟著年齡時，過了換段的生日月會花 4 週慢慢放寬；家長改的會立刻換。這一版先記下年段，下一版才會套用到遊戲畫面。
        </div>
      </div>
      {error && <p style={{ color: '#8a3f2a', margin: '8px 0 0' }}>{error}</p>}
    </div>
  )
}

import { THEME_DAYS, bandSetting, followsBand, themeEnds, updateSettings, useSettings, weekTheme, type Settings } from '../../lib/settings'
import { useGrowth } from '../../lib/growth'
import { BAND_ZH } from '../../content/growth'
import { today } from '../../lib/db'
import { useSync, signIn, signOut, syncNow, syncConfigured } from '../../lib/sync'
import { setVolume } from '../../lib/audio'
import { useInstall, promptInstall } from '../../lib/install'
import { useEffect, useState } from 'react'
import { useUpdateStatus, checkForUpdate, forceUpdate, APP_VERSION, BUILD_TIME, type UpdateStatus } from '../../lib/update'
import { useAudioCache } from '../../lib/audio-cache'
import { minutesUsedToday } from '../../lib/session'
import { THEME_LABEL } from '../../content/vocab'
import { CHILD_EN, CHILD_ZH } from '../../lib/env'
import { ResetCard } from './ResetCard'
import { GrowthCard } from './GrowthCard'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div>{label}</div>
      <div>{children}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

const UPDATE_LABEL: Record<UpdateStatus, string> = {
  idle: '',
  checking: '檢查中…',
  downloading: '正在下載新版…（下載完，孩子不在遊戲中時會自動換）',
  latest: '已經是最新版',
  ready: '新版已下載，孩子回到首頁、地圖或收藏時會自動套用',
  applying: '正在套用新版，畫面會重新載入…',
  offline: '目前沒有網路，連上網路後會自動檢查',
  error: '檢查失敗，稍後會再自動檢查；一直不行可以按「強制更新」',
  stuck: '更新程式沒有回應，請按「強制更新」',
  unsupported: '這個瀏覽器不支援離線更新',
}

/** 強制更新：點一下變成「再按一次確認」，4 秒內再按才執行 */
function ForceUpdate() {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button className="btn" style={{ marginLeft: 8 }} onClick={() => (armed ? void forceUpdate() : setArmed(true))}>
      {armed ? '再按一次確認' : '強制更新'}
    </button>
  )
}

function AudioCacheLine() {
  const a = useAudioCache()
  if (!a.total) return null
  const done = a.cached >= a.total
  return (
    <p className="sub" style={{ marginBottom: 0 }}>
      離線語音：已存 {a.cached}／{a.total} 個{done ? '，沒有網路也能玩' : a.running ? '，正在背景下載…' : '，連上 Wi-Fi 時會自動補齊'}
    </p>
  )
}

function InstallStep() {
  const ins = useInstall()
  if (ins.standalone) return <li>✓ 已從主畫面圖示開啟（全螢幕模式）</li>
  if (ins.installed) return <li>✓ 已安裝。之後請從主畫面的「豆豆冒險」圖示開啟，不要用瀏覽器分頁，才會全螢幕、鎖橫向</li>
  if (ins.canPrompt)
    return (
      <li>
        安裝成 App，之後都從桌面的「豆豆冒險」圖示開啟（全螢幕、鎖橫向、可離線）
        <div className="step-action">
          <button className="btn primary" onClick={() => void promptInstall()}>
            安裝成 App
          </button>
        </div>
      </li>
    )
  return <li>用 Chrome 打開這個網址 → 右上角「⋮」選單 →「安裝應用程式」（沒有的話選「加到主畫面」→「安裝」），之後都從桌面的「豆豆冒險」圖示開啟</li>
}

function VersionCard() {
  const st = useUpdateStatus()
  const built = new Date(BUILD_TIME).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short', hour12: false })
  return (
    <div className="card">
      <h3>App 版本</h3>
      <p className="sub" style={{ marginTop: 0 }}>
        目前版本 <span className="mono">{APP_VERSION}</span>（{built} 建置）。App 回到前景時和每 30 分鐘會自動檢查；有新版會在孩子不在遊戲中時自動更新，不用手動關掉重開。
      </p>
      <button className="btn" disabled={st === 'checking' || st === 'applying' || st === 'unsupported'} onClick={() => void checkForUpdate()}>
        {st === 'ready' ? '立即更新' : '檢查更新'}
      </button>
      {st !== 'unsupported' && st !== 'applying' && <ForceUpdate />}
      {UPDATE_LABEL[st] && <span className="update-status">{UPDATE_LABEL[st]}</span>}
      <p className="sub" style={{ marginBottom: 0 }}>
        「強制更新」會直接從網路重新載入最新版，學習紀錄、設定和已下載的語音都會保留。
      </p>
      <AudioCacheLine />
    </div>
  )
}

/** 本週主題的說明：設定了就寫到哪一天自動取消 */
function themeHint(s: Settings): string {
  const base = `對應幼兒園聯絡簿這週的主題，動物村會多出這一類的英文詞（主題裡的新詞不佔每週新概念的額度）。${THEME_DAYS} 天後自動取消，下週換主題時再選一次。`
  const end = weekTheme(s) && themeEnds(s)
  if (!end) return base
  const [, m, d] = end.split('-').map(Number)
  const last = new Date(Number(end.slice(0, 4)), m - 1, d - 1)
  return `到 ${last.getMonth() + 1}/${last.getDate()}（${'日一二三四五六'[last.getDay()]}）為止。${base}`
}

export function SettingsPanel({ onChanged }: { onChanged: () => void }) {
  const s = useSettings()
  const sync = useSync()
  // 每日上限、護眼休息：家長沒改過就跟著年段（FRAME-6、7），年段換了要重新畫
  const growth = useGrowth()
  const daily = bandSetting('dailyMinutes', s)
  const eyeBreak = bandSetting('eyeBreakEvery', s)
  const set = (p: Partial<Settings>) => {
    void updateSettings(p)
    onChanged()
  }

  return (
    <>
      <h2>設定與同步</h2>
      <p className="sub">
        孩子的稱呼：{CHILD_ZH}／{CHILD_EN}（語音已預先產生，要改名需要重新產生音檔）。今天已玩 {minutesUsedToday()} 分鐘。
      </p>

      <GrowthCard onChanged={onChanged} />

      <div className="card">
        <h3>使用時間與內容</h3>
        <Field label="每日時間上限" hint={`時間到了豆豆會說晚安，畫面進入休息模式。${!followsBand('dailyMinutes', s) ? '' : `沒改過時跟著年段（${BAND_ZH[growth.band]}預設 ${growth.frame.dailyMinutes} 分鐘）。`}`}>
          <select value={daily} onChange={(e) => set({ dailyMinutes: Number(e.target.value) })}>
            {[10, 15, 20, 25, 30, 45, 60, 0].map((m) => (
              <option key={m} value={m}>
                {m ? `${m} 分鐘` : '不限制'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="今日冒險的站數" hint="每站約 3–5 分鐘。">
          <select value={s.activitiesPerDay} onChange={(e) => set({ activitiesPerDay: Number(e.target.value) })}>
            {[3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} 站
              </option>
            ))}
          </select>
        </Field>
        <Field label="自由探索（地圖）" hint="預設要先完成今日冒險才能自己選站點玩。">
          <select value={s.freePlay} onChange={(e) => set({ freePlay: e.target.value as Settings['freePlay'] })}>
            <option value="after">完成今日冒險後開放</option>
            <option value="always">一直開放</option>
          </select>
        </Field>
        <Field label="本週主題" hint={themeHint(s)}>
          <select value={weekTheme(s) ?? 'all'} onChange={(e) => set({ theme: e.target.value as Settings['theme'] })}>
            <option value="all">不指定</option>
            {Object.entries(THEME_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {weekTheme(s) && s.themeSetAt !== today() && (
            <button className="btn" style={{ marginLeft: 10 }} onClick={() => set({ themeSetAt: today() })}>
              再延長一週
            </button>
          )}
        </Field>
        <Field
          label="單字中文提示"
          hint="教學卡教一個英文單字時，接著用中文說一次，再用英文說一次，例如「Apple → 蘋果 → Apple」，字幕也會顯示中文。孩子學會這個字以後就只說英文；在「單字清單」勾了「他不認得」的字，會重新帶回中文。其他語音都是英文。"
        >
          <select value={s.zhBridge ? 'on' : 'off'} onChange={(e) => set({ zhBridge: e.target.value === 'on' })}>
            <option value="on">開</option>
            <option value="off">關</option>
          </select>
        </Field>
        <Field
          label="著色：幫忙不塗出線"
          hint="預設關閉：完全自由塗，手畫到哪裡顏色就到哪裡，從線外畫進來、一筆畫過好幾塊都會有顏色（黑線一直在最上面，塗出線也好看）。開啟後，一筆只會塗在下筆的那一塊：從車子外面開始畫，整筆都塗不到車子上，孩子可能會以為畫了沒有顏色。"
        >
          <select value={s.coloringHelp ? 'on' : 'off'} onChange={(e) => set({ coloringHelp: e.target.value === 'on' })}>
            <option value="on">開啟</option>
            <option value="off">關閉</option>
          </select>
        </Field>
        <Field label="音量">
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.1}
            value={s.volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              setVolume(v)
              set({ volume: v })
            }}
            style={{ width: 240 }}
          />
        </Field>
      </div>

      <div className="card">
        <h3>護眼</h3>
        <Field label="看遠方休息" hint={`連續玩一段時間後，豆豆會請孩子看遠方 20 秒；只會在兩個遊戲之間出現。${followsBand('eyeBreakEvery', s) ? `沒改過時跟著年段（${BAND_ZH[growth.band]}預設每 ${growth.frame.eyeBreakEvery[1]} 分鐘）。` : ''}`}>
          <select value={eyeBreak} onChange={(e) => set({ eyeBreakEvery: Number(e.target.value) })}>
            {[5, 10, 15, 0].map((m) => (
              <option key={m} value={m}>
                {m ? `每 ${m} 分鐘` : '關閉'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="夜間暖色" hint="晚上 7 點到早上 6 點，畫面自動偏暖、減少藍光。">
          <select value={s.nightWarm ? 'on' : 'off'} onChange={(e) => set({ nightWarm: e.target.value === 'on' })}>
            <option value="on">開啟</option>
            <option value="off">關閉</option>
          </select>
        </Field>
        <ol className="steps" style={{ marginTop: 10 }}>
          <li>平板側邊的 NXTPAPER 鍵或設定中開啟「NXTPAPER 護眼模式」，配合 App 的紙感配色效果最好。</li>
          <li>亮度跟室內光線差不多就好，不要比周圍亮；避免在暗處或強光直射下使用。</li>
          <li>平板放在桌上、距離眼睛 30 公分以上，坐姿端正。</li>
          <li>國健署建議 2–5 歲每天螢幕時間不超過 1 小時；目前每日上限設為 {daily || '不限'} 分鐘。</li>
        </ol>
      </div>

      <div className="card">
        <h3>雲端同步</h3>
        {!syncConfigured ? (
          <p className="empty">尚未設定 Firebase。照 README 的「啟用雲端同步」步驟設定後，這裡就會出現登入按鈕。紀錄目前存在這台平板上，可以用「作答紀錄」頁的匯出備份。</p>
        ) : sync.user ? (
          <>
            <p style={{ margin: '0 0 12px' }}>
              已登入：{sync.user.email}
              <br />
              <span className="sub">
                狀態：{{ idle: '已同步', syncing: '同步中…', error: '同步失敗', loading: '啟動中', signedOut: '未登入', off: '未設定' }[sync.status]}
                {sync.last ? `（上次 ${new Date(sync.last).toLocaleTimeString('zh-TW')}）` : ''}
              </span>
            </p>
            {sync.error && <p style={{ color: '#8a3f2a' }}>{sync.error}</p>}
            <button className="btn primary" onClick={() => void syncNow()}>
              立即同步
            </button>
            <button className="btn" onClick={() => void signOut()}>
              登出
            </button>
          </>
        ) : (
          <>
            <p className="sub" style={{ marginTop: 0 }}>用家長的 Google 帳號登入一次，之後有網路就會自動上傳。在手機上打開同一個網址、登入同一個帳號，就能看到{CHILD_ZH}的紀錄。</p>
            {sync.error && <p style={{ color: '#8a3f2a' }}>{sync.error}</p>}
            <button className="btn primary" onClick={() => void signIn()}>
              用 Google 登入
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h3>鎖定平板（防止孩子跳出 App）</h3>
        <p className="sub" style={{ marginTop: 0 }}>網頁本身擋不住回到桌面的手勢，真正的鎖要用 Android 內建的「螢幕固定」。設定一次就好：</p>
        <ol className="steps">
          <InstallStep />
          <li>設定 → 安全性與隱私權（或「安全性」）→ 更多安全性設定 →「應用程式固定」/「螢幕固定」→ 開啟</li>
          <li>同一頁開啟「取消固定前要求輸入 PIN」</li>
          <li>打開豆豆冒險 → 從底部往上滑叫出最近使用的應用程式 → 點 App 上方的圖示 →「固定」</li>
          <li>要解除時：同時按住「返回」與「總覽」（手勢操作則是從底部往上滑並停住），再輸入 PIN</li>
        </ol>
        <p className="sub">各家 Android 選單名稱略有不同，在設定裡搜尋「固定」最快。</p>
      </div>

      <VersionCard />

      <ResetCard />
    </>
  )
}

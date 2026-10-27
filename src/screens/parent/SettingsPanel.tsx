import { updateSettings, useSettings, type Settings } from '../../lib/settings'
import { useSync, signIn, signOut, syncNow, syncConfigured } from '../../lib/sync'
import { setVolume } from '../../lib/audio'
import { isStandalone } from '../../lib/lock'
import { minutesUsedToday } from '../../lib/session'
import { THEME_LABEL } from '../../content/vocab'
import { CHILD_EN, CHILD_ZH } from '../../lib/env'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div>{label}</div>
      <div>{children}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function SettingsPanel({ onChanged }: { onChanged: () => void }) {
  const s = useSettings()
  const sync = useSync()
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

      <div className="card">
        <h3>使用時間與內容</h3>
        <Field label="每日時間上限" hint="時間到了豆豆會說晚安，畫面進入休息模式。">
          <select value={s.dailyMinutes} onChange={(e) => set({ dailyMinutes: Number(e.target.value) })}>
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
        <Field label="本週主題" hint="可以對應幼兒園聯絡簿的主題，動物村會多出這一類的詞。">
          <select value={s.theme} onChange={(e) => set({ theme: e.target.value as Settings['theme'] })}>
            <option value="all">不指定</option>
            {Object.entries(THEME_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
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
        <Field label="看遠方休息" hint="連續玩一段時間後，豆豆會請孩子看遠方 20 秒；只會在兩個遊戲之間出現。">
          <select value={s.eyeBreakEvery} onChange={(e) => set({ eyeBreakEvery: Number(e.target.value) })}>
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
          <li>國健署建議 2–5 歲每天螢幕時間不超過 1 小時；目前每日上限設為 {s.dailyMinutes || '不限'} 分鐘。</li>
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
          <li>{isStandalone() ? '✓ 已從主畫面圖示開啟（全螢幕模式）' : '用 Chrome 打開這個網址 → 右上角選單 →「加到主畫面」/「安裝應用程式」，之後都從桌面的「豆豆冒險」圖示開啟'}</li>
          <li>設定 → 安全性與隱私權（或「安全性」）→ 更多安全性設定 →「應用程式固定」/「螢幕固定」→ 開啟</li>
          <li>同一頁開啟「取消固定前要求輸入 PIN」</li>
          <li>打開豆豆冒險 → 從底部往上滑叫出最近使用的應用程式 → 點 App 上方的圖示 →「固定」</li>
          <li>要解除時：同時按住「返回」與「總覽」（手勢操作則是從底部往上滑並停住），再輸入 PIN</li>
        </ol>
        <p className="sub">各家 Android 選單名稱略有不同，在設定裡搜尋「固定」最快。</p>
      </div>
    </>
  )
}

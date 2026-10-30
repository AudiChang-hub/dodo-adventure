import { useMemo, useState, type ReactElement } from 'react'
import { go } from '../../lib/nav'
import { useSync, syncConfigured } from '../../lib/sync'
import { useParentData, type ParentData } from './data'
import { Overview } from './Overview'
import { Progress } from './Progress'
import { Records } from './Records'
import { Gallery } from './Gallery'
import { Outing } from './Outing'
import { SettingsPanel } from './SettingsPanel'
import { WordList } from './WordList'
import { StoryReview } from './StoryReview'
import { reviewStatus, useReview } from '../../lib/review'
import { WEEKLY, draftChapters } from '../../content/story'
import { RESET_DONE_KEY } from '../../lib/reset'
import { CHILD_ZH } from '../../lib/env'
import './parent.css'
import './reset.css'

const TABS = [
  ['overview', '總覽'],
  ['outing', '出門任務卡'],
  ['progress', '學習進度'],
  ['records', '作答紀錄'],
  ['words', '單字清單'],
  ['gallery', '作品集'],
  ['review', '故事審稿'],
  ['settings', '設定與同步'],
] as const

type Tab = (typeof TABS)[number][0]

/** 重置學習進度後重新載入：讀一次就清掉，只顯示這一次 */
function takeResetDone(): boolean {
  try {
    const v = sessionStorage.getItem(RESET_DONE_KEY)
    sessionStorage.removeItem(RESET_DONE_KEY)
    return !!v
  } catch {
    return false
  }
}

export function Parent() {
  const [tab, setTab] = useState<Tab>('overview')
  const sync = useSync()
  const [source, setSource] = useState<'local' | 'cloud'>('local')
  const [reload, setReload] = useState(0)
  const { data, error } = useParentData(source, reload)
  const [resetDone, setResetDone] = useState(takeResetDone)

  const canCloud = syncConfigured && !!sync.user
  // 故事審稿：待審的章數標在分頁上
  const verdicts = useReview()
  const toReview = useMemo(() => WEEKLY.flatMap(draftChapters).filter((c) => reviewStatus(c) === 'pending').length, [verdicts])
  const body = useMemo(() => {
    if (tab === 'settings') return <SettingsPanel onChanged={() => setReload((r) => r + 1)} />
    // 審稿不用讀學習資料（手機上也能直接審）
    if (tab === 'review') return <StoryReview />
    if (error) return <p className="empty">讀取雲端資料失敗：{error}</p>
    if (!data) return <p className="empty">讀取中…</p>
    const views: Record<Exclude<Tab, 'settings' | 'review'>, (d: ParentData) => ReactElement> = {
      overview: (d) => <Overview d={d} />,
      progress: (d) => <Progress d={d} />,
      records: (d) => <Records d={d} />,
      gallery: (d) => <Gallery d={d} />,
      outing: (d) => <Outing d={d} />,
      words: (d) => <WordList d={d} />,
    }
    return views[tab](data)
  }, [tab, data, error])

  return (
    <div className="parent">
      <nav>
        <h1>家長區</h1>
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : undefined} onClick={() => setTab(k)}>
            {label}
            {k === 'review' && toReview > 0 && <span className="nav-count" aria-label={`${toReview} 章待審`}>{toReview}</span>}
          </button>
        ))}
        <div className="spacer" />
        {canCloud && (
          <button onClick={() => setSource((s) => (s === 'local' ? 'cloud' : 'local'))}>資料來源：{source === 'local' ? '這台裝置' : '雲端'}</button>
        )}
        <button onClick={() => go({ name: 'home' })}>← 回到孩子模式</button>
      </nav>
      <main>
        {resetDone && (
          <div className="reset-done" role="status">
            <p>
              <strong>已重置學習進度。</strong>這台平板回到全新開始，{CHILD_ZH}下次打開會從第一次玩、從頭教起；家長設定都還在。
            </p>
            <button type="button" onClick={() => setResetDone(false)}>
              知道了
            </button>
          </div>
        )}
        {body}
      </main>
    </div>
  )
}

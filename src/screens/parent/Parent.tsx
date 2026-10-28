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
import './parent.css'

const TABS = [
  ['overview', '總覽'],
  ['outing', '出門任務卡'],
  ['progress', '學習進度'],
  ['records', '作答紀錄'],
  ['gallery', '作品集'],
  ['settings', '設定與同步'],
] as const

type Tab = (typeof TABS)[number][0]

export function Parent() {
  const [tab, setTab] = useState<Tab>('overview')
  const sync = useSync()
  const [source, setSource] = useState<'local' | 'cloud'>('local')
  const [reload, setReload] = useState(0)
  const { data, error } = useParentData(source, reload)

  const canCloud = syncConfigured && !!sync.user
  const body = useMemo(() => {
    if (tab === 'settings') return <SettingsPanel onChanged={() => setReload((r) => r + 1)} />
    if (error) return <p className="empty">讀取雲端資料失敗：{error}</p>
    if (!data) return <p className="empty">讀取中…</p>
    const views: Record<Exclude<Tab, 'settings'>, (d: ParentData) => ReactElement> = {
      overview: (d) => <Overview d={d} />,
      progress: (d) => <Progress d={d} />,
      records: (d) => <Records d={d} />,
      gallery: (d) => <Gallery d={d} />,
      outing: (d) => <Outing d={d} />,
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
          </button>
        ))}
        <div className="spacer" />
        {canCloud && (
          <button onClick={() => setSource((s) => (s === 'local' ? 'cloud' : 'local'))}>資料來源：{source === 'local' ? '這台裝置' : '雲端'}</button>
        )}
        <button onClick={() => go({ name: 'home' })}>← 回到孩子模式</button>
      </nav>
      <main>{body}</main>
    </div>
  )
}

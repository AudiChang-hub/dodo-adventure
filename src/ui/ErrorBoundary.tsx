import { Component, useEffect, type ReactNode } from 'react'

/**
 * 畫面執行中當掉時，React 會把整棵樹拆掉、留下一片空白。
 * 這裡接住錯誤，改顯示 index.html 裡給家長看的說明（錯誤訊息、重新載入、清除快取）。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    window.__dodoBoot?.fail(error instanceof Error ? error : new Error(String(error)), 'runtime')
  }

  render() {
    if (!this.state.failed) return this.props.children
    // 萬一 index.html 的失敗畫面不在（例如開發時改過 index.html），至少不要留白
    return window.__dodoBoot ? null : <p style={{ padding: 24, fontSize: 18 }}>豆豆冒險出了點問題，請重新開啟 App。</p>
  }
}

/** 第一次畫完後通知 index.html：淡出並移除啟動畫面 */
export function BootSignal() {
  useEffect(() => window.__dodoBoot?.ok(), [])
  return null
}

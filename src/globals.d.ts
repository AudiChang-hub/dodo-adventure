// 建置時由 vite.config.ts 的 define 注入
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

// index.html 的啟動／失敗畫面（inline script，不經過 bundle）
interface Window {
  __dodoBoot?: {
    version: string
    /** 記一筆到 localStorage，下次出錯時會一起顯示 */
    log: (msg: string) => void
    /** React 第一次畫完 */
    ok: () => void
    /** 掛載前出錯；kind 為 'runtime' 時表示執行中當掉 */
    fail: (err: unknown, kind?: string) => void
  }
}

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// 家長區顯示的版本：git 短 hash（有未提交改動加 *）＋建置時間
function gitVersion() {
  try {
    const hash = execSync('git rev-parse --short HEAD').toString().trim()
    const dirty = execSync('git status --porcelain').toString().trim() !== ''
    return hash + (dirty ? '*' : '')
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  base: '/dodo-adventure/',
  define: {
    __APP_VERSION__: JSON.stringify(gitVersion()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      // 不要 autoUpdate：它會在新版啟用時立刻重新載入，可能打斷遊戲；改由 src/lib/update.ts 挑時機
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      manifest: {
        name: '豆豆冒險',
        short_name: '豆豆冒險',
        description: '和豆豆、波波、莫莫一起學英文、數學、國語',
        lang: 'zh-Hant-TW',
        // 固定 id，之後改 start_url 也不會被當成另一個 App
        id: '/dodo-adventure/',
        start_url: '/dodo-adventure/',
        scope: '/dodo-adventure/',
        // 從主畫面開啟：全螢幕、鎖橫向；不支援 fullscreen 的瀏覽器退回 standalone
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#F3EEE4',
        theme_color: '#F3EEE4',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})

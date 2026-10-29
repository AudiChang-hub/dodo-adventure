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

const APP_VERSION = gitVersion()

export default defineConfig({
  base: '/dodo-adventure/',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    // index.html 的啟動／失敗畫面不經過 bundle，版本要在這裡填進去，家長拍照回報時才看得出是哪一版
    {
      name: 'boot-version',
      transformIndexHtml: (html) => html.replace('__APP_VERSION__', APP_VERSION),
    },
    VitePWA({
      // 不要 autoUpdate：它會在新版啟用時立刻重新載入，可能打斷遊戲；改由 src/lib/update.ts 挑時機
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: {
        // 語音（約 2000 個 mp3、28MB）刻意留在 precache：孩子可能在沒網路時玩，沒聲音的遊戲對 3 歲小孩等於壞掉。
        // 不會造成白畫面：新版要等全部下載完（installed → waiting）才會通知 update.ts，下載中舊版照常服務；
        // 下載失敗只是這次不更新。沒變的檔案靠 revision 比對直接沿用，平常更新只下載有改的檔案。
        // 中文三明治（BreezyVoice）的音檔在 audio/zh/，已經產生好的字列在 audio/zh/index.json，一樣離線可用
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}', 'audio/timings.json', 'audio/zh/index.json'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      manifest: {
        name: '豆豆冒險',
        short_name: '豆豆冒險',
        description: '和豆豆、波波、莫莫一起用英文學字母、數字、詞彙與運筆',
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

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

/** public/audio 底下所有 mp3（相對於 audio/），App 在背景照這份清單把語音補進快取（lib/audio-cache.ts） */
function audioFiles(dir = 'public/audio', prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? audioFiles(`${dir}/${e.name}`, `${prefix}${e.name}/`) : e.name.endsWith('.mp3') ? [prefix + e.name] : [],
  )
}

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
    {
      name: 'audio-files',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'audio/files.json', source: JSON.stringify(audioFiles()) })
      },
    },
    VitePWA({
      // 不要 autoUpdate：它會在新版啟用時立刻重新載入，可能打斷遊戲；改由 src/lib/update.ts 挑時機
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: {
        // 語音（約 2100 個 mp3、31MB）不放 precache：precache 要全部下載成功新版才裝得起來，
        // 紙感平板的 Wi-Fi 常常有一兩個檔案失敗，結果新版一直裝不起來、平板停在舊版好幾天（T-54）。
        // 新版只帶程式（約 2MB，幾秒裝好）；語音改成下面的 runtime 快取：播過就存，
        // App 也會在背景照 audio/files.json 慢慢補齊（lib/audio-cache.ts），所以沒網路時一樣有聲音。
        // 音檔檔名包含內容與後製版本（lib/clip.ts），內容改了檔名就會變，CacheFirst 不會拿到舊的聲音
        // 故事（G-8）：劇本是 content/story 的程式碼，跟著 JS 一起 precache；故事的語音一樣走 dodo-audio，
        // 冒險一開始講就先把這一篇剩下的章、下一篇的語音補進來（lib/story.ts 的 warmStory，依篇快取），沒網路也講得完
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'audio/timings.json', 'audio/zh/index.json', 'audio/files.json'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/audio\/.+\.mp3$/,
            handler: 'CacheFirst',
            options: { cacheName: 'dodo-audio', cacheableResponse: { statuses: [200] } },
          },
        ],
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

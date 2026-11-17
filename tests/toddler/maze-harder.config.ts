import { defineConfig } from '@playwright/test'
import base from './t118.config'

// 迷宮走完的「難一點／再一個／回首頁」定點檢查（只給這次修正用，不在三歲測試的清單裡）
export default defineConfig({
  ...base,
  testMatch: /maze-harder-check\.spec\.ts/,
  outputDir: '../../test-results/maze-harder/pw',
  workers: 1,
  use: { ...base.use, viewport: { width: 1200, height: 786 } },
  webServer: {
    ...(base.webServer as object),
    command: `npx vite preview --port ${process.env.TODDLER_PORT ?? 4694} --strictPort --outDir ${process.env.MAZE_DIST ?? 'test-results/maze-harder/dist'}`,
  } as never,
})

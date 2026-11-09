import { defineConfig } from '@playwright/test'
import base from './t118.config'

// T-122 定點檢查（只給這次開發用）：英文課描到一半放手、選擇題答完的大箭頭
export default defineConfig({
  ...base,
  testMatch: /t122-check\.spec\.ts/,
  outputDir: '../../test-results/t122/pw',
  webServer: {
    ...(base.webServer as object),
    command: `npx vite preview --port ${process.env.TODDLER_PORT ?? 4693} --strictPort --outDir ${process.env.T122_DIST ?? 'test-results/t122/dist'}`,
  } as never,
})

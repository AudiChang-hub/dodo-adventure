// Vite 執行時讀 import.meta.env；產生音檔的 Node 腳本則讀 process.env
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
const nodeEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env

export function env(key: string): string | undefined {
  return viteEnv?.[key] ?? nodeEnv?.[key]
}

export const CHILD_ZH = env('VITE_CHILD_NAME_ZH') || '小朋友'
export const CHILD_EN = env('VITE_CHILD_NAME_EN') || 'buddy'

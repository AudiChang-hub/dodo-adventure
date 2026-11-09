// 審稿佇列：每週自動產生的劇本（由 scripts/story-weekly.ts 產生這個檔案，不要手改）。
// 每一份劇本是同一個資料夾裡的 JSON；通過自動檢查就直接進孩子端，家長在家長區「本週新故事」撤下的不播（lib/review.ts）。
import type { StoryDraft } from '../draft'
import _J02 from './J02.json'
import _p1_a02 from './p1-a02.json'
import _A02 from './A02.json'
import _p1_a03 from './p1-a03.json'
import _A04 from './A04.json'
import _p1_a04 from './p1-a04.json'
import _P01 from './P01.json'
import _p1_a05 from './p1-a05.json'
import _A06 from './A06.json'

export const WEEKLY_DRAFTS: StoryDraft[] = [_J02 as unknown as StoryDraft, _p1_a02 as unknown as StoryDraft, _A02 as unknown as StoryDraft, _p1_a03 as unknown as StoryDraft, _A04 as unknown as StoryDraft, _p1_a04 as unknown as StoryDraft, _P01 as unknown as StoryDraft, _p1_a05 as unknown as StoryDraft, _A06 as unknown as StoryDraft]

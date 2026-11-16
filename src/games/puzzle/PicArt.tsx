// 拼圖的一張圖：手排的用故事插畫（StoryPage），組合圖用拼圖自己的構圖（FreeArtView，T-159 第二版）。
import { memo } from 'react'
import { StoryPage } from '../../art/storybook/Page'
import { FreeArtView } from './FreeArt'
import type { PuzzlePic } from './pics-hand'

export const PicArt = memo(function PicArt({ pic }: { pic: PuzzlePic }) {
  return pic.free ? <FreeArtView art={pic.free} /> : <StoryPage art={pic.art!} />
})

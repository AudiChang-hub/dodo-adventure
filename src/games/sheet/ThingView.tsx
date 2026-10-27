import { memo } from 'react'
import { Emoji } from '../../art/Emoji'
import { Balloon } from '../../art/Balloon'
import { Solid } from '../../art/Solid'
import { ShapeSvg } from '../../ui/Visual'
import type { Thing } from '../../content/games-worksheet'

/** 學習單上的一個東西，填滿父層（父層決定大小） */
export const ThingView = memo(function ThingView({ v }: { v: Thing }) {
  switch (v.t) {
    case 'emoji':
      return <Emoji name={v.icon} />
    case 'balloon':
      return <Balloon kind={v.kind} hex={v.hex} />
    case 'shape':
      return <ShapeSvg shape={v.shape} hex={v.hex} />
    case 'solid':
      return <Solid solid={v.solid} hex={v.hex} />
  }
})

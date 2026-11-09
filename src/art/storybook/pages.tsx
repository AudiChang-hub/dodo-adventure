// 故事時間手繪插畫的樣張（T-119）：龜兔賽跑 3 頁、挪亞方舟 1 頁。一頁 960×600，最多 3 個角色（準則 LOAD-1），每個角色在平板上 ≥ 120 px。
// 場景只有天空、地面、一兩樣東西；全部平塗、粗外框、靜止（準則 MOTION-2、DISPLAY-1）。念到名字的那個角色跳一下（hop），只跳一次。
import type { ReactElement } from 'react'
import { ARK_BOX, Ark, Banner, Cloud, ELEPHANT_BOX, Elephant, Place, RABBIT_BOX, Rabbit, Sun, TREE_BOX, TURTLE_BOX, Tree, Turtle } from './chars'

export interface StoryPage {
  id: string
  /** 故事 */
  book: string
  /** 這一頁念的英文（跟現在的劇本同一句）；`|` 前面是名字（念到它，那個角色跳一下） */
  en: string
  /** 念到第幾個字時誰跳一下 */
  hops: { word: number; actor: string }[]
  draw: (hop: Record<string, number>) => ReactElement
}

/** 天空＋地面（＋一條跑道） */
function Land({ sky = '#E3EEF2', ground = '#CFE3B5', path = true }: { sky?: string; ground?: string; path?: boolean }) {
  return (
    <g>
      <rect width={960} height={600} fill={sky} />
      <path d="M0 404 Q240 376 480 396 T960 390 V600 H0 Z" fill={ground} stroke="#9FBF86" strokeWidth={5} strokeLinejoin="round" />
      {path && <path d="M0 470 Q480 444 960 470 L960 540 Q480 512 0 540 Z" fill="#EBDDBB" stroke="#CDB98C" strokeWidth={5} strokeLinejoin="round" />}
    </g>
  )
}

/** 地上幾撮草（三筆，粗線） */
function Grass({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y} l-8 -18 M${x} ${y} l0 -22 M${x} ${y} l8 -18`} stroke="#86AE6E" strokeWidth={5} strokeLinecap="round" fill="none" />
}

/** 睡覺的 Zzz（字體一樣是圓圓的 Fredoka） */
function Zzz({ x, y }: { x: number; y: number }) {
  return (
    <g fill="#8E95C9" fontFamily="Fredoka, sans-serif" fontWeight={600}>
      <text x={x} y={y} fontSize={30}>
        z
      </text>
      <text x={x + 24} y={y - 28} fontSize={40}>
        z
      </text>
      <text x={x + 54} y={y - 66} fontSize={52}>
        Z
      </text>
    </g>
  )
}

export const PAGES: StoryPage[] = [
  {
    id: 'rt-fast',
    book: '龜兔賽跑',
    en: 'Rabbit is fast. Then… a nap!',
    hops: [{ word: 0, actor: 'rabbit' }],
    draw: (h) => (
      <g>
        <Land />
        <Sun x={110} y={92} />
        <Cloud x={420} y={90} />
        <Cloud x={700} y={140} k={0.8} />
        {/* 遠遠的終點那邊有一棵大樹（下一頁兔子在這裡睡覺） */}
        <Place x={820} y={420} k={0.72} box={TREE_BOX}>
          <Tree />
        </Place>
        <Place x={120} y={470} k={0.62} box={{ w: 300, h: 290 }}>
          <Banner />
        </Place>
        <Grass x={340} y={430} />
        <Grass x={600} y={420} />
        <Place x={190} y={512} k={0.72} box={TURTLE_BOX.walk} id="turtle">
          <Turtle pose="walk" />
        </Place>
        <Place x={560} y={510} k={1.25} box={RABBIT_BOX.run} id="rabbit" hop={h.rabbit}>
          <Rabbit pose="run" />
        </Place>
      </g>
    ),
  },
  {
    id: 'rt-walk',
    book: '龜兔賽跑',
    en: 'Turtle walks on. Step, step, step.',
    hops: [{ word: 0, actor: 'turtle' }],
    draw: (h) => (
      <g>
        <Land />
        <Cloud x={120} y={86} />
        <Cloud x={430} y={130} k={0.75} />
        <Place x={720} y={450} k={1.18} box={TREE_BOX}>
          <Tree />
        </Place>
        <Place x={740} y={500} k={1.1} box={RABBIT_BOX.sleep} id="rabbit">
          <Rabbit pose="sleep" />
        </Place>
        <Zzz x={822} y={300} />
        <Grass x={80} y={440} />
        <Grass x={430} y={432} />
        <Place x={290} y={520} k={1.05} box={TURTLE_BOX.walk} id="turtle" hop={h.turtle}>
          <Turtle pose="walk" />
        </Place>
      </g>
    ),
  },
  {
    id: 'rt-win',
    book: '龜兔賽跑',
    en: 'Turtle wins! Slow and steady!',
    hops: [{ word: 0, actor: 'turtle' }],
    draw: (h) => (
      <g>
        <Land />
        <Sun x={850} y={92} />
        <Cloud x={300} y={80} k={0.85} />
        <Place x={600} y={490} k={1.05} box={{ w: 300, h: 290 }}>
          <Banner />
        </Place>
        <Place x={180} y={520} k={0.82} box={RABBIT_BOX.stand} id="rabbit">
          <Rabbit pose="stand" />
        </Place>
        <Grass x={860} y={430} />
        <Place x={610} y={528} k={1.08} box={TURTLE_BOX.cheer} id="turtle" hop={h.turtle}>
          <Turtle pose="cheer" />
        </Place>
      </g>
    ),
  },
  {
    id: 'noah-elephants',
    book: '挪亞方舟',
    en: 'Two elephants.',
    hops: [{ word: 1, actor: 'elephants' }],
    draw: (h) => (
      <g>
        <Land path={false} />
        <Cloud x={110} y={90} />
        <Cloud x={420} y={70} k={0.8} />
        <Place x={700} y={470} k={1.15} box={ARK_BOX}>
          <Ark />
        </Place>
        {/* 走上方舟的木板：從地上斜斜接到船門 */}
        <path d="M300 470 L560 404 L572 428 L316 492 Z" fill="#DCC398" stroke="#8F6E4B" strokeWidth={5} strokeLinejoin="round" />
        <Grass x={70} y={470} />
        <Place x={170} y={500} k={0.78} box={ELEPHANT_BOX} id="elephant1" hop={h.elephants}>
          <Elephant />
        </Place>
        <Place x={430} y={442} k={0.72} box={ELEPHANT_BOX} id="elephant2" hop={h.elephants} delay={140}>
          <Elephant />
        </Place>
      </g>
    ),
  },
]

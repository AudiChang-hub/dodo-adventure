// 故事插畫的角色庫（T-119）：角色、東西的 id → 怎麼畫（每個姿勢）。清單和大小在 ./meta.ts。
// 三隻恐龍直接用 art/Dino.tsx 同一份圖（造型、顏色、表情跟 App 一模一樣）。
import type { ReactElement } from 'react'
import { DinoArt, type Mood } from '../Dino'
import type { Speaker } from '../../content/lines'
import { Ark, Banner, Elephant, Rabbit, Tree, Turtle, type RabbitPose, type TurtlePose } from './chars'
import { Bird, Butterfly, Cat, Chicken, Cow, Dove, Fish, Frog, Giraffe, Lion, Monkey, Octopus, Pig, Sauropod, Sheep, Snail, Teddy, Trex, Whale, Zebra } from './animals'
import * as T from './things'
import { Zzz } from './kit'

function Dino({ who, pose }: { who: Speaker; pose: string }) {
  const mood: Mood = pose === 'cheer' ? 'cheer' : pose === 'sleep' ? 'sleep' : 'happy'
  return (
    <g>
      <DinoArt who={who} mood={mood} />
      {pose === 'sleep' && <Zzz x={who === 'bobo' ? 214 : 170} y={who === 'momo' ? 40 : 60} k={0.7} />}
    </g>
  )
}

/** 方舟（full：動物從屋頂探出頭來，大家在船裡暖暖的） */
function ArkFull() {
  return (
    <g>
      {/* 長頸鹿從屋頂後面探出脖子、大象從船尾探出頭（身體藏在方舟後面） */}
      <g transform="translate(96 -6) scale(0.62)">
        <Giraffe />
      </g>
      <g transform="translate(286 60) scale(0.5)">
        <Elephant />
      </g>
      <g transform="translate(0 40)">
        <Ark />
      </g>
    </g>
  )
}

const DRAW: Record<string, (pose: string) => ReactElement> = {
  dodo: (p) => <Dino who="dodo" pose={p} />,
  bobo: (p) => <Dino who="bobo" pose={p} />,
  momo: (p) => <Dino who="momo" pose={p} />,
  egg: (p) => <T.Egg sleep={p === 'sleep'} />,
  rabbit: (p) =>
    p === 'sleep' ? (
      <g>
        <Rabbit pose="sleep" />
        <Zzz x={190} y={62} k={0.6} />
      </g>
    ) : (
      <Rabbit pose={p as RabbitPose} />
    ),
  turtle: (p) => <Turtle pose={p as TurtlePose} />,
  elephant: () => <Elephant />,
  giraffe: () => <Giraffe />,
  zebra: () => <Zebra />,
  lion: () => <Lion />,
  monkey: () => <Monkey />,
  cow: () => <Cow />,
  sheep: () => <Sheep />,
  pig: () => <Pig />,
  chicken: () => <Chicken />,
  cat: () => <Cat />,
  frog: () => <Frog />,
  snail: () => <Snail />,
  fish: () => <Fish />,
  octopus: () => <Octopus />,
  whale: () => <Whale />,
  butterfly: () => <Butterfly />,
  bird: () => <Bird />,
  dove: (p) => <Dove pose={p} />,
  sauropod: () => <Sauropod />,
  trex: () => <Trex />,
  teddy: () => <Teddy />,
  tree: () => <Tree />,
  seedling: () => <T.Seedling />,
  banner: () => <Banner />,
  trophy: () => <T.Trophy />,
  ark: (p) => (p === 'full' ? <ArkFull /> : <Ark />),
  hammer: () => <T.Hammer />,
  planks: () => <T.Planks />,
  apples: () => <T.Apples />,
  'book-open': () => <T.BookOpen />,
  'book-closed': () => <T.BookClosed />,
  door: (p) => <T.Door open={p === 'open'} />,
  house: () => <T.House />,
  bed: () => <T.Bed />,
  yarn: () => <T.Yarn />,
  blanket: () => <T.Blanket />,
  basket: (p) => <T.Basket pose={p} />,
  nest: () => <T.Nest Teddy={Teddy} />,
  'dino-nest': () => <T.DinoNest />,
  bus: () => <T.Bus />,
  'bus-stop': () => <T.BusStop />,
  'traffic-light': () => <T.TrafficLight />,
  bridge: () => <T.Bridge />,
  footprints: () => <T.Footprints />,
  volcano: () => <T.Volcano />,
  tractor: () => <T.Tractor />,
  'fire-truck': () => <T.FireTruck />,
  'police-car': () => <T.PoliceCar />,
  ladder: () => <T.Ladder />,
  water: () => <T.Water />,
  sailboat: () => <T.Sailboat />,
  'beach-umbrella': () => <T.BeachUmbrella />,
  umbrella: () => <T.Umbrella />,
  banana: () => <T.Banana />,
  grapes: () => <T.Grapes />,
  watermelon: () => <T.Watermelon />,
  blocks: () => <T.Blocks />,
  truck: () => <T.Truck />,
  cone: () => <T.Cone />,
  frame: () => <T.Frame />,
  'new-house': () => <T.NewHouse />,
  bathtub: () => <T.Bathtub />,
  toothbrush: () => <T.Toothbrush />,
  gift: () => <T.Gift />,
  balloons: () => <T.Balloons />,
  cake: () => <T.Cake />,
  confetti: () => <T.Confetti />,
  kite: () => <T.Kite />,
  sandwich: () => <T.Sandwich />,
  'picnic-blanket': () => <T.PicnicBlanket />,
  sun: (p) => <T.Sun face={p === 'face'} />,
  moon: () => <T.Moon />,
  rainbow: () => <T.Rainbow />,
  raincloud: () => <T.RainCloud />,
}

/** 畫一個角色庫裡的角色（沒有這個 id 回傳 null，Page 改畫 Fluent Emoji） */
export function drawItem(id: string, pose: string): ReactElement | null {
  return DRAW[id]?.(pose) ?? null
}

export const LIBRARY_IDS = Object.keys(DRAW)

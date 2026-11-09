// 故事插畫的動物（T-119）：自己畫的原創造型，每個角色固定一種顏色和記號，每次出場都一樣。
// 大小照 ./meta.ts 的 poses（自己的 viewBox，腳底在下緣、面向右邊）。
import { Blob, Cheek, Eye, INK, Open, Smile, line } from './kit'

// ── 長頸鹿 230×330：奶油黃、大塊橘色斑點 ──
export function Giraffe() {
  const s = line('#BF8E45')
  const sp = '#DDA35C'
  return (
    <g>
      <g {...s} fill="#F2CF8A">
        <rect x={52} y={234} width={22} height={92} rx={10} fill="#E3BC72" />
        <rect x={126} y={234} width={22} height={92} rx={10} fill="#E3BC72" />
        <path d="M30 196 C18 206 14 222 18 236" fill="none" />
        <ellipse cx={100} cy={214} rx={74} ry={46} />
        <rect x={74} y={234} width={24} height={92} rx={10} />
        <rect x={148} y={234} width={24} height={92} rx={10} />
        <path d="M128 196 L162 72 L196 84 L172 206 Z" />
        <rect x={166} y={22} width={8} height={26} rx={4} fill="#C99A55" />
        <rect x={186} y={20} width={8} height={26} rx={4} fill="#C99A55" />
        <ellipse cx={186} cy={60} rx={36} ry={27} />
        <ellipse cx={152} cy={48} rx={14} ry={8} transform="rotate(-25 152 48)" />
      </g>
      <g fill={sp}>
        <ellipse cx={70} cy={204} rx={16} ry={12} />
        <ellipse cx={112} cy={196} rx={14} ry={11} />
        <ellipse cx={96} cy={232} rx={13} ry={9} />
        <ellipse cx={142} cy={222} rx={11} ry={9} />
        <ellipse cx={170} cy={150} rx={9} ry={11} />
        <ellipse cx={164} cy={108} rx={8} ry={9} />
      </g>
      <Eye x={196} y={54} />
      <Cheek x={206} y={70} r={8} />
      <Smile x={206} y={76} w={7} />
    </g>
  )
}

// ── 斑馬 260×220：白色、四條粗粗的灰條紋、短短的鬃毛 ──
export function Zebra() {
  const s = line('#6B645A')
  return (
    <g>
      <g {...s}>
        <rect x={58} y={150} width={22} height={64} rx={10} fill="#E6E1D8" />
        <rect x={150} y={150} width={22} height={64} rx={10} fill="#E6E1D8" />
        <path d="M36 112 C22 122 20 140 26 152" fill="none" />
        <ellipse cx={112} cy={128} rx={78} ry={46} fill="#FBF8F2" />
        <rect x={80} y={150} width={22} height={66} rx={10} fill="#FBF8F2" />
        <rect x={170} y={150} width={22} height={66} rx={10} fill="#FBF8F2" />
        <path d="M156 110 L188 40 L226 60 L196 126 Z" fill="#FBF8F2" />
        <path d="M160 92 C162 70 172 46 186 34" fill="none" stroke="#6B645A" strokeWidth={12} />
        <ellipse cx={218} cy={66} rx={34} ry={24} transform="rotate(20 218 66)" fill="#FBF8F2" />
        <ellipse cx={240} cy={78} rx={14} ry={11} fill="#C9C2B6" />
        <ellipse cx={194} cy={36} rx={7} ry={14} transform="rotate(-20 194 36)" fill="#FBF8F2" />
      </g>
      <g stroke="#6B645A" strokeWidth={10} strokeLinecap="round" fill="none">
        <path d="M80 92 Q86 120 78 150" />
        <path d="M110 84 Q118 116 112 154" />
        <path d="M140 88 Q148 116 142 152" />
        <path d="M182 60 L198 72" />
      </g>
      <Eye x={214} y={58} />
      <Cheek x={226} y={66} r={6} />
    </g>
  )
}

// ── 獅子 260×220：沙黃色、圓圓的橘色鬃毛、尾巴尖一撮毛 ──
export function Lion() {
  const s = line('#B88A45')
  const mane: [number, number, number][] = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2
    return [196 + Math.cos(a) * 40, 86 + Math.sin(a) * 40, 22]
  })
  return (
    <g>
      <g {...s}>
        <rect x={56} y={146} width={24} height={66} rx={11} fill="#E3B26C" />
        <rect x={140} y={146} width={24} height={66} rx={11} fill="#E3B26C" />
        <path d="M34 118 C10 112 4 92 14 82" fill="none" />
        <circle cx={14} cy={80} r={11} fill="#D9925A" />
        <ellipse cx={108} cy={134} rx={78} ry={44} fill="#EDC27E" />
        <rect x={78} y={150} width={24} height={64} rx={11} fill="#EDC27E" />
        <rect x={160} y={150} width={24} height={64} rx={11} fill="#EDC27E" />
      </g>
      <Blob c={mane} fill="#D9925A" stroke="#B26F3C" />
      <circle cx={196} cy={86} r={40} fill="#EDC27E" {...s} />
      <ellipse cx={210} cy={104} rx={16} ry={11} fill="#F6DDB0" />
      <ellipse cx={214} cy={96} rx={7} ry={5} fill="#8A5A3A" />
      <Eye x={188} y={78} />
      <Eye x={218} y={76} />
      <Cheek x={180} y={98} r={7} />
      <Smile x={212} y={110} w={7} />
    </g>
  )
}

// ── 猴子 200×230：咖啡色、淺色的臉和大耳朵、捲捲的長尾巴 ──
export function Monkey() {
  const s = line('#8A6440')
  return (
    <g>
      <path d="M150 196 C196 196 196 140 172 132 C156 128 152 150 166 152" fill="none" {...line('#8A6440', 12)} />
      <path d="M150 196 C196 196 196 140 172 132 C156 128 152 150 166 152" fill="none" stroke="#C49A6C" strokeWidth={6} strokeLinecap="round" />
      <g {...s} fill="#C49A6C">
        <ellipse cx={74} cy={214} rx={22} ry={13} />
        <ellipse cx={126} cy={214} rx={22} ry={13} />
        <ellipse cx={100} cy={172} rx={46} ry={48} />
        <ellipse cx={52} cy={150} rx={12} ry={30} transform="rotate(30 52 150)" />
        <ellipse cx={150} cy={140} rx={12} ry={32} transform="rotate(-40 150 140)" />
        <circle cx={46} cy={82} r={20} fill="#F1D7B5" />
        <circle cx={154} cy={82} r={20} fill="#F1D7B5" />
        <circle cx={100} cy={82} r={50} />
      </g>
      <ellipse cx={176} cy={112} rx={12} ry={14} fill="#C49A6C" {...s} />
      <path d="M66 92 C66 62 86 56 100 70 C114 56 134 62 134 92 C134 116 116 126 100 126 C84 126 66 116 66 92 Z" fill="#F1D7B5" {...line('#8A6440', 4)} />
      <ellipse cx={100} cy={174} rx={28} ry={26} fill="#F1D7B5" />
      <Eye x={86} y={86} />
      <Eye x={114} y={86} />
      <Open x={100} y={106} w={9} />
    </g>
  )
}

// ── 牛 270×220：白色、三塊咖啡色斑、粉紅鼻子、小小的角 ──
export function Cow() {
  const s = line('#8B6B55')
  return (
    <g>
      <g {...s}>
        <rect x={58} y={146} width={24} height={68} rx={10} fill="#E9E3D9" />
        <rect x={146} y={146} width={24} height={68} rx={10} fill="#E9E3D9" />
        <path d="M34 112 C20 126 20 144 24 158" fill="none" />
        <ellipse cx={110} cy={130} rx={82} ry={48} fill="#FBF8F2" />
        <rect x={82} y={150} width={24} height={66} rx={10} fill="#FBF8F2" />
        <rect x={168} y={150} width={24} height={66} rx={10} fill="#FBF8F2" />
      </g>
      <g fill="#A88468">
        <ellipse cx={80} cy={112} rx={22} ry={16} />
        <ellipse cx={134} cy={144} rx={18} ry={13} />
        <ellipse cx={142} cy={104} rx={13} ry={10} />
      </g>
      <g {...s}>
        <path d="M196 54 C194 40 200 30 210 26" fill="none" stroke="#C9B48A" strokeWidth={8} />
        <path d="M234 54 C238 40 234 30 226 24" fill="none" stroke="#C9B48A" strokeWidth={8} />
        <ellipse cx={180} cy={68} rx={18} ry={10} transform="rotate(-20 180 68)" fill="#FBF8F2" />
        <ellipse cx={216} cy={82} rx={36} ry={34} fill="#FBF8F2" />
        <ellipse cx={226} cy={108} rx={30} ry={20} fill="#F4B6B0" />
      </g>
      <ellipse cx={216} cy={108} rx={4} ry={5} fill="#C9837C" />
      <ellipse cx={236} cy={108} rx={4} ry={5} fill="#C9837C" />
      <Eye x={204} y={74} />
      <Eye x={232} y={72} />
    </g>
  )
}

// ── 綿羊 250×200：奶油色的一團羊毛、灰色的臉和腳 ──
export function Sheep() {
  const wool: [number, number, number][] = [
    [62, 108, 34],
    [100, 88, 38],
    [142, 92, 36],
    [170, 120, 32],
    [130, 140, 36],
    [84, 140, 36],
  ]
  return (
    <g>
      <g {...line('#6B645A')} fill="#8C8478">
        <rect x={70} y={150} width={18} height={44} rx={8} />
        <rect x={140} y={150} width={18} height={44} rx={8} />
      </g>
      <Blob c={wool} fill="#FBF6EC" stroke="#B9A58E" />
      <g {...line('#6B645A')} fill="#8C8478">
        <ellipse cx={176} cy={72} rx={16} ry={8} transform="rotate(-25 176 72)" />
        <ellipse cx={204} cy={90} rx={30} ry={34} />
      </g>
      <Blob c={[[196, 58, 16], [214, 56, 14]]} fill="#FBF6EC" stroke="#B9A58E" />
      <Eye x={198} y={86} r={5.5} />
      <Eye x={220} y={86} r={5.5} />
      <Cheek x={190} y={104} r={6} />
      <Smile x={212} y={108} w={7} />
    </g>
  )
}

// ── 豬 250×190：粉紅色、大鼻子、捲捲的尾巴 ──
export function Pig() {
  const s = line('#C9837C')
  return (
    <g>
      <path d="M36 108 C18 104 20 86 32 90 C42 94 34 104 24 100" fill="none" {...line('#C9837C', 5)} />
      <g {...s} fill="#F4B6B0">
        <rect x={64} y={140} width={22} height={46} rx={10} fill="#EBA39C" />
        <rect x={142} y={140} width={22} height={46} rx={10} fill="#EBA39C" />
        <ellipse cx={110} cy={120} rx={78} ry={50} />
        <rect x={86} y={144} width={22} height={44} rx={10} />
        <rect x={164} y={144} width={22} height={44} rx={10} />
        <path d="M176 66 L184 36 L202 62 Z" />
        <circle cx={200} cy={92} r={38} />
        <ellipse cx={230} cy={100} rx={18} ry={15} fill="#F7C8C2" />
      </g>
      <ellipse cx={224} cy={100} rx={3.5} ry={5} fill="#C9837C" />
      <ellipse cx={236} cy={100} rx={3.5} ry={5} fill="#C9837C" />
      <Eye x={196} y={80} />
      <Cheek x={190} y={104} r={7} />
    </g>
  )
}

// ── 公雞 200×220：白色、紅雞冠、黃嘴巴和腳、尾巴三根羽毛 ──
export function Chicken() {
  const s = line('#B9A58E')
  return (
    <g>
      <g {...line('#C2A140')} fill="none">
        <path d="M86 176 L82 214 M74 214 H92" />
        <path d="M118 176 L122 214 M114 214 H132" />
      </g>
      <g {...s} fill="#FBF8F2">
        <path d="M60 120 C30 100 26 64 44 52 C52 82 64 96 74 104 Z" fill="#8DB8D8" stroke="#5F89B0" />
        <path d="M66 112 C46 80 52 46 70 40 C70 70 76 90 84 100 Z" fill="#9FCB9A" stroke="#6A9E6B" />
        <ellipse cx={104} cy={134} rx={58} ry={48} />
        <ellipse cx={92} cy={136} rx={26} ry={18} transform="rotate(-15 92 136)" />
        <ellipse cx={144} cy={82} rx={30} ry={34} />
      </g>
      <path d="M128 52 C126 36 138 32 142 44 C146 30 160 32 156 48 C166 44 170 56 158 60 Z" fill="#E8907E" {...line('#BF6A5C')} />
      <path d="M170 82 L194 90 L170 98 Z" fill="#EED37E" {...line('#C2A140', 4)} />
      <path d="M166 102 C172 112 168 122 160 118 Z" fill="#E8907E" {...line('#BF6A5C', 4)} />
      <Eye x={152} y={78} />
      <Cheek x={140} y={96} r={6} />
    </g>
  )
}

// ── 貓 200×210：薑黃色、三條粗粗的深色紋、坐著 ──
export function Cat() {
  const s = line('#C08F4F')
  return (
    <g>
      <path d="M150 196 C196 196 196 140 178 120" fill="none" {...line('#C08F4F', 14)} />
      <path d="M150 196 C196 196 196 140 178 120" fill="none" stroke="#F3C793" strokeWidth={8} strokeLinecap="round" />
      <g {...s} fill="#F3C793">
        <path d="M58 202 C46 150 66 112 100 112 C134 112 154 150 142 202 Z" />
        <ellipse cx={80} cy={202} rx={18} ry={9} />
        <ellipse cx={120} cy={202} rx={18} ry={9} />
        <path d="M58 70 L56 22 L92 48 Z" />
        <path d="M142 70 L144 22 L108 48 Z" />
        <ellipse cx={100} cy={78} rx={52} ry={44} />
      </g>
      <path d="M66 32 L70 56 M134 32 L130 56" stroke="#F4C1B6" strokeWidth={8} strokeLinecap="round" />
      <g stroke="#D9A563" strokeWidth={8} strokeLinecap="round" fill="none">
        <path d="M100 36 V52" />
        <path d="M80 140 Q100 148 120 140" />
        <path d="M76 164 Q100 172 124 164" />
      </g>
      <ellipse cx={100} cy={156} rx={20} ry={30} fill="#FBF0DC" opacity={0.9} />
      <Eye x={82} y={76} />
      <Eye x={118} y={76} />
      <path d="M95 92 L105 92 L100 98 Z" fill="#E98F86" />
      <path d="M92 104 Q96 108 100 103 Q104 108 108 104" fill="none" {...line(INK, 3)} />
      <Cheek x={72} y={96} r={7} />
      <Cheek x={128} y={96} r={7} />
    </g>
  )
}

// ── 青蛙 210×170：萊姆綠、眼睛長在頭上、寬寬的笑 ──
export function Frog() {
  const s = line('#6E9A42')
  return (
    <g>
      <g {...s} fill="#A8D27A">
        <ellipse cx={46} cy={150} rx={34} ry={16} />
        <ellipse cx={164} cy={150} rx={34} ry={16} />
        <ellipse cx={105} cy={116} rx={80} ry={48} />
        <circle cx={66} cy={56} r={28} />
        <circle cx={144} cy={56} r={28} />
        <ellipse cx={80} cy={160} rx={14} ry={8} />
        <ellipse cx={130} cy={160} rx={14} ry={8} />
      </g>
      <ellipse cx={105} cy={130} rx={50} ry={26} fill="#D6EBB8" />
      <circle cx={66} cy={56} r={16} fill="#FBF8F2" />
      <circle cx={144} cy={56} r={16} fill="#FBF8F2" />
      <Eye x={68} y={58} r={7} />
      <Eye x={146} y={58} r={7} />
      <path d="M68 104 Q105 132 142 104" fill="none" {...line(INK, 4)} />
      <Cheek x={54} y={100} r={9} />
      <Cheek x={156} y={100} r={9} />
    </g>
  )
}

// ── 蝸牛 240×170：奶茶色的身體、粗粗的螺旋殼 ──
export function Snail() {
  return (
    <g>
      <path d="M20 160 C40 140 150 136 214 140 C232 142 236 160 220 164 Z" fill="#F0DDB0" {...line('#B39A63')} />
      <path d="M196 140 C192 110 196 92 206 80" fill="none" {...line('#B39A63', 12)} />
      <path d="M196 140 C192 110 196 92 206 80" fill="none" stroke="#F0DDB0" strokeWidth={6} strokeLinecap="round" />
      <path d="M190 74 L184 46 M214 74 L224 48" {...line('#B39A63', 5)} />
      <circle cx={184} cy={42} r={7} fill="#B39A63" />
      <circle cx={225} cy={44} r={7} fill="#B39A63" />
      <circle cx={206} cy={92} r={28} fill="#F0DDB0" {...line('#B39A63')} />
      <circle cx={104} cy={94} r={62} fill="#E8B98C" {...line('#B07E54')} />
      <path d="M104 94 m0 -10 a10 10 0 1 1 -10 10 a22 22 0 1 1 22 22 a34 34 0 1 1 -34 -34 a46 46 0 1 1 46 46" fill="none" stroke="#C6925F" strokeWidth={7} strokeLinecap="round" />
      <Eye x={198} y={88} r={5.5} />
      <Eye x={218} y={88} r={5.5} />
      <Smile x={210} y={104} w={7} />
    </g>
  )
}

// ── 熱帶魚 220×150：芥末黃、兩條藍色粗條紋 ──
export function Fish() {
  return (
    <g>
      <path d="M40 76 L6 40 L10 112 Z" fill="#F6C66B" {...line('#C29A3E')} />
      <path d="M96 30 C112 6 140 10 150 30 Z" fill="#F6C66B" {...line('#C29A3E')} />
      <ellipse cx={116} cy={78} rx={84} ry={52} fill="#F6C66B" {...line('#C29A3E')} />
      <path d="M90 32 Q78 78 90 124" fill="none" stroke="#8DB8D8" strokeWidth={14} />
      <path d="M134 28 Q122 78 134 128" fill="none" stroke="#8DB8D8" strokeWidth={14} />
      <ellipse cx={116} cy={78} rx={84} ry={52} fill="none" {...line('#C29A3E')} />
      <Eye x={168} y={66} r={7} />
      <Smile x={184} y={90} w={7} />
      <Cheek x={160} y={88} r={7} />
    </g>
  )
}

// ── 章魚 220×220：粉紫色、六隻彎彎的腳 ──
export function Octopus() {
  const s = line('#B36F96')
  const legs = [36, 64, 92, 126, 154, 182]
  return (
    <g>
      {legs.map((x, i) => (
        <path key={i} d={`M${x + (110 - x) * 0.25} 140 C${x} 170 ${x + (i % 2 ? 18 : -18)} 186 ${x} 212`} fill="none" stroke="#B36F96" strokeWidth={24} strokeLinecap="round" />
      ))}
      {legs.map((x, i) => (
        <path key={`i${i}`} d={`M${x + (110 - x) * 0.25} 140 C${x} 170 ${x + (i % 2 ? 18 : -18)} 186 ${x} 212`} fill="none" stroke="#E3A6C8" strokeWidth={14} strokeLinecap="round" />
      ))}
      <path d="M30 140 C30 60 64 20 110 20 C156 20 190 60 190 140 Z" fill="#E3A6C8" {...s} />
      <Eye x={88} y={98} r={8} />
      <Eye x={132} y={98} r={8} />
      <Cheek x={74} y={120} r={9} />
      <Cheek x={146} y={120} r={9} />
      <Smile x={110} y={122} w={10} />
    </g>
  )
}

// ── 鯨魚 330×230：藍色、淺色的肚子、頭上噴水 ──
export function Whale() {
  const s = line('#5F89B0')
  return (
    <g>
      <g fill="#BFDDEB" {...line('#7FA9C9', 5)}>
        <path d="M206 64 C204 40 196 26 184 18 M206 64 C210 40 222 26 236 20 M206 64 V14" fill="none" />
        <circle cx={182} cy={16} r={8} />
        <circle cx={206} cy={10} r={8} />
        <circle cx={238} cy={18} r={8} />
      </g>
      <path d="M56 150 L8 112 L18 196 Z" fill="#8DB8D8" {...s} />
      <path d="M44 156 C44 92 110 66 196 66 C268 66 316 104 316 158 C316 202 270 222 184 222 C104 222 44 206 44 156 Z" fill="#8DB8D8" {...s} />
      <path d="M96 186 C150 214 260 214 304 176 C300 204 264 220 184 220 C126 220 104 210 96 186 Z" fill="#D8E7F5" />
      <path d="M150 182 C162 206 186 214 196 200" fill="#8DB8D8" {...s} />
      <Eye x={262} y={132} r={8} />
      <Smile x={276} y={160} w={14} />
      <Cheek x={248} y={156} r={10} />
    </g>
  )
}

// ── 蝴蝶 180×150：橘色、黃色的翅膀 ──
export function Butterfly() {
  return (
    <g>
      <g {...line('#C2864A')}>
        <ellipse cx={58} cy={58} rx={44} ry={40} fill="#F2B07A" />
        <ellipse cx={122} cy={58} rx={44} ry={40} fill="#F2B07A" />
        <ellipse cx={62} cy={112} rx={32} ry={28} fill="#EED37E" />
        <ellipse cx={118} cy={112} rx={32} ry={28} fill="#EED37E" />
      </g>
      <circle cx={58} cy={58} r={13} fill="#FBF8F2" />
      <circle cx={122} cy={58} r={13} fill="#FBF8F2" />
      <rect x={82} y={36} width={16} height={104} rx={8} fill="#8A6440" />
      <path d="M86 38 C80 20 70 14 62 12 M94 38 C100 20 110 14 118 12" fill="none" {...line('#8A6440', 4)} />
      <circle cx={62} cy={12} r={5} fill="#8A6440" />
      <circle cx={118} cy={12} r={5} fill="#8A6440" />
    </g>
  )
}

// ── 小鳥 160×140：黃色、橘色嘴巴 ──
export function Bird() {
  return (
    <g>
      <path d="M40 80 L6 62 L12 100 Z" fill="#EED37E" {...line('#C2A140')} />
      <g {...line('#C2A140', 4)}>
        <path d="M70 118 L66 136 M92 118 L96 136" fill="none" />
      </g>
      <ellipse cx={80} cy={86} rx={50} ry={36} fill="#EED37E" {...line('#C2A140')} />
      <circle cx={112} cy={56} r={30} fill="#EED37E" {...line('#C2A140')} />
      <path d="M58 82 C70 100 92 100 100 88" fill="#E3C25E" {...line('#C2A140', 4)} />
      <path d="M140 54 L158 62 L140 70 Z" fill="#EDB07A" {...line('#C2864A', 4)} />
      <Eye x={120} y={50} r={6} />
      <Cheek x={112} y={68} r={6} />
    </g>
  )
}

// ── 鴿子 240×170：白色、張開翅膀飛；leaf：嘴巴叼一片綠葉子 ──
export function Dove({ pose }: { pose: string }) {
  const s = line('#9CB0C2')
  return (
    <g>
      <path d="M54 92 L10 74 L18 118 Z" fill="#FBF8F2" {...s} />
      <path d="M96 84 C80 40 96 8 136 6 C128 40 130 66 140 86 Z" fill="#FBF8F2" {...s} />
      <ellipse cx={110} cy={104} rx={66} ry={34} fill="#FBF8F2" {...s} />
      <path d="M100 104 C90 140 110 166 156 164 C140 140 136 124 132 104 Z" fill="#E6ECF2" {...s} />
      <circle cx={176} cy={80} r={28} fill="#FBF8F2" {...s} />
      <path d="M200 78 L222 86 L200 94 Z" fill="#EDB07A" {...line('#C2864A', 4)} />
      {pose === 'leaf' && (
        <g>
          <path d="M214 92 C228 98 238 112 236 130 C220 126 210 112 214 92 Z" fill="#9FCB9A" {...line('#6A9E6B', 4)} />
          <path d="M216 96 L232 126" stroke="#6A9E6B" strokeWidth={3} />
        </g>
      )}
      <Eye x={182} y={74} r={6} />
      <Cheek x={172} y={92} r={6} />
    </g>
  )
}

// ── 長脖子恐龍 300×300：淡紫色（跟藍色的莫莫分得開）、背上一排圓點 ──
export function Sauropod() {
  const s = line('#8076B5')
  const neck = 'M196 210 C214 160 220 110 236 64'
  return (
    <g>
      <g {...s} fill="#C3B6E3">
        <path d="M80 240 C46 246 18 236 4 214 C30 222 54 222 82 216 Z" />
        <rect x={84} y={236} width={34} height={60} rx={14} fill="#AFA1D6" />
        <rect x={168} y={236} width={34} height={60} rx={14} fill="#AFA1D6" />
        <ellipse cx={150} cy={226} rx={92} ry={52} />
        <rect x={108} y={240} width={34} height={58} rx={14} />
        <rect x={194} y={240} width={34} height={58} rx={14} />
      </g>
      <path d={neck} fill="none" stroke="#8076B5" strokeWidth={44} strokeLinecap="round" />
      <path d={neck} fill="none" stroke="#C3B6E3" strokeWidth={34} strokeLinecap="round" />
      <ellipse cx={252} cy={54} rx={42} ry={28} fill="#C3B6E3" {...s} />
      <g fill="#E1D9F3">
        <circle cx={120} cy={196} r={10} />
        <circle cx={156} cy={186} r={8} />
        <circle cx={92} cy={214} r={7} />
        <circle cx={214} cy={150} r={6} />
      </g>
      <Eye x={258} y={44} r={7} />
      <Cheek x={272} y={62} r={7} />
      <Smile x={274} y={68} w={8} />
    </g>
  )
}

// ── 暴龍 260×260：珊瑚粉、大大的頭、短短的手，友善的笑 ──
export function Trex() {
  const s = line('#B8655A')
  return (
    <g>
      <g {...s} fill="#E99A8E">
        <path d="M70 170 C40 176 14 166 2 140 C26 152 50 152 76 146 Z" />
        <rect x={78} y={196} width={34} height={58} rx={14} fill="#D9867A" />
        <ellipse cx={116} cy={164} rx={60} ry={54} />
        <rect x={112} y={200} width={36} height={56} rx={14} />
        <ellipse cx={92} cy={256} rx={26} ry={9} fill="#D9867A" />
        <ellipse cx={136} cy={256} rx={26} ry={9} />
        <path d="M150 120 C150 60 178 26 214 26 C246 26 256 50 256 72 C256 100 236 116 200 116 L176 132 Z" />
        <path d="M166 164 L190 170 L184 182" fill="none" />
      </g>
      <ellipse cx={128} cy={180} rx={30} ry={30} fill="#F6C6BC" />
      <path d="M180 92 Q218 106 252 86" fill="none" {...line(INK, 4)} />
      <g fill="#FBF8F2">
        <path d="M196 98 l5 10 l5 -10 Z" />
        <path d="M216 100 l5 10 l5 -10 Z" />
      </g>
      <Eye x={210} y={52} r={8} />
      <Cheek x={230} y={70} r={8} />
    </g>
  )
}

// ── 泰迪熊 190×210：咖啡色、淺色的嘴巴、紅色領結 ──
export function Teddy() {
  const s = line('#8F6E4B')
  return (
    <g>
      <g {...s} fill="#C9A57E">
        <ellipse cx={62} cy={192} rx={26} ry={16} />
        <ellipse cx={128} cy={192} rx={26} ry={16} />
        <ellipse cx={95} cy={150} rx={52} ry={50} />
        <ellipse cx={42} cy={136} rx={16} ry={26} transform="rotate(25 42 136)" />
        <ellipse cx={148} cy={136} rx={16} ry={26} transform="rotate(-25 148 136)" />
        <circle cx={50} cy={36} r={20} />
        <circle cx={140} cy={36} r={20} />
        <circle cx={95} cy={70} r={50} />
      </g>
      <circle cx={50} cy={36} r={9} fill="#E8D3A8" />
      <circle cx={140} cy={36} r={9} fill="#E8D3A8" />
      <ellipse cx={95} cy={156} rx={30} ry={28} fill="#E8D3A8" />
      <ellipse cx={95} cy={88} rx={24} ry={18} fill="#E8D3A8" />
      <ellipse cx={95} cy={80} rx={8} ry={6} fill="#6B4E36" />
      <Smile x={95} y={92} w={7} />
      <Eye x={76} y={62} />
      <Eye x={114} y={62} />
      <path d="M95 118 L74 108 L74 130 Z M95 118 L116 108 L116 130 Z" fill="#E8907E" {...line('#BF6A5C', 4)} />
      <circle cx={95} cy={118} r={6} fill="#E8907E" {...line('#BF6A5C', 3)} />
    </g>
  )
}

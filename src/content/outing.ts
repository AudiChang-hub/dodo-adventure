// 出門任務卡（PRD §5.11）：假日出門順便玩，走路、等車、排隊的空檔玩 1–2 分鐘，不需要道具。
// 這裡只放題目資料：哪些詞在外面找得到、五種固定的思考題型。
// 依作答紀錄挑題的邏輯在 src/lib/outing.ts；台詞在 lines-outing.ts；家長區畫面在 src/screens/parent/Outing.tsx。

/** 四條能力主線（PRD §5.10），任務卡上的小標籤 */
export type Track = 'lang' | 'math' | 'think'
export const TRACK_ZH: Record<Track, string> = { lang: '語言', math: '數與規律', think: '思考' }

// ── 「找找看」：這週學過、在外面真的找得到的詞 ────────────────────────
// 只收台北街上、捷運、公園、市場看得到的東西；獅子、鯨魚、浴缸這類就不出成任務。
// art 是英文冠詞，回到 App 時恐龍問「Did you see a | bus?」要用；cry 是答對後的狀聲詞。

export interface Findable {
  /** 對應 VOCAB 的 id */
  id: string
  art: 'a' | 'an'
  /** 爸爸可以去哪裡找 */
  where: string
  cry: string
}

export const FINDABLE: Findable[] = [
  { id: 'bus', art: 'a', where: '公車站、大馬路', cry: 'Beep beep!' },
  { id: 'car', art: 'a', where: '路邊、停車場', cry: 'Beep beep!' },
  { id: 'taxi', art: 'a', where: '路口、車站前', cry: 'Beep beep!' },
  { id: 'scooter', art: 'a', where: '騎樓、路口等紅燈', cry: 'Vroom, vroom!' },
  { id: 'truck', art: 'a', where: '大馬路、工地旁', cry: 'Vroom, vroom!' },
  { id: 'bike', art: 'a', where: '河濱、YouBike 站', cry: 'Ring, ring!' },
  { id: 'police', art: 'a', where: '路口、派出所前', cry: 'Wee-oo, wee-oo!' },
  { id: 'ambulance', art: 'an', where: '大馬路、醫院附近', cry: 'Wee-oo, wee-oo!' },
  { id: 'firetruck', art: 'a', where: '消防隊前、大馬路', cry: 'Wee-oo, wee-oo!' },
  { id: 'train', art: 'a', where: '捷運、火車站', cry: 'Choo choo!' },
  { id: 'plane', art: 'an', where: '天空、松山機場附近', cry: 'Zoom!' },
  { id: 'helicopter', art: 'a', where: '天空', cry: 'Chop, chop, chop!' },
  { id: 'boat', art: 'a', where: '河邊、碼頭', cry: 'Toot, toot!' },
  { id: 'dog', art: 'a', where: '公園、騎樓', cry: 'Woof woof!' },
  { id: 'cat', art: 'a', where: '巷子、店門口', cry: 'Meow!' },
  { id: 'bird', art: 'a', where: '公園、樹上、電線上', cry: 'Tweet tweet!' },
  { id: 'duck', art: 'a', where: '公園的池塘', cry: 'Quack quack!' },
  { id: 'fish', art: 'a', where: '池塘、水族箱', cry: 'Swish, swish!' },
  { id: 'butterfly', art: 'a', where: '公園的花叢', cry: 'Flap, flap!' },
  { id: 'umbrella', art: 'an', where: '下雨天的路上', cry: 'Drip, drop!' },
  { id: 'apple', art: 'an', where: '水果攤、超市', cry: 'Yum, yum!' },
  { id: 'banana', art: 'a', where: '水果攤、超市', cry: 'Yum, yum!' },
  { id: 'watermelon', art: 'a', where: '水果攤、超市', cry: 'Yum, yum!' },
]

export const findable = (id: string) => FINDABLE.find((f) => f.id === id)

/** 回到 App 時，這週任務不夠三張圖，就用這些補（幾乎每次出門都會看到） */
export const COMMON_SIGHTS = ['car', 'bus', 'dog', 'bird', 'scooter']

/** 顏色：去哪裡找 */
export const COLOR_WHERE: Record<string, string> = {
  red: '紅綠燈、消防栓、郵筒',
  yellow: '計程車、校車、路邊的黃線',
  blue: '路牌、捷運板南線、天空',
  green: '樹葉、郵筒、綠燈',
  orange: '三角錐、橘子',
  purple: '花、招牌',
  pink: '花、衣服',
  brown: '樹幹、狗狗、紙箱',
}

/** 形狀：生活中的例子 */
export const SHAPE_WHERE: Record<string, string> = {
  circle: '輪子、時鐘、人孔蓋',
  triangle: '交通號誌、屋頂、三角錐',
  square: '地磚、窗戶、按鈕',
  rect: '門、斑馬線、手機',
  star: '招牌、貼紙',
  heart: '招牌、貼紙、氣球',
}

export const NUM_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export const NUM_ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

// ── 五種固定的思考題型（PRD §5.11、§10 的運算思維）──────────────────
// 每週輪流出 2–3 種；這週在程式車庫玩過的（skills）優先，讓「App 裡學的」和「外面看到的」接在一起。

export type ThinkKind = 'seq' | 'dir' | 'cond' | 'loop' | 'pattern'

export interface ThinkMission {
  kind: ThinkKind
  /** 運算思維的名稱 */
  concept: string
  title: string
  /** 適合的情境 */
  where: string[]
  /** 給爸爸的玩法，一兩句 */
  dad: string
  /** 爸爸可以說的一句英文 */
  en: string
  /** 為什麼這樣玩：連到程式的哪個概念 */
  why: string
  /** 這週在 App 玩過這些技能（前綴），就優先出這題，並改用 tied 這句說明 */
  skills: string[]
  tied: string
}

export const THINK: ThinkMission[] = [
  {
    kind: 'seq',
    concept: '順序',
    title: '下一站是哪一站？',
    where: ['搭捷運', '搭公車'],
    dad: '上車後一起看路線圖：剛剛是哪一站？下一站呢？到站前讓他先猜，廣播一響就知道猜對沒。',
    en: 'What comes next?',
    why: '事情有先後，程式也是一步接一步照順序做。',
    skills: ['seq:'],
    tied: '這週在程式車庫玩了「排順序」，出門換成真的站名。',
  },
  {
    kind: 'dir',
    concept: '方向・除錯',
    title: '當小導航',
    where: ['走路', '逛公園'],
    dad: '快到目的地時讓他用手指路，你幫他說出英文：up、down、left、right。走錯了不要緊，停下來問「要改哪一步？」改好再走。',
    en: 'Which way? Left or right?',
    why: '走錯了改指令再試一次，就是程式的「除錯」。',
    skills: ['arrow:', 'route:'],
    tied: '這週在程式車庫用箭頭卡開車，出門換他當導航。',
  },
  {
    kind: 'cond',
    concept: '條件',
    title: '紅燈停、綠燈走',
    where: ['過馬路', '等紅綠燈'],
    dad: '等紅綠燈時先說好規則：「如果紅燈，就停；如果綠燈，就走。」讓他當號誌判斷員，燈一換就喊出來。',
    en: 'Red light? Stop! Green light? Go!',
    why: '「如果……就……」是程式的條件判斷（if）。',
    skills: ['color:red', 'color:green'],
    tied: '這週學了 red、green，剛好用在紅綠燈。',
  },
  {
    kind: 'loop',
    concept: '重複',
    title: '數樓梯',
    where: ['捷運站', '天橋', '公園階梯'],
    dad: '上下樓梯時一階數一個：one、two、three……數到十就重新開始。邊數邊踏，身體也記得節奏。',
    en: "Let's count the stairs! One, two, three…",
    why: '同一個動作做好幾次，就是程式的「重複」（迴圈）。',
    skills: ['count:', 'num:', 'order:'],
    tied: '這週在數字工地數了數量，出門改數真的樓梯。',
  },
  {
    kind: 'pattern',
    concept: '規律',
    title: '地磚和斑馬線',
    where: ['過馬路', '人行道'],
    dad: '看斑馬線：白、黑、白、黑……下一條是什麼？地磚、欄杆也找得到規律，也可以用腳踩：跳、走、跳、走。',
    en: 'White, black, white… what comes next?',
    why: '看出規律、猜下一個，是寫程式找出「重複的部分」的基礎。',
    skills: ['pattern:'],
    tied: '這週在程式車庫玩了「找規律」，出門找真的規律。',
  },
]

export const thinkMission = (k: ThinkKind) => THINK.find((t) => t.kind === k)!

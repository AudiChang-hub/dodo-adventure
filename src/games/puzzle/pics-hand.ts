// 拼圖圖庫裡一張一張手排的圖（T-156 的 16 張＋T-159 的 51 張）。只有資料；整個圖庫在 ./pics.ts（加上 ./pics-mix.ts 的組合圖、天上補東西）。
// 圖全部是 App 自己的故事插畫（src/art/storybook：場景＋角色庫），角色庫沒有的東西用專案已經在用的 Fluent Emoji（src/art/emoji.generated.ts），
// 用 StoryPage 畫，不照任何現成 App 的關卡或圖。
// 擺法：主角大（size L）、分散在左、右（再加中間或天上一樣），切成 2×2 或 3×2 時每一片都有看得出來的東西，不會整片只有天空或草地。
// 天上（太陽、月亮、彩虹、雨雲、風箏、蝴蝶）放在中間，補 3×2 中間上面那一片；室內的場景牆上有窗戶、畫框。
import type { Cast, PageArt, Slot } from '../../art/storybook/layout'
import type { FreeArt } from './free'

export interface PuzzlePic {
  id: string
  /** 中文名字（家長區、報告看的） */
  zh: string
  /** 手排的：故事插畫的擺法（StoryPage 畫） */
  art?: PageArt
  /** 組合圖：拼圖自己的構圖（./FreeArt.tsx 畫，T-159 第二版） */
  free?: FreeArt
  /** 拼完念的那一句（./lines.ts 用 picLineKey 登記，≤ 6 個字） */
  en: string
}

/** 角色庫沒有、用 Fluent Emoji 畫的東西（名字就是 emoji.generated.ts 的 key） */
const e = (who: string, at: Slot, o: Partial<Cast> = {}): Cast => ({ who, emoji: who, at, size: 'L', ...o })

/**
 * 新增一張：加在這裡（id 不重複、句子 ≤ 6 個字），跑 npx tsx scripts/extract-phrases.ts 和 python scripts/gen_audio.py --only pz.（只產新的那一句）；
 * scripts/test-puzzle-maze.ts 會用 problemsOf 檢查擺法、3×3 每一格都有東西（coverage.ts）、檢查台詞和音檔都在。
 */
export const HAND_PICS: PuzzlePic[] = [
  // ── T-156 原本的 16 張 ──
  { id: 'park', zh: '豆豆在公園', en: 'Dodo is at the park!', art: { scene: 'park', cast: [{ who: 'dodo', at: 'L', size: 'L' }, { who: 'bird', at: 'C', size: 'M' }, { who: 'sun', at: 'RC' }], back: [{ who: 'tree', at: 'R', size: 'L' }] } },
  { id: 'farm', zh: '農場的牛和豬', en: 'Moo! Oink! Hello, farm!', art: { scene: 'farm', cast: [{ who: 'cow', at: 'L', size: 'L' }, { who: 'chicken', at: 'C', size: 'M' }, { who: 'pig', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'sea', zh: '海上的鯨魚', en: 'A big whale in the sea!', art: { scene: 'sea', cast: [{ who: 'whale', at: 'L', size: 'L' }, { who: 'octopus', at: 'C', size: 'L' }, { who: 'fish', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }], back: [{ who: 'sailboat', at: 'L', size: 'L' }, { who: 'sailboat', at: 'R', size: 'L' }] } },
  { id: 'beach', zh: '莫莫在海邊', en: 'Momo is at the beach!', art: { scene: 'beach', cast: [{ who: 'momo', at: 'L', size: 'L' }, e('crab', 'C', { size: 'M' }), { who: 'beach-umbrella', at: 'R', size: 'L' }, { who: 'sun', at: 'C' }] } },
  { id: 'valley', zh: '恐龍谷', en: 'Two big dinosaurs!', art: { scene: 'valley', cast: [{ who: 'sauropod', at: 'L', size: 'L' }, { who: 'egg', at: 'C', size: 'M' }, { who: 'trex', at: 'R', size: 'L', flip: true }] } },
  { id: 'zoo', zh: '動物園的長頸鹿和大象', en: 'Hello, giraffe and elephant!', art: { scene: 'zoo', cast: [{ who: 'giraffe', at: 'L', size: 'L' }, { who: 'monkey', at: 'C', size: 'M' }, { who: 'elephant', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'party', zh: '生日派對', en: 'Happy birthday, Bobo!', art: { scene: 'party', cast: [{ who: 'bobo', at: 'L', size: 'L' }, { who: 'cake', at: 'C', size: 'L' }, { who: 'gift', at: 'R', size: 'L' }] } },
  { id: 'rain', zh: '下雨天的青蛙', en: 'Frog loves the rain!', art: { scene: 'rain', cast: [{ who: 'frog', at: 'L', size: 'L' }, { who: 'snail', at: 'C', size: 'M' }, e('duck', 'R', { flip: true }), { who: 'raincloud', at: 'C', size: 'L' }] } },
  { id: 'city', zh: '城市的公車', en: 'Beep beep! A big bus!', art: { scene: 'city', cast: [{ who: 'bus', at: 'L', size: 'L' }, { who: 'cat', at: 'C', size: 'M' }, { who: 'momo', at: 'R', size: 'L', flip: true }] } },
  { id: 'site', zh: '工地的卡車', en: 'Bobo and the big truck!', art: { scene: 'site', cast: [{ who: 'truck', at: 'L', size: 'L' }, { who: 'momo', at: 'C', size: 'M' }, { who: 'bobo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'meadow', zh: '兔子和烏龜', en: 'Rabbit and turtle!', art: { scene: 'meadow', cast: [{ who: 'rabbit', at: 'L', size: 'L' }, { who: 'seedling', at: 'C', size: 'M' }, { who: 'turtle', at: 'R', size: 'L', pose: 'walk', flip: true }, { who: 'rainbow', at: 'C' }] } },
  { id: 'market', zh: '水果市場的猴子', en: 'Monkey loves fruit!', art: { scene: 'market', cast: [{ who: 'monkey', at: 'L', size: 'L' }, { who: 'banana', at: 'C' }, { who: 'watermelon', at: 'R', size: 'L' }] } },
  { id: 'night', zh: '晚安泰迪熊', en: 'Good night, teddy!', art: { scene: 'bedroom', cast: [{ who: 'momo', at: 'L', size: 'L', pose: 'sleep' }, { who: 'teddy', at: 'C', size: 'L' }, { who: 'bed', at: 'R', size: 'L' }, { who: 'moon', at: 'R' }] } },
  { id: 'nest', zh: '莫莫找到蛋', en: 'Momo found the eggs!', art: { scene: 'meadow', cast: [{ who: 'momo', at: 'L', size: 'L' }, { who: 'egg', at: 'C', size: 'M' }, { who: 'dino-nest', at: 'R', size: 'L' }, { who: 'sun', at: 'C' }] } },
  { id: 'fire', zh: '消防車', en: 'Wee-oo! A fire truck!', art: { scene: 'city', cast: [{ who: 'fire-truck', at: 'L', size: 'L', with: 'dodo' }, { who: 'momo', at: 'C', size: 'M' }, { who: 'cat', at: 'R', size: 'L', flip: true }] } },
  { id: 'kite', zh: '豆豆放風箏', en: 'Dodo flies a kite!', art: { scene: 'meadow', cast: [{ who: 'dodo', at: 'L', size: 'L' }, { who: 'bird', at: 'C', size: 'M' }, { who: 'kite', at: 'RC' }, { who: 'sheep', at: 'R', size: 'L', flip: true }] } },

  // ── T-159：每張左、中、右地上各一樣（中間的小一號），天上再一樣，切 3×2 時下面中間那一片也有東西 ──
  // 動物
  { id: 'lion', zh: '獅子和斑馬', en: 'Roar! Lion and zebra!', art: { scene: 'zoo', cast: [{ who: 'lion', at: 'L', size: 'L' }, { who: 'bird', at: 'C', size: 'M' }, { who: 'zebra', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'panda', zh: '熊貓和猴子', en: 'Panda and monkey!', art: { scene: 'zoo', cast: [e('panda', 'L'), { who: 'banana', at: 'C', size: 'M' }, { who: 'monkey', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C', pose: 'face' }] } },
  { id: 'kangaroo', zh: '袋鼠和無尾熊', en: 'Hop! Kangaroo and koala!', art: { scene: 'zoo', cast: [e('kangaroo', 'L'), { who: 'bird', at: 'C', size: 'M' }, e('koala', 'R', { flip: true }), { who: 'sun', at: 'C' }] } },
  { id: 'penguin', zh: '企鵝和鱷魚', en: 'Penguin and crocodile say hi!', art: { scene: 'zoo', cast: [e('penguin', 'L'), e('front-facing-baby-chick', 'C', { size: 'M' }), e('crocodile', 'R', { flip: true }), { who: 'raincloud', at: 'C', size: 'L' }] } },
  { id: 'pond', zh: '鴨子和青蛙', en: 'A duck and a frog!', art: { scene: 'meadow', cast: [e('duck', 'L'), { who: 'water', at: 'C', size: 'M' }, { who: 'frog', at: 'R', size: 'L', flip: true }, { who: 'butterfly', at: 'C' }] } },
  { id: 'horse', zh: '馬和綿羊', en: 'Neigh! Baa! Farm friends!', art: { scene: 'farm', cast: [e('horse', 'L'), { who: 'apples', at: 'C', size: 'M' }, { who: 'sheep', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'chick', zh: '公雞和小雞', en: 'Chicken and little chick!', art: { scene: 'farm', cast: [{ who: 'chicken', at: 'L', size: 'L' }, { who: 'basket', at: 'C', size: 'M' }, e('front-facing-baby-chick', 'R'), { who: 'sun', at: 'C', pose: 'face' }] } },
  { id: 'woods', zh: '森林的鹿和狐狸', en: 'Deer and fox in the woods!', art: { scene: 'meadow', cast: [e('deer', 'L'), e('fox', 'R', { flip: true }), { who: 'butterfly', at: 'C' }], back: [{ who: 'tree', at: 'C', size: 'L' }] } },
  { id: 'hedgehog', zh: '刺蝟找到香菇', en: 'Hedgehog finds a mushroom!', art: { scene: 'meadow', cast: [e('hedgehog', 'L'), { who: 'snail', at: 'C', size: 'M' }, e('mushroom', 'R'), { who: 'rainbow', at: 'C' }] } },
  { id: 'owl', zh: '晚上的貓頭鷹', en: 'Hoo hoo! Good night, owl!', art: { scene: 'bedroom', cast: [e('owl', 'L'), { who: 'cat', at: 'C', size: 'L', flip: true }, { who: 'bed', at: 'R', size: 'M' }, { who: 'moon', at: 'R' }] } },
  { id: 'kitty', zh: '小貓玩毛線', en: 'Kitty plays with yarn!', art: { scene: 'home', cast: [{ who: 'cat', at: 'L', size: 'L' }, { who: 'teddy', at: 'C', size: 'L' }, { who: 'yarn', at: 'R', size: 'L' }] } },
  { id: 'elephant', zh: '大象噴水', en: 'Splash! Elephant sprays water!', art: { scene: 'zoo', cast: [{ who: 'elephant', at: 'L', size: 'L' }, { who: 'water', at: 'C', size: 'L' }, { who: 'giraffe', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'unicorn', zh: '獨角獸和彩虹', en: 'A unicorn and a rainbow!', art: { scene: 'meadow', cast: [e('unicorn', 'L'), e('blossom', 'C', { size: 'M' }), { who: 'momo', at: 'R', size: 'L', flip: true }, { who: 'rainbow', at: 'C' }] } },

  // 海邊、海上
  { id: 'octopus', zh: '章魚和魚', en: 'Octopus and fish say hi!', art: { scene: 'sea', cast: [{ who: 'fish', at: 'L', size: 'L' }, { who: 'octopus', at: 'C', size: 'L' }, { who: 'fish', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C', pose: 'face' }], back: [{ who: 'sailboat', at: 'L', size: 'L' }, { who: 'sailboat', at: 'R', size: 'L' }] } },
  { id: 'dolphin', zh: '海豚和帆船', en: 'Dolphin swims by the boat!', art: { scene: 'sea', cast: [{ who: 'fish', at: 'L', size: 'L' }, { who: 'octopus', at: 'C', size: 'L' }, { who: 'whale', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }], back: [e('dolphin', 'L'), { who: 'sailboat', at: 'R', size: 'L' }] } },
  { id: 'crab', zh: '沙灘上的螃蟹', en: 'A crab at the beach!', art: { scene: 'beach', cast: [e('crab', 'L'), e('soccer-ball', 'C', { size: 'M' }), { who: 'bobo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },

  // 季節、天氣
  { id: 'spring', zh: '春天的花和兔子', en: 'Spring flowers and a rabbit!', art: { scene: 'meadow', cast: [e('tulip', 'L'), { who: 'seedling', at: 'C', size: 'M' }, { who: 'rabbit', at: 'R', size: 'L', flip: true }, { who: 'butterfly', at: 'C' }] } },
  { id: 'summer', zh: '夏天吃冰淇淋', en: 'Ice cream on a sunny day!', art: { scene: 'beach', cast: [e('ice-cream', 'L'), { who: 'watermelon', at: 'C', size: 'L' }, { who: 'momo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C', pose: 'face' }] } },
  { id: 'autumn', zh: '秋天的落葉', en: 'Bobo and the falling leaves!', art: { scene: 'meadow', cast: [e('leaf-fluttering-in-wind', 'C', { size: 'M' }), { who: 'bobo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }], back: [{ who: 'tree', at: 'L', size: 'L' }] } },
  { id: 'winter', zh: '冬天堆雪人', en: 'Dodo made a snowman!', art: { scene: 'park', cast: [e('snowman', 'L'), e('snowflake', 'C', { size: 'M' }), { who: 'dodo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'sunflower', zh: '向日葵和蜜蜂', en: 'Buzz! Bee and sunflower!', art: { scene: 'meadow', cast: [e('sunflower', 'L'), e('tulip', 'C', { size: 'M' }), e('honeybee', 'R', { flip: true }), { who: 'sun', at: 'C', pose: 'face' }] } },
  { id: 'puddle', zh: '下雨天的蝸牛', en: 'Momo and snail in the rain!', art: { scene: 'rain', cast: [{ who: 'momo', at: 'L', size: 'L' }, e('duck', 'C', { size: 'M' }), { who: 'snail', at: 'R', size: 'L', flip: true }, { who: 'raincloud', at: 'C', size: 'L' }] } },

  // 節日、派對
  { id: 'xmas', zh: '聖誕樹下的禮物', en: 'Presents under the tree!', art: { scene: 'home', cast: [e('evergreen-tree', 'L'), { who: 'bobo', at: 'C', size: 'L' }, { who: 'gift', at: 'R', size: 'L' }] } },
  { id: 'party-time', zh: '莫莫和波波的派對', en: 'Party time, Momo and Bobo!', art: { scene: 'party', cast: [{ who: 'bobo', at: 'L', size: 'L', pose: 'cheer' }, { who: 'gift', at: 'C', size: 'L' }, { who: 'momo', at: 'R', size: 'L', flip: true, pose: 'cheer' }] } },
  { id: 'cupcake', zh: '杯子蛋糕', en: 'Cupcakes for Dodo!', art: { scene: 'party', cast: [{ who: 'dodo', at: 'L', size: 'L' }, e('cupcake', 'C', { size: 'M' }), { who: 'gift', at: 'R', size: 'L' }] } },

  // 家裡、學校（牆上左邊窗戶、右邊畫框，中間站一隻恐龍，切 3×2 時上面中間那片有牠的頭）
  { id: 'bath', zh: '洗澡時間', en: 'Splash! Bath time, Dodo!', art: { scene: 'home', cast: [{ who: 'bathtub', at: 'L', size: 'L' }, { who: 'dodo', at: 'C', size: 'L' }, e('duck', 'R', { size: 'M', flip: true })] } },
  { id: 'reading', zh: '莫莫看書', en: 'Momo reads a book!', art: { scene: 'home', cast: [{ who: 'book-open', at: 'L', size: 'L' }, { who: 'momo', at: 'C', size: 'L' }, { who: 'teddy', at: 'R', size: 'L', flip: true }] } },
  { id: 'blocks', zh: '波波堆積木', en: 'Bobo builds with blocks!', art: { scene: 'home', cast: [{ who: 'blocks', at: 'L', size: 'L' }, { who: 'bobo', at: 'C', size: 'L' }, e('puzzle-piece', 'R', { size: 'M' })] } },
  { id: 'crayon', zh: '豆豆畫畫', en: 'Dodo loves to draw!', art: { scene: 'home', cast: [e('crayon', 'L'), { who: 'dodo', at: 'C', size: 'L' }, e('artist-palette', 'R', { size: 'M' })] } },
  { id: 'school', zh: '上學的書和鉛筆', en: 'Books and pencils for school!', art: { scene: 'home', cast: [e('books', 'L'), { who: 'momo', at: 'C', size: 'L' }, e('pencil', 'R', { size: 'M' })] } },
  { id: 'abacus', zh: '波波數一數', en: 'One, two, three, Bobo!', art: { scene: 'home', cast: [e('abacus', 'L'), { who: 'bobo', at: 'C', size: 'L' }, { who: 'apples', at: 'R', size: 'L' }] } },

  // 太空
  { id: 'rocket', zh: '飛向月亮的火箭', en: 'Rocket to the moon!', art: { scene: 'bedroom', cast: [e('rocket', 'L'), { who: 'dodo', at: 'C', size: 'L' }, e('ringed-planet', 'R', { size: 'M' }), { who: 'moon', at: 'R' }] } },
  { id: 'robot', zh: '機器人和火箭', en: 'Beep! Robot and rocket!', art: { scene: 'park', cast: [e('robot', 'L'), e('flying-saucer', 'C', { size: 'M' }), e('rocket', 'R'), { who: 'sun', at: 'C', pose: 'face' }] } },

  // 恐龍
  { id: 'volcano', zh: '恐龍谷的火山', en: 'Puff! A big volcano!', art: { scene: 'valley', cast: [{ who: 'momo', at: 'L', size: 'L' }, { who: 'bobo', at: 'R', size: 'L', flip: true }], back: [{ who: 'volcano', at: 'C', size: 'L' }] } },
  { id: 'trex-egg', zh: '暴龍和彩虹蛋', en: 'T-rex finds a rainbow egg!', art: { scene: 'valley', cast: [{ who: 'trex', at: 'L', size: 'L' }, { who: 'dino-nest', at: 'C', size: 'M' }, { who: 'egg', at: 'R', size: 'L' }, { who: 'sun', at: 'C' }] } },
  { id: 'longneck', zh: '豆豆和長脖子恐龍', en: 'Dodo and the long neck!', art: { scene: 'valley', cast: [{ who: 'sauropod', at: 'L', size: 'L' }, { who: 'dodo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }], back: [{ who: 'tree', at: 'C', size: 'L' }] } },
  { id: 'footprints', zh: '大腳印', en: 'Stomp! Big dinosaur feet!', art: { scene: 'valley', cast: [{ who: 'trex', at: 'L', size: 'L' }, { who: 'footprints', at: 'C', size: 'L' }, { who: 'bobo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }], back: [{ who: 'volcano', at: 'C', size: 'L' }] } },

  // 交通工具、職業
  { id: 'police', zh: '警車', en: 'Nee-naw! A police car!', art: { scene: 'city', cast: [{ who: 'police-car', at: 'L', size: 'L' }, { who: 'traffic-light', at: 'C', size: 'L' }, { who: 'momo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'ambulance', zh: '救護車', en: 'Wee-oo! An ambulance!', art: { scene: 'city', cast: [e('ambulance', 'L'), { who: 'bobo', at: 'C', size: 'M' }, { who: 'momo', at: 'R', size: 'L', flip: true }] } },
  { id: 'tractor', zh: '農場的拖拉機', en: 'Tractor and chicken on the farm!', art: { scene: 'farm', cast: [{ who: 'tractor', at: 'L', size: 'L' }, { who: 'basket', at: 'C', size: 'M', pose: 'full' }, { who: 'chicken', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'builder', zh: '莫莫蓋房子', en: 'Bang! Momo builds a house!', art: { scene: 'site', cast: [{ who: 'momo', at: 'L', size: 'L' }, { who: 'cone', at: 'R', size: 'L' }], back: [{ who: 'frame', at: 'C', size: 'L' }] } },
  { id: 'airplane', zh: '大飛機', en: 'Zoom! A big airplane!', art: { scene: 'park', cast: [e('airplane', 'L'), { who: 'cone', at: 'C', size: 'M' }, { who: 'dodo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'helicopter', zh: '直升機', en: 'Whirr! A helicopter!', art: { scene: 'meadow', cast: [e('helicopter', 'L'), { who: 'bird', at: 'C', size: 'M' }, { who: 'momo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C', pose: 'face' }] } },
  { id: 'train', zh: '火車', en: 'Choo choo! A train!', art: { scene: 'meadow', cast: [e('locomotive', 'L'), { who: 'cow', at: 'C', size: 'M' }, { who: 'sheep', at: 'R', size: 'L', flip: true }, { who: 'rainbow', at: 'C' }] } },
  { id: 'racecar', zh: '賽車', en: 'Vroom! A race car!', art: { scene: 'park', cast: [e('racing-car', 'L', { with: 'dodo' }), { who: 'bobo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }], back: [{ who: 'banner', at: 'C', size: 'L' }] } },
  { id: 'bike', zh: '騎腳踏車', en: 'Ring ring! A bike!', art: { scene: 'park', cast: [e('bicycle', 'L'), { who: 'bird', at: 'C', size: 'M' }, { who: 'dodo', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },

  // 食物
  { id: 'fruit', zh: '蘋果、葡萄、西瓜', en: 'Apples, grapes, and watermelon!', art: { scene: 'market', cast: [{ who: 'apples', at: 'L', size: 'L' }, { who: 'grapes', at: 'C', size: 'L' }, { who: 'watermelon', at: 'R', size: 'L' }] } },
  { id: 'pizza', zh: '波波吃披薩', en: 'Yummy pizza, Bobo!', art: { scene: 'party', cast: [e('pizza', 'L'), { who: 'bobo', at: 'C', size: 'L' }, e('glass-of-milk', 'R', { size: 'M' })] } },
  { id: 'carrot', zh: '兔子愛紅蘿蔔', en: 'Rabbit loves carrots!', art: { scene: 'farm', cast: [e('carrot', 'L'), { who: 'basket', at: 'C', size: 'L' }, { who: 'rabbit', at: 'R', size: 'L', flip: true }, { who: 'sun', at: 'C' }] } },
  { id: 'picnic', zh: '野餐', en: 'Picnic time with Dodo!', art: { scene: 'park', cast: [{ who: 'sandwich', at: 'L', size: 'L' }, { who: 'basket', at: 'C', size: 'M' }, { who: 'dodo', at: 'R', size: 'L', flip: true }, { who: 'kite', at: 'C' }] } },
]

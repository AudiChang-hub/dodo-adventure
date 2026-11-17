// 小熊野餐（T-160）的食物：Fluent Emoji 的圖、英文的一個／好幾個。只有資料，scripts/build-picnic-emoji.ts 在 node 裡也讀得到。
// 一張圖要剛好是「一個」：一串葡萄、兩顆櫻桃、一包爆米花、一盤鬆餅這種數不清是幾個的不放（數數的東西不能讓孩子猶豫要算幾個）。
// 英文用孩子聽得懂的說法（tangerine 說 orange、shortcake 說 strawberry cake）；一句「I want three apples!」≤ 6 個字。

export interface Food {
  /** Fluent Emoji 的名字（主程式那一套沒有的在 ./food.generated.ts） */
  icon: string
  one: string
  many: string
}

const f = (icon: string, one: string, many = `${one}s`): Food => ({ icon, one, many })

export const FOODS: Food[] = [
  // 主程式那一套就有的
  f('red-apple', 'apple'),
  f('green-apple', 'green apple'),
  f('banana', 'banana'),
  f('carrot', 'carrot'),
  f('cookie', 'cookie'),
  f('cooked-rice', 'bowl of rice', 'bowls of rice'),
  f('cupcake', 'cupcake'),
  f('doughnut', 'donut'),
  f('egg', 'egg'),
  f('hamburger', 'burger'),
  f('hot-dog', 'hot dog'),
  f('kiwi-fruit', 'kiwi'),
  f('lemon', 'lemon'),
  f('lollipop', 'lollipop'),
  f('mango', 'mango', 'mangoes'),
  f('mushroom', 'mushroom'),
  f('peach', 'peach', 'peaches'),
  f('pear', 'pear'),
  f('pizza', 'pizza slice'),
  f('sandwich', 'sandwich', 'sandwiches'),
  f('soft-ice-cream', 'ice cream cone'),
  f('strawberry', 'strawberry', 'strawberries'),
  f('tangerine', 'orange'),
  f('tomato', 'tomato', 'tomatoes'),
  f('watermelon', 'watermelon slice'),
  f('birthday-cake', 'cake'),
  // 野餐自己的（./food.generated.ts）
  f('croissant', 'croissant'),
  f('pretzel', 'pretzel'),
  f('ear-of-corn', 'corn cob'),
  f('cucumber', 'cucumber'),
  f('eggplant', 'eggplant'),
  f('avocado', 'avocado'),
  f('potato', 'potato', 'potatoes'),
  f('rice-ball', 'rice ball'),
  f('pineapple', 'pineapple'),
  f('coconut', 'coconut'),
  f('melon', 'melon'),
  f('dumpling', 'dumpling'),
  f('bagel', 'bagel'),
  f('candy', 'candy', 'candies'),
  f('chocolate-bar', 'chocolate bar'),
  f('honey-pot', 'honey pot'),
  f('bell-pepper', 'pepper'),
  f('custard', 'pudding'),
  f('moon-cake', 'mooncake'),
  f('taco', 'taco'),
  f('roasted-sweet-potato', 'sweet potato', 'sweet potatoes'),
  f('pie', 'pie'),
  f('shortcake', 'strawberry cake'),
  f('waffle', 'waffle'),
  f('chestnut', 'chestnut'),
]

export const foodOf = (icon: string) => FOODS.find((x) => x.icon === icon) ?? null

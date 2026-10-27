export interface LetterEntry {
  letter: string
  word: string
  icon: string
}

export const LETTERS: LetterEntry[] = [
  { letter: 'A', word: 'apple', icon: 'red-apple' },
  { letter: 'B', word: 'bus', icon: 'bus' },
  { letter: 'C', word: 'car', icon: 'automobile' },
  { letter: 'D', word: 'dinosaur', icon: 'sauropod' },
  { letter: 'E', word: 'elephant', icon: 'elephant' },
  { letter: 'F', word: 'fish', icon: 'fish' },
  { letter: 'G', word: 'giraffe', icon: 'giraffe' },
  { letter: 'H', word: 'horse', icon: 'horse' },
  { letter: 'I', word: 'ice cream', icon: 'soft-ice-cream' },
  { letter: 'J', word: 'jellyfish', icon: 'jellyfish' },
  { letter: 'K', word: 'kangaroo', icon: 'kangaroo' },
  { letter: 'L', word: 'lion', icon: 'lion' },
  { letter: 'M', word: 'monkey', icon: 'monkey' },
  { letter: 'N', word: 'nest', icon: 'nest-with-eggs' },
  { letter: 'O', word: 'octopus', icon: 'octopus' },
  { letter: 'P', word: 'pig', icon: 'pig-face' },
  { letter: 'Q', word: 'queen', icon: 'crown' },
  { letter: 'R', word: 'rabbit', icon: 'rabbit-face' },
  { letter: 'S', word: 'sun', icon: 'sun-with-face' },
  { letter: 'T', word: 'T-rex', icon: 't-rex' },
  { letter: 'U', word: 'umbrella', icon: 'umbrella' },
  { letter: 'V', word: 'volcano', icon: 'volcano' },
  { letter: 'W', word: 'whale', icon: 'spouting-whale' },
  { letter: 'X', word: 'x-ray', icon: 'x-ray' },
  { letter: 'Y', word: 'yo-yo', icon: 'yo-yo' },
  { letter: 'Z', word: 'zebra', icon: 'zebra' },
]

/** 字母依序分組解鎖，熟了一組才開下一組 */
export const LETTER_GROUPS = ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWXYZ']

/** 外型相近的字母，高難度時拿來當干擾選項 */
export const LOOKALIKE: Record<string, string> = {
  E: 'FB',
  F: 'EP',
  M: 'NW',
  N: 'MH',
  O: 'QC',
  Q: 'OG',
  P: 'RB',
  R: 'PB',
  C: 'GO',
  G: 'CO',
  U: 'VJ',
  V: 'UY',
  W: 'MV',
  B: 'PR',
  I: 'LT',
  L: 'IT',
  T: 'IL',
  K: 'XY',
  X: 'KY',
  Y: 'VX',
}

export const letterEntry = (l: string) => LETTERS.find((e) => e.letter === l)!

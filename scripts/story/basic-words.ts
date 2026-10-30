// 故事可以自由用的基本字（check-story 的「沒學過的字」不算這些）：
// 1. Dolch 常見字（1936 年的公開字表，學前到三年級的 220 個功能字＋95 個名詞）
// 2. 幼兒每天會聽到的動作、感覺、位置、時間的字（PM 整理，三歲孩子在家裡、幼兒園天天聽得到）
// 圖卡單字（content/lexicon.ts 的 LEXICON，例如 apple、bus）不在這裡算：要看孩子教過沒（學習快照）。
export const DOLCH = `
a and away big blue can come down find for funny go help here I in is it jump little look make me my not one play red run said see
the three to two up we where yellow you
all am are at ate be black brown but came did do eat four get good have he into like must new no now on our out please pretty ran
ride saw say she so soon that there they this too under want was well went what white who will with yes
after again an any as ask by could every fly from give going had has her him his how just know let live may of old once open over
put round some stop take thank them then think walk were when
always around because been before best both buy call cold does don't fast first five found gave goes green its made many off or pull
read right sing sit sleep tell their these those upon us use very wash which why wish work would write your
about better bring carry clean cut done draw drink eight fall far full got grow hold hot if keep kind laugh light long much myself
never only own pick seven shall show six small start ten today together try warm
apple baby back ball bear bed bell bird birthday boat box boy bread brother cake car cat chair chicken children coat corn cow day
dog doll door duck egg eye farm farmer father feet fire fish floor flower game garden girl goodbye grass ground hand head hill home
horse house kitty leg letter man men milk money morning mother name nest night paper party picture pig rabbit rain ring robin school
seed sheep shoe sister snow song squirrel stick street sun table thing time top toy tree watch water way wind window wood
`

export const EVERYDAY = `
walk step run jump hop skip climb swim sleep nap wake sit stand lie wash brush bath hug kiss smile cry sing dance share wait win
race ready set try hide seek peek push roll bounce throw catch kick fix build stack tumble wobble shake wiggle spin turn finish
happy sad tired sleepy hungry thirsty wet dry dirty quick quiet loud soft hard tiny huge tall short heavy empty nice brave careful
gentle silly yummy sweet behind inside outside next near bottom middle last more same different also tomorrow yesterday moon star
sky cloud rock stone sand river pond lake sea beach path road bridge room friend family mom mommy dad daddy everyone someone
something nothing things oops hooray shh hmm whoa wave waves sound sounds listen hear sees smell taste touch feel love likes loves
shine shines glow glows sparkle sparkles bright dark fun busy fine okay ok thank thanks sorry welcome let's it's that's here's
what's i'm you're we're can't don't isn't too back home bring visit go goes went find found need needs fits fit wrap tuck
`

export const BASIC_WORDS: string[] = [...new Set(`${DOLCH} ${EVERYDAY}`.split(/\s+/).filter(Boolean).map((w) => w.toLowerCase()))]

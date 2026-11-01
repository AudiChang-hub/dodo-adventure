import { memo } from 'react'
import { Emoji } from '../../art/Emoji'
import { ZH_PICS } from './pics.generated'

/** 字詞的圖：主程式那一套（art/Emoji）有就用，沒有的用中文課自己的那一份（pics.generated.ts，跟著中文課分開載入） */
export const Pic = memo(function Pic({ name }: { name: string }) {
  const e = ZH_PICS[name]
  if (!e) return <Emoji name={name} />
  return <svg viewBox={`0 0 ${e.w} ${e.h}`} width="100%" height="100%" style={{ display: 'block' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: e.b }} />
})

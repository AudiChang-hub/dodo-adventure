import { useState } from 'react'
import type { Drawing } from '../../lib/db'
import type { ParentData } from './data'
import { Highlights } from './Highlights'

export function Gallery({ d }: { d: ParentData }) {
  const [open, setOpen] = useState<Drawing | null>(null)
  return (
    <>
      <Highlights d={d} />
      <h2>作品集</h2>
      <p className="sub">畫畫小屋裡「蠟筆著色」與「自由畫畫」完成的作品，縮圖就是孩子塗的樣子。</p>
      {d.drawings.length === 0 ? (
        <p className="empty">還沒有作品。</p>
      ) : (
        <div className="gallery">
          {d.drawings.map((x) => (
            <figure key={x.id} onClick={() => setOpen(x)} style={{ cursor: 'zoom-in' }}>
              {x.thumb && <img src={x.thumb} alt={x.title} />}
              <figcaption>
                {x.title}・{new Date(x.ts).toLocaleDateString('zh-TW')}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {open && (
        <div className="gate-backdrop" onClick={() => setOpen(null)}>
          <img src={open.thumb} alt={open.title} style={{ maxWidth: '86vw', maxHeight: '80vh', borderRadius: 18, background: '#FBF8F2' }} />
        </div>
      )}
    </>
  )
}

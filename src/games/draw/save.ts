import { db, today, uid } from '../../lib/db'
import { requestSync } from '../../lib/sync'

/** 把一個 SVG 元素轉成縮圖（給家長區的作品集用） */
export async function svgThumb(svg: SVGSVGElement, maxW = 480, bg = '#FBF8F2'): Promise<string> {
  const vb = svg.viewBox.baseVal
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(vb.width))
  clone.setAttribute('height', String(vb.height))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = maxW
    c.height = Math.round((vb.height / vb.width) * maxW)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/webp', 0.8)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function saveDrawing(game: string, title: string, thumb: string, strokes: unknown) {
  await db.drawings.put({ id: uid(), ts: Date.now(), date: today(), game, title, thumb, strokes: JSON.stringify(strokes), synced: 0 })
  requestSync()
}

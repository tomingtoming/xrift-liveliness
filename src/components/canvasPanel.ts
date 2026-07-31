import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

/**
 * 文字はCanvasTextureで描く。フォントもテクスチャも同梱しない。
 * （縁日射的で確立した手口。CJKがそのまま出て、配信物が軽い）
 */

export interface PanelLine {
  text: string
  size?: number
  color?: string
  gap?: number
}

export interface PanelOptions {
  width?: number
  height?: number
  background?: string
  border?: string
  padding?: number
  align?: CanvasTextAlign
}

const FONT_STACK =
  '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif'

export const drawPanel = (lines: PanelLine[], opts: PanelOptions = {}): CanvasTexture => {
  const {
    width = 1024,
    height = 512,
    background = 'rgba(18,20,26,0.92)',
    border = 'rgba(120,190,255,0.55)',
    padding = 48,
    align = 'left',
  } = opts

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = border
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, width - 6, height - 6)

  ctx.textAlign = align
  ctx.textBaseline = 'top'
  const x = align === 'center' ? width / 2 : padding

  let y = padding
  for (const line of lines) {
    const size = line.size ?? 34
    ctx.font = `${size}px ${FONT_STACK}`
    ctx.fillStyle = line.color ?? '#e8eef6'
    ctx.fillText(line.text, x, y)
    y += size * 1.35 + (line.gap ?? 0)
  }

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

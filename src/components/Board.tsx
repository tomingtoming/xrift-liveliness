import { useEffect, useMemo } from 'react'
import { DoubleSide } from 'three'
import { drawPanel, type PanelLine, type PanelOptions } from './canvasPanel'

interface Props {
  lines: PanelLine[]
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** 板の実寸（メートル） */
  size?: [number, number]
  panel?: PanelOptions
}

/** CanvasTextureの掲示板。lines が変わればテクスチャを作り直す */
export const Board = ({
  lines,
  position = [0, 1.6, 0],
  rotation = [0, 0, 0],
  size = [1.6, 0.8],
  panel,
}: Props) => {
  const key = JSON.stringify(lines)
  const texture = useMemo(() => drawPanel(lines, panel), [key, panel])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} side={DoubleSide} transparent toneMapped={false} />
    </mesh>
  )
}

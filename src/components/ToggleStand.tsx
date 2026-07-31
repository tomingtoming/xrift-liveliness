import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Interactable } from '@xrift/world-components'
import type { Group } from 'three'

interface Props {
  on: boolean
  onToggle: () => void
  position?: [number, number, number]
}

/**
 * ON/OFFを切り替えるレバー。状態はインスタンス同期されるので、
 * 2人で入って片方が倒せば両方の見え方が同時に変わる。
 * A/B比較を会話しながらその場で回せるようにするための操作系。
 */
export const ToggleStand = ({ on, onToggle, position = [0, 0, 0] }: Props) => {
  const lever = useRef<Group>(null)

  useFrame((_, dt) => {
    if (!lever.current) return
    const goal = on ? -0.5 : 0.5
    lever.current.rotation.x += (goal - lever.current.rotation.x) * Math.min(1, dt * 12)
  })

  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 1, 24]} />
        <meshStandardMaterial color="#2a3038" roughness={0.7} />
      </mesh>

      <Interactable
        id="liveliness-toggle"
        onInteract={onToggle}
        interactionText={on ? '表情をOFFにする' : '表情をONにする'}
      >
        <group position={[0, 1.02, 0]}>
          <mesh>
            <boxGeometry args={[0.36, 0.06, 0.26]} />
            <meshStandardMaterial color="#1b1f26" roughness={0.6} />
          </mesh>
          <group ref={lever} position={[0, 0.03, 0]}>
            <mesh position={[0, 0.14, 0]} castShadow>
              <cylinderGeometry args={[0.022, 0.022, 0.28, 12]} />
              <meshStandardMaterial color="#8a929c" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.29, 0]}>
              <sphereGeometry args={[0.05, 16, 12]} />
              <meshStandardMaterial
                color={on ? '#4fd18b' : '#c9564f'}
                emissive={on ? '#1d6b45' : '#5c1f1b'}
                emissiveIntensity={0.8}
                roughness={0.35}
              />
            </mesh>
          </group>
        </group>
      </Interactable>
    </group>
  )
}

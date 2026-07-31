import { useCallback, useState } from 'react'
import { Mirror, SpawnPoint, useInstanceState } from '@xrift/world-components'
import { RigidBody } from '@react-three/rapier'
import { BackSide } from 'three'
import { Liveliness, type Diagnostics } from './liveliness/Liveliness'
import { Board } from './components/Board'
import { ToggleStand } from './components/ToggleStand'

/**
 * 表情の実証室。
 *
 * 見せたいのは1点だけ。「まばたきと視線があるアバターと、無いアバターとで、
 * 話しているときの感じがどう変わるか」。だから部屋には比較の道具しか置かない。
 * 鏡（自分の顔が見える）とレバー（全員ぶんを同時に切り替える）と掲示板。
 *
 * XRiftのアバターは表情を一切動かしていない。まばたきすら無い。ただし機構は
 * 揃っている＝アップロード時のvrmOptimizerは表情のバインド先メッシュを保護して
 * 通しており、ホストは毎フレーム vrm.update() を呼んでいる。動かす者がいないだけ。
 * この部屋はそこを埋めたときに何が起きるかを見るためのもの。
 */

export interface WorldProps {
  isPreview?: boolean
}

const ROOM = 11
const WALL_H = 3.6

export const World = ({ isPreview }: WorldProps) => {
  const [state, setState] = useInstanceState('liveliness-enabled', { on: true })
  const [diag, setDiag] = useState<Diagnostics | null>(null)

  const toggle = useCallback(() => {
    setState((prev) => ({ on: !prev.on }))
  }, [setState])

  const on = state.on

  return (
    <>
      <SpawnPoint position={[0, 0, 3.2]} />

      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} castShadow />
      <pointLight position={[0, 3, 0]} intensity={18} distance={14} color="#ffe9d0" />

      {/* 部屋。内向きの箱1つで床・壁・天井を兼ねる（見た目だけ） */}
      <mesh position={[0, WALL_H / 2, 0]}>
        <boxGeometry args={[ROOM, WALL_H, ROOM]} />
        <meshStandardMaterial color="#39414d" side={BackSide} roughness={0.9} />
      </mesh>

      {/* 床と壁の実体。見た目のBackSide箱には当たり判定が付かないので別に置く */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, -0.25, 0]} receiveShadow>
          <boxGeometry args={[ROOM, 0.5, ROOM]} />
          <meshStandardMaterial color="#2b313a" roughness={0.95} />
        </mesh>
      </RigidBody>
      {([
        [0, WALL_H / 2, -ROOM / 2 - 0.25, ROOM, WALL_H, 0.5],
        [0, WALL_H / 2, ROOM / 2 + 0.25, ROOM, WALL_H, 0.5],
        [-ROOM / 2 - 0.25, WALL_H / 2, 0, 0.5, WALL_H, ROOM],
        [ROOM / 2 + 0.25, WALL_H / 2, 0, 0.5, WALL_H, ROOM],
      ] as const).map(([x, y, z, w, h, d], i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid">
          <mesh position={[x, y, z]} visible={false}>
            <boxGeometry args={[w, h, d]} />
          </mesh>
        </RigidBody>
      ))}

      {/* 自分の顔が見えないと、まばたきが付いたことに気づけない */}
      <Mirror position={[0, 1.5, -ROOM / 2 + 0.06]} size={[3.4, 2.6]} textureResolution={768} />
      <Mirror
        position={[-ROOM / 2 + 0.06, 1.5, 0]}
        rotation={[0, Math.PI / 2, 0]}
        size={[2.4, 2.2]}
        textureResolution={640}
      />

      <ToggleStand on={on} onToggle={toggle} position={[1.5, 0, 1.2]} />

      <Board
        position={[-1.7, 1.75, -1.4]}
        rotation={[0, 0.5, 0]}
        size={[2.2, 1.24]}
        lines={[
          { text: '表情の実証室', size: 52, color: '#9fd4ff', gap: 14 },
          { text: 'レバーで全員ぶんのまばたきと視線を切り替える。', size: 30 },
          { text: '鏡で自分の顔を見ながら、誰かと話してみてほしい。', size: 30, gap: 16 },
          { text: '使っているのは乱数と、他の人の位置だけ。', size: 26, color: '#a8b4c2' },
          { text: 'カメラも視線トラッキングも使っていない。', size: 26, color: '#a8b4c2' },
        ]}
      />

      <Board
        position={[1.7, 1.75, -1.4]}
        rotation={[0, -0.5, 0]}
        size={[2.2, 1.24]}
        panel={{ background: 'rgba(14,18,24,0.94)', border: 'rgba(140,220,180,0.5)' }}
        lines={[
          { text: on ? '状態: ON' : '状態: OFF', size: 46, color: on ? '#7de3ab' : '#e08b84', gap: 14 },
          {
            text: `表情を持つアバター: ${diag?.rigged ?? 0}`,
            size: 30,
          },
          {
            text: `うち まばたき可: ${diag?.withBlink ?? 0} / 視線可: ${diag?.withLookAt ?? 0}`,
            size: 26,
            color: '#a8b4c2',
            gap: 12,
          },
          {
            text: `表情を持たないアバター: ${diag?.expressionless ?? 0}`,
            size: 30,
            color: '#e0c184',
          },
          {
            text: '（既定アバターはVRMでないので表情を持てない）',
            size: 22,
            color: '#a8b4c2',
          },
        ]}
      />

      {!isPreview && <Liveliness enabled={on} onDiagnostics={setDiag} />}
    </>
  )
}

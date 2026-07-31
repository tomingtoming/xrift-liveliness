import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { resetRig, scanAvatars, type AvatarRig } from './scan'
import { applyBlink, initBlink, stepBlink, type BlinkState } from './blink'
import { initGaze, stepGaze, type GazeState } from './gaze'
import { personalityOf, type Personality } from './personality'

/**
 * 部屋にいる全アバターに、まばたきと疑似視線を与える。
 *
 * ワールドに1つ置くだけで、その部屋の全員に等しく効く。アイテムでなくワールドの
 * 機能にしているのは、他人のアバターの見え方を1人の持ち物で変えるのが越権になる
 * ため。入室した時点で同意の筋が通る形にしている。
 *
 * 新しいセンサーは一切使わない。マイクもカメラも視線トラッキングも要らず、
 * 使うのは乱数と他アバターの位置だけ。
 * （音声に連動した口パクだけは、ワールドのコードからは実装できない。
 *   XRiftのコード検査が navigator.* を全面禁止しており getUserMedia に届かず、
 *   SDKにも音声レベルを取る口が無い。そこはプラットフォーム側の仕事になる）
 */

export interface Diagnostics {
  /** 表情を持つ（＝VRM）アバターの数 */
  rigged: number
  /** 表情ノードを持たないアバターの数（XRift既定アバター等） */
  expressionless: number
  /** blink を持つアバターの数 */
  withBlink: number
  /** 視線を動かせるアバターの数 */
  withLookAt: number
  totalNodes: number
}

interface Entry {
  rig: AvatarRig
  personality: Personality
  blink: BlinkState
  gaze: GazeState
}

export interface LivelinessProps {
  /** false でこの機能を止め、表情を元に戻す（A/B比較用） */
  enabled?: boolean
  /** アバターの出入りを拾い直す間隔（秒） */
  rescanInterval?: number
  onDiagnostics?: (d: Diagnostics) => void
}

const EMPTY_DIAG: Diagnostics = {
  rigged: 0,
  expressionless: 0,
  withBlink: 0,
  withLookAt: 0,
  totalNodes: 0,
}

export const Liveliness = ({
  enabled = true,
  rescanInterval = 1.5,
  onDiagnostics,
}: LivelinessProps) => {
  const { scene, camera } = useThree()
  const entries = useRef(new Map<string, Entry>())
  const sinceScan = useRef(rescanInterval)
  const wasEnabled = useRef(enabled)
  const diag = useRef<Diagnostics>(EMPTY_DIAG)
  const heads = useRef<Vector3[]>([])

  // アンマウント時は必ず元に戻す（付けっぱなしの weight を残さない）
  useEffect(() => {
    const map = entries.current
    return () => {
      for (const e of map.values()) resetRig(e.rig)
      map.clear()
    }
  }, [])

  useFrame((_, rawDt) => {
    // タブ復帰などで巨大なdtが来ると瞬きが飛ぶので上限を切る
    const dt = Math.min(rawDt, 0.1)

    if (!enabled) {
      if (wasEnabled.current) {
        for (const e of entries.current.values()) resetRig(e.rig)
        wasEnabled.current = false
        diag.current = EMPTY_DIAG
        onDiagnostics?.(EMPTY_DIAG)
      }
      return
    }
    wasEnabled.current = true

    sinceScan.current += dt
    if (sinceScan.current >= rescanInterval) {
      sinceScan.current = 0
      const result = scanAvatars(scene)

      const seen = new Set<string>()
      let withBlink = 0
      let withLookAt = 0
      for (const rig of result.rigs) {
        const key = rig.root.uuid
        seen.add(key)
        if (!entries.current.has(key)) {
          const personality = personalityOf(key)
          entries.current.set(key, {
            rig,
            personality,
            blink: initBlink(personality),
            gaze: initGaze(),
          })
        } else {
          // 同じルートでも中身が差し替わることがあるので参照を更新
          entries.current.get(key)!.rig = rig
        }
        if (rig.expressions.has('blink') || rig.expressions.has('blinkLeft')) withBlink++
        if (rig.lookAt) withLookAt++
      }

      // 退室したアバターを落とす
      for (const [key, e] of entries.current) {
        if (!seen.has(key)) {
          resetRig(e.rig)
          entries.current.delete(key)
        }
      }

      const next: Diagnostics = {
        rigged: result.rigs.length,
        expressionless: result.expressionlessAvatars,
        withBlink,
        withLookAt,
        totalNodes: result.totalNodes,
      }
      const prev = diag.current
      if (
        next.rigged !== prev.rigged ||
        next.expressionless !== prev.expressionless ||
        next.withBlink !== prev.withBlink ||
        next.withLookAt !== prev.withLookAt
      ) {
        diag.current = next
        onDiagnostics?.(next)
      }
    }

    // 視線の候補＝各アバターの頭＋自分の視点。
    // デスクトップでは自分のアバターが描かれないことがあるのでカメラも候補に足す。
    const candidates = heads.current
    candidates.length = 0
    for (const e of entries.current.values()) {
      candidates.push(e.rig.head.getWorldPosition(new Vector3()))
    }
    candidates.push(camera.getWorldPosition(new Vector3()))

    for (const e of entries.current.values()) {
      applyBlink(e.rig, stepBlink(e.blink, e.personality, dt))

      if (e.rig.lookAt) {
        stepGaze(e.gaze, e.rig, e.personality, candidates, dt)
        if (e.rig.lookAt.target !== e.gaze.target) e.rig.lookAt.target = e.gaze.target
      }
    }
  })

  return null
}

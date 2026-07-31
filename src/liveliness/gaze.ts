import { Object3D, Vector3 } from 'three'
import type { AvatarRig } from './scan'
import { gazeAttentionOf, gazeAvertOf, gazeDwellOf, type Personality } from './personality'

/**
 * 疑似視線。実測の視線ではなく、周りの人と部屋を見回す合成。
 *
 * VRChatのドキュメントが率直に書いている通りのもの:
 *   "This isn't eye tracking but it is a pretty good way of making your avatar
 *    look more 'alive'."
 *
 * 実装上の要点は3つ。
 *
 * ①**視線の移動はサッカードであって補間ではない。** 人の目は点から点へ30〜80msで
 *   飛び、その間は視覚が抑制される。ゆっくり lerp すると人形の首振りになる。
 *   ∴ 移動は40msの速い遷移で、あとは固視。
 *
 * ②**固視中も完全に止めない。** 相手の顔を見るとき、人は目・口・目と細かく
 *   打ち直している。固視点に微小なドリフトを載せる。
 *
 * ③**ずっと見続けない。** 注視と逸らしを交互に打つ。この配分が性格スライダー
 *   （shy↔confident）の実体で、VRChatも同じ2値を持っている。
 */

const SACCADE_S = 0.04

/** 顔の中で打ち直す点（頭の位置からの相対・メートル）。目のあたりと口のあたり */
const FACE_POINTS: readonly [number, number][] = [
  [0.03, 0.02],
  [-0.03, 0.02],
  [0, -0.05],
]

export interface GazeState {
  /** 我々が所有する注視点。lookAt.target に差す */
  target: Object3D
  /** 現在の注視点（ワールド） */
  current: Vector3
  /** 移動元 */
  from: Vector3
  /** 移動先 */
  to: Vector3
  /** サッカード進行 0〜1。1なら固視中 */
  t: number
  /** 次に打ち直すまでの残り秒 */
  hold: number
  /** 誰かを見ているか */
  attending: boolean
}

export const initGaze = (): GazeState => {
  const target = new Object3D()
  target.name = 'liveliness_gaze_target'
  return {
    target,
    current: new Vector3(),
    from: new Vector3(),
    to: new Vector3(),
    t: 1,
    hold: Math.random() * 2,
    attending: false,
  }
}

const tmpHead = new Vector3()
const tmpFwd = new Vector3()

/** 次の注視点を決める */
const pickPoint = (
  rig: AvatarRig,
  p: Personality,
  candidates: Vector3[],
  out: Vector3,
): boolean => {
  rig.head.getWorldPosition(tmpHead)

  // 近い順に見て、手が届く範囲（6m以内）に居る相手だけ候補にする
  let best: Vector3 | null = null
  let bestD = Infinity
  for (const c of candidates) {
    const d = c.distanceTo(tmpHead)
    if (d < 0.35) continue // 自分
    if (d > 6 || d >= bestD) continue
    best = c
    bestD = d
  }

  if (best && Math.random() < gazeAttentionOf(p)) {
    const [dx, dy] = FACE_POINTS[(Math.random() * FACE_POINTS.length) | 0]
    out.copy(best).add(tmpHead.clone().sub(best).normalize().multiplyScalar(0)).setX(best.x + dx).setY(best.y + dy)
    return true
  }

  // 誰も見ないときは部屋を見回す。頭の前方を基準に左右±50度・上下を振る
  rig.head.getWorldDirection(tmpFwd)
  // three のボーンは -Z が前とは限らないので、水平成分だけ使って方位を作る
  const yaw = Math.atan2(-tmpFwd.x, -tmpFwd.z) + (Math.random() - 0.5) * 1.7
  const pitch = (Math.random() - 0.55) * 0.5
  const dist = 2.5 + Math.random() * 3
  out.set(
    tmpHead.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    tmpHead.y + Math.sin(pitch) * dist,
    tmpHead.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  )
  return false
}

/**
 * 1フレーム進める。candidates は他アバターの頭のワールド座標。
 * lookAt が無いアバターでは呼ばれても副作用は注視点の更新だけで害が無い。
 */
export const stepGaze = (
  st: GazeState,
  rig: AvatarRig,
  p: Personality,
  candidates: Vector3[],
  dt: number,
): void => {
  if (st.t < 1) {
    st.t = Math.min(1, st.t + dt / SACCADE_S)
    st.current.lerpVectors(st.from, st.to, st.t)
  } else {
    st.hold -= dt
    if (st.hold <= 0) {
      st.from.copy(st.current)
      st.attending = pickPoint(rig, p, candidates, st.to)
      // 初回は瞬間移動（目の初期位置から飛ぶのを見せない）
      if (st.from.lengthSq() === 0) st.from.copy(st.to)
      st.t = 0
      st.hold = st.attending
        ? gazeDwellOf(p) * (0.6 + Math.random() * 0.8)
        : gazeAvertOf(p) * (0.6 + Math.random() * 0.8)
    } else {
      // 固視中の微小ドリフト。止め切ると人形になる
      st.current.x += (Math.random() - 0.5) * 0.0012
      st.current.y += (Math.random() - 0.5) * 0.0012
    }
  }

  st.target.position.copy(st.current)
  st.target.updateMatrixWorld()
}

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
 * 実装上の要点。
 *
 * ①**眼球だけで振ってよい範囲は狭い。** 人は15度を超える方向を見るとき目より先に
 *   首を回す。目だけ大きく振ると「目が泳ぐ」見え方になる。さらにVRMのlookAtは
 *   rangeMapで角度を切るので、範囲外を要求すると可動端に張り付いて余計に極端になる。
 *   首はプレイヤー本人が回すのでこちらからは触らず、要求角を最初から錐台に収める。
 *
 * ②**注視点は頭に対する相対角で持つ。** ワールド座標で固定すると、頭が回った分だけ
 *   相対角が開いて目が端まで流れる。相対で持てば、頭を回したとき目は自然に正面へ戻る。
 *
 * ③**視線の移動はサッカードであって補間ではない。** 人の目は点から点へ30〜80msで
 *   飛ぶ。ゆっくりlerpすると人形の首振りになる。
 *
 * ④**固視中も完全には止めない。** 相手の顔を見るとき、人は目・口・目と細かく
 *   打ち直している。微小なドリフトを載せる。
 *
 * ⑤**ずっと見続けない。** 注視と逸らしを交互に打つ。この配分が性格スライダー
 *   （shy↔confident）の実体で、VRChatも同じ2値を持っている。
 */

const SACCADE_S = 0.045

/**
 * 目を実際に何度回すか（度）。要求角ではなく**結果**で決める。
 *
 * VRMのlookAtは rangeMap で入力角を圧縮しており、その比はモデルごとに違う
 * （手元のモデルは入力90度→出力10度の9:1）。だから「何度を要求するか」を決め打つと、
 * あるモデルでは目が飛び出し別のモデルではほとんど動かない。狙うのは実振れ角の方。
 *
 * 会話中に相手の目と口を往復するときの眼球回転は数度。部屋を見回すときはもう少し大きい。
 */
const ATTEND_EYE_DEG = 3.5
const IDLE_EYE_DEG = 6
const VERTICAL_EYE_DEG = 2.5

/** モデルが許す最大の何割までを使うか。可動端に張り付くと極端に見えるので余裕を残す */
const HEADROOM = 0.8

const DEG2RAD = Math.PI / 180

/** 実振れ角（度）から、要求すべき角度（ラジアン）を逆算する */
const requestFor = (deg: number, gain: number, maxDeg: number): number =>
  (Math.min(deg, maxDeg * HEADROOM) / Math.max(gain, 1e-4)) * DEG2RAD

/** 相手を見るとみなす距離 */
const ATTEND_MAX_DIST = 6

/** 顔の中で打ち直す点（相手の頭からの相対・メートル）。目のあたりと口のあたり */
const FACE_POINTS: readonly [number, number][] = [
  [0.03, 0.02],
  [-0.03, 0.02],
  [0, -0.05],
]

export interface GazeState {
  /** 我々が所有する注視点。lookAt.target に差す */
  target: Object3D
  /** 頭に対する現在の相対角 */
  yaw: number
  pitch: number
  /** サッカードの始点と終点 */
  fromYaw: number
  fromPitch: number
  toYaw: number
  toPitch: number
  /** サッカード進行 0〜1。1なら固視中 */
  t: number
  /** 次に打ち直すまでの残り秒 */
  hold: number
  /** 誰かを見ているか */
  attending: boolean
  /** 追っている相手の位置（見失うまで毎フレーム更新する） */
  attendPoint: Vector3 | null
  /** 顔のどこを見ているか */
  faceOffset: [number, number]
}

export const initGaze = (): GazeState => {
  const target = new Object3D()
  target.name = 'liveliness_gaze_target'
  return {
    target,
    yaw: 0,
    pitch: 0,
    fromYaw: 0,
    fromPitch: 0,
    toYaw: 0,
    toPitch: 0,
    t: 1,
    hold: Math.random() * 2,
    attending: false,
    attendPoint: null,
    faceOffset: [0, 0],
  }
}

const tmpHead = new Vector3()
const tmpFwd = new Vector3()

const clamp = (v: number, lim: number): number => (v < -lim ? -lim : v > lim ? lim : v)

/** 角度を -π〜π に畳む */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * 頭の位置と、顔が向いている方位を読む。
 *
 * 前方は頭ボーンの **+Z**。VRMのモデル自体は -Z を向いて立つ規約だが、lookAtが基準に
 * するのは `faceFront`（既定 +Z）を頭の回転で回したベクトルの方で、これは
 * `head.getWorldDirection()` と一致する（実測で3経路が同値 (0.878, 0, 0.479) を返した）。
 *
 * ここを -Z と取り違えると、狙う点が真後ろに出る。VRMLookAtは内部で ±180度に近い
 * 角度を計算し、rangeMap の inputMaxValue で切られて**目が可動端に張り付いたまま**になる。
 * 実際に一度そうなった（内部 _yaw が -40〜-127度・inputMaxValue は90）。
 */
const readHead = (rig: AvatarRig): number => {
  rig.head.getWorldPosition(tmpHead)
  rig.head.getWorldDirection(tmpFwd)
  return Math.atan2(tmpFwd.x, tmpFwd.z)
}

/** ワールド上の点を、頭に対する相対角（錐台に丸め済み）へ落とす */
const offsetsTo = (
  point: Vector3,
  baseYaw: number,
  maxYaw: number,
  maxPitch: number,
): [number, number] => {
  const dyaw = Math.atan2(point.x - tmpHead.x, point.z - tmpHead.z) - baseYaw
  const horiz = Math.hypot(point.x - tmpHead.x, point.z - tmpHead.z)
  return [
    clamp(wrap(dyaw), maxYaw),
    clamp(Math.atan2(point.y - tmpHead.y, horiz), maxPitch),
  ]
}

/** 見る相手を選ぶ。首を回さないと見られない位置の人は選ばない */
const findAttendable = (
  candidates: Vector3[],
  baseYaw: number,
  maxYaw: number,
): Vector3 | null => {
  let best: Vector3 | null = null
  let bestD = Infinity
  for (const c of candidates) {
    const d = c.distanceTo(tmpHead)
    if (d < 0.35 || d > ATTEND_MAX_DIST || d >= bestD) continue
    if (Math.abs(wrap(Math.atan2(c.x - tmpHead.x, c.z - tmpHead.z) - baseYaw)) > maxYaw * 1.6) continue
    best = c
    bestD = d
  }
  return best
}

/**
 * 1フレーム進める。candidates は他アバターの頭のワールド座標。
 * lookAt が無いアバターでは注視点の更新だけで、害は無い。
 */
export const stepGaze = (
  st: GazeState,
  rig: AvatarRig,
  p: Personality,
  candidates: Vector3[],
  dt: number,
): void => {
  const baseYaw = readHead(rig)
  const g = rig.gazeGain
  const attendYaw = requestFor(ATTEND_EYE_DEG, g.yaw, g.maxYawDeg)
  const idleYaw = requestFor(IDLE_EYE_DEG, g.yaw, g.maxYawDeg)
  const maxPitch = requestFor(VERTICAL_EYE_DEG, g.pitch, g.maxPitchDeg)

  // 相手を追っている間は、相手が動いても目で追う（見失ったら見回しへ落ちる）
  if (st.attending && st.attendPoint) {
    let nearest: Vector3 | null = null
    let nd = 1.0
    for (const c of candidates) {
      const d = c.distanceTo(st.attendPoint)
      if (d < nd) {
        nd = d
        nearest = c
      }
    }
    if (nearest) {
      st.attendPoint.copy(nearest)
      const [dx, dy] = st.faceOffset
      const aim = st.attendPoint.clone().setX(st.attendPoint.x + dx).setY(st.attendPoint.y + dy)
      const [y, pt] = offsetsTo(aim, baseYaw, attendYaw, maxPitch)
      st.toYaw = y
      st.toPitch = pt
    } else {
      st.attending = false
      st.attendPoint = null
    }
  }

  if (st.t < 1) {
    st.t = Math.min(1, st.t + dt / SACCADE_S)
    st.yaw = st.fromYaw + (st.toYaw - st.fromYaw) * st.t
    st.pitch = st.fromPitch + (st.toPitch - st.fromPitch) * st.t
  } else {
    // 固視中も終点へ緩く追従させる（相手が歩いても目が置いていかれない）
    st.yaw += (st.toYaw - st.yaw) * Math.min(1, dt * 6)
    st.pitch += (st.toPitch - st.pitch) * Math.min(1, dt * 6)

    st.hold -= dt
    if (st.hold <= 0) {
      st.fromYaw = st.yaw
      st.fromPitch = st.pitch

      const person = findAttendable(candidates, baseYaw, attendYaw)
      if (person && Math.random() < gazeAttentionOf(p)) {
        st.attending = true
        st.attendPoint = person.clone()
        st.faceOffset = FACE_POINTS[(Math.random() * FACE_POINTS.length) | 0]
        const aim = person
          .clone()
          .setX(person.x + st.faceOffset[0])
          .setY(person.y + st.faceOffset[1])
        const [y, pt] = offsetsTo(aim, baseYaw, attendYaw, maxPitch)
        st.toYaw = y
        st.toPitch = pt
        st.hold = gazeDwellOf(p) * (0.6 + Math.random() * 0.8)
      } else {
        st.attending = false
        st.attendPoint = null
        st.toYaw = (Math.random() - 0.5) * 2 * idleYaw
        st.toPitch = (Math.random() - 0.55) * 2 * maxPitch
        st.hold = gazeAvertOf(p) * (0.6 + Math.random() * 0.8)
      }
      st.t = 0
    } else {
      // 固視中の微小ドリフト。止め切ると人形になる
      st.yaw += (Math.random() - 0.5) * 0.0016
      st.pitch += (Math.random() - 0.5) * 0.0012
    }
  }

  // 相対角をワールドの注視点へ戻す。距離は目の輻輳に効くので相手までの距離を使う
  const dist = st.attending && st.attendPoint ? Math.max(0.8, st.attendPoint.distanceTo(tmpHead)) : 3.5
  const yaw = baseYaw + st.yaw
  st.target.position.set(
    tmpHead.x + Math.sin(yaw) * Math.cos(st.pitch) * dist,
    tmpHead.y + Math.sin(st.pitch) * dist,
    tmpHead.z + Math.cos(yaw) * Math.cos(st.pitch) * dist,
  )
  st.target.updateMatrixWorld()
}

import type { AvatarRig } from './scan'
import { blinkIntervalOf, type Personality } from './personality'

/**
 * 自動まばたき。
 *
 * 生理の実測に合わせた3相の台形カーブで、等速の往復にしない:
 *   閉じ  60ms（速い。ここを遅くすると眠そうになる）
 *   保持  40ms
 *   開き 120ms（閉じの2倍かける。ここが非対称でないと機械的に見える）
 *
 * 間隔は性格から決めた平均値に ±45% のばらつきを乗せ、さらに一定確率で
 * 二連瞬き（人は単発より連続で打つことがある）を混ぜる。
 */

const CLOSE_S = 0.06
const HOLD_S = 0.04
const OPEN_S = 0.12
const CYCLE_S = CLOSE_S + HOLD_S + OPEN_S

/** 二連瞬きの発生率 */
const DOUBLE_RATE = 0.18

export interface BlinkState {
  /** 次に瞬きを始めるまでの残り秒。負なら瞬き中 */
  timer: number
  /** 瞬き開始からの経過秒 */
  phase: number
  blinking: boolean
  /** 残りの連続回数（二連瞬きなら1） */
  remaining: number
}

export const initBlink = (p: Personality): BlinkState => ({
  // 初期値をばらけさせないと、入室した全員が同時に瞬く
  timer: Math.random() * blinkIntervalOf(p),
  phase: 0,
  blinking: false,
  remaining: 0,
})

/** 台形カーブ。0（開）〜1（閉） */
const curve = (phase: number): number => {
  if (phase < CLOSE_S) return phase / CLOSE_S
  if (phase < CLOSE_S + HOLD_S) return 1
  const t = (phase - CLOSE_S - HOLD_S) / OPEN_S
  return Math.max(0, 1 - t)
}

const nextInterval = (p: Personality): number => {
  const base = blinkIntervalOf(p)
  return base * (0.55 + Math.random() * 0.9)
}

/**
 * 1フレーム進めて blink の weight を返す。
 * blinkLeft/blinkRight しか持たないアバターのために、呼び出し側で振り分ける。
 */
export const stepBlink = (st: BlinkState, p: Personality, dt: number): number => {
  if (st.blinking) {
    st.phase += dt
    if (st.phase >= CYCLE_S) {
      st.blinking = false
      st.phase = 0
      if (st.remaining > 0) {
        st.remaining--
        // 二連目は間を置かずすぐ
        st.timer = 0.05
      } else {
        st.timer = nextInterval(p)
      }
      return 0
    }
    return curve(st.phase)
  }

  st.timer -= dt
  if (st.timer <= 0) {
    st.blinking = true
    st.phase = 0
    st.remaining = Math.random() < DOUBLE_RATE ? 1 : 0
  }
  return 0
}

/** 求めた weight をアバターに書く。blink が無ければ左右個別にフォールバック */
export const applyBlink = (rig: AvatarRig, weight: number): void => {
  const both = rig.expressions.get('blink')
  if (both) {
    both.weight = weight
    return
  }
  const l = rig.expressions.get('blinkLeft')
  const r = rig.expressions.get('blinkRight')
  if (l) l.weight = weight
  if (r) r.weight = weight
}

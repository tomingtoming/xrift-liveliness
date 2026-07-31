/**
 * 性格スライダー2本。VRChatのAvatar Descriptorが持つものと同じ2軸。
 *
 *   calm ↔ excited     … まばたきの頻度
 *   shy  ↔ confident   … 他人の顔を見る頻度と、目を逸らすまでの注視時間
 *
 * VRChatではユーザーがアバターごとに設定する値だが、ここでは設定を持ち込む口が
 * 無いので、アバターのuuidから決定論的に導く。狙いは「全員が同じリズムで瞬きして
 * 一斉に同じ方向を見る」のを避けること（同期した瞬きは生き物に見えない）。
 */

export interface Personality {
  /** 0=calm 〜 1=excited */
  excited: number
  /** 0=shy 〜 1=confident */
  confident: number
}

/** 文字列から0〜1の安定した擬似乱数を2本取る（FNV-1a） */
const hash = (s: string, salt: number): number => {
  let h = 0x811c9dc5 ^ salt
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 10000) / 10000
}

export const personalityOf = (uuid: string): Personality => ({
  // 両端に寄りすぎると挙動が極端になるので 0.2〜0.8 に収める
  excited: 0.2 + hash(uuid, 1) * 0.6,
  confident: 0.2 + hash(uuid, 2) * 0.6,
})

/** まばたきの平均間隔（秒）。実測値の範囲＝安静時2〜10秒、平均4秒前後 */
export const blinkIntervalOf = (p: Personality): number => 5.6 - p.excited * 3.2

/** 相手の顔を見続ける時間（秒）。shyほど短く目を逸らす */
export const gazeDwellOf = (p: Personality): number => 1.0 + p.confident * 3.4

/** 目を逸らしている時間（秒）。shyほど長い */
export const gazeAvertOf = (p: Personality): number => 2.6 - p.confident * 1.8

/** 相手が居るとき、そちらを見る確率 */
export const gazeAttentionOf = (p: Personality): number => 0.35 + p.confident * 0.5

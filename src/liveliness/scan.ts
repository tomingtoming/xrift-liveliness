import type { Object3D } from 'three'

/**
 * シーンからVRMアバターの「表情を書ける口」を見つける。
 *
 * XRiftのアバターは three-vrm でロードされる（ホストの SafeVRMLoaderPlugin が
 * VRMLoaderPlugin を継承。SpringBoneだけ安全版に差し替え）。three-vrm は各表情を
 *
 *   name: "VRMExpression_<preset名>", type: "VRMExpression", weight: number
 *
 * という Object3D として vrm.scene に add する。ホストは毎フレーム vrm.update(delta)
 * を呼んでおり、その中で expressionManager が clearAppliedWeight → applyWeight を回す。
 * ∴ こちらは weight を書くだけでよく、適用はホストがやってくれる。
 *
 * 視線は lookAtQuaternionProxy ノードが持つ vrmLookAt（VRMLookAt実体）に target を
 * 差せば、同じ vrm.update() の中で目に反映される。
 *
 * 前提を1つも壊さない設計にしている:
 *   - シーンに何も add しない（gaze target だけは呼び出し側が持つ）
 *   - weight 以外のプロパティを書かない
 *   - ホストが表情を駆動していないことは実測済み（アバターchunkに expressionManager
 *     への参照が無く、standing_idle.vrma の expressions/lookAt も null）
 */

/** three-vrm の VRMExpression（構造的にだけ触る。three-vrm を依存に入れない） */
interface ExpressionNode extends Object3D {
  weight: number
}

interface RangeMap {
  inputMaxValue: number
  outputScale: number
}

/** three-vrm の VRMLookAt（同上） */
export interface VrmLookAt {
  target?: Object3D | null
  autoUpdate?: boolean
  applier?: {
    rangeMapHorizontalOuter?: RangeMap
    rangeMapHorizontalInner?: RangeMap
    rangeMapVerticalUp?: RangeMap
    rangeMapVerticalDown?: RangeMap
  }
}

/**
 * 「何度を要求すると目が何度回るか」の比。
 *
 * VRMのlookAtは rangeMap で入力角を圧縮する。手元のモデルは入力90度→出力10度の
 * 9:1で、これは作者が「目はこれ以上動かさない」と決めた様式そのもの。値はモデルごとに
 * 違うので、要求角を決め打ちすると、あるモデルでは目が飛び出し別のモデルでは動いて
 * 見えない。∴ 実行時に読んで、狙った実振れ角から逆算する。
 *
 * 読めなければVRM既定の9:1を仮定する。
 */
export interface GazeGain {
  /** 出力度 / 入力度 */
  yaw: number
  pitch: number
  /** このモデルが許す最大の実振れ角（度） */
  maxYawDeg: number
  maxPitchDeg: number
}

const DEFAULT_GAIN: GazeGain = { yaw: 10 / 90, pitch: 10 / 90, maxYawDeg: 10, maxPitchDeg: 10 }

const gainOf = (lookAt: VrmLookAt | null): GazeGain => {
  const a = lookAt?.applier
  if (!a) return DEFAULT_GAIN
  const h = a.rangeMapHorizontalOuter ?? a.rangeMapHorizontalInner
  const v = a.rangeMapVerticalUp ?? a.rangeMapVerticalDown
  if (!h?.inputMaxValue || !v?.inputMaxValue) return DEFAULT_GAIN
  return {
    yaw: h.outputScale / h.inputMaxValue,
    pitch: v.outputScale / v.inputMaxValue,
    maxYawDeg: h.outputScale,
    maxPitchDeg: v.outputScale,
  }
}

interface LookAtProxyNode extends Object3D {
  vrmLookAt?: VrmLookAt
}

/**
 * VRMLookAtQuaternionProxy の判定。
 *
 * これは three-vrm 本体でなく @pixiv/three-vrm-animation のクラスで、VRMAアニメを
 * 再生するホストが自分で vrm.scene に add する。XRiftはVRMAで体を動かしているので
 * 実機のシーンに存在する（バンドル内に name="lookAtQuaternionProxy" を確認済み）。
 *
 * 名前はホストが付ける慣習値なので当てにせず、vrmLookAt を持っているかで判定する。
 */
const asLookAtProxy = (obj: Object3D): VrmLookAt | null => {
  const p = obj as LookAtProxyNode
  return p.vrmLookAt ? p.vrmLookAt : null
}

/** 見つかった1体ぶんのアバター */
export interface AvatarRig {
  /** vrm.scene 相当のルート（表情ノードの共通の親） */
  root: Object3D
  /** preset名 → 表情ノード（"blink" 等。書けるのは .weight） */
  expressions: Map<string, ExpressionNode>
  /** 視線の口。無いアバターもある */
  lookAt: VrmLookAt | null
  /** そのモデルの視線の効き具合（rangeMapから実測） */
  gazeGain: GazeGain
  /** 頭の位置の目安（視線の相手として狙う点）。見つからなければ root */
  head: Object3D
}

export interface ScanResult {
  rigs: AvatarRig[]
  /** 表情ノードを1つも持たないアバター（XRift既定アバター等）の数 */
  expressionlessAvatars: number
  totalNodes: number
}

const EXPRESSION_PREFIX = 'VRMExpression_'

/**
 * 表情ノードから「そのアバターのルート」へ遡る。
 * three-vrm は expression を vrm.scene 直下に add するので親1つで足りるが、
 * 実装差で1段深い場合に備えて、表情ノードを複数抱える最も近い祖先を採る。
 */
const rootOfExpression = (node: Object3D): Object3D => node.parent ?? node

/** 頭ボーンらしきものを名前で拾う（VRM Humanoid の正規化ボーンは "Normalized_J_Bip_C_Head" 等） */
const isHeadName = (name: string): boolean => {
  const n = name.toLowerCase()
  return n.includes('head') && !n.includes('headtop') && !n.includes('_end')
}

/**
 * 既定アバター（セグメント方式のプレースホルダ）の検出。
 * xrift-mirror が実機診断で確定した構造＝名前付きボーン風 Object3D に
 * Blender原始図形の Mesh を直付けした簡易アバターで、VRMではないため表情を持たない。
 * 提案の材料として「表情を持てない参加者が何人いるか」を数えたいので拾っておく。
 */
const isSegmentedAvatarRoot = (obj: Object3D): boolean => {
  if (obj.children.length < 4) return false
  let jointish = 0
  for (const c of obj.children) {
    const n = c.name.toLowerCase()
    if (n.includes('hips') || n.includes('spine') || n.includes('head') || n.includes('shoulder')) jointish++
  }
  return jointish >= 2
}

const isAncestorOf = (ancestor: Object3D, node: Object3D): boolean => {
  let p = node.parent
  while (p) {
    if (p === ancestor) return true
    p = p.parent
  }
  return false
}

export const scanAvatars = (scene: Object3D): ScanResult => {
  const byRoot = new Map<Object3D, AvatarRig>()
  const lookAtByRoot = new Map<Object3D, VrmLookAt>()
  const segmentedRoots = new Set<Object3D>()
  let totalNodes = 0

  scene.traverse((obj) => {
    totalNodes++

    if (obj.type === 'VRMExpression' && obj.name.startsWith(EXPRESSION_PREFIX)) {
      const root = rootOfExpression(obj)
      let rig = byRoot.get(root)
      if (!rig) {
        rig = { root, expressions: new Map(), lookAt: null, gazeGain: DEFAULT_GAIN, head: root }
        byRoot.set(root, rig)
      }
      const preset = obj.name.slice(EXPRESSION_PREFIX.length)
      rig.expressions.set(preset, obj as ExpressionNode)
      return
    }

    const lookAt = asLookAtProxy(obj)
    if (lookAt) {
      lookAtByRoot.set(obj.parent ?? obj, lookAt)
      return
    }

    if (isSegmentedAvatarRoot(obj)) segmentedRoots.add(obj)
  })

  // VRMアバターの内側にも「hips/spine/head を子に持つノード」はあるので、
  // 素直に数えるとVRMを既定アバターとして二重に数えてしまう（実測で発覚）。
  // 表情ノードを持つツリーに属する候補は落とす。
  for (const candidate of [...segmentedRoots]) {
    let inRig = false
    for (const root of byRoot.keys()) {
      if (root === candidate || isAncestorOf(root, candidate) || isAncestorOf(candidate, root)) {
        inRig = true
        break
      }
    }
    if (inRig) segmentedRoots.delete(candidate)
  }

  // 視線と頭を紐づける
  for (const [root, rig] of byRoot) {
    rig.lookAt = lookAtByRoot.get(root) ?? null
    rig.gazeGain = gainOf(rig.lookAt)
    root.traverse((o) => {
      if (rig.head === root && o.type === 'Bone' && isHeadName(o.name)) rig.head = o
    })
  }

  return {
    rigs: [...byRoot.values()],
    expressionlessAvatars: segmentedRoots.size,
    totalNodes,
  }
}

/** 表情を全部0に戻す（OFFに切り替えたとき用。冪等） */
export const resetRig = (rig: AvatarRig): void => {
  for (const node of rig.expressions.values()) node.weight = 0
  if (rig.lookAt) rig.lookAt.target = null
}

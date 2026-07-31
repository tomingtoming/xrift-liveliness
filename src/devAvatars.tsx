/**
 * 開発専用（npm run dev のみ）。本番のフェデレーションバンドルには入らない。
 *
 * XRiftのホストがやっていることを手元で再現する:
 *   VRMLoaderPlugin でVRMをロード → vrm.scene をシーンに add → 毎フレーム vrm.update(dt)
 *
 * この3点が Liveliness の前提そのものなので、ここが動けば実機でも同じ口が使えるはず、
 * という関係になる。逆に言うと、実機での確認までは「はず」のままである点に注意。
 *
 * モデルは three-vrm 公式サンプル（public/test-avatar.vrm・gitignore済み・非同梱）。
 * 手元のアバター（玉の巻物使い・Lowi・キョンシー娘）は表情プリセットを宣言だけして
 * morphTargetBinds が空なので、まばたきの確認には使えない（視線はボーン式なので効く）。
 */

import { useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm'
import { VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation'
import { Group, Object3D, PerspectiveCamera, Vector3 } from 'three'

const MODEL_URL = (() => {
  const q = new URLSearchParams(location.search).get('model')
  return q ? `/dev-assets/${q}` : '/test-avatar.vrm'
})()

const PLACEMENTS: { position: [number, number, number]; rotationY: number }[] = [
  { position: [-1.1, 0, -0.6], rotationY: 0.35 },
  { position: [1.2, 0, -0.9], rotationY: -0.5 },
]

export const DevAvatars = () => {
  const { scene } = useThree()
  const [vrms, setVrms] = useState<VRM[]>([])

  // 機械検証（scripts/liveliness-probe.mjs）からシーンを掴むための口。
  // 開発ハーネス専用ファイルなので本番バンドルには入らない。
  useEffect(() => {
    ;(globalThis as unknown as { __scene?: unknown }).__scene = scene
  }, [scene])

  const { gl, camera } = useThree()
  useEffect(() => {
    ;(globalThis as unknown as { __gl?: unknown; __camera?: unknown }).__gl = gl
    ;(globalThis as unknown as { __camera?: unknown }).__camera = camera

    // 候補アバターの見た目を撮るための口（検証専用）。撮影用カメラで直接renderするので
    // 操作ヒントのDOMオーバーレイが写り込まない。
    ;(globalThis as unknown as { __portrait?: (d: number) => string | null }).__portrait = (
      distance: number,
    ) => {
      let head: Object3D | null = null
      scene.traverse((o) => {
        if (!head && o.type === 'Bone' && /head/i.test(o.name) && !/end|top/i.test(o.name)) head = o
      })
      if (!head) return null
      const aim = new Vector3()
      ;(head as Object3D).getWorldPosition(aim)
      if (distance > 1) aim.y -= 0.75
      const shot = new PerspectiveCamera(30, 1, 0.01, 100)
      shot.position.set(aim.x, aim.y, aim.z + distance)
      shot.lookAt(aim)
      shot.updateMatrixWorld()
      gl.render(scene, shot)
      return gl.domElement.toDataURL('image/png')
    }
  }, [gl, camera, scene])

  useEffect(() => {
    let disposed = false
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    const loaded: VRM[] = []
    const holders: Group[] = []

    Promise.all(
      PLACEMENTS.map(
        (p) =>
          new Promise<void>((resolve) => {
            loader.load(
              MODEL_URL,
              (gltf) => {
                if (disposed) return resolve()
                const vrm = gltf.userData.vrm as VRM
                // XRiftと同じ構成にする。VRMAで体を動かすホストは
                // VRMLookAtQuaternionProxy を自分で vrm.scene に add しており、
                // 視線に手が届く口はこれ（実機バンドルに存在を確認済み）。
                if (vrm.lookAt) {
                  const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt)
                  proxy.name = 'lookAtQuaternionProxy'
                  vrm.scene.add(proxy)
                }
                const holder = new Group()
                holder.position.set(...p.position)
                holder.rotation.y = p.rotationY
                holder.add(vrm.scene)
                scene.add(holder)
                loaded.push(vrm)
                holders.push(holder)
                resolve()
              },
              undefined,
              (err) => {
                console.warn('[devAvatars] VRMのロードに失敗:', err)
                resolve()
              },
            )
          }),
      ),
    ).then(() => {
      if (!disposed) setVrms(loaded)
    })

    return () => {
      disposed = true
      for (const h of holders) scene.remove(h)
    }
  }, [scene])

  // ホストと同じく毎フレーム update する。ここで expressionManager と lookAt が適用される
  useFrame((_, dt) => {
    for (const vrm of vrms) vrm.update(Math.min(dt, 0.1))
  })

  return null
}

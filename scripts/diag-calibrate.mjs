// 「どのワールド方向に注視点を置くと内部_yaw/_pitchが0になるか」を実測で探す。
// 規約を推測せず、実際の応答から正面を割り出す。
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
await page.goto((process.env.URL ?? 'http://localhost:5180/') + '?nolively=1')
await page.waitForFunction(() => !!globalThis.__scene, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(2000)
console.log(JSON.stringify(await page.evaluate(async () => {
  let la = null, proxy = null
  globalThis.__scene.traverse(o => { if (!la && o.vrmLookAt) { la = o.vrmLookAt; proxy = o } })
  // lookAtの基準位置はライブラリが持っている
  const V = globalThis.__camera.position.constructor
  const origin = la.getLookAtWorldPosition(new V())
  // 我々のLivelinessが差しているtargetを一時的に借りて掃引する
  // 駆動が止まっているのでtargetは空。自前のObject3Dを差して掃引する
  const O3 = Object.getPrototypeOf(globalThis.__scene).constructor
  const probe = new O3()
  la.target = probe
  la.autoUpdate = true
  const wait = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const rows = []
  for (let deg = 0; deg < 360; deg += 15) {
    const a = deg * Math.PI / 180
    probe.position.set(origin.x + Math.sin(a) * 3, origin.y, origin.z + Math.cos(a) * 3)
    probe.updateMatrixWorld()
    await wait()
    rows.push({ dirDeg: deg, yaw: +la._yaw.toFixed(1), pitch: +la._pitch.toFixed(1) })
  }
  // yawの絶対値が最小＝正面
  const best = rows.reduce((a, b) => (Math.abs(b.yaw) < Math.abs(a.yaw) ? b : a))
  // 高さ方向も1点調べる
  return { origin: { x:+origin.x.toFixed(3), y:+origin.y.toFixed(3), z:+origin.z.toFixed(3) }, best, rows }
}), null, 1))
await browser.close()

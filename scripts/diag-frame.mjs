import { chromium } from '@playwright/test'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
await page.goto((process.env.URL ?? 'http://localhost:5180/') + '?nolively=1')
await page.waitForFunction(() => !!globalThis.__scene, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(2000)
console.log(JSON.stringify(await page.evaluate(() => {
  let la = null
  globalThis.__scene.traverse(o => { if (!la && o.vrmLookAt) la = o.vrmLookAt })
  const V = globalThis.__camera.position.constructor
  const az = (v) => +(Math.atan2(v.x, v.z) * 180 / Math.PI).toFixed(2)
  const ff = () => new V(la.faceFront.x, la.faceFront.y, la.faceFront.z)
  const out = {}
  // 候補1: rest head world quaternion（ライブラリが基準にしていると睨んだもの）
  if (la._restHeadWorldQuaternion) out.restHeadWorldQuat = az(ff().applyQuaternion(la._restHeadWorldQuaternion))
  // 候補2: getLookAtWorldQuaternion
  const Q = Object.getPrototypeOf(globalThis.__camera.quaternion).constructor
  out.lookAtWorldQuat = az(ff().applyQuaternion(la.getLookAtWorldQuaternion(new Q())))
  // 候補3: humanoid の正規化hipsボーン（体の向き）
  const hips = la.humanoid?.getNormalizedBoneNode?.('hips')
  if (hips) out.normalizedHips = az(hips.getWorldDirection(new V()))
  const rawHead = la.humanoid?.getRawBoneNode?.('head')
  if (rawHead) out.rawHeadDir = az(rawHead.getWorldDirection(new V()))
  const nHead = la.humanoid?.getNormalizedBoneNode?.('head')
  if (nHead) out.normalizedHeadDir = az(nHead.getWorldDirection(new V()))
  out.note = '校正で判明した真の正面 ≈ 20度'
  return out
}), null, 1))
await browser.close()

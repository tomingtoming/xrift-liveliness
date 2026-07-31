import { chromium } from '@playwright/test'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
await page.goto(process.env.URL ?? 'http://localhost:5180/')
await page.waitForFunction(() => !!globalThis.__scene, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(2000)
console.log(JSON.stringify(await page.evaluate(() => {
  let la = null, head = null
  globalThis.__scene.traverse(o => {
    if (!la && o.vrmLookAt) la = o.vrmLookAt
    if (!head && o.type === 'Bone' && /head/i.test(o.name) && !/end|top/i.test(o.name)) head = o
  })
  const proto = Object.getPrototypeOf(la)
  const methods = Object.getOwnPropertyNames(proto).filter(n => typeof la[n] === 'function')
  const out = { methods, faceFront: la.faceFront, headName: head?.name }
  // 各候補の「前方向」をワールドで出して比較する
  const V = head.position.constructor
  const Q = Object.getPrototypeOf(head.quaternion).constructor
  const q = la.getLookAtWorldQuaternion ? la.getLookAtWorldQuaternion(new Q()) : null
  if (q) {
    const f = new V(la.faceFront.x, la.faceFront.y, la.faceFront.z).applyQuaternion(q)
    out.forwardFromLookAtQuat = { x: +f.x.toFixed(3), y: +f.y.toFixed(3), z: +f.z.toFixed(3) }
  }
  const hd = head.getWorldDirection(new V())
  out.headGetWorldDirection = { x: +hd.x.toFixed(3), y: +hd.y.toFixed(3), z: +hd.z.toFixed(3) }
  const hq = head.getWorldQuaternion(new Q())
  const ff = new V(la.faceFront.x, la.faceFront.y, la.faceFront.z).applyQuaternion(hq)
  out.forwardFromHeadQuatTimesFaceFront = { x: +ff.x.toFixed(3), y: +ff.y.toFixed(3), z: +ff.z.toFixed(3) }
  if (la.getLookAtWorldPosition) {
    const p = la.getLookAtWorldPosition(new V())
    out.lookAtWorldPosition = { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) }
  }
  const hp = head.getWorldPosition(new V())
  out.headWorldPosition = { x: +hp.x.toFixed(3), y: +hp.y.toFixed(3), z: +hp.z.toFixed(3) }
  return out
}), null, 1))
await browser.close()

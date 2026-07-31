// VRMLookAtが内部で持つ _yaw/_pitch（度）を直接読む。
// これが rangeMap の inputMaxValue に張り付いていれば「可動端に貼り付き」の直接証拠。
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
await page.goto(process.env.URL ?? 'http://localhost:5180/')
await page.waitForFunction(() => !!globalThis.__scene, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(2500)
const r = await page.evaluate(() => new Promise(res => {
  const las = []
  globalThis.__scene.traverse(o => { if (o.vrmLookAt) las.push(o.vrmLookAt) })
  const samples = []
  const t0 = performance.now()
  const tick = () => {
    samples.push(las.map(la => ({ y: la._yaw, p: la._pitch })))
    if (performance.now() - t0 < 5000) requestAnimationFrame(tick)
    else {
      const stat = (i, k) => {
        const v = samples.map(s => s[i][k]).filter(x => typeof x === 'number')
        return { min: +Math.min(...v).toFixed(2), max: +Math.max(...v).toFixed(2) }
      }
      res({
        count: las.length,
        faceFront: las[0]?.applier?.faceFront ?? las[0]?.faceFront ?? null,
        inputMax: las[0]?.applier?.rangeMapHorizontalOuter?.inputMaxValue ?? null,
        yaw: las.map((_, i) => stat(i, 'y')),
        pitch: las.map((_, i) => stat(i, 'p')),
        frames: samples.length,
      })
    }
  }
  requestAnimationFrame(tick)
}))
console.log(JSON.stringify(r, null, 1))
await browser.close()

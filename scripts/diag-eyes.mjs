// 視線ターゲットが動くだけでは足りない。目のボーンが実際に回っているかを測る。
import { chromium } from '@playwright/test'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
await page.goto(process.env.URL ?? 'http://localhost:5180/')
await page.waitForFunction(() => !!globalThis.__scene, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(2000)
const r = await page.evaluate(() => new Promise(res => {
  const eyes = []
  globalThis.__scene.traverse(o => { if (o.type === 'Bone' && /eye/i.test(o.name) && !/eyebrow|lid|lash/i.test(o.name)) eyes.push(o) })
  if (!eyes.length) return res({ eyeBones: 0 })
  const samples = []
  const t0 = performance.now()
  const tick = () => {
    samples.push(eyes.map(e => [e.quaternion.x, e.quaternion.y, e.quaternion.z, e.quaternion.w]))
    if (performance.now() - t0 < 5000) requestAnimationFrame(tick)
    else {
      // 各ボーンの回転の振れ幅（最大角度差・度）
      const spans = eyes.map((_, i) => {
        let max = 0
        for (let a = 0; a < samples.length; a++) for (let b = a + 1; b < samples.length; b += 17) {
          const qa = samples[a][i], qb = samples[b][i]
          const dot = Math.abs(qa[0]*qb[0]+qa[1]*qb[1]+qa[2]*qb[2]+qa[3]*qb[3])
          max = Math.max(max, 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI)
        }
        return +max.toFixed(2)
      })
      res({ eyeBones: eyes.length, names: eyes.map(e => e.name), maxRotationDeg: spans, frames: samples.length })
    }
  }
  requestAnimationFrame(tick)
}))
console.log(JSON.stringify(r, null, 1))
const moved = (r.maxRotationDeg || []).filter(d => d > 1).length
console.log(moved > 0 ? `PASS: ${moved}/${r.eyeBones} 個の目のボーンが1度以上回っている` : 'NG: 目が回っていない')
await browser.close()

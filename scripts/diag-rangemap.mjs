import { chromium } from '@playwright/test'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
await page.goto(process.env.URL ?? 'http://localhost:5180/')
await page.waitForFunction(() => !!globalThis.__scene, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(1500)
console.log(JSON.stringify(await page.evaluate(() => {
  let la = null
  globalThis.__scene.traverse(o => { if (!la && o.vrmLookAt) la = o.vrmLookAt })
  if (!la) return { found: false }
  const keys = []
  for (const k in la) keys.push(k)
  const applier = la.applier
  const dump = (o) => o ? Object.fromEntries(Object.entries(o).map(([k,v]) => [k, typeof v === 'object' && v ? JSON.stringify(v).slice(0,80) : v])) : null
  return {
    found: true,
    lookAtKeys: keys.slice(0, 25),
    applierType: applier?.constructor?.name ?? null,
    applierProps: dump(applier),
    rangeMapsOnLookAt: {
      hi: la.rangeMapHorizontalInner, ho: la.rangeMapHorizontalOuter,
      vu: la.rangeMapVerticalUp, vd: la.rangeMapVerticalDown,
    },
  }
}), null, 1))
await browser.close()

import { chromium } from '@playwright/test'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
await page.goto(process.env.URL ?? 'http://localhost:5180/')
await page.waitForFunction(() => !!globalThis.__gl, undefined, { timeout: 60000 })
await page.waitForTimeout(2000)
const a = await page.evaluate(() => ({ frame: globalThis.__gl.info.render.frame, calls: globalThis.__gl.info.render.calls, tris: globalThis.__gl.info.render.triangles }))
await page.waitForTimeout(2000)
const b = await page.evaluate(() => {
  const g = globalThis.__gl
  const cam = globalThis.__camera
  return {
    frame: g.info.render.frame, calls: g.info.render.calls, tris: g.info.render.triangles,
    target: g.getRenderTarget() ? 'render-target' : 'default-framebuffer',
    camPos: [cam.position.x.toFixed(2), cam.position.y.toFixed(2), cam.position.z.toFixed(2)],
    camFar: cam.far, camNear: cam.near,
    autoClear: g.autoClear,
    xrEnabled: g.xr?.enabled ?? null,
    domSize: `${g.domElement.width}x${g.domElement.height}`,
  }
})
console.log('t=2s:', JSON.stringify(a))
console.log('t=4s:', JSON.stringify(b))
await browser.close()

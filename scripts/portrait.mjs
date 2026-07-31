// 候補アバターの見た目を撮る（開発ハーネスの __portrait を叩く）
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
await page.goto(process.env.URL ?? 'http://localhost:5180/')
await page.waitForFunction(() => !!globalThis.__portrait, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(2500)
fs.mkdirSync('out', { recursive: true })
for (const [name, dist] of [['face', 0.6], ['full', 2.6]]) {
  const url = await page.evaluate((d) => globalThis.__portrait(d), dist)
  if (!url) { console.log(name, 'NG'); continue }
  fs.writeFileSync(`out/cand_${name}.png`, Buffer.from(url.split(',')[1], 'base64'))
  console.log(`out/cand_${name}.png`)
}
await browser.close()

// 視線の振れを目視で確かめる: 顔の寄りを一定間隔で数枚
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 700, height: 700 } })
await page.goto(process.env.URL ?? 'http://localhost:5180/')
await page.waitForFunction(() => !!globalThis.__portrait, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(2500)
fs.mkdirSync('out', { recursive: true })
const urls = []
for (let i = 0; i < 4; i++) {
  urls.push(await page.evaluate(() => globalThis.__portrait(0.45)))
  await page.waitForTimeout(1400)
}
urls.forEach((u, i) => u && fs.writeFileSync(`out/gaze_${i}.png`, Buffer.from(u.split(',')[1], 'base64')))
console.log('撮影完了', urls.filter(Boolean).length, '枚')
await browser.close()

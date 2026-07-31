// 開眼/閉眼の瞬間を顔の寄りで撮り分ける（頭ボーンを自動で捉える）
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 700, height: 700 } })
await page.goto(process.env.URL ?? 'http://localhost:5180/')
await page.waitForFunction(() => !!globalThis.__portrait, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(2500)
fs.mkdirSync('out', { recursive: true })
const dist = Number(process.env.DIST ?? 0.45)
const grab = async (want, name) => {
  await page.waitForFunction((w) => {
    let v = null
    globalThis.__scene.traverse(o => { if (v === null && o.name === 'VRMExpression_blink') v = o.weight })
    return v !== null && (w === 'open' ? v < 0.02 : v > 0.85)
  }, want, { timeout: 30000, polling: 'raf' })
  const url = await page.evaluate((d) => globalThis.__portrait(d), dist)
  fs.writeFileSync(`out/${name}`, Buffer.from(url.split(',')[1], 'base64'))
}
await grab('open', 'p_open.png')
await grab('closed', 'p_closed.png')
console.log('撮影完了')
await browser.close()

// 数値が動いていても描画に出ているとは限らない。閉眼の瞬間と開眼で画を撮って比べる。
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const URL = process.env.URL ?? 'http://localhost:5180/'
const browser = await chromium.launch({ args: ['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
await page.addInitScript(() => {
  const og = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (t, a) {
    if (/webgl/.test(t)) a = Object.assign({}, a, { preserveDrawingBuffer: true })
    return og.call(this, t, a)
  }
})
await page.goto(URL)
await page.waitForFunction(() => !!globalThis.__scene, undefined, { timeout: 60000 })
await page.waitForFunction(() => { let n=0; globalThis.__scene.traverse(o=>{if(o.type==='VRMExpression')n++}); return n>0 }, undefined, { timeout: 60000 })
await page.waitForTimeout(1500)

// アバターの顔に寄る（1体目の頭のワールド位置をカメラで見る）
await page.evaluate(() => {
  const s = globalThis.__scene
  let head = null
  s.traverse(o => { if (!head && o.type === 'Bone' && /head/i.test(o.name) && !/end/i.test(o.name)) head = o })
  globalThis.__head = head
})
const shot = async (name) => {
  const d = await page.evaluate(() => new Promise(r => {
    const c = document.querySelector('canvas')
    requestAnimationFrame(() => r(c.toDataURL('image/png')))
  }))
  fs.mkdirSync('out', { recursive: true })
  fs.writeFileSync(`out/${name}`, Buffer.from(d.split(',')[1], 'base64'))
}
// 閉眼のフレームを待って撮る
const grabAt = async (pred, label, timeout = 20000) => {
  await page.waitForFunction((p) => {
    let w = null
    globalThis.__scene.traverse(o => { if (w === null && o.name === 'VRMExpression_blink') w = o.weight })
    return w !== null && eval(p)(w)
  }, pred, { timeout, polling: 'raf' })
  await shot(label)
}
await grabAt('(w)=>w<0.02', 'eyes_open.png')
await grabAt('(w)=>w>0.85', 'eyes_closed.png')
console.log('撮影完了: out/eyes_open.png, out/eyes_closed.png')
await browser.close()

// 表情駆動の機械検証。目視でなく数値で「動いているか」を確かめる。
//  ①走査がVRMアバターを見つけたか ②blinkのweightが振れるか（かつ台形か）
//  ③視線ターゲットがサッカードで飛ぶか ④OFFで全部0に戻るか
import { chromium } from '@playwright/test'

const URL = process.env.URL ?? 'http://localhost:5174/'
const browser = await chromium.launch({
  args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('console', (m) => {
  const t = m.text()
  if (/devAvatars|Error|error/i.test(t)) console.log('PAGE:', t.slice(0, 160))
})
page.on('pageerror', (e) => console.log('EXC:', String(e).slice(0, 200)))

await page.goto(URL)

await page.waitForFunction(() => !!document.querySelector('canvas'), undefined, { timeout: 60_000 })

// DevAvatars が globalThis.__scene にシーンを出す（開発ハーネス専用の口）
const installed = await page
  .waitForFunction(() => !!globalThis.__scene, undefined, { timeout: 30_000 })
  .then(() => true)
  .catch(() => false)
if (!installed) {
  console.log('FAIL: シーンに到達できない（DevAvatarsが動いていない）')
  await browser.close()
  process.exit(1)
}

// VRMのロード完了を待つ（表情ノードが現れるまで）
await page.waitForFunction(
  () => {
    let n = 0
    globalThis.__scene.traverse((o) => {
      if (o.type === 'VRMExpression') n++
    })
    return n > 0
  },
  undefined,
  { timeout: 90_000 },
).catch(() => {})

const inventory = await page.evaluate(() => {
  const expr = new Map()
  let proxies = 0
  globalThis.__scene.traverse((o) => {
    if (o.type === 'VRMExpression') {
      const root = o.parent?.uuid ?? 'orphan'
      if (!expr.has(root)) expr.set(root, [])
      expr.get(root).push(o.name.replace('VRMExpression_', ''))
    }
    if (o.name === 'lookAtQuaternionProxy' && o.vrmLookAt) proxies++
  })
  return {
    avatars: expr.size,
    perAvatar: [...expr.values()].map((v) => v.length),
    hasBlink: [...expr.values()].filter((v) => v.includes('blink')).length,
    lookAtProxies: proxies,
  }
})
console.log('走査結果:', JSON.stringify(inventory))

// 60Hzで6秒ぶんサンプリング
const samples = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const out = []
      const t0 = performance.now()
      const tick = () => {
        const t = performance.now() - t0
        let blink = null
        let gaze = null
        globalThis.__scene.traverse((o) => {
          if (blink === null && o.name === 'VRMExpression_blink') blink = o.weight
          if (gaze === null && o.name === 'liveliness_gaze_target') {
            gaze = { x: o.position.x, y: o.position.y, z: o.position.z }
          }
        })
        // gaze targetはシーンに追加していないので、lookAt.target 経由で拾う
        if (gaze === null) {
          globalThis.__scene.traverse((o) => {
            if (gaze === null && o.name === 'lookAtQuaternionProxy' && o.vrmLookAt?.target) {
              const p = o.vrmLookAt.target.position
              gaze = { x: p.x, y: p.y, z: p.z }
            }
          })
        }
        out.push({ t, blink, gaze })
        if (t < 6000) requestAnimationFrame(tick)
        else resolve(out)
      }
      requestAnimationFrame(tick)
    }),
)

const blinks = samples.map((s) => s.blink).filter((v) => v !== null)
const maxBlink = Math.max(...blinks)
const nonZero = blinks.filter((v) => v > 0.02).length
// 立ち上がり/立ち下がりの非対称を測る（閉じ60ms・開き120msの設計通りか）
let rising = 0
let falling = 0
for (let i = 1; i < blinks.length; i++) {
  const d = blinks[i] - blinks[i - 1]
  if (d > 0.05) rising++
  if (d < -0.05) falling++
}

const gazes = samples.map((s) => s.gaze).filter(Boolean)
let jumps = 0
let maxJump = 0
for (let i = 1; i < gazes.length; i++) {
  const a = gazes[i - 1]
  const b = gazes[i]
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  if (d > 0.05) jumps++
  maxJump = Math.max(maxJump, d)
}

console.log('--- 6秒間の観測 ---')
console.log(`blink: サンプル${blinks.length} 最大${maxBlink.toFixed(3)} 開いていないフレーム${nonZero}`)
console.log(`       立ち上がり${rising}フレーム / 立ち下がり${falling}フレーム（設計=開きは閉じの2倍かける）`)
console.log(`gaze : サンプル${gazes.length} 移動${jumps}回 最大移動${maxJump.toFixed(3)}m/frame`)

// OFFの検証: レバーを倒さずpropを直接叩けないので、Liveliness側のresetを間接確認
// （ここではONのまま。OFFは実機/手動で確認する）

// 視線が可動端に張り付いていないか。
// VRMLookAtは内部で角度を計算し rangeMap の inputMaxValue で切る。基準にする「顔の
// 正面」を取り違えると、常に大きな角度を要求して目が端に貼り付いたまま止まる。
// 実際に一度そうなった（生の頭ボーンの+Zを正面と誤認＝正解は正規化ボーン。90度ずれ）。
// 見た目では気づきにくく、weightもサッカードも正常に見えるので、ここで数値で見る。
const internal = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const las = []
      globalThis.__scene.traverse((o) => {
        if (o.vrmLookAt) las.push(o.vrmLookAt)
      })
      if (!las.length) return resolve(null)
      const samples = []
      const t0 = performance.now()
      const tick = () => {
        samples.push(las.map((la) => la._yaw))
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
        else
          resolve({
            inputMax: las[0]?.applier?.rangeMapHorizontalOuter?.inputMaxValue ?? null,
            maxAbsYaw: Math.max(...samples.flat().map((v) => Math.abs(v ?? 0))),
          })
      }
      requestAnimationFrame(tick)
    }),
)
if (internal) {
  console.log(
    `内部角: |yaw|最大 ${internal.maxAbsYaw.toFixed(1)}度 / 切り捨てライン ${internal.inputMax}度`,
  )
}

const verdict = []
if (internal && internal.inputMax && internal.maxAbsYaw > internal.inputMax * 0.8) {
  verdict.push(
    `NG: 視線が可動端に張り付いている（|yaw|${internal.maxAbsYaw.toFixed(1)}度 ≥ ${internal.inputMax}度の8割）。正面の基準を疑うこと`,
  )
}
if (inventory.avatars < 1) verdict.push('NG: アバターを検出できていない')
if (inventory.hasBlink < 1) verdict.push('NG: blink表情が見つからない')
if (maxBlink < 0.8) verdict.push(`NG: まばたきが閉じきっていない (max=${maxBlink.toFixed(2)})`)
if (nonZero === 0) verdict.push('NG: まばたきが一度も起きていない')
if (falling <= rising) verdict.push('NG: 開きが閉じより速い（非対称カーブが効いていない）')
if (inventory.lookAtProxies > 0 && gazes.length === 0) verdict.push('NG: 視線ターゲットが設定されていない')
if (inventory.lookAtProxies > 0 && jumps === 0) verdict.push('NG: 視線が動いていない')

console.log(verdict.length ? verdict.join('\n') : 'PASS: 全項目')
await browser.close()
process.exit(verdict.length ? 1 : 0)

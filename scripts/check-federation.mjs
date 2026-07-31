// ビルド成果物がXRiftから読める形になっているかを機械で確かめる。
//
// 一度これで転んだ: build.rollupOptions.input を上書きしたら公開チャンクが生成されず、
// remoteEntry.js に未解決のプレースホルダが残ったまま「アップロード成功」まで通った。
// セキュリティ検査もサムネ生成も通るので、実際にワールドを開くまで誰も気づかない。
// ∴ 出荷前にここで止める。
import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve(process.cwd(), 'dist')
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}

if (!fs.existsSync(dist)) {
  fail('dist が無い')
  process.exit(1)
}

const files = fs.readdirSync(dist)

const entry = path.join(dist, 'remoteEntry.js')
if (!fs.existsSync(entry)) fail('remoteEntry.js が無い')
else {
  const src = fs.readFileSync(entry, 'utf8')
  const unresolved = src.match(/\$\{__federation_expose_[^}]*\}/g)
  if (unresolved) fail(`remoteEntry.js に未解決のプレースホルダ: ${[...new Set(unresolved)].join(', ')}`)
  if (!src.includes('"./World"')) fail('remoteEntry.js が "./World" を公開していない')
}

const exposed = files.filter((f) => /^__federation_expose_World-.*\.js$/.test(f))
if (exposed.length === 0) fail('公開チャンク __federation_expose_World-*.js が無い')

if (process.exitCode) {
  console.error('\nXRiftはこのビルドからワールドを読めない。アップロードしないこと。')
} else {
  console.log(`✓ フェデレーション出力OK（公開チャンク: ${exposed[0]}）`)
}

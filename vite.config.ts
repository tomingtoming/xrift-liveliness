import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'path'
import { defineConfig, type PluginOption } from 'vite'
import dts from 'vite-plugin-dts'
import federation from '@originjs/vite-plugin-federation'

/**
 * 検証用VRM（dev-assets/test-avatar.vrm・10MB）を開発時だけ配る。
 * public/ に置くと本番のdistへ丸ごとコピーされて配信物に混ざるため。
 */
const devAssets = (): PluginOption => ({
  name: 'liveliness-dev-assets',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/test-avatar.vrm')) return next()
      const file = path.resolve(__dirname, 'dev-assets/test-avatar.vrm')
      if (!fs.existsSync(file)) return next()
      res.setHeader('Content-Type', 'model/gltf-binary')
      fs.createReadStream(file).pipe(res)
    })
  },
})

export default defineConfig({
  // 3Dモデルをアセットとして扱う（利用側は?inlineでdata URI埋め込み＝CDN連合配信でもURL切れしない）
  assetsInclude: ['**/*.glb'],
  plugins: [
    react(),
    devAssets(),
    dts({
      insertTypesEntry: true,
    }),
    federation({
      name: 'xrift_xrift_liveliness',
      filename: 'remoteEntry.js',
      exposes: {
        './World': './src/index.tsx',
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '*',
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '*',
        },
        'react-dom/client': {
          singleton: true,
        },
        'react/jsx-runtime': {
          singleton: true,
        },
        three: {
          singleton: true,
          requiredVersion: '*',
        },
        '@react-three/fiber': {
          singleton: true,
          requiredVersion: '*',
        },
        '@react-three/rapier': {
          singleton: true,
          requiredVersion: '*',
        },
        '@react-three/drei': {
          singleton: true,
          requiredVersion: '*',
        },
        '@react-three/uikit': {
          singleton: true,
          requiredVersion: '*',
        },
        '@xrift/world-components': {
          singleton: true,
          requiredVersion: '*',
        },
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    assetsDir: '',
    // 注意: rollupOptions.input で index.html を外してはいけない。
    // 開発エントリを本番から省こうとして input を './src/index.tsx' にしたところ、
    // フェデレーションの公開チャンク（__federation_expose_World-*.js）が生成されず、
    // remoteEntry.js に未解決のプレースホルダ "${__federation_expose_./World}" が
    // 残ったまま出荷された（XRiftがワールド本体を読めない状態でアップロード成功）。
    // dist に開発エントリのチャンクが残るのは他ワールドと同じ既定の挙動で、
    // プラットフォームは remoteEntry からしか辿らないので実害が無い。
    // 壊れていないことは scripts/check-federation.mjs が build 後に機械で確かめる。
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
  },
})

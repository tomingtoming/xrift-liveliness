/**
 * 開発環境用エントリーポイント（npm run dev）。本番ビルドでは使われない。
 */

import { DevEnvironment, XRiftProvider } from '@xrift/world-components'
import type { CameraConfig, PhysicsConfig } from '@xrift/world-components'
import { createRoot } from 'react-dom/client'
import { World } from './World'
import { DevAvatars } from './devAvatars'
import xriftConfig from '../xrift.json'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

const worldConfig = xriftConfig.world as {
  physics?: PhysicsConfig
  camera?: CameraConfig
  outputBufferType?: string
}

createRoot(rootElement).render(
  <XRiftProvider baseUrl="/">
    <DevEnvironment
      physicsConfig={worldConfig.physics}
      camera={worldConfig.camera}
      outputBufferType={worldConfig.outputBufferType}
      spawnPosition={[0, 1.5, 3.2]}
    >
      {/* ?nolively=1 で駆動を止める。視線の校正計測はこちらで行う
          （Livelinessが毎フレーム注視点を書くので、走らせたままでは掃引できない） */}
      <World isPreview={new URLSearchParams(location.search).has('nolively')} />
      <DevAvatars />
    </DevEnvironment>
  </XRiftProvider>,
)

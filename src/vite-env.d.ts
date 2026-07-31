/// <reference types="vite/client" />

// .glbはこのvite構成では既定アセットに入っていないため、?inline（data URI埋め込み）で読む
declare module '*.glb?inline' {
  const dataUri: string
  export default dataUri
}

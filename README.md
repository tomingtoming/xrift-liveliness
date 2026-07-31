# xrift-liveliness — 表情の実証室

XRiftのワールド。部屋に入った全員のアバターに**まばたきと疑似的な視線**が付く。レバーで全員ぶんを同時にON/OFFできるので、話しながら見え方の違いをその場で比べられる。

新しいセンサーは使わない。カメラも視線トラッキングも要らず、材料は**乱数と他の人の位置だけ**。

## なぜ作ったか

XRiftのアバターは今、表情を一切動かしていない。まばたきもしない。だが**機構はすべて揃っている**。足りないのは動かす者だけ、というのが調べた結論で、この部屋はそこを埋めたときに何が起きるかを見るために作った。

VRChatが表情トラッキング機材を持たないユーザーにやっていることは3つ。音声からの口パク、自動まばたき、疑似視線。このうち後ろ2つはワールドのコードから実装でき、最初の1つはできない（後述）。

## 調べて分かったこと

### プラットフォームは表情を駆動していない

- アバター実行時チャンク（`index-*.js`）に `expressionManager` / blink / viseme への参照が無い
- 体アニメの実体 `standing_idle.vrma` などの `VRMC_vrm_animation` 拡張は `humanoid` のみで、`expressions: null, lookAt: null`。アイドルのまばたきも入っていない
- 音声はLiveKitで流れており `IsSpeakingChanged` イベントも存在するが、アバターの口には配線されていない

### 一方で、動かすための口はすべて開いている

- アバターは three-vrm でロードされる（ホストの `SafeVRMLoaderPlugin` が `VRMLoaderPlugin` を継承し、SpringBoneだけ安全版に差し替え）
- three-vrm は各表情を `name: "VRMExpression_<preset>"`, `type: "VRMExpression"`, 書き込み可能な `weight` を持つ `Object3D` として `vrm.scene` に add する
- ホストは毎フレーム `vrm.update(delta)` を呼んでおり、その中で `expressionManager` が `clearAppliedWeight` → `applyWeight` を回す。**つまり weight を書けば適用はホストがやってくれる**
- 視線は `VRMLookAtQuaternionProxy`（`@pixiv/three-vrm-animation`、VRMAを再生するホストが自分で `vrm.scene` に add するもの）が持つ `vrmLookAt` に `target` を差せば、同じ `vrm.update()` の中で目に届く
- アップロード時の `vrmOptimizer` は**表情のバインド先メッシュを簡略化から保護**し、`aa/ih/ou/ee/oh/blink/blinkLeft/blinkRight/lookUp/lookDown/lookLeft/lookRight/neutral/happy…` を再書き出ししている。パイプラインは表情を通す前提で作られている

### シーンを走査してアバターを掴む手口は前例がある

[xrift-mirror](https://github.com/tomingtoming/xrift-mirror) が本番で実アバターの `SkinnedMesh` をシーン走査で捕捉してレイヤーを改変し、コード検査を通って公開運用されている。この部屋がやっているのは同じ侵襲度で、書くのは `weight` と `lookAt.target` だけ。シーンには何も足さない。

## 実装

```
src/liveliness/
  scan.ts          シーン走査。VRMExpressionノードとlookAtプロキシを見つける
  blink.ts         まばたきの状態機械（非対称な台形カーブ）
  gaze.ts          疑似視線（サッカードと固視）
  personality.ts   性格スライダー2本
  Liveliness.tsx   毎フレーム駆動するReactコンポーネント
```

ワールドに `<Liveliness />` を1つ置くと、その部屋の全アバターに効く。

### まばたき

生理に合わせた3相の台形カーブ。閉じ60ms、保持40ms、開き120ms。**開きに閉じの2倍かける非対称が要点**で、等速の往復にすると機械的に見える。間隔は性格から決めた平均に ±45% のばらつきを乗せ、18%の確率で二連瞬きを混ぜる。初期値もばらすので、入室した全員が同時に瞬くことはない。

### 疑似視線

要点は3つ。

1. **視線の移動はサッカードであって補間ではない。** 人の目は点から点へ30〜80msで飛ぶ。ゆっくり lerp すると人形の首振りになる
2. **固視中も完全には止めない。** 相手を見るとき人は目・口・目と細かく打ち直しているので、微小ドリフトを載せる
3. **見続けない。** 注視と逸らしを交互に打つ

### 性格スライダー

VRChatのAvatar Descriptorが持つのと同じ2軸。`calm ↔ excited` がまばたきの頻度、`shy ↔ confident` が他人の顔を見る頻度と目を逸らすまでの時間を決める。VRChatではユーザー設定だが、ここでは設定を持ち込む口が無いのでアバターのuuidから決定論的に導いている。全員が同じリズムになるのを避けるため。

## 検証

目視でなく数値で確かめている（`scripts/`）。開発ハーネスはXRiftのホストと同じ手順（VRMをロード → `vrm.scene` を add → 毎フレーム `vrm.update(dt)` → `VRMLookAtQuaternionProxy` を add）を再現しており、モデルは three-vrm 公式サンプル。

```
$ npm run dev
$ node scripts/liveliness-probe.mjs
走査結果: {"avatars":2,"perAvatar":[18,18],"hasBlink":2,"lookAtProxies":2}
--- 6秒間の観測 ---
blink: サンプル362 最大1.000 開いていないフレーム13
       立ち上がり4フレーム / 立ち下がり7フレーム（設計=開きは閉じの2倍かける）
gaze : サンプル326 移動6回 最大移動1.153m/frame
PASS: 全項目

$ node scripts/diag-eyes.mjs
PASS: 4/4 個の目のボーンが1度以上回っている（最大14.19度）
```

`scripts/blink-capture.mjs` は閉眼と開眼の瞬間を撮り分けて画で確かめる。

**数値のプローブは「プレイヤーが床をすり抜けて落下している」のを一度素通しした**（weightは正しく振れていたので全項目PASSを返した）。描画が出ているかは別の計器で見る必要がある、という実例。原因は床にコライダーを付け忘れていたこと。

### 手元のアバターで分かった落とし穴

toming自身のVRM3体（玉の巻物使い・Lowi・キョンシー娘）は、表情プリセットを**宣言だけして `morphTargetBinds` が空**だった。18個の表情名が並ぶのに実体がゼロ。書いても何も起きない。VRMの表情の有無はプリセットの一覧では判定できず、バインドまで見る必要がある。

一方 `lookAt` はボーン方式なので、バインドが空でも視線は効く。

## ワールドのコードからはできないこと

**マイク音声に連動した口パク。** アップロード時の静的検査 `@xrift/code-security` の `no-navigator-access` が `navigator.*` へのアクセスを全面的に検出するため `getUserMedia` に届かず、SDKにも音声レベルを取る口が無い。ここはプラットフォーム側の仕事になる。

`useVoiceVolumeOverride` は他人の**音量を上書きする**hookで、音量を**読む**ものではない。

## プラットフォームへの提案（この部屋が土台）

1. **プラットフォーム側で自動まばたきと疑似視線を既定にする。** ワールドごとに入れるものではなく、全アバターが凍った顔をしているのはXRift全体の課題。この部屋のコードがそのまま素案になる
2. **音声連動の口パク。** LiveKitの `IsSpeakingChanged` は既に来ているので、まずは発話中フラグで `aa` を動かすだけでも成立する。音量が取れるなら口の開きに強弱が付く。VRMは `aa/ih/ou/ee/oh` を標準で持っている
3. **代替案としてSDKにhookを2つ。** ローカルの音声レベルを返すものと、アバターの表情に触れるもの。1と2が本命で、これは次善

## 既知の限界

- **XRift既定アバターは表情を持てない。** VRMではなく、名前付きのボーン風ノードにBlenderの原始図形をぶら下げたセグメント方式のプレースホルダ。診断板はこれを別に数えて表示する
- アバターのルートに userId のマーカーが無いため、誰のアバターかは位置照合でしか分からない。この部屋は誰のものかを問わず全員に一律で効かせるので、v1では使っていない
- 実機での確認は未了。上の検証はホストの構成を手元で再現したもので、実際のXRift上で同じ口が使えるかはまだ「はず」の段階

## ライセンス

MIT。検証に使う `dev-assets/test-avatar.vrm` は three-vrm 公式サンプル（リポジトリには含めない。`npm run dev` の前に配置する）。

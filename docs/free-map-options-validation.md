# 無料候補の利用条件確認メモ

Google Maps API以外で「無料で開始しやすい」候補を、2026-04時点で確認。

## 1) Leaflet + OpenStreetMap タイル

- ライブラリ本体（Leaflet）はOSSで無料。
- OSMデータは自由利用できるが、`tile.openstreetmap.org` はコミュニティ提供のため大量商用アクセス向けではない。
- 公式ポリシーでは、負荷が高い/不適切な利用はブロックされうる。
- 本番大量アクセス時は、OSM派生の商用/無料枠付きタイルサービスか自己ホストを推奨。

## 2) MapLibre GL JS

- MapLibre GL JSはBSD系OSSで無料利用可能。
- ただし地図タイル配信は別問題で、タイル供給元の利用規約/上限に従う必要がある。
- ベクタタイル運用時は、MapLibre + 自前タイル（またはPMTiles）構成でベンダーロックインを抑えやすい。

## 3) PMTiles / Protomaps（自己配信寄り）

- PMTilesは単一ファイル配信で、タイルサーバ不要の低運用コスト構成が可能。
- 静的ホスティング（S3/CDN等）でも運用しやすく、無料枠内PoCに向く。
- 大規模化時も配信コスト中心でスケールしやすい。

## 実運用での注意点

- 「ライブラリ無料」と「タイル無料」は別で管理する。
- Attribution（著作権表示）要件を常に満たす。
- オフライン/キャッシュ可否は提供元ごとに確認する。
- PoCは無料で進め、リリース前に想定トラフィックで上限超過リスクを再評価する。

## 参考

- OSM tile policy: https://operations.osmfoundation.org/policies/tiles/
- MapLibre GL JS: https://maplibre.org/projects/gl-js/
- PMTiles: https://github.com/protomaps/pmtiles
- Protomaps: https://protomaps.com/
- Leaflet: https://leafletjs.com/

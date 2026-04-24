# Google Maps API 利用機能の棚卸し

現行実装（`src/components/MapView/MapView.tsx` と `src/components/MapView/TrueSizePolygon.tsx`）を基準に、Google Maps API依存点を整理。

## 必須機能（代替先でも維持したい）

- 地図表示（パン、ズーム、UIコントロール）
- GeoJSON由来の都道府県ポリゴン表示
- 地物選択後の自動移動（`panTo` / `fitBounds` 相当）
- 比較位置を変えるドラッグ操作
- 初期位置へのリセット
- ドラッグ終了時に重心座標をアプリへ通知（国判定に利用）

## 任意機能（PoC段階では簡略化可）

- ポリゴン自体をドラッグ可能にする挙動
- MultiPolygon（日本全体）の主島+離島の相対位置維持ドラッグ
- ドラッグ中に赤い重心マーカーを追従表示
- Google特有の `mapId` / `mapTypeId` 活用

## 依存APIの内訳（現行）

- `google.maps.Map`
- `google.maps.Polygon`
- `google.maps.Marker`
- `google.maps.event.addListener`
- `google.maps.SymbolPath.CIRCLE`
- `google.maps.LatLng`

## 今回のPoCでの置き換え方針

- **Leaflet PoC**: ポリゴン表示 + 重心マーカー（ドラッグ）で必須機能を確認
- **MapLibre PoC**: GeoJSON source/layer + draggable marker で必須機能を確認
- 高度なポリゴンドラッグ補正（真のサイズ補正ロジック）は将来拡張として分離

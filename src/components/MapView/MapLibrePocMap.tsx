import { useEffect, useMemo, useRef } from 'react';
import * as turf from '@turf/turf';
import maplibregl from 'maplibre-gl';
import {
  createDragCorrectionModel,
  rebuildFeatureFromCentroid,
  type DragCorrectionModel,
} from '../../utils/geojsonDragCorrection';
import './MapLibrePocMap.css';

interface MapLibrePocMapProps {
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  onDragEnd?: (centroid: [number, number]) => void;
}

const SOURCE_ID = 'prefecture-geojson';
const FILL_LAYER_ID = 'prefecture-fill';
const STROKE_LAYER_ID = 'prefecture-stroke';
const VECTOR_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const JAPANESE_LABEL_EXPR = [
  'coalesce',
  ['get', 'name:ja'],
  ['get', 'name_ja'],
  ['get', 'name:en'],
  ['get', 'name_en'],
  ['get', 'name'],
] as const;

function disableHeavyVisualLayers(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    const source =
      'source' in layer && typeof layer.source === 'string' ? layer.source.toLowerCase() : '';
    const isHeavyId =
      id.includes('hillshade') ||
      id.includes('terrain') ||
      id.includes('contour') ||
      id.includes('elevation') ||
      id.includes('dem') ||
      id.includes('mountain') ||
      id.includes('peak') ||
      id.includes('ridge') ||
      id.includes('summit') ||
      id.includes('volcano');
    const isHeavySource = source.includes('ne2_shaded');
    const isHeavyType =
      layer.type === 'hillshade' ||
      layer.type === 'fill-extrusion' ||
      layer.type === 'heatmap';
    const isTerrainLikeRaster = layer.type === 'raster' && (id.includes('natural_earth') || isHeavySource);
    if (isHeavyId || isHeavyType || isTerrainLikeRaster) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}

/**
 * OpenFreeMap liberty はタイルにデータが含まれているのに
 * スタイルでは色を割り当てていないクラスが多い（farmland, industrial,
 * commercial, retail, stadium, zoo, theme_park, military, railway, rock）。
 * これらを Google Maps 風の色で描画するレイヤを追加する。
 * 見た目のみを目的とし、データの正確性は要求しない。
 */
interface ExtraLandLayer {
  id: string;
  sourceLayer: 'landcover' | 'landuse';
  classes: string[];
  color: string;
  opacity: number;
}

const EXTRA_LAND_LAYERS: ExtraLandLayer[] = [
  // 農地：Google の黄緑ベージュ
  {
    id: 'extra_landcover_farmland',
    sourceLayer: 'landcover',
    classes: ['farmland'],
    color: '#eaeccd',
    opacity: 0.85,
  },
  // 岩場（高原・岩石地）：中立グレージュ
  {
    id: 'extra_landcover_rock',
    sourceLayer: 'landcover',
    classes: ['rock'],
    color: '#e3ded2',
    opacity: 0.85,
  },
  // 工業地：Google の薄紫ベージュ
  {
    id: 'extra_landuse_industrial',
    sourceLayer: 'landuse',
    classes: ['industrial'],
    color: '#ece4ea',
    opacity: 0.75,
  },
  // 商業地：Google の薄橙ベージュ
  {
    id: 'extra_landuse_commercial',
    sourceLayer: 'landuse',
    classes: ['commercial'],
    color: '#f5e8d4',
    opacity: 0.75,
  },
  // 小売・繁華街：Google の薄橙（商業より濃い）
  {
    id: 'extra_landuse_retail',
    sourceLayer: 'landuse',
    classes: ['retail'],
    color: '#f5d9b4',
    opacity: 0.7,
  },
  // スタジアム・動物園・遊園地：公園色
  {
    id: 'extra_landuse_parklike',
    sourceLayer: 'landuse',
    classes: ['stadium', 'zoo', 'theme_park', 'playground', 'kindergarten'],
    color: '#d7e9c6',
    opacity: 0.85,
  },
  // 軍用地：淡いピンクグレー
  {
    id: 'extra_landuse_military',
    sourceLayer: 'landuse',
    classes: ['military'],
    color: '#ece0dc',
    opacity: 0.7,
  },
  // 鉄道敷地：中ベージュ
  {
    id: 'extra_landuse_railway',
    sourceLayer: 'landuse',
    classes: ['railway', 'bus_station'],
    color: '#e6ded2',
    opacity: 0.7,
  },
];

function addMissingLandLayers(map: maplibregl.Map) {
  if (!map.getSource('openmaptiles')) return;

  // 水面より下に差し込むことで、道路・建物・水が上に来るようにする
  const beforeId = map.getLayer('water') ? 'water' : undefined;

  for (const extra of EXTRA_LAND_LAYERS) {
    if (map.getLayer(extra.id)) continue;
    try {
      map.addLayer(
        {
          id: extra.id,
          type: 'fill',
          source: 'openmaptiles',
          'source-layer': extra.sourceLayer,
          filter: [
            'match',
            ['get', 'class'],
            extra.classes,
            true,
            false,
          ] as unknown as maplibregl.FilterSpecification,
          paint: {
            'fill-color': extra.color,
            'fill-opacity': extra.opacity,
            'fill-antialias': true,
          },
        },
        beforeId
      );
    } catch {
      // 同名レイヤの再追加などは無視
    }
  }
}

function applyGoogleLikeGranularity(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    if (id.startsWith('extra_')) continue;
    const sourceLayer =
      'source-layer' in layer && typeof layer['source-layer'] === 'string'
        ? layer['source-layer'].toLowerCase()
        : '';

    // 情報量の多いラベルは表示を抑える
    const hideDenseLabels =
      id.includes('poi') ||
      id.includes('amenity') ||
      id.includes('shop') ||
      id.includes('housenumber') ||
      id.includes('address') ||
      id.includes('neighbourhood') ||
      id.includes('neighborhood') ||
      id.includes('suburb') ||
      id.includes('hamlet') ||
      id.includes('mountain') ||
      id.includes('peak') ||
      id.includes('ridge') ||
      id.includes('summit') ||
      id.includes('volcano');

    if (hideDenseLabels) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      continue;
    }

    // 低ズームで見た目が重くなる塗り・模様系を大幅に整理
    const hideVisualNoise =
      id.includes('park_outline') ||
      id.includes('road_area_pattern') ||
      id.includes('aeroway_fill') ||
      id.includes('hatching') ||
      id.includes('one_way_arrow');
    if (hideVisualNoise) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      continue;
    }

    // 空港塗りや細かい空港線を落として簡素化
    if (sourceLayer === 'aeroway' && (id.includes('taxiway') || id.includes('runway'))) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      continue;
    }

    // park / landuse は全ズームで見せる（緑地の色を確実に出すため）。
    // 交通補助系だけ高ズームに寄せて情報量を抑える。
    if (id.includes('transit') || id.includes('rail')) {
      try {
        map.setLayerZoomRange(layer.id, 11, 24);
      } catch {
        // 一部スタイルはズーム範囲変更に非対応
      }
    }

    // 地名は残しつつ、道路名などは中ズーム以降に
    if (sourceLayer === 'transportation_name') {
      try {
        map.setLayerZoomRange(layer.id, 6, 24);
      } catch {
        // ignore
      }
    }
  }
}

function applyGoogleLikeColors(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    // addMissingLandLayers で追加した独自レイヤは初回の paint をそのまま使う
    if (id.startsWith('extra_')) continue;
    const sourceLayer =
      'source-layer' in layer && typeof layer['source-layer'] === 'string'
        ? layer['source-layer'].toLowerCase()
        : '';

    try {
      if (layer.type === 'background') {
        // 低ズームは Google のような“薄めの砂色ベース”で大陸全体を塗る。
        // 中〜高ズームでは中立のベージュに寄せて、都市の色分けを邪魔しない。
        map.setPaintProperty(layer.id, 'background-color', [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, '#efe6d3',
          3, '#f0e9d8',
          5, '#f1ecdf',
          8, '#f2eee3',
          10, '#f2efe9',
        ]);
        map.setPaintProperty(layer.id, 'background-opacity', 1);
      }

      if (layer.type === 'fill') {
        if (sourceLayer === 'water' || id === 'water') {
          map.setPaintProperty(layer.id, 'fill-color', '#bcdcff');
          map.setPaintProperty(layer.id, 'fill-opacity', 1);
        } else if (id.includes('landcover_ice')) {
          map.setPaintProperty(layer.id, 'fill-color', '#f4f7fb');
          map.setPaintProperty(layer.id, 'fill-opacity', 0.95);
        } else if (sourceLayer === 'park') {
          // 低ズームの“緑の点々感”を抑えるため、公園は遠景では薄くする
          map.setPaintProperty(layer.id, 'fill-color', '#c9e1ae');
          map.setPaintProperty(layer.id, 'fill-opacity', [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 0.08,
            4, 0.14,
            7, 0.28,
            10, 0.62,
            14, 0.72,
          ]);
        } else if (sourceLayer === 'landcover') {
          if (id.includes('wood') || id.includes('grass') || id.includes('wetland')) {
            // 低ズームは“森林の塊感だけ残して点々感を消す”ため、かなり薄くする。
            // 中ズームから徐々に濃くして、Google通常地図に近い見え方に寄せる。
            try {
              map.setPaintProperty(layer.id, 'fill-antialias', true);
            } catch {
              // ignore unsupported
            }
            map.setPaintProperty(
              layer.id,
              'fill-color',
              id.includes('grass') ? '#d3e2b5' : '#c4d6a8'
            );
            map.setPaintProperty(layer.id, 'fill-opacity', [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 0.06,
              4, 0.12,
              6, 0.22,
              8, 0.42,
              10, 0.62,
              14, 0.6,
            ]);
          } else if (id.includes('sand')) {
            // 砂漠は Google の淡い砂色で
            map.setPaintProperty(layer.id, 'fill-color', '#ecdeb0');
            map.setPaintProperty(layer.id, 'fill-opacity', [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 0.9,
              6, 0.85,
              12, 0.8,
            ]);
          } else {
            map.setPaintProperty(layer.id, 'fill-color', '#efe9de');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.6);
          }
        } else if (sourceLayer === 'landuse') {
          if (id.includes('residential')) {
            map.setPaintProperty(layer.id, 'fill-color', '#efe9df');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.6);
          } else if (
            id.includes('pitch') ||
            id.includes('track') ||
            id.includes('cemetery') ||
            id.includes('school')
          ) {
            // 公園類似の緑地（運動場・墓地・学校敷地など）
            map.setPaintProperty(layer.id, 'fill-color', '#d7e9c6');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.82);
          } else if (id.includes('hospital')) {
            map.setPaintProperty(layer.id, 'fill-color', '#f6e4e4');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.7);
          } else {
            map.setPaintProperty(layer.id, 'fill-color', '#e6edd8');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.58);
          }
        } else if (sourceLayer === 'building') {
          map.setPaintProperty(layer.id, 'fill-color', '#e5dfd6');
          map.setPaintProperty(layer.id, 'fill-opacity', 0.5);
        }
      }

      if (layer.type === 'line') {
        if (sourceLayer === 'transportation') {
          if (id.includes('motorway') || id.includes('trunk') || id.includes('primary')) {
            map.setPaintProperty(layer.id, 'line-color', '#f3c17a');
            map.setPaintProperty(layer.id, 'line-opacity', 0.95);
          } else if (id.includes('secondary') || id.includes('tertiary')) {
            map.setPaintProperty(layer.id, 'line-color', '#f8d9a6');
            map.setPaintProperty(layer.id, 'line-opacity', 0.9);
          } else {
            map.setPaintProperty(layer.id, 'line-color', '#ffffff');
            map.setPaintProperty(layer.id, 'line-opacity', 0.88);
          }
        } else if (sourceLayer === 'boundary') {
          map.setPaintProperty(layer.id, 'line-color', '#c4c4c4');
          map.setPaintProperty(layer.id, 'line-opacity', 0.45);
        } else if (sourceLayer === 'waterway') {
          map.setPaintProperty(layer.id, 'line-color', '#bcdcff');
          map.setPaintProperty(layer.id, 'line-opacity', 0.95);
        }
      }
    } catch {
      // Some layers may not support a specific property.
    }
  }
}

function applyJapaneseLabels(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue;
    const hasTextField = layer.layout && 'text-field' in layer.layout;
    if (!hasTextField) continue;
    map.setLayoutProperty(layer.id, 'text-field', JAPANESE_LABEL_EXPR);

    const id = layer.id.toLowerCase();
    const sourceLayer =
      'source-layer' in layer && typeof layer['source-layer'] === 'string'
        ? layer['source-layer'].toLowerCase()
        : '';

    // 低ズームは都市・国中心、高ズームで詳細地名
    if (sourceLayer === 'place') {
      try {
        if (id.includes('country')) {
          map.setLayerZoomRange(layer.id, 0, 24);
        } else if (id.includes('city') || id.includes('state')) {
          map.setLayerZoomRange(layer.id, 3, 24);
        } else if (id.includes('town') || id.includes('village') || id.includes('other')) {
          map.setLayerZoomRange(layer.id, 6, 24);
        }
      } catch {
        // ignore unsupported layers
      }
    }
  }
}

export function MapLibrePocMap({ feature, onDragEnd }: MapLibrePocMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const initialCentroidRef = useRef<[number, number] | null>(null);
  const initialFeatureRef = useRef<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null>(
    null
  );
  const translatedFeatureRef = useRef<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null>(
    null
  );
  const correctionModelRef = useRef<DragCorrectionModel | null>(null);
  const currentCentroidRef = useRef<[number, number] | null>(null);
  const isDraggingShapeRef = useRef(false);
  const lastDragPointRef = useRef<{ lng: number; lat: number } | null>(null);
  const lastDragPixelRef = useRef<{ x: number; y: number } | null>(null);
  const dragDeltaRef = useRef<{ deltaLng: number; deltaLat: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const shapeMouseDownHandlerRef = useRef<((event: maplibregl.MapLayerMouseEvent) => void) | null>(
    null
  );
  const mapMouseMoveHandlerRef = useRef<((event: maplibregl.MapMouseEvent) => void) | null>(null);
  const mapMouseUpHandlerRef = useRef<((event: maplibregl.MapMouseEvent) => void) | null>(null);
  const shapeTouchStartHandlerRef = useRef<((event: maplibregl.MapLayerTouchEvent) => void) | null>(null);
  const mapTouchMoveHandlerRef = useRef<((event: maplibregl.MapTouchEvent) => void) | null>(null);
  const mapTouchEndHandlerRef = useRef<((event: maplibregl.MapTouchEvent) => void) | null>(null);

  const centroid = useMemo(() => {
    if (!feature) return null;
    return turf.centroid(feature).geometry.coordinates as [number, number];
  }, [feature]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: VECTOR_STYLE_URL,
      center: [138, 36],
      zoom: 4.5,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;
    const applyAllStyleTweaks = () => {
      disableHeavyVisualLayers(map);
      addMissingLandLayers(map);
      applyGoogleLikeGranularity(map);
      applyGoogleLikeColors(map);
      applyJapaneseLabels(map);

      // 国境：白ケーシング＋濃い線の2層でズームに応じて太さを変える
      if (!map.getSource('openmaptiles')) return;
      try {
        if (!map.getLayer('country-boundary-casing')) {
          map.addLayer({
            id: 'country-boundary-casing',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'boundary',
            filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
            paint: {
              'line-color': '#ffffff',
              'line-opacity': 0.9,
              'line-width': [
                'interpolate', ['linear'], ['zoom'],
                2, 2,
                8, 5,
                12, 8,
              ],
            },
          });
        }
        if (!map.getLayer('country-boundary-dark')) {
          map.addLayer({
            id: 'country-boundary-dark',
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'boundary',
            filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
            paint: {
              'line-color': '#111111',
              'line-opacity': 1,
              'line-width': [
                'interpolate', ['linear'], ['zoom'],
                2, 0.8,
                8, 2.5,
                12, 4,
              ],
            },
          });
        }
      } catch {
        // レイヤ追加失敗時は既存の boundary レイヤがそのまま表示される
      }
    };
    map.on('load', applyAllStyleTweaks);
    map.on('styledata', applyAllStyleTweaks);

    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyFeature = () => {
      markerRef.current?.remove();
      markerRef.current = null;
      initialCentroidRef.current = null;

      if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
      if (map.getLayer(STROKE_LAYER_ID)) map.removeLayer(STROKE_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

      if (!feature || !centroid) return;

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: feature as GeoJSON.GeoJSON,
      });

      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': '#e74c3c',
          'fill-opacity': 0.2,
        },
      });

      map.addLayer({
        id: STROKE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#e74c3c',
          'line-width': 2,
        },
      });

      const bbox = turf.bbox(feature);
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 24, maxZoom: 8 }
      );

      const markerElement = document.createElement('div');
      markerElement.className = 'compare-dot-marker';
      markerElement.innerHTML = '<span class="compare-dot-marker__inner"></span>';

      const marker = new maplibregl.Marker({ element: markerElement, draggable: true })
        .setLngLat(centroid)
        .addTo(map);
      markerRef.current = marker;
      initialCentroidRef.current = centroid;
      initialFeatureRef.current = feature;
      translatedFeatureRef.current = feature;
      correctionModelRef.current = createDragCorrectionModel(feature, centroid);
      currentCentroidRef.current = centroid;

      const dragStart = { lng: centroid[0], lat: centroid[1] };
      marker.on('dragstart', () => {
        const lngLat = marker.getLngLat();
        dragStart.lng = lngLat.lng;
        dragStart.lat = lngLat.lat;
      });

      marker.on('drag', () => {
        const lngLat = marker.getLngLat();
        const baseFeature = initialFeatureRef.current;
        const correctionModel = correctionModelRef.current;
        if (!baseFeature || !correctionModel) return;
        const newCentroid: [number, number] = [lngLat.lng, lngLat.lat];
        const movedFeature = rebuildFeatureFromCentroid(baseFeature, correctionModel, newCentroid);
        translatedFeatureRef.current = movedFeature;
        currentCentroidRef.current = newCentroid;

        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        source?.setData(movedFeature as GeoJSON.GeoJSON);

        dragStart.lng = lngLat.lng;
        dragStart.lat = lngLat.lat;
      });

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        onDragEnd?.([lngLat.lng, lngLat.lat]);
      });

      if (shapeMouseDownHandlerRef.current) {
        map.off('mousedown', FILL_LAYER_ID, shapeMouseDownHandlerRef.current);
      }
      if (mapMouseMoveHandlerRef.current) {
        map.off('mousemove', mapMouseMoveHandlerRef.current);
      }
      if (mapMouseUpHandlerRef.current) {
        map.off('mouseup', mapMouseUpHandlerRef.current);
      }
      if (shapeTouchStartHandlerRef.current) {
        map.off('touchstart', FILL_LAYER_ID, shapeTouchStartHandlerRef.current);
      }
      if (mapTouchMoveHandlerRef.current) {
        map.off('touchmove', mapTouchMoveHandlerRef.current);
      }
      if (mapTouchEndHandlerRef.current) {
        map.off('touchend', mapTouchEndHandlerRef.current);
      }

      // ピクセル座標から lngLat デルタを計算して累積する共通処理
      const applyMoveDelta = (prevPixel: { x: number; y: number }, curPixel: { x: number; y: number }) => {
        const prevLngLat = map.unproject([prevPixel.x, prevPixel.y]);
        const curLngLat  = map.unproject([curPixel.x,  curPixel.y]);
        const deltaLng = curLngLat.lng - prevLngLat.lng;
        const deltaLat = curLngLat.lat - prevLngLat.lat;
        // RAF 間に複数イベントが来ても全て累積する
        if (dragDeltaRef.current) {
          dragDeltaRef.current.deltaLng += deltaLng;
          dragDeltaRef.current.deltaLat += deltaLat;
        } else {
          dragDeltaRef.current = { deltaLng, deltaLat };
        }
        lastDragPixelRef.current = curPixel;
        if (dragRafRef.current === null) {
          dragRafRef.current = requestAnimationFrame(() => {
            dragRafRef.current = null;
            const queued = dragDeltaRef.current;
            dragDeltaRef.current = null;
            if (!queued) return;
            const baseFeature = initialFeatureRef.current;
            const correctionModel = correctionModelRef.current;
            const currentCentroid = currentCentroidRef.current;
            if (!baseFeature || !correctionModel || !currentCentroid) return;
            const newCentroid: [number, number] = [
              currentCentroid[0] + queued.deltaLng,
              currentCentroid[1] + queued.deltaLat,
            ];
            const movedFeature = rebuildFeatureFromCentroid(baseFeature, correctionModel, newCentroid);
            translatedFeatureRef.current = movedFeature;
            currentCentroidRef.current = newCentroid;
            const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
            source?.setData(movedFeature as GeoJSON.GeoJSON);
            const markerLngLat = marker.getLngLat();
            marker.setLngLat([
              markerLngLat.lng + queued.deltaLng,
              markerLngLat.lat + queued.deltaLat,
            ]);
          });
        }
      };

      const startDrag = (pixel: { x: number; y: number }) => {
        isDraggingShapeRef.current = true;
        lastDragPixelRef.current = pixel;
        map.dragPan.disable();
        map.touchZoomRotate.disable();
      };

      const endDrag = () => {
        if (!isDraggingShapeRef.current) return;
        isDraggingShapeRef.current = false;
        lastDragPixelRef.current = null;
        lastDragPointRef.current = null;
        dragDeltaRef.current = null;
        if (dragRafRef.current !== null) {
          cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
        map.dragPan.enable();
        map.touchZoomRotate.enable();
        const lngLat = marker.getLngLat();
        onDragEnd?.([lngLat.lng, lngLat.lat]);
      };

      const handleShapeMouseDown = (event: maplibregl.MapLayerMouseEvent) => {
        startDrag({ x: event.point.x, y: event.point.y });
      };
      shapeMouseDownHandlerRef.current = handleShapeMouseDown;
      map.on('mousedown', FILL_LAYER_ID, handleShapeMouseDown);

      const handleShapeTouchStart = (event: maplibregl.MapLayerTouchEvent) => {
        if (event.originalEvent.touches.length !== 1) return;
        startDrag({ x: event.point.x, y: event.point.y });
      };
      shapeTouchStartHandlerRef.current = handleShapeTouchStart;
      map.on('touchstart', FILL_LAYER_ID, handleShapeTouchStart);

      const handleMapMouseMove = (event: maplibregl.MapMouseEvent) => {
        if (!isDraggingShapeRef.current || !lastDragPixelRef.current) return;
        applyMoveDelta(lastDragPixelRef.current, { x: event.point.x, y: event.point.y });
      };
      mapMouseMoveHandlerRef.current = handleMapMouseMove;
      map.on('mousemove', handleMapMouseMove);

      const handleMapTouchMove = (event: maplibregl.MapTouchEvent) => {
        if (event.originalEvent.touches.length !== 1) return;
        if (!isDraggingShapeRef.current || !lastDragPixelRef.current) return;
        applyMoveDelta(lastDragPixelRef.current, { x: event.point.x, y: event.point.y });
      };
      mapTouchMoveHandlerRef.current = handleMapTouchMove;
      map.on('touchmove', handleMapTouchMove);

      const handleMapMouseUp = (_event: maplibregl.MapMouseEvent) => endDrag();
      mapMouseUpHandlerRef.current = handleMapMouseUp;
      map.on('mouseup', handleMapMouseUp);

      const handleMapTouchEnd = (_event: maplibregl.MapTouchEvent) => endDrag();
      mapTouchEndHandlerRef.current = handleMapTouchEnd;
      map.on('touchend', handleMapTouchEnd);

      onDragEnd?.(centroid);
    };

    if (map.isStyleLoaded()) {
      applyFeature();
      return;
    }

    map.once('load', applyFeature);
    return () => {
      map.dragPan.enable();
      map.touchZoomRotate.enable();
      if (shapeMouseDownHandlerRef.current) {
        map.off('mousedown', FILL_LAYER_ID, shapeMouseDownHandlerRef.current);
      }
      if (mapMouseMoveHandlerRef.current) {
        map.off('mousemove', mapMouseMoveHandlerRef.current);
      }
      if (mapMouseUpHandlerRef.current) {
        map.off('mouseup', mapMouseUpHandlerRef.current);
      }
      if (shapeTouchStartHandlerRef.current) {
        map.off('touchstart', FILL_LAYER_ID, shapeTouchStartHandlerRef.current);
      }
      if (mapTouchMoveHandlerRef.current) {
        map.off('touchmove', mapTouchMoveHandlerRef.current);
      }
      if (mapTouchEndHandlerRef.current) {
        map.off('touchend', mapTouchEndHandlerRef.current);
      }
      map.off('load', applyFeature);
    };
  }, [feature, centroid, onDragEnd]);

  const handleReset = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    const initial = initialCentroidRef.current;
    if (!map || !marker || !initial) return;

    marker.setLngLat(initial);
    const initialFeature = initialFeatureRef.current;
    if (initialFeature) {
      translatedFeatureRef.current = initialFeature;
      currentCentroidRef.current = initial;
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      source?.setData(initialFeature as GeoJSON.GeoJSON);
    }
    map.flyTo({ center: initial, zoom: map.getZoom() });
    onDragEnd?.(initial);
  };

  return (
    <div className="map-container">
      <div ref={containerRef} className="maplibre-map-host" />
      {feature && (
        <button className="reset-btn" onClick={handleReset} title="元の位置に戻す">
          元の位置に戻す
        </button>
      )}
      <div className="map-attribution">
        ベースマップ: OpenFreeMap（MapLibre・簡素化2D）
      </div>
    </div>
  );
}

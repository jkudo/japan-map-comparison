import { useState, useEffect, useRef } from 'react';
import { extractLargestPolygon } from '../utils/geojsonUtils';

const BASE_URL =
  'https://raw.githubusercontent.com/amay077/JapanPrefGeoJson/master/prefs';

export const JAPAN_WHOLE_CODE = 0;

const cache = new Map<number, GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>();

export interface GeoJSONResult {
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  loading: boolean;
  error: string | null;
}

function prefectureUrl(code: number): string {
  const padded = String(code).padStart(2, '0');
  return `${BASE_URL}/${padded}.geojson`;
}

export function usePrefectureGeoJSON(code: number | null): GeoJSONResult {
  const [feature, setFeature] = useState<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (code === null) {
      setFeature(null);
      setError(null);
      return;
    }

    if (cache.has(code)) {
      setFeature(cache.get(code)!);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const url =
      code === JAPAN_WHOLE_CODE
        ? '/japan_outline.geojson'
        : prefectureUrl(code);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw: GeoJSON.Feature) => {
        // 日本全体はMultiPolygonをそのまま使用（全島表示）
        // 都道府県は最大Polygonを抽出
        const processed =
          code === JAPAN_WHOLE_CODE
            ? (raw as GeoJSON.Feature<GeoJSON.MultiPolygon>)
            : extractLargestPolygon(raw);
        cache.set(code, processed);
        setFeature(processed);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(`データの取得に失敗しました: ${err.message}`);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [code]);

  return { feature, loading, error };
}

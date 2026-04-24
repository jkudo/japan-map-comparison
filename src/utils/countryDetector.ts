import * as turf from '@turf/turf';

interface CountryFeature {
  iso: string;
  name: string;
}

let countriesCache: GeoJSON.FeatureCollection | null = null;

async function loadCountries(): Promise<GeoJSON.FeatureCollection> {
  if (countriesCache) return countriesCache;
  const res = await fetch(`${import.meta.env.BASE_URL}countries.geojson`);
  if (!res.ok) throw new Error('countries.geojson の読み込みに失敗しました');
  countriesCache = await res.json();
  return countriesCache!;
}

/**
 * 指定した座標 [lng, lat] がどの国にあるかを返す
 * 見つからない場合は iso: '-1' を返す
 */
export async function detectCountry(
  lngLat: [number, number]
): Promise<CountryFeature> {
  const countries = await loadCountries();
  const pt = turf.point(lngLat);

  for (const feature of countries.features) {
    try {
      if (turf.booleanPointInPolygon(pt, feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)) {
        return {
          iso: (feature.properties as { iso: string }).iso,
          name: (feature.properties as { name: string }).name,
        };
      }
    } catch {
      // 不正なジオメトリはスキップ
    }
  }
  return { iso: '-1', name: 'Ocean / Unknown' };
}

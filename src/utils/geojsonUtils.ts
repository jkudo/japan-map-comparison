/**
 * MultiPolygon から最大の Polygon を抽出する
 * 島嶼県（長崎・鹿児島・沖縄等）はMultiPolygonのため、主島を選択する
 */
export function extractLargestPolygon(
  feature: GeoJSON.Feature
): GeoJSON.Feature<GeoJSON.Polygon> {
  const { geometry } = feature;

  if (geometry.type === 'Polygon') {
    return feature as GeoJSON.Feature<GeoJSON.Polygon>;
  }

  if (geometry.type === 'MultiPolygon') {
    // 頂点数が最も多いポリゴンを主島と見なす（面積の代理指標）
    let largestRing: GeoJSON.Position[][] = geometry.coordinates[0];
    let maxVertices = largestRing[0].length;

    for (const ring of geometry.coordinates) {
      const vertexCount = ring[0].length;
      if (vertexCount > maxVertices) {
        maxVertices = vertexCount;
        largestRing = ring;
      }
    }

    return {
      type: 'Feature',
      properties: feature.properties,
      geometry: {
        type: 'Polygon',
        coordinates: largestRing,
      },
    };
  }

  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

/**
 * GeoJSON Polygon の座標配列を [lng, lat][] 形式で返す（外周リングのみ）
 */
export function getOuterRingCoords(
  feature: GeoJSON.Feature<GeoJSON.Polygon>
): [number, number][] {
  return feature.geometry.coordinates[0] as [number, number][];
}

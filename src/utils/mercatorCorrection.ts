import * as turf from '@turf/turf';
import type { Anchor, PolygonGroupAnchor } from '../types/prefecture';

export interface LatLngLiteral {
  lat: number;
  lng: number;
}


/**
 * ポリゴンの重心を計算する
 */
export function computeCentroid(coords: [number, number][]): [number, number] {
  const polygon = turf.polygon([coords]);
  const centroid = turf.centroid(polygon);
  return centroid.geometry.coordinates as [number, number];
}

/**
 * 各頂点の重心からの測地線情報（方位角・距離）を記録する
 */
export function computeAnchors(
  coords: [number, number][],
  centroid: [number, number]
): Anchor[] {
  const centroidPt = turf.point(centroid);
  return coords.map((vertex) => {
    const vertexPt = turf.point(vertex);
    return {
      bearing: turf.bearing(centroidPt, vertexPt),
      distance: turf.distance(centroidPt, vertexPt, { units: 'kilometers' }),
    };
  });
}

/**
 * 新しい中心位置からMercator補正済みのポリゴン頂点を再構築する
 */
export function rebuildPolygon(
  newCentroid: [number, number],
  anchors: Anchor[]
): LatLngLiteral[] {
  return anchors.map(({ bearing, distance }) => {
    const dest = turf.destination(newCentroid, distance, bearing, {
      units: 'kilometers',
    });
    const [lng, lat] = dest.geometry.coordinates;
    return { lat, lng };
  });
}

/**
 * MultiPolygon 用: 全島のアンカー情報を全体重心基準で記録する
 */
export function computeGroupAnchors(
  rings: [number, number][][],
  globalCentroid: [number, number]
): PolygonGroupAnchor[] {
  const globalPt = turf.point(globalCentroid);
  return rings.map((coords) => {
    const polyCentroid = computeCentroid(coords);
    const polyCentroidPt = turf.point(polyCentroid);
    return {
      polyCentroidBearing: turf.bearing(globalPt, polyCentroidPt),
      polyCentroidDistance: turf.distance(globalPt, polyCentroidPt, {
        units: 'kilometers',
      }),
      vertexAnchors: computeAnchors(coords, polyCentroid),
    };
  });
}

/**
 * MultiPolygon 用: 新しい全体重心から各島の頂点を再構築する
 */
export function rebuildGroup(
  newGlobalCentroid: [number, number],
  groupAnchors: PolygonGroupAnchor[]
): LatLngLiteral[][] {
  return groupAnchors.map(
    ({ polyCentroidBearing, polyCentroidDistance, vertexAnchors }) => {
      const newPolyCentroid = turf.destination(
        newGlobalCentroid,
        polyCentroidDistance,
        polyCentroidBearing,
        { units: 'kilometers' }
      ).geometry.coordinates as [number, number];
      return rebuildPolygon(newPolyCentroid, vertexAnchors);
    }
  );
}

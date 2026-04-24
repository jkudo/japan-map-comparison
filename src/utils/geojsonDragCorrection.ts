import {
  computeAnchors,
  computeGroupAnchors,
  rebuildGroup,
  rebuildPolygon,
} from './mercatorCorrection';
import type { Anchor, PolygonGroupAnchor } from '../types/prefecture';

export interface DragCorrectionModel {
  kind: 'polygon' | 'multiPolygon';
  polygonAnchors?: Anchor[];
  groupAnchors?: PolygonGroupAnchor[];
}

export function createDragCorrectionModel(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  centroid: [number, number]
): DragCorrectionModel {
  if (feature.geometry.type === 'Polygon') {
    const ring = feature.geometry.coordinates[0] as [number, number][];
    return {
      kind: 'polygon',
      polygonAnchors: computeAnchors(ring, centroid),
    };
  }

  const rings = feature.geometry.coordinates.map(
    (polygon) => polygon[0] as [number, number][]
  );
  return {
    kind: 'multiPolygon',
    groupAnchors: computeGroupAnchors(rings, centroid),
  };
}

export function rebuildFeatureFromCentroid(
  baseFeature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  model: DragCorrectionModel,
  centroid: [number, number]
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  if (model.kind === 'polygon' && model.polygonAnchors) {
    const ring = rebuildPolygon(centroid, model.polygonAnchors).map(({ lng, lat }) => [lng, lat]);
    return {
      ...baseFeature,
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    };
  }

  if (model.kind === 'multiPolygon' && model.groupAnchors) {
    const polygons = rebuildGroup(centroid, model.groupAnchors).map((ring) => [
      ring.map(({ lng, lat }) => [lng, lat]),
    ]);
    return {
      ...baseFeature,
      geometry: {
        type: 'MultiPolygon',
        coordinates: polygons,
      },
    };
  }

  return baseFeature;
}

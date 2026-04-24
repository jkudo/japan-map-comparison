export interface PrefectureData {
  nameEn: string;
  nameJa: string;
  areaKm2: number;
  region: string;
}

export interface Anchor {
  bearing: number;
  distance: number;
}

export interface PolygonGroupAnchor {
  polyCentroidBearing: number;
  polyCentroidDistance: number;
  vertexAnchors: Anchor[];
}

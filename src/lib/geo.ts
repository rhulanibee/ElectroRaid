import type { GeoPoint } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance in metres — the in-memory stand-in for
 * `ST_Distance(a::geography, b::geography)` on WGS-84.
 */
export function distanceMetres(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when two points fall inside a geofence of `radiusM` metres. */
export function withinMetres(a: GeoPoint, b: GeoPoint, radiusM: number): boolean {
  return distanceMetres(a, b) <= radiusM;
}

/**
 * Geographic centroid of a point set. Used when merging reports into a
 * master incident so the map pin tracks the cluster, matching
 * `ST_Centroid(ST_Collect(geom))`.
 */
export function centroid(points: GeoPoint[]): GeoPoint {
  if (points.length === 0) {
    throw new Error("centroid() requires at least one point");
  }
  const sum = points.reduce(
    (acc, p) => ({ lon: acc.lon + p.lon, lat: acc.lat + p.lat }),
    { lon: 0, lat: 0 },
  );
  return { lon: sum.lon / points.length, lat: sum.lat / points.length };
}

/** Drive-time estimate at 32 km/h urban average + 3 min staging. */
export function etaMinutes(distanceM: number): number {
  return Math.max(4, Math.round((distanceM / 1000 / 32) * 60 + 3));
}

export function lerpPoint(from: GeoPoint, to: GeoPoint, t: number): GeoPoint {
  const clamped = Math.min(1, Math.max(0, t));
  return {
    lon: from.lon + (to.lon - from.lon) * clamped,
    lat: from.lat + (to.lat - from.lat) * clamped,
  };
}

const SUBURB_POINTS: Record<string, GeoPoint> = {
  mamelodi: { lon: 28.3932, lat: -25.7228 },
  atteridgeville: { lon: 28.0704, lat: -25.7758 },
  soshanguve: { lon: 28.1022, lat: -25.5284 },
  hatfield: { lon: 28.2376, lat: -25.7472 },
  "pretoria cbd": { lon: 28.1879, lat: -25.7463 },
  "pretoria north": { lon: 28.1762, lat: -25.6794 },
};

/** Map pin for a suburb name. Unknown suburbs use Church Square. */
export function pointForSuburb(suburb: string): GeoPoint {
  const key = suburb.trim().toLowerCase();
  return SUBURB_POINTS[key] ?? SUBURB_POINTS["pretoria cbd"];
}

export function formatKm(metres: number): string {
  if (metres < 950) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

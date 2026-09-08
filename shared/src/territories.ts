import type { Point } from './index';
import type { MapDefinition } from './maps';
export const BUILD_MODES = {
  all: 'Jeder darf überall bauen',
  columns: 'Streifen · West nach Ost',
  rows: 'Streifen · Nord nach Süd',
  sectors: 'Sektoren um die Kartenmitte',
} as const;
export type BuildMode = keyof typeof BUILD_MODES;
export function territoryIndex(p: Point, map: MapDefinition, mode: BuildMode, count: number) {
  if (count < 2 || mode === 'all') return 0;
  const u =
    mode === 'columns'
      ? (p.x + map.width / 2) / map.width
      : mode === 'rows'
        ? (p.z + map.depth / 2) / map.depth
        : ((Math.atan2(p.z, p.x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
  return Math.max(0, Math.min(count - 1, Math.floor(u * count)));
}
/** The tower centre determines ownership; normal terrain and spacing rules still apply. */
export function territoryError(
  p: Point,
  map: MapDefinition,
  mode: BuildMode,
  owners: readonly string[],
  playerId: string,
) {
  if (mode === 'all' || owners.length < 2) return null;
  return owners[territoryIndex(p, map, mode, owners.length)] === playerId
    ? null
    : 'Dieses Baugebiet gehört einem anderen Spieler.';
}
export function territoryPolygons(map: MapDefinition, mode: BuildMode, count: number): Point[][] {
  const rect = [
    { x: -map.width / 2, z: -map.depth / 2 },
    { x: map.width / 2, z: -map.depth / 2 },
    { x: map.width / 2, z: map.depth / 2 },
    { x: -map.width / 2, z: map.depth / 2 },
  ];
  const clip = (poly: Point[], value: (p: Point) => number) => {
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        va = value(a),
        vb = value(b);
      if (va >= -1e-9) out.push(a);
      if (va >= 0 !== vb >= 0) {
        const t = va / (va - vb);
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    return out;
  };
  if (mode === 'all' || count < 2) return [rect];
  return Array.from({ length: count }, (_, i) => {
    if (mode === 'columns' || mode === 'rows') {
      const axis = mode === 'columns' ? 'x' : 'z',
        length = mode === 'columns' ? map.width : map.depth;
      const low = -length / 2 + (i * length) / count,
        high = low + length / count;
      return clip(
        clip(rect, (p) => p[axis] - low),
        (p) => high - p[axis],
      );
    }
    const start = -Math.PI / 2 + (i * Math.PI * 2) / count,
      end = start + (Math.PI * 2) / count;
    return clip(
      clip(rect, (p) => Math.cos(start) * p.z - Math.sin(start) * p.x),
      (p) => Math.sin(end) * p.x - Math.cos(end) * p.z,
    );
  });
}

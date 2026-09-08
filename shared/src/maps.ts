import type { Point } from './index';
export type MapId = 'waldtal' | 'silberfurt' | 'bernsteinhain' | 'frostklamm' | 'glutspalten';
export type Biome = 'forest' | 'river' | 'autumn' | 'frost' | 'volcano';
export interface Route {
  id: string;
  points: Point[];
  length: number;
}
export interface Waterway {
  points: Point[];
  radius: number;
  kind: 'water' | 'lava';
  waterfall?: boolean;
}
export interface Bridge {
  a: Point;
  b: Point;
  width: number;
  style: 'wood' | 'stone' | 'basalt';
}
export interface MapObstacle extends Point {
  r: number;
  kind: 'trees' | 'rocks' | 'ruins';
  border?: boolean;
}
export interface MapDefinition {
  id: MapId;
  name: string;
  description: string;
  biome: Biome;
  width: number;
  depth: number;
  outline: Point[];
  base: Point;
  baseAngle: number;
  pathRadius: number;
  towerRadius: number;
  routes: Route[];
  waterways: Waterway[];
  bridges: Bridge[];
  obstacles: MapObstacle[];
}
export const DEFAULT_MAP_ID: MapId = 'waldtal';
export const MAP_IDS: MapId[] = ['waldtal', 'silberfurt', 'bernsteinhain', 'frostklamm', 'glutspalten'];
const pts = (pairs: number[][]): Point[] => pairs.map(([x, z]) => ({ x, z }));
const route = (id: string, pairs: number[][]): Route => {
  const points = pts(pairs);
  return { id, points, length: points.slice(1).reduce((sum, p, i) => sum + distance(p, points[i]), 0) };
};
const obstacle = (kind: MapObstacle['kind'], pairs: number[][]): MapObstacle[] =>
  pairs.map(([x, z, r]) => ({ x, z, r, kind }));
const river = (
  pairs: number[][],
  radius = 1.05,
  kind: Waterway['kind'] = 'water',
  waterfall = false,
): Waterway => ({ points: pts(pairs), radius, kind, waterfall });
const bridge = (a: number[], b: number[], style: Bridge['style'] = 'wood'): Bridge => ({
  a: pts([a])[0],
  b: pts([b])[0],
  width: 2.1,
  style,
});
const common = {
  width: 30,
  depth: 22,
  pathRadius: 0.85,
  towerRadius: 0.68,
  outline: pts([
    [-15, -8],
    [-14, -10],
    [-10, -11],
    [9, -11],
    [14, -9],
    [15, -4],
    [15, 8],
    [12, 10],
    [5, 11],
    [-10, 10],
    [-15, 7],
  ]),
  base: { x: 11, z: 7.1 },
  baseAngle: 0,
};
const silverStart = [
  [-14, -1],
  [-10, -1],
  [-9, 0],
];
const silverEnd = [
  [6, 0],
  [9, 0],
  [11, 2],
  [11, 6],
];
const autumnEnd = [
  [0, 0],
  [3, -2],
  [3, -6],
  [8, -6],
  [9, -3],
  [6, 0],
  [6, 4],
  [8, 2],
  [11, 2],
  [11, 6],
];
const frostEnd = [
  [3, 3],
  [6, 5],
  [8, 2],
  [11, 2],
  [11, 6],
];
const lavaEnd = [
  [7, 0],
  [10, 0],
  [11, 2],
  [11, 6],
];
export const MAPS: Record<MapId, MapDefinition> = {
  waldtal: {
    ...common,
    id: 'waldtal',
    name: 'Waldtal',
    biome: 'forest',
    description: 'Die erste Wacht. Ein langer, gewundener Weg durch das grüne Tal.',
    routes: [
      route('main', [
        [-14, -5],
        [-9, -5],
        [-7, -3],
        [-7, 3],
        [-4, 5],
        [1, 5],
        [3, 3],
        [3, -3],
        [6, -5],
        [10, -5],
        [11, -2],
        [11, 6],
      ]),
    ],
    waterways: [
      river(
        [
          [-9.4, 9.55],
          [1.5, 9.55],
        ],
        0.6,
        'water',
        true,
      ),
    ],
    bridges: [],
    obstacles: [
      ...obstacle('trees', [
        [-12, 4, 1.4],
        [-10, 7, 1.2],
        [-3, -6, 1.2],
        [-1, -7, 1.1],
        [6, 7.5, 1.1],
        [12, -8, 1.1],
        [-12, -8, 1.1],
        [-4, 8.5, 1.1],
      ]),
      ...obstacle('rocks', [[7.5, 0.8, 0.9]]),
    ],
  },
  silberfurt: {
    ...common,
    id: 'silberfurt',
    name: 'Silberfurt',
    biome: 'river',
    description: 'Zwei Holzbrücken, ein rauschender Fluss. Halte beide Ufer und die gemeinsame Engstelle.',
    routes: [
      route('north', [...silverStart, [-9, -6], [-5, -6], [-3, -5], [3, -5], [6, -6], [8, -3], ...silverEnd]),
      route('south', [...silverStart, [-9, 6], [-5, 6], [-3, 5], [3, 5], [6, 6], [8, 3], ...silverEnd]),
    ],
    waterways: [
      river(
        [
          [0, -11],
          [0, 11],
        ],
        1.1,
        'water',
        true,
      ),
    ],
    bridges: [bridge([-2.1, -5], [2.1, -5]), bridge([-2.1, 5], [2.1, 5])],
    obstacles: [
      ...obstacle('trees', [
        [-12, -7, 1],
        [-12, 5, 1],
        [-5, -9, 1],
        [-4, 9, 1],
        [5, -9, 1],
        [5, 9, 0.8],
      ]),
      ...obstacle('rocks', [
        [-5, 0, 1.1],
        [4, 0, 0.8],
        [12, -6, 1],
      ]),
    ],
  },
  bernsteinhain: {
    ...common,
    id: 'bernsteinhain',
    name: 'Bernsteinhain',
    biome: 'autumn',
    description: 'Goldenes Laub und alte Ruinen. Zwei Eingänge vereinen sich im Herzen des Hains.',
    routes: [
      route('north', [[-14, -6], [-10, -6], [-8, -8], [-4, -8], [-2, -5], [-4, -2], ...autumnEnd]),
      route('south', [[-14, 6], [-10, 6], [-8, 8], [-4, 8], [-2, 5], [-4, 2], ...autumnEnd]),
    ],
    waterways: [],
    bridges: [],
    obstacles: [
      ...obstacle('trees', [
        [-12, 0, 1.2],
        [-7, -4, 0.9],
        [-7, 4, 0.9],
        [-1, -9, 0.9],
        [2, 6, 1],
        [12, -7, 1],
        [1, 9, 1],
      ]),
      ...obstacle('ruins', [
        [0.5, -4, 0.8],
        [-1, 8.5, 0.8],
      ]),
      ...obstacle('rocks', [[11, -1, 0.8]]),
    ],
  },
  frostklamm: {
    ...common,
    id: 'frostklamm',
    name: 'Frostklamm',
    biome: 'frost',
    description:
      'Drei Routen zwischen Schnee und Eiswasser. Sichere die Brücken und die schmalen Felspassagen.',
    routes: [
      route('west-high', [
        [-14, -7],
        [-10, -5],
        [-7, -7],
        [-4, -7],
        [-4, -3],
        [-8, -1],
        [-8, 3],
        [-3, 3],
        ...frostEnd,
      ]),
      route('west-low', [[-14, -7], [-10, -5], [-10, 0], [-12, 3], [-10, 7], [-6, 7], [-3, 3], ...frostEnd]),
      route('east', [[14, -7], [10, -7], [8, -9], [4, -9], [3, -6], [7, -4], [8, -1], [5, 0], ...frostEnd]),
    ],
    waterways: [
      river(
        [
          [0, -11],
          [0, 11],
        ],
        1,
        'water',
        true,
      ),
      river(
        [
          [0, -5],
          [14, -5],
        ],
        0.8,
      ),
    ],
    bridges: [bridge([-2, 3], [2, 3], 'stone'), bridge([3, -6], [7, -4], 'stone')],
    obstacles: [
      ...obstacle('rocks', [
        [-12, -2, 0.7],
        [-5, 0, 1],
        [-2, 7, 1],
        [4, 7, 1],
        [11, -9, 0.7],
        [-7, -9, 1],
      ]),
      ...obstacle('trees', [
        [-12, 8.5, 0.6],
        [4, -2, 0.6],
        [13, 4, 0.8],
        [-3, -9, 0.6],
      ]),
    ],
  },
  glutspalten: {
    ...common,
    id: 'glutspalten',
    name: 'Glutspalten',
    biome: 'volcano',
    description:
      'Drei Basaltbrücken über glühende Lava. Verteidige getrennte Routen bis zum letzten Zusammenschluss.',
    routes: [
      route('north', [
        [-14, 0],
        [-11, 0],
        [-11, -6],
        [-7, -7],
        [-4, -5],
        [3, -5],
        [7, -7],
        [10, -5],
        [8, -1],
        ...lavaEnd,
      ]),
      route('middle', [
        [-14, 0],
        [-11, 0],
        [-8, 0],
        [-8, -3],
        [-4, -3],
        [-4, 0],
        [-6, 0],
        [-6, 3],
        [-3, 3],
        [-3, 0],
        [3, 0],
        [5, 2],
        ...lavaEnd,
      ]),
      route('south', [[-14, 0], [-11, 0], [-11, 7], [-7, 8], [-4, 5], [3, 5], [6, 7], [9, 4], ...lavaEnd]),
    ],
    waterways: [
      river(
        [
          [0, -11],
          [0, 11],
        ],
        1.05,
        'lava',
        true,
      ),
    ],
    bridges: [
      bridge([-2, -5], [2, -5], 'basalt'),
      bridge([-2, 0], [2, 0], 'basalt'),
      bridge([-2, 5], [2, 5], 'basalt'),
    ],
    obstacles: [
      ...obstacle('rocks', [
        [-13, -7, 0.8],
        [-6, -9, 1],
        [5, -9, 1],
        [12, -7, 1],
        [3, -2.5, 0.55],
        [3, 8.5, 1],
        [-6, 5.2, 0.5],
      ]),
      ...obstacle('trees', [
        [-13, 5, 0.6],
        [12, -2, 0.7],
        [-9, 9, 0.5],
      ]),
    ],
  },
};
export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && Object.hasOwn(MAPS, value);
}
export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    den = dx * dx + dz * dz;
  const t = den ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / den)) : 0;
  return distance(p, { x: a.x + t * dx, z: a.z + t * dz });
}
export function getRoute(map: MapDefinition, routeId = map.routes[0].id): Route {
  const found = map.routes.find((r) => r.id === routeId);
  if (!found) throw new Error(`Unknown route ${routeId} on ${map.id}`);
  return found;
}
export function pathPosition(
  progress: number,
  map: MapDefinition = MAPS.waldtal,
  routeId = map.routes[0].id,
): Point {
  const points = getRoute(map, routeId).points;
  let d = Math.max(0, progress);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      len = distance(a, b);
    if (d <= len) return { x: a.x + ((b.x - a.x) * d) / len, z: a.z + ((b.z - a.z) * d) / len };
    d -= len;
  }
  return { ...points[points.length - 1] };
}
export function routeSegments(map: MapDefinition): { a: Point; b: Point }[] {
  const segments = new Map<string, { a: Point; b: Point }>();
  for (const r of map.routes)
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i];
      const key = [`${a.x},${a.z}`, `${b.x},${b.z}`].sort().join(':');
      segments.set(key, { a, b });
    }
  return [...segments.values()];
}
export function entrances(map: MapDefinition): Point[] {
  return [...new Map(map.routes.map((r) => [`${r.points[0].x},${r.points[0].z}`, r.points[0]])).values()];
}
export function inPolygon(p: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
export function onWater(p: Point, map: MapDefinition, margin = 0) {
  return map.waterways.some((w) =>
    w.points.slice(1).some((b, i) => segmentDistance(p, w.points[i], b) < w.radius + margin),
  );
}
export function onBridge(p: Point, map: MapDefinition, margin = 0) {
  return map.bridges.some((b) => {
    const len = distance(b.a, b.b),
      dx = (b.b.x - b.a.x) / len,
      dz = (b.b.z - b.a.z) / len;
    const along = (p.x - b.a.x) * dx + (p.z - b.a.z) * dz,
      across = Math.abs((p.x - b.a.x) * dz - (p.z - b.a.z) * dx);
    return along >= -margin && along <= len + margin && across <= b.width / 2 + margin;
  });
}
const segmentCache = new Map<MapId, ReturnType<typeof routeSegments>>();
export function placementError(
  p: Point,
  towers: Iterable<Point>,
  map: MapDefinition = MAPS.waldtal,
): string | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return 'Ungültige Position.';
  if (
    !inPolygon(p, map.outline) ||
    map.outline.some(
      (b, i) =>
        segmentDistance(p, map.outline[(i + map.outline.length - 1) % map.outline.length], b) <
        map.towerRadius + 0.5,
    ) ||
    (map.id === 'waldtal' && (Math.abs(p.x) > 13.8 || Math.abs(p.z) > 9))
  )
    return 'Baue innerhalb der Insel.';
  if (onWater(p, map, map.towerRadius))
    return map.biome === 'volcano' ? 'Auf Lava kannst du nicht bauen.' : 'Auf Wasser kannst du nicht bauen.';
  if (onBridge(p, map, map.towerRadius)) return 'Die Brücke muss frei bleiben.';
  let segments = segmentCache.get(map.id);
  if (!segments) {
    segments = routeSegments(map);
    segmentCache.set(map.id, segments);
  }
  if (segments.some(({ a, b }) => segmentDistance(p, a, b) < map.pathRadius + map.towerRadius))
    return 'Der Weg muss frei bleiben.';
  if (distance(p, map.base) < 2.4) return 'Halte den Eingang zur Festung frei.';
  if (map.obstacles.some((o) => distance(p, o) < o.r + map.towerRadius))
    return 'Hier stehen Bäume oder Felsen.';
  if ([...towers].some((t) => distance(p, t) < map.towerRadius * 2 + 0.15))
    return 'Zu nah an einem anderen Turm.';
  return null;
}
// Fixed border planting belongs to collision data as well as the landscape.
for (const map of Object.values(MAPS)) {
  const segments = routeSegments(map);
  for (let i = 0; i < 25; i++) {
    const p = { x: -13 + i * 1.1, z: i % 2 ? -9.6 : 9.4 };
    if (
      !inPolygon(p, map.outline) ||
      onWater(p, map, 1) ||
      distance(p, map.base) < 3 ||
      segments.some((s) => segmentDistance(p, s.a, s.b) < 1.8)
    )
      continue;
    map.obstacles.push({ ...p, r: 0.6, kind: 'trees', border: true });
  }
}
/** Default-map aliases retained for existing fixtures and integrations. Gameplay uses the room's map. */
export const MAP = { ...MAPS.waldtal, path: MAPS.waldtal.routes[0].points };
export const PATH_LENGTH = MAPS.waldtal.routes[0].length;

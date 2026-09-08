import * as THREE from 'three';
import { MAPS, inPolygon, territoryPolygons, type GameView, type Point } from '@emberwatch/shared';
/** Clip a triangle against a convex territory; map concavities remain intact. */
function clip(subject: Point[], boundary: Point[]) {
  let result = subject;
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i],
      b = boundary[(i + 1) % boundary.length],
      input = result;
    result = [];
    const side = (p: Point) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    for (let j = 0; j < input.length; j++) {
      const p = input[j],
        q = input[(j + 1) % input.length],
        sp = side(p),
        sq = side(q);
      if (sp >= -1e-8) result.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        result.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
      }
    }
  }
  return result;
}
export function createTerritoryOverlay(state: GameView, playerId: string, dragging: boolean) {
  const group = new THREE.Group();
  group.name = 'build-territories';
  const owners = state.zoneOwners || [],
    mode = state.buildMode || 'all';
  if (state.mode !== 'coop' || state.lobby || mode === 'all' || owners.length < 2) return group;
  const map = MAPS[state.mapId],
    polygons = territoryPolygons(map, mode, owners.length);
  if (dragging) {
    const triangles = THREE.ShapeUtils.triangulateShape(
      map.outline.map((p) => new THREE.Vector2(p.x, p.z)),
      [],
    );
    const vertices: [number[], number[]] = [[], []];
    polygons.forEach((poly, index) => {
      const out = vertices[owners[index] === playerId ? 0 : 1];
      for (const tri of triangles) {
        const points = clip(
          tri.map((i) => map.outline[i]),
          poly,
        );
        for (let i = 1; i + 1 < points.length; i++)
          for (const p of [points[0], points[i], points[i + 1]]) out.push(p.x, 0.11, p.z);
      }
    });
    vertices.forEach((v, i) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: i ? 0x071310 : 0xa1d591,
          transparent: true,
          opacity: i ? 0.58 : 0.08,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
        }),
      );
      mesh.name = i ? 'foreign-build-areas' : 'own-build-areas';
      mesh.renderOrder = 2;
      group.add(mesh);
    });
  }
  const lines: number[] = [],
    seen = new Set<string>();
  for (const poly of polygons)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      // Omit the outer rectangular bounds; only division lines are relevant.
      if (
        (Math.abs(a.x - b.x) < 1e-6 && Math.abs(Math.abs(a.x) - map.width / 2) < 1e-6) ||
        (Math.abs(a.z - b.z) < 1e-6 && Math.abs(Math.abs(a.z) - map.depth / 2) < 1e-6)
      )
        continue;
      const key = [`${a.x.toFixed(4)},${a.z.toFixed(4)}`, `${b.x.toFixed(4)},${b.z.toFixed(4)}`]
        .sort()
        .join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 0; d < length; d += 0.55) {
        const end = Math.min(length, d + 0.32),
          p = { x: a.x + ((b.x - a.x) * d) / length, z: a.z + ((b.z - a.z) * d) / length },
          q = { x: a.x + ((b.x - a.x) * end) / length, z: a.z + ((b.z - a.z) * end) / length };
        if (inPolygon(p, map.outline) && inPolygon(q, map.outline))
          lines.push(p.x, 0.13, p.z, q.x, 0.13, q.z);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xfff1c8,
      transparent: true,
      opacity: dragging ? 1 : 0.65,
      depthTest: false,
      depthWrite: false,
    }),
  );
  line.name = 'territory-boundaries';
  line.renderOrder = 3;
  group.add(line);
  return group;
}
export function disposeTerritoryOverlay(group: THREE.Group) {
  group.removeFromParent();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

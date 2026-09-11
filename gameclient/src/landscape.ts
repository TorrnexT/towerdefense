import * as THREE from 'three';
import {
  routeSegments,
  entrances,
  segmentDistance,
  distance,
  onWater,
  onBridge,
  inPolygon,
  type MapDefinition,
  type Point,
} from '@emberwatch/shared';
import type { Assets } from './world';
export const BIOME_COLORS = {
  forest: {
    ground: 0x719651,
    edge: 0x666952,
    road: 0xc5af82,
    rock: 0xc4bca6,
    water: 0x66b7b2,
    background: 0x243b31,
    leaf: 0x39794e,
    accent: '#b9d190',
  },
  river: {
    ground: 0x72a165,
    edge: 0x667d64,
    road: 0xd6c89f,
    rock: 0xb3beb0,
    water: 0x379fba,
    background: 0x203c3d,
    leaf: 0x36735a,
    accent: '#83d5d5',
  },
  autumn: {
    ground: 0x9b8b50,
    edge: 0x6d5942,
    road: 0xd8bb84,
    rock: 0x9e9685,
    water: 0x668f91,
    background: 0x41362b,
    leaf: 0xc7883f,
    accent: '#f1bd79',
  },
  frost: {
    ground: 0xc6d8d8,
    edge: 0x657d8b,
    road: 0x829aab,
    rock: 0x7d94a2,
    water: 0x458ea5,
    background: 0x263e50,
    leaf: 0x638d8e,
    accent: '#b1dce7',
  },
  volcano: {
    ground: 0x49434b,
    edge: 0x302d35,
    road: 0x827078,
    rock: 0x655c69,
    water: 0xf47730,
    background: 0x271d2c,
    leaf: 0x504039,
    accent: '#f6aa79',
  },
};
/** Owns map resources only. Models share asset geometry; recoloring never edits asset materials. */
export class Landscape {
  group = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private colors = new Map<number, THREE.MeshStandardMaterial>();
  private currents: { mesh: THREE.Mesh; origin: THREE.Vector3; direction: THREE.Vector3; phase: number }[] =
    [];
  private waterMaterials: THREE.MeshStandardMaterial[] = [];
  private seed = 1;
  private cube = this.own(new THREE.BoxGeometry(1, 1, 1));
  private cone = this.own(new THREE.ConeGeometry(1, 1, 7));
  private rock = this.own(new THREE.IcosahedronGeometry(1, 0));
  private cylinder = this.own(new THREE.CylinderGeometry(1, 1, 1, 12));
  private palette;
  constructor(
    public map: MapDefinition,
    private assets: Assets,
  ) {
    this.palette = BIOME_COLORS[map.biome];
    this.seed = (map.id + map.name).split('').reduce((n, c) => n * 31 + c.charCodeAt(0), 17) >>> 0;
    this.group.name = `landscape-${map.id}`;
    this.terrain();
    this.water();
    this.roads();
    this.bridges();
    this.scenery();
    this.fortress();
    for (const p of entrances(map)) this.portal(p);
  }
  private own<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.add(geo);
    return geo;
  }
  private color(color: number) {
    let m = this.colors.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true });
      this.colors.set(color, m);
      this.materials.add(m);
    }
    return m;
  }
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private mesh(
    geo: THREE.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
    parent: THREE.Object3D = this.group,
  ) {
    const m = new THREE.Mesh(geo, this.color(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  private box(
    color: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    parent: THREE.Object3D = this.group,
  ) {
    return this.mesh(this.cube, color, x, y, z, sx, sy, sz, parent);
  }
  private model(name: string, size: number, x: number, y: number, z: number, tint?: number) {
    const model = this.assets.model(name, size);
    model.position.set(x, y, z);
    if (tint !== undefined)
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) o.material = this.color(tint);
      });
    this.group.add(model);
    return model;
  }
  private terrain() {
    const { ground, edge } = this.palette;
    const shape = new THREE.Shape(this.map.outline.map((p) => new THREE.Vector2(p.x, -p.z)));
    const earth = new THREE.Mesh(
      this.own(
        new THREE.ExtrudeGeometry(shape, {
          depth: 1.8,
          bevelEnabled: true,
          bevelSize: 0.35,
          bevelThickness: 0.3,
          bevelSegments: 1,
          steps: 1,
        }),
      ),
      this.color(edge),
    );
    earth.rotation.x = -Math.PI / 2;
    earth.position.y = -2.1;
    earth.castShadow = true;
    earth.receiveShadow = true;
    this.group.add(earth);
    const top = new THREE.Mesh(this.own(new THREE.ShapeGeometry(shape)), this.color(ground));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.025;
    top.receiveShadow = true;
    this.group.add(top);
    const patchGeo = this.own(new THREE.CircleGeometry(1, 7));
    const patches = [
      new THREE.Color(ground).multiplyScalar(0.94).getHex(),
      new THREE.Color(ground).multiplyScalar(1.07).getHex(),
    ];
    const segments = routeSegments(this.map);
    for (let i = 0; i < 105; i++) {
      const p = { x: (this.random() - 0.5) * 27, z: (this.random() - 0.5) * 18 };
      if (onWater(p, this.map, 0.8) || segments.some((s) => segmentDistance(p, s.a, s.b) < 1.1)) continue;
      const m = this.mesh(patchGeo, patches[i % 2], p.x, 0.038, p.z, 0.3 + this.random() * 0.9, 1, 0.5);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = this.random() * 6;
      m.castShadow = false;
    }
  }
  private water() {
    for (const w of this.map.waterways) {
      const material = new THREE.MeshStandardMaterial({
        color: this.palette.water,
        roughness: 0.35,
        metalness: 0.15,
        emissive: w.kind === 'lava' ? 0xff6020 : 0x163540,
        emissiveIntensity: w.kind === 'lava' ? 0.5 : 0.12,
      });
      this.materials.add(material);
      this.waterMaterials.push(material);
      for (let i = 1; i < w.points.length; i++) {
        const a = w.points[i - 1],
          b = w.points[i],
          len = distance(a, b),
          angle = Math.atan2(b.x - a.x, b.z - a.z);
        const bank = this.box(
          this.palette.rock,
          (a.x + b.x) / 2,
          0.04,
          (a.z + b.z) / 2,
          w.radius * 2 + 0.35,
          0.06,
          len,
        );
        bank.rotation.y = angle;
        bank.castShadow = false;
        const water = this.box(
          this.palette.water,
          (a.x + b.x) / 2,
          0.064,
          (a.z + b.z) / 2,
          w.radius * 2,
          0.025,
          len,
        );
        water.rotation.y = angle;
        water.material = material;
        water.castShadow = false;
        for (let d = 0.5; d < len; d += 1.4) {
          const x = a.x + ((b.x - a.x) * d) / len,
            z = a.z + ((b.z - a.z) * d) / len;
          if (onBridge({ x, z }, this.map, 0.8)) continue;
          const m = this.box(
            w.kind === 'lava' ? 0xffca65 : 0x9cdadd,
            x,
            0.087,
            z,
            w.radius * (0.25 + this.random() * 0.65),
            0.006,
            0.04,
          );
          m.rotation.y = angle;
          m.castShadow = false;
          m.userData.animated = true;
          this.currents.push({
            mesh: m,
            origin: m.position.clone(),
            direction: new THREE.Vector3((b.x - a.x) / len, 0, (b.z - a.z) / len),
            phase: this.random() * 6,
          });
        }
      }
      for (const p of w.points) {
        const m = this.mesh(this.cylinder, this.palette.water, p.x, 0.064, p.z, w.radius, 0.025, w.radius);
        m.material = material;
        m.castShadow = false;
      }
      if (w.waterfall) {
        const p = w.points[this.map.id === 'waldtal' ? 0 : w.points.length - 1];
        const fall = this.box(this.palette.water, p.x, -1.03, p.z, w.radius * 1.9, 2.2, 0.16);
        fall.material = material;
        fall.castShadow = false;
      }
    }
  }
  private roads() {
    const segments = routeSegments(this.map),
      unique = new Map<string, Point>();
    for (const { a, b } of segments) {
      const len = distance(a, b),
        angle = Math.atan2(b.x - a.x, b.z - a.z);
      // Short cells omit water/bridge sections; bridges supply the walkable surface there.
      const steps = Math.ceil(len / 0.35);
      for (let i = 0; i < steps; i++) {
        const u = (i + 0.5) / steps,
          p = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
        if (onWater(p, this.map, 0.04) || onBridge(p, this.map, 0.05)) continue;
        const road = this.box(
          this.palette.road,
          p.x,
          0.048,
          p.z,
          this.map.pathRadius * 2,
          0.075,
          len / steps + 0.012,
        );
        road.rotation.y = angle;
        road.castShadow = false;
      }
      unique.set(`${a.x},${a.z}`, a);
      unique.set(`${b.x},${b.z}`, b);
      const nx = (b.z - a.z) / len,
        nz = -(b.x - a.x) / len;
      for (let d = 0.12; d < len; d += 0.52)
        for (const side of [-1, 1]) {
          const p = {
            x: a.x + ((b.x - a.x) * d) / len + nx * 0.92 * side,
            z: a.z + ((b.z - a.z) * d) / len + nz * 0.92 * side,
          };
          if (
            onWater(p, this.map, 0.25) ||
            onBridge(p, this.map, 0.3) ||
            segments.some(
              (s) => s !== undefined && (s.a !== a || s.b !== b) && segmentDistance(p, s.a, s.b) < 0.89,
            )
          )
            continue;
          const m = this.mesh(
            this.rock,
            this.palette.road,
            p.x,
            0.12,
            p.z,
            0.17 + this.random() * 0.08,
            0.1 + this.random() * 0.08,
            0.2,
          );
          m.rotation.y = this.random() * 6;
        }
    }
    for (const p of unique.values()) {
      if (onWater(p, this.map) || onBridge(p, this.map)) continue;
      const m = this.mesh(this.cylinder, this.palette.road, p.x, 0.052, p.z, 0.86, 0.08, 0.86);
      m.castShadow = false;
    }
  }
  private bridges() {
    for (const b of this.map.bridges) {
      const g = new THREE.Group();
      g.position.set((b.a.x + b.b.x) / 2, 0, (b.a.z + b.b.z) / 2);
      g.rotation.y = Math.atan2(b.b.x - b.a.x, b.b.z - b.a.z);
      this.group.add(g);
      const len = distance(b.a, b.b),
        wood = b.style === 'wood',
        color = wood ? 0x9c7450 : b.style === 'basalt' ? 0x4c4755 : 0x9aafb8;
      this.box(color, 0, 0.08, 0, b.width, 0.12, len, g);
      const count = Math.ceil(len / (wood ? 0.32 : 0.65));
      for (let i = 0; i < count; i++)
        this.box(
          i % 2 ? color : new THREE.Color(color).multiplyScalar(1.12).getHex(),
          0,
          0.157,
          -len / 2 + ((i + 0.5) * len) / count,
          b.width - 0.1,
          0.03,
          len / count - 0.045,
          g,
        );
      for (const side of [-1, 1]) {
        this.box(color, side * (b.width / 2 - 0.08), 0.43, 0, 0.11, 0.1, len, g);
        for (const z of [-len / 2 + 0.14, 0, len / 2 - 0.14])
          this.box(color, side * (b.width / 2 - 0.08), 0.27, z, 0.16, 0.52, 0.16, g);
      }
    }
  }
  private tree(x: number, z: number, size: number, index: number) {
    const biome = this.map.biome;
    if (biome === 'forest' || biome === 'river') {
      const t = this.model(index % 2 ? 'detail-tree' : 'detail-tree-large', size, x, 0, z);
      t.rotation.y = this.random() * 6;
      return;
    }
    this.mesh(
      this.cylinder,
      biome === 'volcano' ? 0x302731 : 0x72503b,
      x,
      size * 0.3,
      z,
      0.11,
      size * 0.6,
      0.11,
    );
    if (biome === 'volcano') {
      for (const side of [-1, 1]) {
        const b = this.box(0x40333c, x + side * 0.25, size * 0.52, z, 0.09, 0.65, 0.09);
        b.rotation.z = -side * 0.7;
      }
      this.mesh(this.rock, 0x403841, x, 0.18, z, 0.5, 0.2, 0.4);
      return;
    }
    for (let k = 0; k < 3; k++) {
      const r = (0.34 - k * 0.06) * size,
        y = size * (0.4 + k * 0.2);
      const color = biome === 'frost' ? 0x58858b : [0xbf783a, 0xd0a149, 0xa75432][index % 3];
      this.mesh(this.cone, color, x, y, z, r, size * 0.45, r);
      if (biome === 'frost') this.mesh(this.cone, 0xe3eeee, x, y + 0.14, z, r * 0.83, size * 0.39, r * 0.83);
    }
  }
  private scenery() {
    for (let i = 0; i < this.map.obstacles.length; i++) {
      const o = this.map.obstacles[i];
      if (o.border) {
        this.tree(o.x, o.z, 1.5 + this.random() * 0.6, i);
      } else if (o.kind === 'rocks') {
        this.model(
          'detail-rocks-large',
          o.r * 2.3,
          o.x,
          0,
          o.z,
          this.map.biome === 'forest' ? undefined : this.palette.rock,
        );
        if (this.map.biome === 'frost')
          this.mesh(this.rock, 0xe0eeee, o.x, o.r * 1.05, o.z, o.r * 0.7, 0.2, o.r * 0.7);
      } else if (o.kind === 'ruins') {
        for (const side of [-1, 1]) {
          this.mesh(this.cylinder, this.palette.rock, o.x + side * 0.45, 0.75, o.z, 0.24, 1.5, 0.24);
          this.box(this.palette.rock, o.x + side * 0.45, 1.58, o.z, 0.62, 0.2, 0.6);
        }
        const fallen = this.box(this.palette.rock, o.x, 0.28, o.z + 0.4, 0.35, 1.4, 0.4);
        fallen.rotation.z = 0.9;
      } else {
        const count = o.r < 0.8 ? 1 : 3;
        for (let j = 0; j < count; j++)
          this.tree(
            o.x + (j - 1) * o.r * 0.45,
            o.z + (j % 2) * o.r * 0.3,
            2.3 + o.r * 0.7 + this.random() * 0.5,
            i + j,
          );
        this.model(
          'detail-rocks',
          o.r,
          o.x + 0.6,
          0,
          o.z + 0.4,
          this.map.biome === 'forest' ? undefined : this.palette.rock,
        );
      }
    }
  }
  private fortress() {
    const g = new THREE.Group();
    g.position.set(this.map.base.x, 0, this.map.base.z);
    g.rotation.y = this.map.baseAngle;
    this.group.add(g);
    const stone = this.map.biome === 'frost' ? 0xc5d3d9 : this.map.biome === 'volcano' ? 0x978895 : 0xd8c4a1;
    const roof =
      this.map.biome === 'autumn'
        ? 0x965d3d
        : this.map.biome === 'frost'
          ? 0x607f99
          : this.map.biome === 'volcano'
            ? 0x714957
            : 0x497d73;
    this.box(0x7b8069, 0, 0.18, 0, 3.6, 0.35, 2.8, g);
    this.box(stone, 0, 0.95, 0, 2.9, 1.65, 1.8, g);
    this.box(0x49513f, 0, 0.65, -0.92, 0.72, 1.15, 0.07, g);
    this.box(0x664434, 0, 0.59, -0.98, 0.6, 1.05, 0.05, g);
    for (const x of [-1.35, 1.35]) {
      this.mesh(this.cylinder, stone, x, 1.35, -0.15, 0.64, 2.2, 0.64, g);
      for (let j = 0; j < 4; j++)
        this.box(
          stone,
          x + Math.cos((j * Math.PI) / 2) * 0.5,
          2.5,
          -0.15 + Math.sin((j * Math.PI) / 2) * 0.5,
          0.27,
          0.4,
          0.27,
          g,
        );
      this.mesh(this.cone, roof, x, 2.95, -0.15, 0.87, 1, 0.87, g);
      this.mesh(this.rock, 0xe5b464, x, 3.55, -0.15, 0.1, 0.1, 0.1, g);
    }
    this.box(stone, 0, 2.1, 0.2, 1.8, 1.1, 1.4, g);
    const r = this.mesh(this.cone, roof, 0, 3, 0.2, 1.45, 1.2, 1.45, g);
    r.rotation.y = Math.PI / 4;
    this.box(0xe5b464, 0, 3.95, 0.2, 0.065, 1, 0.065, g);
    this.box(0xcf7b4e, 0.28, 4.2, 0.2, 0.6, 0.35, 0.045, g);
    for (const x of [-0.95, 0.95]) {
      this.box(0x664434, x, 0.6, -1.35, 0.06, 1.1, 0.06, g);
      this.mesh(this.rock, 0xffbd69, x, 1.22, -1.35, 0.12, 0.25, 0.12, g);
    }
  }
  private portal(p: Point) {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    const r = this.map.routes.find((r) => distance(r.points[0], p) < 0.01)!;
    g.rotation.y = Math.atan2(r.points[1].x - p.x, r.points[1].z - p.z) - Math.PI / 2;
    this.group.add(g);
    for (const z of [-0.85, 0.85]) {
      this.box(this.palette.rock, 0, 1.1, z, 0.7, 2.2, 0.65, g);
      this.mesh(this.rock, this.palette.rock, 0, 2.3, z, 0.5, 0.4, 0.5, g);
    }
    this.box(this.palette.rock, 0, 2.5, 0, 0.8, 0.45, 2.1, g);
    const material = new THREE.MeshBasicMaterial({
      color: this.map.biome === 'volcano' ? 0xe88661 : 0x9673bb,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    this.materials.add(material);
    const portal = new THREE.Mesh(this.own(new THREE.PlaneGeometry(1.35, 1.95)), material);
    portal.rotation.y = Math.PI / 2;
    portal.position.set(0, 1.15, 0);
    g.add(portal);
  }
  animate(time: number, reduced: boolean) {
    if (reduced) return;
    for (const c of this.currents)
      c.mesh.position.copy(c.origin).addScaledVector(c.direction, Math.sin(time * 0.8 + c.phase) * 0.26);
    for (const m of this.waterMaterials)
      m.emissiveIntensity = this.map.biome === 'volcano' ? 0.45 + Math.sin(time * 1.5) * 0.1 : 0.12;
  }
  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.group.removeFromParent();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.currents = [];
    this.waterMaterials = [];
    this.group.clear();
  }
}

import { createTerritoryOverlay, disposeTerritoryOverlay } from './territoryOverlay';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Landscape, BIOME_COLORS } from './landscape';
import {
  PLAYER_COLORS,
  PROJECTILE_STYLE,
  MAPS,
  type MapId,
  TOWERS,
  towerStats,
  ENEMY_COLLIDERS,
  placementError,
  distance,
  segmentDistance,
  type Point,
  type TowerKind,
  type GameView,
  type TowerView,
  type EnemyView,
  type ImpactEvent,
} from '@emberwatch/shared';

const palette = {
  stone: 0xd8c4a1,
  darkStone: 0x697366,
  wood: 0x664434,
  gold: 0xe5b464,
  grass: 0x719651,
  lightGrass: 0x87aa5e,
  leaf: 0x356c4d,
  lightLeaf: 0x56844b,
};
const materials = new Map<number, THREE.MeshStandardMaterial>();
function mat(color: number) {
  if (!materials.has(color))
    materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  return materials.get(color)!;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1),
  cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8),
  coneGeo = new THREE.ConeGeometry(1, 1, 6),
  rockGeo = new THREE.IcosahedronGeometry(1, 0),
  orbGeo = new THREE.IcosahedronGeometry(1, 1);
function mesh(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function box(color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  return mesh(boxGeo, color, x, y, z, sx, sy, sz);
}
function ring(radius: number, color: number, opacity = 0.8) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.035, radius, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.09;
  return m;
}
const assetNames = [
  'detail-tree',
  'detail-tree-large',
  'detail-rocks',
  'detail-rocks-large',
  'detail-crystal',
  'weapon-ballista',
  'weapon-cannon',
  'tower-round-bottom-a',
  'tower-round-top-a',
  'tower-round-roof-a',
  'tower-round-middle-a',
  'tower-square-bottom-a',
  'tower-square-top-a',
  'tower-square-roof-a',
];
export class Assets {
  models = new Map<string, GLTF>();
  private towers = new Map<string, THREE.Group>();
  async load(progress: (p: number) => void) {
    const loader = new GLTFLoader();
    let loaded = 0;
    const files = [
      ...assetNames.map((name) => ({ name, url: `/assets/kenney/${name}.glb` })),
      ...['goblin', 'ogre', 'wraith'].map((name) => ({ name, url: `/assets/monsters/${name}.glb` })),
    ];
    await Promise.all(
      files.map(async (f) => {
        const gltf = await loader.loadAsync(f.url);
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.models.set(f.name, gltf);
        progress(++loaded / files.length);
      }),
    );
  }
  model(name: string, size: number) {
    const source = this.models.get(name);
    if (!source) return new THREE.Group();
    const object = cloneSkeleton(source.scene);
    const bounds = new THREE.Box3().setFromObject(object);
    const v = bounds.getSize(new THREE.Vector3()),
      center = bounds.getCenter(new THREE.Vector3());
    const scale = size / Math.max(v.x, v.y, v.z);
    object.scale.multiplyScalar(scale);
    object.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    const root = new THREE.Group();
    root.add(object);
    return root;
  }
  tower(kind: TowerKind, level = 1) {
    const key = `${kind}-${level}`;
    const cached = this.towers.get(key);
    if (cached) return cached.clone(true);
    const root = new THREE.Group();
    const color = new THREE.Color(TOWERS[kind].color).getHex();
    root.add(mesh(cylGeo, 0x566650, 0, 0.13, 0, 0.77, 0.25, 0.77));
    root.add(mesh(cylGeo, palette.stone, 0, 0.27, 0, 0.65, 0.18, 0.65));
    const body = this.model('tower-round-bottom-a', 1.35);
    body.position.y = 0.34;
    body.scale.y = 0.75 + (level >= 3 ? 0.15 : 0);
    root.add(body);
    root.add(mesh(cylGeo, palette.gold, 0, 1.22, 0, 0.56, 0.09, 0.56));
    const head = new THREE.Group();
    head.name = 'head';
    head.position.y = 1.22 + (level >= 3 ? 0.2 : 0);
    root.add(head);
    if (kind === 'venom') {
      head.add(mesh(cylGeo, 0x37493e, 0, 0.25, 0, 0.58, 0.55, 0.58));
      head.add(mesh(cylGeo, color, 0, 0.55, 0, 0.47, 0.08, 0.47));
      for (const x of [-0.28, 0.2]) head.add(mesh(rockGeo, color, x, 0.78, 0.1, 0.16));
      for (const x of [-0.58, 0.58]) head.add(box(0xb7b98a, x, 0.4, 0, 0.1, 0.3, 0.35));
    } else if (kind === 'inferno') {
      head.add(mesh(cylGeo, 0x684c38, 0, 0.4, 0, 0.32, 0.8, 0.32));
      for (const x of [-0.4, 0.4]) head.add(mesh(coneGeo, 0xe6ba70, x, 0.55, 0, 0.15, 1, 0.15));
      head.add(mesh(coneGeo, color, 0, 1.02, 0, 0.38, 0.9, 0.38));
      head.add(mesh(coneGeo, 0xffdf84, 0, 0.91, 0.15, 0.21, 0.65, 0.21));
    } else if (kind === 'sniper') {
      head.add(box(0x4b5661, 0, 0.18, 0, 0.7, 0.25, 0.7));
      const barrel = mesh(cylGeo, 0x62788a, 0, 0.5, 0.65, 0.12, 1.9, 0.12);
      barrel.rotation.x = Math.PI / 2;
      head.add(barrel);
      head.add(box(palette.wood, 0, 0.35, -0.3, 0.4, 0.35, 0.65));
      head.add(box(color, 0, 0.8, 0.05, 0.18, 0.16, 0.5));
    } else if (kind === 'repeater') {
      head.add(box(palette.wood, 0, 0.3, 0, 1, 0.5, 0.75));
      for (const x of [-0.3, 0, 0.3]) {
        const barrel = mesh(cylGeo, 0x657572, x, 0.5, 0.5, 0.1, 1.1, 0.1);
        barrel.rotation.x = Math.PI / 2;
        head.add(barrel);
      }
      head.add(mesh(cylGeo, color, 0, 0.68, 0, 0.32, 0.14, 0.32));
    } else if (kind === 'ballista') {
      const weapon = this.model('weapon-ballista', 1.65);
      head.add(weapon);
    } else if (kind === 'arcane' || kind === 'prism' || kind === 'frost') {
      head.add(mesh(coneGeo, 0x746391, 0, 0.22, 0, 0.48, 0.4, 0.48));
      const crystal = mesh(new THREE.OctahedronGeometry(0.4), 0xb898f4, 0, 0.82, 0, 1, 1.65, 1);
      (crystal.material as THREE.MeshStandardMaterial) = new THREE.MeshStandardMaterial({
        color,
        emissive: kind === 'frost' ? 0x349dae : kind === 'prism' ? 0x854c99 : 0x704aa9,
        emissiveIntensity: 0.65,
        roughness: 0.3,
      });
      head.add(crystal);
      if (kind === 'prism' || kind === 'frost')
        for (const x of [-0.45, 0.45]) head.add(mesh(coneGeo, color, x, 0.7, 0, 0.18, 0.95, 0.18));
      head.add(ring(0.57, color));
    } else if (PROJECTILE_STYLE[kind] === 'shell') {
      head.add(box(0x3b494b, 0, 0.14, 0, 0.9, 0.22, 0.85));
      for (const x of [-0.42, 0.42]) head.add(mesh(cylGeo, palette.gold, x, 0.3, 0, 0.12, 0.42, 0.12));
      const barrel = new THREE.Group();
      barrel.position.set(0, 0.35, 0);
      barrel.rotation.x = 0.52;
      barrel.add(mesh(cylGeo, 0x465254, 0, 0.28, 0, 0.3, 0.75, 0.3));
      barrel.add(mesh(cylGeo, palette.gold, 0, 0.59, 0, 0.33, 0.13, 0.33));
      barrel.add(mesh(cylGeo, 0x1d292b, 0, 0.665, 0, 0.235, 0.015, 0.235));
      if (kind === 'meteor') barrel.scale.setScalar(1.25);
      head.add(barrel);
      if (kind !== 'grenade') head.add(mesh(orbGeo, color, 0, 0.95, 0, 0.24));
      for (const x of [-0.35, 0.35]) head.add(mesh(orbGeo, 0x303c3d, x, 0.32, -0.4, 0.17));
    } else {
      const cannon = this.model('weapon-cannon', 1.4);
      cannon.rotation.x = -0.22;
      if (kind === 'ember') {
        cannon.scale.set(0.8, 0.8, 1.15);
        head.add(mesh(coneGeo, color, 0, 0.7, -0.3, 0.3, 0.7, 0.3));
      }
      head.add(cannon);
      const flame = mesh(orbGeo, 0xffae50, 0, 0.62, 0.5, 0.2, 0.4, 0.2);
      flame.name = 'flame';
      head.add(flame);
    }
    for (let i = 0; i < level; i++) {
      const a = (i * Math.PI * 2) / 5;
      root.add(mesh(rockGeo, color, Math.cos(a) * 0.59, 0.54, Math.sin(a) * 0.59, 0.075));
    }
    if (level >= 3) {
      for (const x of [-0.56, 0.56]) root.add(box(palette.gold, x, 0.9, 0, 0.12, 1.15, 0.18));
    }
    if (level >= 5) {
      const crown = ring(0.72, palette.gold);
      crown.position.y = 1.55;
      root.add(crown);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        root.add(mesh(coneGeo, palette.gold, Math.cos(a) * 0.65, 1.55, Math.sin(a) * 0.65, 0.13, 0.42, 0.13));
      }
    }
    // Body and rotating weapon each share merged meshes across every tower of this level.
    // This keeps late waves light and avoids allocating new rings/crystals on every map switch.
    root.updateMatrixWorld(true);
    for (const part of [head, root]) {
      const groups = new Map<THREE.Material, THREE.Mesh[]>();
      part.traverse((o) => {
        if (
          !(o instanceof THREE.Mesh) ||
          Array.isArray(o.material) ||
          o.material.transparent ||
          o.name === 'flame'
        )
          return;
        if (part === root && head.getObjectById(o.id)) return;
        const list = groups.get(o.material) || [];
        list.push(o);
        groups.set(o.material, list);
      });
      const inverse = part.matrixWorld.clone().invert();
      for (const [material, meshes] of groups) {
        if (meshes.length < 2) continue;
        const geometries = meshes.map((m) => {
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          g.applyMatrix4(inverse.clone().multiply(m.matrixWorld));
          return g;
        });
        const merged = mergeGeometries(geometries);
        geometries.forEach((g) => g.dispose());
        if (!merged) continue;
        const batch = new THREE.Mesh(merged, material);
        batch.castShadow = batch.receiveShadow = true;
        meshes.forEach((m) => m.removeFromParent());
        part.add(batch);
      }
    }
    this.towers.set(key, root);
    return root.clone(true);
  }
  previews() {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(240, 200);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffeed9, 0x465340, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(-3, 5, 6);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(32, 1.2, 0.1, 30);
    camera.position.set(3.5, 3.7, 4.8);
    camera.lookAt(0, 1.05, 0);
    const result = {} as Record<TowerKind, string>;
    for (const kind of Object.keys(TOWERS) as TowerKind[]) {
      const tower = this.tower(kind);
      scene.add(tower);
      renderer.render(scene, camera);
      result[kind] = renderer.domElement.toDataURL();
      scene.remove(tower);
    }
    renderer.dispose();
    return result;
  }
}
interface EnemyObject {
  root: THREE.Group;
  mixer?: THREE.AnimationMixer;
  health: THREE.Mesh;
  state: EnemyView;
  hitUntil: number;
}
interface ProjectileObject {
  root: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  elapsed: number;
}
export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-20, 20, 15, -15, 0.1, 200);
  controls: OrbitControls;
  private resizeObserver: ResizeObserver;
  private raf = 0;
  private last = 0;
  private time = 0;
  private disposed = false;
  private ownerGeometry = new THREE.RingGeometry(0.82, 0.94, 32);
  private ownerMaterials = PLAYER_COLORS.map(
    (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  private towerObjects = new Map<string, { root: THREE.Group; level: number }>();
  private enemyObjects = new Map<string, EnemyObject>();
  private projectileObjects = new Map<string, ProjectileObject>();
  private impacted = new Map<string, number>();
  private selectionKey = '';
  private territoryKey = '';
  private territories?: THREE.Group;
  playerId = '';
  private blasts: { mesh: THREE.Mesh; age: number; radius: number }[] = [];
  private state?: GameView;
  private landscape?: Landscape;
  private mapId: MapId = 'waldtal';
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  research: Partial<Record<TowerKind, number>> = {};
  private buildKind: TowerKind | null = null;
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private hoverRange?: THREE.Group;
  private hoverKey = '';
  private mousePosition?: { x: number; y: number };
  private selection?: THREE.Group;
  private ghost?: THREE.Group;
  private target?: Point;
  private previewError: string | null = null;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private down = { x: 0, y: 0 };
  private pointers = new Set<number>();
  private gesture = false;
  private frameSamples: number[] = [];
  private renderedFrames = 0;
  onPick: (point: Point, towerId?: string, enemyId?: string) => void = () => {};
  onHover: (point: Point) => void = () => {};
  constructor(
    private host: HTMLElement,
    private assets: Assets,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    // Scenery is static. Rebuild its shadow atlas only when a tower is added or removed.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.domElement.setAttribute('aria-label', '3D-Spielfeld: Waldtal');
    this.host.appendChild(this.renderer.domElement);
    this.camera.position.set(22, 29, 32);
    this.camera.lookAt(0, 0, 0);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minZoom = 0.72;
    this.controls.maxZoom = 2.4;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = {
      LEFT: null as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.touches = { ONE: null as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_PAN };
    this.scene.add(new THREE.HemisphereLight(0xfff0d9, 0x536c57, 2.8));
    const sun = new THREE.DirectionalLight(0xffe6b6, 4.3);
    sun.position.set(-12, 25, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 70 });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.08;
    this.scene.add(sun);
    this.setMap('waldtal');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.pointerCancel);
    this.renderer.domElement.addEventListener('pointerleave', this.clearHover);
    window.addEventListener('blur', this.clearHover);
    this.controls.addEventListener('change', this.updateHover);
    this.raf = requestAnimationFrame(this.animate);
  }
  /** Repeated scenery uses one draw call per geometry/material combination. */
  private batchStaticMeshes(root: THREE.Group) {
    root.updateMatrixWorld(true);
    const groups = new Map<string, THREE.Mesh[]>();
    root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh ||
        object.userData.animated
      )
        return;
      if (Array.isArray(object.material) || object.material.transparent) return;
      const key = `${object.geometry.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      const group = groups.get(key) || [];
      group.push(object);
      groups.set(key, group);
    });
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const first = group[0];
      const batch = new THREE.InstancedMesh(first.geometry, first.material, group.length);
      batch.castShadow = first.castShadow;
      batch.receiveShadow = first.receiveShadow;
      group.forEach((mesh, index) => {
        batch.setMatrixAt(index, mesh.matrixWorld);
        mesh.removeFromParent();
      });
      batch.computeBoundingSphere();
      root.add(batch);
    }
  }
  private setMap(id: MapId) {
    if (this.landscape && this.mapId === id) return;
    for (const o of this.towerObjects.values()) this.scene.remove(o.root);
    this.towerObjects.clear();
    for (const o of this.enemyObjects.values()) {
      o.mixer?.stopAllAction();
      this.scene.remove(o.root);
      this.disposeDynamic(o.root);
    }
    this.enemyObjects.clear();
    for (const id of [...this.projectileObjects.keys()]) this.removeProjectile(id);
    this.landscape?.dispose();
    this.mapId = id;
    this.landscape = new Landscape(MAPS[id], this.assets);
    this.scene.add(this.landscape.group);
    this.batchStaticMeshes(this.landscape.group);
    this.scene.background = new THREE.Color(BIOME_COLORS[MAPS[id].biome].background);
    this.renderer.domElement.setAttribute('aria-label', `3D-Spielfeld: ${MAPS[id].name}`);
    this.impacted.clear();
    for (const b of this.blasts) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
    }
    this.blasts = [];
    this.clearHover();
    this.select(null, null);
    this.resetCamera();
    this.renderer.shadowMap.needsUpdate = true;
  }
  update(state: GameView) {
    this.setMap(state.mapId || 'waldtal');
    this.state = state;
    for (const t of Object.values(state.towers)) {
      let entry = this.towerObjects.get(t.id);
      if (!entry || entry.level !== t.level) {
        if (entry) this.scene.remove(entry.root);
        const root = this.assets.tower(t.kind, t.level);
        root.position.set(t.x, 0, t.z);
        root.userData.towerId = t.id;
        const marker = new THREE.Mesh(this.ownerGeometry, this.ownerMaterials[0]);
        marker.name = 'owner-marker';
        marker.rotation.x = -Math.PI / 2;
        marker.position.y = 0.08;
        root.add(marker);
        this.scene.add(root);
        entry = { root, level: t.level };
        this.towerObjects.set(t.id, entry);
        this.renderer.shadowMap.needsUpdate = true;
      }
      const marker = entry.root.getObjectByName('owner-marker') as THREE.Mesh;
      marker.visible = state.mode === 'coop';
      marker.material = this.ownerMaterials[state.players[t.owner]?.color || 0];
      const head = entry.root.getObjectByName('head');
      if (head) head.rotation.y = t.angle;
    }
    for (const [id, o] of this.towerObjects)
      if (!state.towers[id]) {
        this.scene.remove(o.root);
        this.towerObjects.delete(id);
        this.renderer.shadowMap.needsUpdate = true;
      }
    for (const e of Object.values(state.enemies)) {
      let entry = this.enemyObjects.get(e.id);
      if (!entry) {
        const root = new THREE.Group();
        const size = e.kind === 'ogre' ? 1.8 : e.kind === 'wraith' ? 1.3 : 1.05;
        const model = this.assets.model(e.kind, size);
        root.add(model);
        model.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = false;
        });
        // Lightweight contact shadows follow monsters without re-rendering every skeleton
        // into the 2048px scenery shadow map on every animation frame.
        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(e.kind === 'ogre' ? 0.6 : 0.34, 12),
          new THREE.MeshBasicMaterial({
            color: 0x142b20,
            opacity: 0.22,
            transparent: true,
            depthWrite: false,
          }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.09;
        root.add(shadow);
        const source = this.assets.models.get(e.kind);
        let mixer: THREE.AnimationMixer | undefined;
        if (source?.animations.length) {
          mixer = new THREE.AnimationMixer(model);
          const clip =
            source.animations.find((a) => /walk|run|flying|float/i.test(a.name)) || source.animations[0];
          mixer.clipAction(clip).play();
        }
        const bar = new THREE.Group();
        bar.position.y = size + 0.3;
        const back = new THREE.Mesh(
          new THREE.PlaneGeometry(0.85, 0.1),
          new THREE.MeshBasicMaterial({ color: 0x243831, depthTest: false }),
        );
        const health = new THREE.Mesh(
          new THREE.PlaneGeometry(0.8, 0.055),
          new THREE.MeshBasicMaterial({ color: e.level > 1 ? 0xe9b466 : 0xa5d174, depthTest: false }),
        );
        health.position.z = 0.005;
        bar.add(back, health);
        for (const [i, effect] of ['burn', 'poison', 'slow'].entries()) {
          const marker = new THREE.Mesh(
            new THREE.CircleGeometry(0.065, 8),
            new THREE.MeshBasicMaterial({ color: [0xff9454, 0xa5df69, 0x89e3f2][i], depthTest: false }),
          );
          marker.name = 'status-' + effect;
          marker.position.set((i - 1) * 0.19, 0.15, 0.01);
          marker.visible = false;
          bar.add(marker);
        }
        bar.name = 'bar';
        root.add(bar);
        if (e.level > 1) {
          const label = this.label(String(e.level));
          label.position.set(0.55, size + 0.3, 0);
          label.scale.set(0.36, 0.36, 1);
          root.add(label);
        }
        root.position.set(e.x, 0, e.z);
        this.scene.add(root);
        entry = { root, mixer, health, state: e, hitUntil: 0 };
        this.enemyObjects.set(e.id, entry);
      }
      if (e.hp < entry.state.hp) entry.hitUntil = this.time + 0.12;
      entry.state = e;
      entry.health.scale.x = Math.max(0, e.hp / e.maxHp);
      entry.health.position.x = -(1 - entry.health.scale.x) * 0.4;
    }
    for (const [id, o] of this.enemyObjects)
      if (!state.enemies[id]) {
        o.mixer?.stopAllAction();
        this.scene.remove(o.root);
        this.disposeDynamic(o.root);
        this.enemyObjects.delete(id);
      }
    for (const p of Object.values(state.projectiles)) {
      if (this.impacted.has(p.id)) continue;
      let entry = this.projectileObjects.get(p.id);
      if (!entry) {
        const root = this.projectileModel(p.kind);
        root.name = 'projectile-' + p.id;
        root.position.set(p.x, p.y, p.z);
        this.scene.add(root);
        entry = { root, from: root.position.clone(), to: root.position.clone(), elapsed: 0 };
        this.projectileObjects.set(p.id, entry);
      }
      if (p.kind === 'fire') entry.root.userData.flame = { x: p.vx, z: p.vz, width: p.vy };
      entry.root.userData.beamTarget = p.kind === 'prism' ? p.targetId : undefined;
      entry.from.copy(entry.root.position);
      entry.to.set(p.x, p.y, p.z);
      entry.elapsed = 0;
      if (PROJECTILE_STYLE[p.kind] === 'bolt')
        entry.root.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(p.vx, p.vy, p.vz).normalize(),
        );
    }
    for (const id of this.projectileObjects.keys()) if (!state.projectiles[id]) this.removeProjectile(id);
    // A new run starts at wave zero; IDs may be reused by its room.
    if (state.wave === 0) this.impacted.clear();
    this.refreshSelection();
  }
  private label(text: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#304437';
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 38px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f3d19a';
    ctx.fillText(text, 32, 33);
    return new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }),
    );
  }
  select(kind: TowerKind | null, towerId: string | null) {
    if (this.buildKind !== kind) {
      this.buildKind = kind;
      this.target = undefined;
      this.previewError = null;
      if (this.ghost) {
        this.scene.remove(this.ghost);
        this.ghost.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
        });
        this.ghost = undefined;
      }
      if (kind) {
        this.ghost = this.assets.tower(kind);
        this.ghost.name = 'build-preview';
        this.ghost.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.material = (o.material as THREE.Material).clone();
            const m = o.material as THREE.MeshStandardMaterial;
            o.userData.previewColor = m.color.clone();
            m.transparent = true;
            m.opacity = 0.55;
            o.castShadow = false;
          }
        });
        this.ghost.visible = false;
        this.scene.add(this.ghost);
      }
    }
    this.selectedId = towerId;
    if (kind) this.clearHover();
    this.refreshSelection();
  }
  preview(point: Point | null, error: string | null = null) {
    this.target = point || undefined;
    this.previewError = error;
    if (this.ghost) {
      if (point) this.ghost.position.set(point.x, 0.06, point.z);
      this.ghost.visible = !!point;
    }
    this.refreshSelection();
  }
  private refreshSelection() {
    if (this.state) {
      const key = JSON.stringify([
        this.state.mapId,
        this.state.mode,
        this.state.lobby,
        this.state.buildMode,
        this.state.zoneOwners,
        this.playerId,
        !!this.buildKind,
      ]);
      if (key !== this.territoryKey) {
        this.territoryKey = key;
        if (this.territories) disposeTerritoryOverlay(this.territories);
        this.territories = createTerritoryOverlay(this.state, this.playerId, !!this.buildKind);
        this.scene.add(this.territories);
      }
    }
    if (this.hoveredId && !this.state?.towers[this.hoveredId]) this.hoveredId = null;
    if (this.selectedId && !this.state?.towers[this.selectedId]) this.selectedId = null;
    const hovered =
      !this.buildKind && this.hoveredId !== this.selectedId
        ? this.state?.towers[this.hoveredId || '']
        : undefined;
    const hoverKey = JSON.stringify([hovered?.id, hovered?.level, hovered?.research, hovered?.x, hovered?.z]);
    if (hoverKey !== this.hoverKey) {
      this.hoverKey = hoverKey;
      if (this.hoverRange) {
        this.scene.remove(this.hoverRange);
        this.disposeDynamic(this.hoverRange);
        this.hoverRange = undefined;
      }
      if (hovered) {
        this.hoverRange = this.rangeIndicator(
          hovered,
          towerStats(hovered.kind, hovered.level, hovered.research || 0).range,
          new THREE.Color(TOWERS[hovered.kind].color).getHex(),
          false,
        );
        this.hoverRange.name = 'tower-hover-range';
        this.hoverRange.userData.towerId = hovered.id;
        this.scene.add(this.hoverRange);
      }
    }
    this.renderer.domElement.style.cursor = !this.buildKind && this.hoveredId ? 'pointer' : '';
    const selected = this.selectedId ? this.state?.towers[this.selectedId] : undefined;
    const pos = this.buildKind ? this.target : selected;
    const error =
      this.buildKind && pos
        ? this.previewError || placementError(pos, Object.values(this.state?.towers || {}), MAPS[this.mapId])
        : null;
    const key = JSON.stringify([
      this.buildKind,
      this.selectedId,
      selected?.level,
      selected?.research,
      this.research,
      pos?.x,
      pos?.z,
      error,
    ]);
    if (this.ghost) {
      const invalid = error ? new THREE.Color(0xe27c68) : null;
      this.ghost.traverse((o) => {
        if (o instanceof THREE.Mesh)
          (o.material as THREE.MeshStandardMaterial).color.copy(invalid || o.userData.previewColor);
      });
    }
    if (key === this.selectionKey) return;
    this.selectionKey = key;
    if (this.selection) {
      this.scene.remove(this.selection);
      this.disposeDynamic(this.selection);
      this.selection = undefined;
    }
    const t = this.selectedId ? this.state?.towers[this.selectedId] : undefined;
    const kind = this.buildKind || t?.kind;
    if (!kind) return;
    const p = this.buildKind ? this.target : t;
    if (!p) return;
    const valid = !this.buildKind || !error;
    const color = valid ? new THREE.Color(TOWERS[kind].color).getHex() : 0xe27c68;
    const radius = towerStats(kind, t?.level || 1, t?.research ?? this.research[kind] ?? 0).range;
    const group = this.rangeIndicator(p, radius, color, !!t);
    group.name = 'tower-range';
    group.userData.towerId = t?.id;
    this.scene.add(group);
    this.selection = group;
  }
  private rangeIndicator(p: Point, radius: number, color: number, selected: boolean) {
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    group.userData.radius = radius;
    const edge = ring(radius, color, selected ? 0.85 : 0.55);
    edge.name = 'range-edge';
    group.add(edge);
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 64),
      new THREE.MeshBasicMaterial({
        color,
        opacity: selected ? 0.085 : 0.035,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    );
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.07;
    fill.renderOrder = 4;
    group.add(fill);
    const base = ring(selected ? 0.94 : 0.85, selected ? 0xffde8e : color, selected ? 1 : 0.7);
    base.name = 'tower-highlight';
    group.add(base);
    if (selected) {
      const inner = ring(0.83, 0xffde8e, 0.65);
      group.add(inner);
      for (let i = 0; i < 4; i++) {
        const mark = new THREE.Mesh(
          new THREE.RingGeometry(0.97, 1.06, 8, 1, (i * Math.PI) / 2 + 0.15, 0.5),
          new THREE.MeshBasicMaterial({
            color: 0xffde8e,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
          }),
        );
        mark.rotation.x = -Math.PI / 2;
        mark.position.y = 0.09;
        mark.renderOrder = 6;
        group.add(mark);
      }
    }
    for (const mesh of [edge, base]) {
      (mesh.material as THREE.MeshBasicMaterial).depthTest = false;
      mesh.renderOrder = 5;
    }
    return group;
  }

  private projectileModel(kind: TowerKind) {
    const root = new THREE.Group();
    const add = (geometry: THREE.BufferGeometry, color: number, y = 0) => {
      const part = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
      part.position.y = y;
      root.add(part);
      return part;
    };
    if (kind === 'fire') {
      for (let i = 0; i < 24; i++) {
        const flame = add(new THREE.IcosahedronGeometry(1, 1), i % 3 ? 0xff6518 : 0xffd25a);
        const material = flame.material as THREE.MeshBasicMaterial;
        material.transparent = true;
        material.depthWrite = false;
        material.blending = THREE.NormalBlending;
        flame.userData.seed = i;
      }
    } else if (kind === 'prism') {
      add(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), 0xffefff);
      const glow = add(new THREE.CylinderGeometry(0.115, 0.115, 1, 8), 0xd789ff);
      const material = glow.material as THREE.MeshBasicMaterial;
      material.transparent = true;
      material.opacity = 0.35;
      material.depthWrite = false;
      material.blending = THREE.AdditiveBlending;
    } else if (PROJECTILE_STYLE[kind] === 'bolt') {
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.68, 5), 0xeac28a);
      add(new THREE.ConeGeometry(0.13, 0.24, 4), 0xf3f0d9, 0.42);
      const fletching = add(new THREE.BoxGeometry(0.28, 0.2, 0.035), 0xb5cc85, -0.27);
      const cross = fletching.clone();
      cross.geometry = fletching.geometry.clone();
      cross.material = fletching.material.clone();
      cross.rotation.y = Math.PI / 2;
      root.add(cross);
    } else if (PROJECTILE_STYLE[kind] === 'shell') {
      add(
        new THREE.IcosahedronGeometry(0.22, 1),
        kind === 'grenade' ? 0x303b3d : new THREE.Color(TOWERS[kind].color).getHex(),
      );
      add(new THREE.CylinderGeometry(0.23, 0.23, 0.09, 8), 0xe2c16e);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 4), 0xe4bc76, 0.25);
      add(new THREE.IcosahedronGeometry(0.07), 0xffefae, 0.34);
    } else {
      const color = new THREE.Color(TOWERS[kind].color).getHex();
      add(new THREE.IcosahedronGeometry(0.18, 1), TOWERS[kind].type === 'arcane' ? 0xf4dfff : 0xffefb0);
      const glow = add(new THREE.IcosahedronGeometry(0.29, 1), color);
      (glow.material as THREE.MeshBasicMaterial).transparent = true;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.4;
      (glow.material as THREE.MeshBasicMaterial).depthWrite = false;
    }
    return root;
  }
  private removeProjectile(id: string) {
    const p = this.projectileObjects.get(id);
    if (!p) return;
    this.scene.remove(p.root);
    this.disposeDynamic(p.root);
    this.projectileObjects.delete(id);
  }
  impact(event: ImpactEvent) {
    // Events can precede the corresponding state patch. Never resurrect an impacted shot.
    this.impacted.set(event.projectileId, this.time + 3);
    this.removeProjectile(event.projectileId);
    if (this.blasts.length >= 35) return;
    const splash = event.splash > 0;
    const geometry = splash ? new THREE.RingGeometry(0.6, 1, 32) : new THREE.IcosahedronGeometry(1, 0);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(TOWERS[event.kind].color),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geometry, material);
    m.position.set(event.at.x, splash ? 0.13 : event.at.y, event.at.z);
    if (splash) m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(0.05);
    this.scene.add(m);
    this.blasts.push({ mesh: m, age: 0, radius: event.splash || 0.35 });
    if (splash && this.blasts.length < 35) {
      const flash = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material.clone());
      flash.position.set(event.at.x, Math.max(0.3, event.at.y), event.at.z);
      flash.scale.setScalar(0.05);
      this.scene.add(flash);
      this.blasts.push({ mesh: flash, age: 0, radius: 0.65 });
    }
  }
  private point(event: PointerEvent) {
    return this.screenPoint(event.clientX, event.clientY);
  }
  screenPoint(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        (-(clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? { x: hit.x, z: hit.z } : null;
  }
  private pointerDown = (e: PointerEvent) => {
    this.clearHover();
    this.pointers.add(e.pointerId);
    if (this.pointers.size > 1) this.gesture = true;
    this.down = { x: e.clientX, y: e.clientY };
  };
  private pointerCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) this.gesture = false;
  };
  private clearHover = () => {
    this.mousePosition = undefined;
    this.hoveredId = null;
    this.refreshSelection();
  };
  private towerHit() {
    const hits = this.raycaster.intersectObjects(
      [...this.towerObjects.values()].map((t) => t.root),
      true,
    );
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData.towerId) return obj.userData.towerId as string;
        obj = obj.parent;
      }
    }
    return undefined;
  }
  private updateHover = () => {
    const p = this.mousePosition;
    if (!p || this.buildKind || this.pointers.size) return;
    this.screenPoint(p.x, p.y);
    const id = this.towerHit() || null;
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.refreshSelection();
    }
  };
  private pointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || this.pointers.size) return;
    const p = this.point(e);
    if (p) this.onHover(p);
    this.mousePosition = { x: e.clientX, y: e.clientY };
    this.updateHover();
  };
  private pointerUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const gesture = this.gesture;
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) this.gesture = false;
    if (gesture || e.button !== 0 || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) return;
    const p = this.point(e);
    if (!p) return;
    const towerId = this.towerHit();
    const enemy = [...this.enemyObjects.entries()].find(([, o]) => distance(p, o.state) < 0.8);
    this.onPick(p, towerId, enemy?.[0]);
    if (e.pointerType === 'mouse') {
      this.mousePosition = { x: e.clientX, y: e.clientY };
      this.updateHover();
    }
  };
  zoom(amount: number) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * amount, 0.72, 2.4);
    this.camera.updateProjectionMatrix();
  }
  resetCamera() {
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(22, 29, 32);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const size = aspect < 1 ? 12.5 / aspect : Math.max(12.2, 18 / aspect);
    this.camera.left = -size * aspect;
    this.camera.right = size * aspect;
    this.camera.top = size;
    this.camera.bottom = -size;
    this.camera.updateProjectionMatrix();
  }
  private animate = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min((now - (this.last || now)) / 1000, 0.05);
    if (this.last) {
      this.frameSamples.push(now - this.last);
      if (this.frameSamples.length > 300) this.frameSamples.shift();
    }
    this.last = now;
    this.time += dt;
    for (const [id, tower] of this.towerObjects) {
      const target =
        !this.buildKind && id === this.selectedId
          ? 1.035
          : !this.buildKind && id === this.hoveredId
            ? 1.02
            : 1;
      const scale = this.reducedMotion.matches
        ? target
        : THREE.MathUtils.lerp(tower.root.scale.x, target, Math.min(1, dt * 14));
      tower.root.scale.setScalar(scale);
    }
    if (this.controls.enabled) this.controls.update();
    const t = this.controls.target;
    const clamped = new THREE.Vector3(
      THREE.MathUtils.clamp(t.x, -8, 8),
      0,
      THREE.MathUtils.clamp(t.z, -6, 6),
    );
    this.camera.position.add(clamped.clone().sub(t));
    t.copy(clamped);
    for (const o of this.enemyObjects.values()) {
      const old = o.root.position.clone();
      o.root.position.lerp(new THREE.Vector3(o.state.x, 0, o.state.z), Math.min(1, dt * 20));
      const dx = o.root.position.x - old.x,
        dz = o.root.position.z - old.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.001) o.root.children[0].rotation.y = Math.atan2(dx, dz);
      o.root.children[0].position.y =
        o.state.kind === 'wraith' ? 0.1 + Math.sin(this.time * 4 + o.state.progress) * 0.08 : 0;
      const bar = o.root.getObjectByName('bar');
      if (bar) bar.quaternion.copy(this.camera.quaternion);
      for (const effect of ['burn', 'poison', 'slow'] as const) {
        const marker = o.root.getObjectByName('status-' + effect);
        if (marker) {
          marker.visible = (o.state[effect] || 0) > 0;
          marker.scale.setScalar(1 + Math.sin(this.time * 5) * 0.12);
        }
      }
      o.mixer?.update(
        this.state?.paused ? 0 : dt * (this.state?.speed || 1) * (1 - (o.state.slowAmount || 0)),
      );
      (o.health.material as THREE.MeshBasicMaterial).color.set(
        o.hitUntil > this.time ? 0xffffff : o.state.level > 1 ? 0xe9b466 : 0xa5d174,
      );
    }
    for (const o of this.projectileObjects.values()) {
      const flame = o.root.userData.flame;
      if (flame) {
        o.root.userData.flameTime =
          (o.root.userData.flameTime || 0) + (this.state?.paused ? 0 : dt * (this.state?.speed || 1));
        o.root.position.copy(o.to);
        const length = Math.hypot(flame.x, flame.z);
        for (const child of o.root.children) {
          const mesh = child as THREE.Mesh;
          const seed = mesh.userData.seed;
          const u = (seed / 24 + o.root.userData.flameTime * 1.8) % 1;
          const spread = Math.sin(seed * 2.4) * flame.width * u * 0.8;
          mesh.position.set(
            flame.x * u + (flame.z / length) * spread,
            -0.7 * u + Math.sin(seed * 3.7 + u * 5) * 0.14 * u,
            flame.z * u - (flame.x / length) * spread,
          );
          const size = (0.12 + u * 0.4) * Math.sin(Math.PI * u);
          mesh.scale.set(size * 0.65, size * 2.3, size * 0.65);
          mesh.rotation.set(Math.PI / 2, Math.atan2(flame.x, flame.z), 0, 'YXZ');
          (mesh.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.8;
        }
        continue;
      }
      const beamTarget = o.root.userData.beamTarget;
      if (beamTarget) {
        const target = this.enemyObjects.get(beamTarget);
        o.root.visible = !!target;
        if (target) {
          const end = target.root.position.clone();
          end.y = ENEMY_COLLIDERS[target.state.kind].height;
          const delta = end.sub(o.to);
          o.root.position.copy(o.to).addScaledVector(delta, 0.5);
          o.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
          o.root.scale.set(1, delta.length(), 1);
        }
        continue;
      }
      o.elapsed += this.state?.paused ? 0 : dt;
      o.root.position.lerpVectors(o.from, o.to, Math.min(1, o.elapsed / 0.05));
    }
    for (const [id, expires] of this.impacted) if (this.time > expires) this.impacted.delete(id);
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.age += dt;
      const u = b.age / 0.28;
      if (u >= 1) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        this.blasts.splice(i, 1);
        continue;
      }
      b.mesh.scale.setScalar(b.radius * Math.min(1, 0.2 + u));
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.6;
    }
    this.landscape?.animate(this.time, this.reducedMotion.matches);
    this.renderer.render(this.scene, this.camera);
    this.renderedFrames++;
    this.raf = requestAnimationFrame(this.animate);
  };
  metrics() {
    return {
      mapId: this.mapId,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      landscapes: this.scene.children.filter((o) => o.name.startsWith('landscape-')).length,
      fps: this.frameSamples.length
        ? 1000 / (this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length)
        : 0,
      projectiles: this.projectileObjects.size,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      frames: this.renderedFrames,
    };
  }
  project(p: Point) {
    const v = new THREE.Vector3(p.x, 0, p.z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.host.clientWidth, y: ((1 - v.y) / 2) * this.host.clientHeight };
  }
  private disposeDynamic(root: THREE.Object3D) {
    root.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
  dispose() {
    if (this.territories) disposeTerritoryOverlay(this.territories);
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener('blur', this.clearHover);
    this.controls.removeEventListener('change', this.updateHover);
    this.controls.dispose();
    this.landscape?.dispose();
    const geometries = new Set<THREE.BufferGeometry>(),
      mats = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          mats.add(m);
          for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });
    geometries.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.ownerGeometry.dispose();
    this.ownerMaterials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

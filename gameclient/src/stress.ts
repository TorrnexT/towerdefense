import {
  TOWERS,
  MAPS,
  getRoute,
  type MapId,
  pathPosition,
  placementError,
  type GameView,
  type EnemyKind,
  type TowerKind,
} from '@emberwatch/shared';
import type { World } from './world';
/** Development-only graphics fixture. It never sends commands or changes a game room. */
export function rendererStress(world: World, mapId: MapId = 'waldtal') {
  const map = MAPS[mapId];
  const state: GameView = {
    ruleSet: 'endless',
    missionId: '',
    mapId,
    mode: 'solo',
    lobby: false,
    hostId: '',
    teamSize: 1,
    run: 0,
    speed: 1,
    phase: 'combat',
    wave: 40,
    completedWaves: 39,
    baseHp: 100,
    kills: 0,
    autoStart: true,
    countdown: 0,
    remaining: 100,
    paused: false,
    players: {},
    towers: {},
    enemies: {},
    projectiles: {},
  };
  for (let x = -13; x <= 13 && Object.keys(state.towers).length < 30; x += 0.75)
    for (let z = -9; z <= 9 && Object.keys(state.towers).length < 30; z += 0.75) {
      if (placementError({ x, z }, Object.values(state.towers), map)) continue;
      const i = Object.keys(state.towers).length,
        id = 'stress-t' + i;
      state.towers[id] = {
        id,
        owner: 'fixture',
        kind: (Object.keys(TOWERS) as TowerKind[])[i % 10],
        level: 1 + (i % 5),
        invested: 100,
        x,
        z,
        angle: 0,
      };
    }
  for (let i = 0; i < 100; i++) {
    const route = map.routes[i % map.routes.length];
    const progress = (i / 100) * route.length,
      id = 'stress-e' + i;
    state.enemies[id] = {
      id,
      kind: (['goblin', 'ogre', 'wraith'] as EnemyKind[])[i % 3],
      level: 8,
      wave: 40,
      progress,
      routeId: route.id,
      ...pathPosition(progress, map, route.id),
      hp: 100,
      teamSize: 1,
      maxHp: 100,
      speed: 2,
    };
  }
  world.select(null, null);
  let tick = 0;
  const timer = window.setInterval(() => {
    for (const enemy of Object.values(state.enemies)) {
      enemy.progress = (enemy.progress + 0.1) % getRoute(map, enemy.routeId).length;
      Object.assign(enemy, pathPosition(enemy.progress, map, enemy.routeId));
    }
    tick++;
    for (const p of Object.values(state.projectiles)) {
      p.x += p.vx * 0.05;
      p.y += p.vy * 0.05;
      p.z += p.vz * 0.05;
      if (p.y <= 0.5) {
        world.impact({ projectileId: p.id, kind: p.kind, at: p, splash: TOWERS[p.kind].splash });
        delete state.projectiles[p.id];
      }
    }
    if (tick % 5 === 0)
      for (const tower of Object.values(state.towers).slice(0, 20)) {
        const e = state.enemies['stress-e' + (tick % 100)];
        const id = `stress-p${tick}-${tower.id}`;
        state.projectiles[id] = {
          id,
          kind: tower.kind,
          x: tower.x,
          y: 1.8,
          z: tower.z,
          vx: (e.x - tower.x) * 2,
          vy: -2.6,
          vz: (e.z - tower.z) * 2,
        };
      }
    world.update(state);
  }, 50);
  world.update(state);
  return () => clearInterval(timer);
}

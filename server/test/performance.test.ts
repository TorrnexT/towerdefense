import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '@emberwatch/shared/simulation';
import { MAP_IDS, TOWERS, placementError, pathPosition, type TowerKind } from '@emberwatch/shared';
for (const mapId of MAP_IDS)
  for (const party of [1, 4])
    test(`${mapId}: ${party === 1 ? 'local' : 'coop'} 100 enemies / 30 mixed towers with synchronization`, () => {
      const s = new Simulation({ mapId });
      s.state.mode = party === 1 ? 'solo' : 'coop';
      s.state.teamSize = party;
      const loadout = Object.keys(TOWERS).slice(-10) as TowerKind[];
      for (let i = 0; i < party; i++) {
        s.addPlayer('p' + i, 'Load test', { completed: 13, loadout });
        s.state.players.get('p' + i)!.gold = 100000;
      }
      let count = 0;
      for (let x = -13; x <= 13 && count < 30; x += 0.75)
        for (let z = -8; z <= 8 && count < 30; z += 0.75) {
          if (placementError({ x, z }, s.state.towers.values(), s.map)) continue;
          assert.ok(
            s.command('p' + (count % party), {
              id: 'build' + count,
              action: 'build',
              kind: loadout[count % 10],
              x,
              z,
            }).ok,
          );
          count++;
        }
      s.state.phase = 'combat';
      s.state.wave = 40;
      for (let i = 0; i < 100; i++) {
        const e = s.spawn((['goblin', 'ogre', 'wraith'] as const)[i % 3]);
        const route = s.map.routes[i % s.map.routes.length];
        e.progress = (i / 100) * route.length;
        e.hp = e.maxHp = 1e9;
        e.speed = 0;
        Object.assign(e, pathPosition(e.progress, s.map, e.routeId));
      }
      let shots = 0;
      s.onShot = () => shots++;
      const start = performance.now();
      for (let i = 0; i < 200; i++) {
        s.step();
        JSON.stringify(s.state.toJSON());
      }
      const ms = (performance.now() - start) / 200;
      assert.equal(s.state.enemies.size, 100);
      assert.equal(s.state.towers.size, 30);
      assert.ok(shots > 0);
      assert.ok(ms < 10, `tick including serialization: ${ms} ms`);
      console.log(`${mapId} ${party}P: ${ms.toFixed(2)} ms/tick including state serialization`);
    });

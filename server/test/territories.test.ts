import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '@emberwatch/shared/simulation';
import {
  BUILD_MODES,
  MAPS,
  placementError,
  territoryError,
  territoryIndex,
  territoryPolygons,
  type BuildMode,
} from '@emberwatch/shared';
let seq = 0;
const send = (s: Simulation, p: string, c: Record<string, unknown>) =>
  s.command(p, { id: String(++seq), ...c });
function setup(n = 2) {
  const s = new Simulation();
  s.state.mode = 'coop';
  s.state.lobby = true;
  for (let i = 0; i < n; i++) s.addPlayer(String(i));
  return s;
}
for (const map of Object.values(MAPS))
  for (const count of [2, 3, 4])
    for (const mode of ['columns', 'rows', 'sectors'] as BuildMode[])
      test(`${map.id} ${count} players ${mode}: every territory has legal building space and preview polygons agree`, () => {
        const owners = Array.from({ length: count }, (_, i) => String(i)),
          valid = Array(count).fill(0),
          polys = territoryPolygons(map, mode, count);
        assert.equal(polys.length, count);
        for (let x = -14.7; x < 15; x += 0.5)
          for (let z = -10.7; z < 11; z += 0.5) {
            const p = { x, z };
            if (placementError(p, [], map)) continue;
            const index = territoryIndex(p, map, mode, count);
            valid[index]++;
            assert.equal(territoryError(p, map, mode, owners, owners[index]), null);
            assert.ok(territoryError(p, map, mode, owners, owners[(index + 1) % count]));
            // Polygons are convex; use cross products with a tolerance at partition boundaries.
            const poly = polys[index];
            assert.ok(
              poly.every((a, i) => {
                const b = poly[(i + 1) % poly.length];
                return (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) >= -1e-6;
              }),
            );
          }
        assert.ok(
          valid.every((n) => n >= 2),
          JSON.stringify(valid),
        );
      });
test('host validates layouts/assignments and resets readiness only when configuration changes', () => {
  const s = setup();
  assert.equal(s.state.buildMode, 'all');
  const c = { action: 'setBuildZones', mode: 'columns', owners: ['0', '1'] };
  assert.equal(send(s, '1', c).ok, false);
  assert.equal(send(s, '0', { ...c, owners: ['0', '0'] }).ok, false);
  assert.equal(send(s, '0', { ...c, mode: 'wrong' }).ok, false);
  assert.ok(send(s, '0', c).ok);
  send(s, '0', { action: 'ready', ready: true });
  send(s, '1', { action: 'ready', ready: true });
  send(s, '0', c);
  assert.ok([...s.state.players.values()].every((p) => p.ready));
  send(s, '0', { ...c, owners: ['1', '0'] });
  assert.ok([...s.state.players.values()].every((p) => !p.ready));
});
test('server enforces territory, keeps live borders on disconnect and transfers departed territory', () => {
  const s = setup();
  send(s, '0', { action: 'setBuildZones', mode: 'columns', owners: ['0', '1'] });
  for (const p of s.state.players.values()) p.ready = true;
  assert.ok(send(s, '0', { action: 'startGame' }).ok);
  const map = MAPS.waldtal,
    p = { x: -4, z: 1 };
  assert.equal(placementError(p, [], map), null);
  assert.equal(send(s, '1', { action: 'build', kind: 'ballista', ...p }).ok, false);
  assert.equal(s.state.players.get('1')!.gold, 240);
  assert.ok(send(s, '0', { action: 'build', kind: 'ballista', ...p }).ok);
  assert.equal(send(s, '0', { action: 'setBuildZones', mode: 'all', owners: ['0', '1'] }).ok, false);
  s.state.players.get('0')!.connected = false;
  s.updatePresence();
  assert.deepEqual([...s.state.zoneOwners], ['0', '1']);
  s.removePlayer('0');
  assert.deepEqual([...s.state.zoneOwners], ['1', '1']);
  assert.equal(territoryError(p, map, s.state.buildMode, [...s.state.zoneOwners], '1'), null);
  s.state.phase = 'defeat';
  send(s, '1', { action: 'restart' });
  assert.equal(s.state.buildMode, 'columns');
});
test('lobby roster changes recompute areas, clear readiness, and default all permits any member', () => {
  const s = setup();
  send(s, '0', { action: 'setBuildZones', mode: 'sectors', owners: ['1', '0'] });
  for (const p of s.state.players.values()) p.ready = true;
  s.addPlayer('2');
  assert.deepEqual([...s.state.zoneOwners], ['0', '1', '2']);
  assert.ok([...s.state.players.values()].every((p) => !p.ready));
  assert.equal(territoryError({ x: 5, z: 4 }, MAPS.waldtal, 'all', ['0', '1'], '0'), null);
});

test('host can preselect every layout alone; joining players activates the stored division', () => {
  const s = setup(1);
  for (const mode of ['columns', 'rows', 'sectors']) {
    assert.ok(send(s, '0', { action: 'setBuildZones', mode, owners: ['0'] }).ok);
    assert.equal(s.state.buildMode, mode);
    assert.equal(
      territoryError({ x: 7, z: 1 }, MAPS.waldtal, s.state.buildMode, [...s.state.zoneOwners], '0'),
      null,
    );
  }
  s.addPlayer('1');
  assert.equal(s.state.buildMode, 'sectors');
  assert.deepEqual([...s.state.zoneOwners], ['0', '1']);
});

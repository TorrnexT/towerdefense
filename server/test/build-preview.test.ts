import test from 'node:test';
import assert from 'node:assert/strict';
import { buildError, MAPS, placementError } from '@emberwatch/shared';
import { Simulation } from '@emberwatch/shared/simulation';
import { TowerState } from '@emberwatch/shared/schema';
test('preview and simulation both reject the tower cap at an otherwise valid, affordable location', () => {
  const s = new Simulation();
  s.addPlayer('p');
  for (let i = 0; i < 60; i++) {
    const t = new TowerState();
    t.id = String(i);
    t.x = 100 + i;
    t.z = 100;
    s.state.towers.set(t.id, t);
  }
  const point = { x: -4, z: 1 };
  assert.equal(placementError(point, s.state.towers.values(), MAPS.waldtal), null);
  const expected = buildError('ballista', point, s.state.towers.values(), MAPS.waldtal, 240);
  assert.equal(expected, 'Alle 60 Turmplätze sind belegt.');
  const result = s.command('p', { id: 'build', action: 'build', kind: 'ballista', ...point });
  assert.equal(result.error, expected);
  assert.equal(s.state.players.get('p')!.gold, 240);
});
test('a changed wallet is revalidated without charging or creating a tower', () => {
  const s = new Simulation();
  s.addPlayer('p');
  const p = s.state.players.get('p')!,
    point = { x: -4, z: 1 };
  assert.equal(buildError('ballista', point, [], MAPS.waldtal, p.gold), null);
  p.gold = 99;
  const result = s.command('p', { id: 'build', action: 'build', kind: 'ballista', ...point });
  assert.equal(result.error, buildError('ballista', point, [], MAPS.waldtal, p.gold));
  assert.equal(s.state.towers.size, 0);
  assert.equal(p.gold, 99);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_MAPS,
  MISSIONS,
  MAPS,
  battleMap,
  placementError,
  routeSegments,
  pathPosition,
  distance,
  inPolygon,
  onWater,
  onBridge,
  segmentDistance,
  entrances,
} from '@emberwatch/shared';
import { Simulation } from '@emberwatch/shared/simulation';

test('all 15 missions have distinct layouts and keep their saved region identity', () => {
  assert.equal(Object.keys(CAMPAIGN_MAPS).length, MISSIONS.length);
  assert.equal(
    new Set(Object.values(CAMPAIGN_MAPS).map((m) => JSON.stringify(m.routes.map((r) => r.points)))).size,
    15,
  );
  let previousRoutes = 0;
  for (const mission of MISSIONS) {
    const map = CAMPAIGN_MAPS[mission.id];
    assert.equal(map.id, mission.mapId);
    assert.equal(map.name, mission.name);
    assert.ok(map.routes.length >= previousRoutes);
    previousRoutes = map.routes.length;
    const sim = new Simulation({ ruleSet: 'campaign', missionId: mission.id });
    assert.equal(sim.map, map);
    assert.equal(
      battleMap({ mapId: sim.state.mapId, missionId: mission.id, ruleSet: 'endless' }),
      MAPS[mission.mapId],
    );
  }
  assert.equal(entrances(CAMPAIGN_MAPS['mission-15']).length, 4);
});

for (const mission of MISSIONS)
  test(`${mission.id}: navigable routes, bridges and usable defense positions`, () => {
    const map = CAMPAIGN_MAPS[mission.id];
    const sites: { x: number; z: number }[] = [];
    for (let x = -13; x <= 13; x += 0.75)
      for (let z = -9; z <= 9; z += 0.75) if (!placementError({ x, z }, sites, map)) sites.push({ x, z });
    assert.ok(sites.length >= 30, `${sites.length} build sites`);
    for (const route of map.routes) {
      assert.ok(route.length >= 25 && route.length <= 95, `${route.id}: ${route.length}`);
      assert.ok(distance(route.points.at(-1)!, map.base) < 1.2);
      let coverage = 0;
      for (let d = 0; d < route.length; d += 0.2) {
        const p = pathPosition(d, map, route.id);
        assert.ok(inPolygon(p, map.outline), `route leaves island at ${d}`);
        if (onWater(p, map)) assert.ok(onBridge(p, map), `missing bridge at ${JSON.stringify(p)}`);
        assert.ok(placementError(p, [], map), 'path must reject tower placement');
        if (sites.some((s) => distance(p, s) < 4.5)) coverage += 0.2;
      }
      assert.ok(coverage > route.length * 0.65, `${route.id} lacks reachable defense positions`);
    }
    for (const o of map.obstacles)
      for (const { a, b } of routeSegments(map))
        assert.ok(segmentDistance(o, a, b) >= o.r + map.pathRadius, 'scenery obstructs route');
  });

test('placement caches and lobby switching distinguish missions in the same region', () => {
  const first = CAMPAIGN_MAPS['mission-01'],
    second = CAMPAIGN_MAPS['mission-02'];
  let different = false;
  for (let x = -12; x <= 12; x++)
    for (let z = -8; z <= 8; z++) {
      const p = { x, z };
      if (!placementError(p, [], first) && placementError(p, [], second) === 'Der Weg muss frei bleiben.')
        different = true;
    }
  assert.ok(different);
  const s = new Simulation({ ruleSet: 'campaign', missionId: 'mission-01' });
  s.state.mode = 'coop';
  s.state.lobby = true;
  s.addPlayer('p', 'Hüter', { completed: 15, xp: 1500 });
  assert.ok(s.command('p', { id: 'mission', action: 'setMission', missionId: 'mission-02' }).ok);
  assert.equal(s.map, second);
});

test('opening forest missions changes terrain, approach direction and bridge topology', () => {
  const [first, second, third] = ['mission-01', 'mission-02', 'mission-03'].map((id) => CAMPAIGN_MAPS[id]);
  assert.notDeepEqual(first.outline, second.outline);
  assert.notDeepEqual(second.outline, third.outline);
  assert.ok(first.base.x > 0 && second.base.x < 0);
  assert.equal(second.baseAngle, Math.PI);
  assert.ok(second.obstacles.some((o) => o.kind === 'ruins'));
  assert.equal(first.routes.length, 1);
  assert.equal(second.routes.length, 1);
  assert.equal(third.routes.length, 2);
  assert.equal(third.bridges.length, 2);
  assert.ok(third.waterways.some((w) => w.points[0].z < 0 && w.points.at(-1)!.z > 0));
});

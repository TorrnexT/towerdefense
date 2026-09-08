import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '@emberwatch/shared/simulation';
import {
  TOWERS,
  MAPS,
  towerStats,
  researchCost,
  researchSpent,
  availableResearch,
  validResearch,
  slotCount,
  profileLevel,
  placementError,
  type TowerKind,
} from '@emberwatch/shared';
let sequence = 0;
const send = (s: Simulation, action: Record<string, unknown>, player = 'p') =>
  s.command(player, { id: String(++sequence), ...action });
const clearWave = (s: Simulation, wave: number) => {
  s.state.phase = 'combat';
  s.state.wave = wave;
  s.step();
};
test('every tenth completed endless wave grants one reward per player and repeat runs can earn again', () => {
  const s = new Simulation();
  s.addPlayer('p');
  s.addPlayer('reserved');
  s.state.players.get('reserved')!.connected = false;
  for (let n = 1; n < 10; n++) clearWave(s, n);
  assert.equal(s.state.players.get('p')!.xp, 0);
  clearWave(s, 10);
  for (let n = 0; n < 20; n++) s.step();
  for (const p of s.state.players.values()) {
    assert.equal(p.xp, 100);
    assert.equal(p.rewards.size, 1);
  }
  clearWave(s, 20);
  assert.equal(s.state.players.get('p')!.xp, 200);
  const ids = [...s.state.players.get('p')!.rewards.keys()];
  s.state.phase = 'defeat';
  assert.ok(send(s, { action: 'restart' }).ok);
  clearWave(s, 10);
  assert.equal(s.state.players.get('p')!.xp, 300);
  assert.equal(s.state.players.get('p')!.rewards.size, 3);
  assert.ok(ids.every((id) => s.state.players.get('reserved')!.rewards.has(id)));
});
test('starting milestone waves and defeat do not grant rewards', () => {
  const s = new Simulation();
  s.addPlayer('p');
  s.state.wave = 9;
  send(s, { action: 'startWave' });
  s.step();
  assert.equal(s.state.players.get('p')!.rewards.size, 0);
  s.state.phase = 'defeat';
  s.step();
  assert.equal(s.state.players.get('p')!.rewards.size, 0);
});
test('campaign repeat victories grant XP and research again without unlocking further missions', () => {
  const s = new Simulation({ ruleSet: 'campaign', missionId: 'mission-01' });
  s.addPlayer('p');
  clearWave(s, 4);
  assert.equal(s.state.players.get('p')!.xp, 100);
  assert.equal(s.state.players.get('p')!.completed, 1);
  send(s, { action: 'restart' });
  clearWave(s, 4);
  const p = s.state.players.get('p')!;
  assert.equal(p.xp, 200);
  assert.equal(p.completed, 1);
  assert.equal(p.rewards.size, 2);
  assert.deepEqual(
    [...p.rewards.values()].map((r) => r.research),
    [50, 50],
  );
});
test('experience opens all slot thresholds independently of campaign and continues above level eight', () => {
  for (const [xp, slots] of [
    [0, 3],
    [99, 3],
    [100, 4],
    [299, 4],
    [300, 5],
    [500, 6],
    [700, 7],
    [900, 8],
    [1100, 9],
    [1300, 10],
    [1500, 10],
  ])
    assert.equal(slotCount(0, xp), slots);
  assert.equal(profileLevel(0, 1500), 9);
  const s = new Simulation();
  s.addPlayer('p', 'Hüter', { xp: 1300, loadout: Object.keys(TOWERS).slice(0, 10) as TowerKind[] });
  assert.equal(s.state.players.get('p')!.loadout.length, 10);
});
test('research validates its entire budget, known units, fifteen steps and integer XP', () => {
  assert.equal(researchSpent({ ballista: 15 }), 1425);
  assert.equal(researchCost(0), 25);
  assert.equal(researchCost(14), 165);
  assert.equal(researchCost(15), 0);
  assert.equal(availableResearch(300, { ballista: 2 }), 90);
  assert.ok(validResearch({ ballista: 15 }, 2900));
  for (const ranks of [{ ballista: 16 }, { ballista: -1 }, { ballista: 1.5 }, { missing: 1 }, null, []])
    assert.equal(validResearch(ranks, 10000), false);
  assert.equal(validResearch({ ballista: 15 }, 2800), false);
  for (const options of [
    { xp: -1 },
    { xp: Infinity },
    { xp: 1.2 },
    { xp: 0, research: { ballista: 1 } },
    { xp: 100, research: { ballista: 2 } },
  ])
    assert.throws(() => new Simulation().addPlayer('p', 'Hüter', options));
});
test('research changes in the lobby reset only owner readiness and remain fixed in combat', () => {
  const s = new Simulation();
  s.state.mode = 'coop';
  s.state.lobby = true;
  s.addPlayer('p', 'Host', { xp: 100 });
  s.addPlayer('b');
  send(s, { action: 'ready', ready: true });
  send(s, { action: 'ready', ready: true }, 'b');
  assert.ok(send(s, { action: 'setLoadout', loadout: ['ballista'], xp: 100, research: { ballista: 1 } }).ok);
  assert.equal(s.state.players.get('p')!.ready, false);
  assert.equal(s.state.players.get('b')!.ready, true);
  assert.equal(
    send(s, { action: 'setLoadout', loadout: ['ballista'], xp: 100, research: { ballista: 15 } }).ok,
    false,
  );
  send(s, { action: 'ready', ready: true });
  send(s, { action: 'startGame' });
  assert.equal(
    send(s, { action: 'setLoadout', loadout: ['ballista'], xp: 300, research: { ballista: 2 } }).ok,
    false,
  );
});
for (const kind of Object.keys(TOWERS) as TowerKind[])
  test(`${kind}: all 15 research steps improve the role and stack with battle upgrades`, () => {
    let previous = towerStats(kind);
    for (let rank = 1; rank <= 15; rank++) {
      const next = towerStats(kind, 1, rank);
      assert.ok(next.damage > previous.damage);
      assert.ok(next.attacks > previous.attacks);
      assert.ok(next.range > previous.range);
      assert.ok(next.damage * next.attacks > previous.damage * previous.attacks);
      assert.equal(next.cost, previous.cost);
      assert.equal(next.upgradeCost, previous.upgradeCost);
      if (next.splash) assert.ok(next.splash > previous.splash);
      previous = next;
    }
    assert.ok(towerStats(kind, 5, 15).damage > towerStats(kind, 5, 0).damage);
    const s = new Simulation();
    s.addPlayer('p', 'Hüter', { xp: 3000, loadout: [kind], research: { [kind]: 15 } });
    s.state.players.get('p')!.gold = 10000;
    let point: { x: number; z: number } | undefined;
    for (let x = -10; x < 10 && !point; x++)
      for (let z = -7; z < 7 && !point; z++)
        if (!placementError({ x, z }, [], MAPS.waldtal)) point = { x, z };
    const result = send(s, { action: 'build', kind, ...point });
    assert.ok(result.ok);
    const t = s.state.towers.get(result.towerId!)!;
    assert.equal(t.research, 15);
    for (let level = 2; level <= 5; level++) assert.ok(send(s, { action: 'upgrade', towerId: t.id }).ok);
    assert.equal(t.level, 5);
    assert.equal(t.research, 15);
    s.state.mode = 'coop';
    s.addPlayer('heir');
    s.removePlayer('p');
    assert.equal(t.owner, 'heir');
    assert.equal(t.research, 15);
  });

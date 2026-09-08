import { Simulation } from '@emberwatch/shared/simulation';
import {
  MISSIONS,
  placementError,
  pathPosition,
  towerStats,
  TOWERS,
  slotCount,
  type TowerKind,
} from '@emberwatch/shared';
import { writeFileSync } from 'node:fs';
const results = [];
const party = process.argv.includes('--coop') ? 4 : 1;
function play(mission: (typeof MISSIONS)[number], loadout: TowerKind[], splash: number) {
  const s = new Simulation({ ruleSet: 'campaign', missionId: mission.id });

  if (party > 1) {
    s.state.mode = 'coop';
    s.state.lobby = true;
  }
  for (let i = 0; i < party; i++)
    s.addPlayer(i === 0 ? 'bot' : 'bot' + i, 'Balance', { completed: mission.number - 1, loadout });
  if (party > 1) {
    for (const player of s.state.players.values())
      s.command(player.id, { id: 'ready', action: 'ready', ready: true });
    s.command('bot', { id: 'start', action: 'startGame' });
  }
  const sites: { x: number; z: number }[] = [];
  for (let x = -13; x <= 13; x += 0.75)
    for (let z = -8; z <= 8; z += 0.75) if (!placementError({ x, z }, [], s.map)) sites.push({ x, z });
  const samples = s.map.routes.flatMap((r) =>
    Array.from({ length: Math.ceil(r.length) }, (_, i) => pathPosition(i, s.map, r.id)),
  );
  let id = 0;
  const actions: Record<string, unknown>[][] = [];
  function power(kind: TowerKind, level: number, point: { x: number; z: number }) {
    const stats = towerStats(kind, level);
    return (
      (samples.reduce((a, p) => a + (Math.hypot(p.x - point.x, p.z - point.z) <= stats.range ? 1 : 0), 0) /
        s.map.routes.length) *
      stats.damage *
      stats.attacks *
      (1 + stats.splash * splash)
    );
  }
  for (let tick = 0; tick < 100000 && !['victory', 'defeat'].includes(s.state.phase); tick++) {
    if (s.state.phase === 'preparing') {
      const commands: Record<string, unknown>[] = [];
      for (const player of s.state.players.values()) {
        for (let buy = 0; buy < 60; buy++) {
          const gold = player.gold;
          let best = 0,
            action: Record<string, unknown> | undefined;
          for (const t of s.state.towers.values())
            if (t.level < 5 && t.owner === player.id) {
              const stats = towerStats(t.kind, t.level);
              if (gold >= stats.upgradeCost) {
                const score = (power(t.kind, t.level + 1, t) - power(t.kind, t.level, t)) / stats.upgradeCost;
                if (score > best) {
                  best = score;
                  action = { action: 'upgrade', towerId: t.id };
                }
              }
            }
          if (s.state.towers.size < 60)
            for (const kind of loadout)
              if (gold >= TOWERS[kind].cost)
                for (const p of sites) {
                  if (placementError(p, s.state.towers.values(), s.map)) continue;
                  const score = power(kind, 1, p) / TOWERS[kind].cost;
                  if (score > best) {
                    best = score;
                    action = { action: 'build', kind, ...p };
                  }
                }
          if (!action) break;
          const r = s.command(player.id, { id: String(++id), ...action });
          if (!r.ok) throw Error(r.error);
          commands.push(action);
        }
      }
      actions.push(commands);
      s.command('bot', { id: String(++id), action: 'startWave' });
    }
    s.step();
  }
  const result = {
    mission: mission.id,
    party,
    phase: s.state.phase,
    hp: s.state.baseHp,
    waves: s.state.completedWaves,
    kills: s.state.kills,
    towers: s.state.towers.size,
    loadout,
    actions,
  };
  return result;
}
for (const mission of MISSIONS) {
  let result;
  for (const team of [
    ['ballista', 'arcane', 'fire'],
    ['ballista', 'fire', 'grenade'],
    ['prism', 'sniper', 'fire'],
    ['sniper', 'prism', 'meteor'],
    ['runemortar', 'prism', 'fire'],
    ['ballista', 'grenade', 'prism'],
  ] as TowerKind[][]) {
    for (const splash of [0.8, 0.2, 0]) {
      result = play(mission, team, splash);
      if (result.phase === 'victory') break;
    }
    if (result?.phase === 'victory') break;
  }
  results.push(result!);
  console.log(mission.name, result!.phase, result!.hp, result!.waves, result!.loadout);
}
writeFileSync(
  party === 1 ? 'verification/output/balance-campaign.json' : 'verification/output/balance-coop.json',
  JSON.stringify(results, null, 2),
);
if (results.some((r) => r.phase !== 'victory')) process.exitCode = 1;

import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { startServer } from '../../src/index';
import type { CoopRoom } from '../../src/room';
async function until(f: () => boolean) {
  const end = Date.now() + 6000;
  while (!f()) {
    if (Date.now() > end) throw Error('Campaign synchronization timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}
let id = 0;
function send(r: Room, payload: Record<string, unknown>) {
  const command = { ...payload, id: String(++id) };
  return new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(Error('Command timeout')), 3000);
    const off = r.onMessage('result', (result) => {
      if (result.id === command.id) {
        off();
        clearTimeout(t);
        resolve(result);
      }
    });
    r.send('command', command);
  });
}
test('campaign rooms enforce teams and mutual unlocks; victory survives offline member and host rematch', async () => {
  const server = await startServer(2573),
    client = new Client('http://127.0.0.1:2573'),
    rooms: Room[] = [];
  const attach = (r: Room) => {
    rooms.push(r);
    for (const type of ['result', 'shot', 'impact']) r.onMessage(type, () => {});
    return r;
  };
  try {
    for (const options of [
      { ruleSet: 'campaign', missionId: 'bad' },
      { ruleSet: 'campaign', missionId: 'mission-15', completed: 0 },
      { loadout: ['ballista', 'ballista'] },
      { completed: 99 },
      { xp: 100, research: { ballista: 15 } },
      { xp: -1 },
      { xp: 100, research: { missing: 1 } },
      { loadout: ['ballista', 'arcane', 'fire', 'grenade'] },
    ])
      await assert.rejects(() => client.create('coop', options));
    const a = attach(
      await client.create('coop', {
        ruleSet: 'campaign',
        missionId: 'mission-01',
        completed: 1,
        xp: 300,
        loadout: ['ballista', 'sniper'],
        research: { ballista: 1 },
      }),
    );
    let b = attach(await client.joinById(a.roomId, { completed: 0, loadout: ['arcane'] }));
    const separate = attach(await client.create('coop', { ruleSet: 'endless' }));
    const room = matchMaker.getLocalRoomById(a.roomId) as CoopRoom;
    await until(() => b.state.players?.size === 2 && a.state.players?.size === 2);
    assert.equal((await send(a, { action: 'setMission', missionId: 'mission-02' })).ok, false);
    assert.equal((await send(b, { action: 'setMission', missionId: 'mission-01' })).ok, false);
    assert.equal((await send(b, { action: 'setLoadout', loadout: ['meteor', 'meteor'] })).ok, false);
    await send(a, { action: 'ready', ready: true });
    await send(b, { action: 'ready', ready: true });
    await until(() => a.state.players.get(a.sessionId)?.ready && a.state.players.get(b.sessionId)?.ready);
    await send(b, { action: 'setLoadout', loadout: ['fire'] });
    await until(() => !a.state.players.get(b.sessionId).ready);
    assert.equal(a.state.players.get(a.sessionId).ready, true);
    await send(b, { action: 'ready', ready: true });
    assert.equal(b.state.players.get(a.sessionId).research.get('ballista'), 1);
    assert.ok((await send(a, { action: 'startGame' })).ok);
    const built = await send(a, { action: 'build', kind: 'ballista', x: -4, z: 1 });
    assert.ok(built.ok);
    await until(() => !!b.state.towers.get(built.towerId));
    assert.equal(b.state.towers.get(built.towerId).research, 1);
    assert.equal((await send(a, { action: 'build', kind: 'meteor', x: -4, z: 1 })).ok, false);
    assert.equal((await send(b, { action: 'setLoadout', loadout: ['ballista'] })).ok, false);
    assert.equal(
      (await send(b, { action: 'setLoadout', loadout: ['prism'], xp: 1000, research: { prism: 2 } })).ok,
      false,
    );
    const token = b.reconnectionToken,
      playerId = b.sessionId;
    b.reconnection.enabled = false;
    b.connection.close();
    await until(() => !room.state.players.get(playerId)!.connected);
    room.state.wave = 4;
    room.state.phase = 'combat';
    room.simulation.step();
    assert.equal(room.state.phase, 'victory');
    assert.equal(room.state.players.get(playerId)!.completed, 1);
    assert.equal(room.state.players.get(playerId)!.victories.get('mission-01')!.hp, 100);
    await send(a, { action: 'restart' });
    assert.ok((await send(a, { action: 'setMission', missionId: 'mission-02' })).ok);
    b = attach(await client.reconnect(token));
    await until(() => b.state.players?.get(playerId)?.connected);
    assert.equal(b.state.missionId, 'mission-02');
    assert.equal(b.state.players.get(playerId).xp, 100);
    assert.equal(b.state.players.get(playerId).rewards.size, 1);
    assert.equal([...b.state.players.get(playerId).rewards.values()][0].research, 50);
    assert.equal(b.state.players.get(playerId).victories.get('mission-01').hp, 100);
    assert.deepEqual([...b.state.players.get(playerId).loadout], ['fire']);
    assert.equal(separate.state.ruleSet, 'endless');
    assert.equal(separate.state.missionId, '');
  } finally {
    await Promise.all(rooms.filter((r) => r.connection.isOpen).map((r) => r.leave().catch(() => {})));
    await server.gracefullyShutdown(false);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { pathPosition } from '@emberwatch/shared';
import { startServer } from '../../src/index';
import type { DefenseRoom } from '../../src/room';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, timeout = 6000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for room state');
    await delay(20);
  }
}
async function send(room: Room, command: Record<string, unknown>) {
  return await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Missing command result')), 3000);
    const off = room.onMessage('result', (r) => {
      if (r.id === command.id) {
        off();
        clearTimeout(timeout);
        resolve(r);
      }
    });
    room.send('command', command);
  });
}
test('real WebSocket rooms: validation, isolation, ownership, duplicate purchases and reconnect', async (t) => {
  const server = await startServer(2568);
  const client = new Client('http://127.0.0.1:2568');
  const rooms: Room[] = [];
  try {
    const a = await client.create('endless', {
      completed: 1,
      loadout: ['ballista', 'arcane', 'fire', 'grenade'],
    });
    rooms.push(a);
    a.reconnection.minUptime = 0;
    a.onMessage('result', () => {});
    a.onMessage('shot', () => {});
    a.onMessage('impact', () => {});
    await until(() => a.state.players?.has(a.sessionId));
    const b = await client.create('endless', {
      completed: 1,
      loadout: ['ballista', 'arcane', 'fire', 'grenade'],
    });
    rooms.push(b);
    b.onMessage('result', () => {});
    b.onMessage('shot', () => {});
    b.onMessage('impact', () => {});
    await until(() => b.state.players?.has(b.sessionId));
    await t.test('private solo rooms stay isolated and disallow a second player', async () => {
      assert.notEqual(a.roomId, b.roomId);
      await assert.rejects(() => client.joinById(a.roomId));
      assert.equal(b.state.towers.size, 0);
    });
    await t.test('invalid builds never charge gold', async () => {
      const r = await send(a, { id: 'bad', action: 'build', kind: 'ballista', x: -9, z: -5 });
      assert.equal(r.ok, false);
      assert.equal(a.state.players.get(a.sessionId).gold, 240);
    });
    let towerId = '';
    await t.test('one command can only purchase once', async () => {
      const cmd = { id: 'build1', action: 'build', kind: 'ballista', x: -4, z: 1 };
      const r = await send(a, cmd);
      towerId = r.towerId;
      assert.equal(r.ok, true);
      assert.deepEqual(await send(a, cmd), r);
      await until(() => a.state.towers.size === 1);
      assert.equal(a.state.players.get(a.sessionId).gold, 140);
      assert.equal(b.state.towers.size, 0);
    });
    await t.test('cross-room tower IDs cannot be upgraded', async () => {
      assert.equal((await send(b, { id: 'steal', action: 'upgrade', towerId })).ok, false);
    });
    await t.test('manual reconnect preserves room, wallet, owner and paused simulation', async () => {
      assert.equal((await send(a, { id: 'speed', action: 'setSpeed', speed: 2 })).ok, true);
      await until(() => a.state.speed === 2);
      assert.equal(b.state.speed, 1, 'speed stays isolated per room');
      await send(a, { id: 'wave', action: 'startWave' });
      await until(() => a.state.wave === 1 && a.state.enemies.size > 0);
      const local = matchMaker.getLocalRoomById(a.roomId) as DefenseRoom;
      const token = a.reconnectionToken;
      const sessionId = a.sessionId;
      a.reconnection.enabled = false;
      a.connection.close();
      await until(() => local.state.paused);
      const snapshot = JSON.stringify(local.state.toJSON());
      await delay(250);
      assert.equal(JSON.stringify(local.state.toJSON()), snapshot);
      const restored = await client.reconnect(token);
      rooms.push(restored);
      restored.onMessage('shot', () => {});
      restored.onMessage('impact', () => {});
      restored.onMessage('result', () => {});
      await until(() => restored.state.players?.has(sessionId) && !restored.state.paused);
      assert.equal(restored.roomId, a.roomId);
      assert.equal(restored.sessionId, sessionId);
      assert.equal(restored.state.speed, 2);
      assert.equal(restored.state.towers.get(towerId).owner, sessionId);
      assert.equal(restored.state.players.get(sessionId).gold, 140);
      assert.equal(
        (await send(restored, { id: 'upgrade-after-reconnect', action: 'upgrade', towerId })).ok,
        true,
      );
      await until(() => restored.state.towers.get(towerId).level === 2);
      assert.equal(restored.state.players.get(sessionId).gold, 60);
    });
    await t.test(
      'projectiles synchronize without launch damage, survive reconnect and broadcast actual splash hits',
      async () => {
        assert.equal(
          (await send(b, { id: 'mortar', action: 'build', kind: 'grenade', x: -4, z: 1 })).ok,
          true,
        );
        const local = matchMaker.getLocalRoomById(b.roomId) as DefenseRoom;
        local.state.phase = 'combat';
        local.state.wave = 1;
        for (let i = 0; i < 3; i++) {
          const e = local.simulation.spawn('goblin');
          Object.assign(e, pathPosition(12 + i * 0.2), { progress: 12 + i * 0.2, speed: 0 });
        }
        local.simulation.step();
        local.state.paused = true;
        await until(() => b.state.projectiles.size === 1 && b.state.paused);
        assert.equal(b.state.kills, 0);
        assert.ok([...b.state.enemies.values()].every((e: any) => e.hp === 45));
        const projectileId = [...local.state.projectiles.keys()][0];
        const projectile = JSON.stringify(local.state.projectiles.get(projectileId)!.toJSON());
        assert.equal(
          a.state.projectiles.has(projectileId),
          false,
          'other room never receives this projectile',
        );
        const forged = await new Promise<any>((resolve) => {
          const off = b.onMessage('result', (r) => {
            if (r.id === '') {
              off();
              resolve(r);
            }
          });
          b.send('impact', { projectileId, damage: 99999 });
        });
        assert.equal(forged.ok, false);
        assert.equal(local.state.kills, 0);
        const token = b.reconnectionToken;
        b.reconnection.enabled = false;
        b.connection.close();
        await until(() => !local.state.players.get(b.sessionId)!.connected);
        await delay(150);
        assert.equal(JSON.stringify(local.state.projectiles.get(projectileId)!.toJSON()), projectile);
        const restored = await client.reconnect(token);
        rooms.push(restored);
        const impacts: any[] = [];
        restored.onMessage('shot', () => {});
        restored.onMessage('result', () => {});
        restored.onMessage('impact', (impact) => impacts.push(impact));
        await until(() => restored.state.projectiles?.has(projectileId));
        assert.equal(restored.state.kills, 0);
        await until(() => restored.state.kills === 3);
        assert.equal(restored.state.players.get(restored.sessionId).gold, 50 + 42);
        assert.equal(restored.state.projectiles.size, 0);
        assert.equal(impacts.length, 1);
        assert.equal(impacts[0].projectileId, projectileId);
        assert.equal(impacts[0].splash, 2.4);
      },
    );
  } finally {
    await Promise.all(rooms.filter((r) => r.connection.isOpen).map((r) => r.leave().catch(() => {})));
    await server.gracefullyShutdown(false);
  }
});

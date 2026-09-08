import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { startServer } from '../../src/index';
import type { CoopRoom } from '../../src/room';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, timeout = 6000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end) throw new Error('Coop state timeout');
    await delay(20);
  }
}
let seq = 0;
async function send(room: Room, payload: Record<string, unknown>) {
  const command = { id: String(++seq), ...payload };
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Coop command timeout')), 3000);
    const off = room.onMessage('result', (r) => {
      if (r.id === command.id) {
        off();
        clearTimeout(timer);
        resolve(r);
      }
    });
    room.send('command', command);
  });
}
test('four-player private rooms: lobby, synchronization, authority, recovery and rematch', async (t) => {
  const server = await startServer(2569);
  const client = new Client('http://127.0.0.1:2569');
  const rooms: Room[] = [];
  function attach(room: Room) {
    rooms.push(room);
    room.onMessage('result', () => {});
    room.onMessage('shot', () => {});
    room.onMessage('impact', () => {});
    return room;
  }
  try {
    const a = attach(await client.create('coop', { name: 'Ada', mode: 'solo', maxClients: 99 }));
    const b = attach(await client.joinById(a.roomId, { name: 'Ben' }));
    const c = attach(await client.joinById(a.roomId, { name: 'Cleo' }));
    let d = attach(await client.joinById(a.roomId, { name: 'Dora' }));
    const solo = attach(await client.create('endless'));
    const local = matchMaker.getLocalRoomById(a.roomId) as CoopRoom;
    await until(
      () => a.state.players?.size === 4 && d.state.players?.size === 4 && solo.state.players?.size === 1,
    );
    await t.test(
      'rooms created automatically, four seats enforced, lobby and ownership server-controlled',
      async () => {
        assert.equal(local.maxClients, 4);
        assert.equal(a.state.mode, 'coop');
        assert.equal(a.state.hostId, a.sessionId);
        assert.equal(b.state.players.get(a.sessionId).name, 'Ada');
        await assert.rejects(() => client.joinById(a.roomId));
        assert.equal((await send(a, { action: 'startGame' })).ok, false);
        assert.equal((await send(b, { action: 'build', kind: 'ballista', x: -4, z: 1 })).ok, false);
        for (const r of [a, b, c, d]) assert.ok((await send(r, { action: 'ready', ready: true })).ok);
        assert.equal((await send(b, { action: 'startGame' })).ok, false);
        assert.ok((await send(a, { action: 'startGame' })).ok);
        await until(() => !d.state.lobby);
        assert.equal(d.state.teamSize, 4);
        const purchases = await Promise.all(
          [a, b].map((r) => send(r, { id: 'same-id', action: 'build', kind: 'ballista', x: -4, z: 1 })),
        );
        assert.equal(purchases.filter((r) => r.ok).length, 1);
        const winner = purchases[0].ok ? a : b,
          loser = winner === a ? b : a;
        const receipt = purchases.find((r) => r.ok)!;
        assert.deepEqual(
          await send(winner, { id: 'same-id', action: 'build', kind: 'ballista', x: -4, z: 1 }),
          receipt,
        );
        await until(() => d.state.towers.size === 1);
        assert.equal(d.state.players.get(winner.sessionId).gold, 140);
        assert.equal(d.state.players.get(loser.sessionId).gold, 240);
        assert.equal((await send(loser, { action: 'sell', towerId: receipt.towerId })).ok, false);
        assert.equal(solo.state.towers.size, 0);
        assert.equal((await send(b, { action: 'setSpeed', speed: 10 })).ok, false);
        assert.ok((await send(a, { action: 'setSpeed', speed: 2 })).ok);
        await until(() => d.state.speed === 2);
        assert.equal(solo.state.speed, 1);
      },
    );
    await t.test(
      'disconnect reserves ownership while teammates continue; reconnect keeps identity',
      async () => {
        const token = d.reconnectionToken,
          id = d.sessionId;
        d.reconnection.enabled = false;
        d.connection.close();
        await until(() => !local.state.players.get(id)!.connected);
        assert.equal(local.state.paused, false);
        await assert.rejects(() => client.joinById(a.roomId));
        d = attach(await client.reconnect(token));
        await until(() => d.state.players?.get(id)?.connected);
        assert.equal(d.sessionId, id);
        assert.equal(d.state.players.size, 4);
      },
    );
    await t.test(
      'host drop transfers control; permanent departure transfers assets and cannot admit late arrivals',
      async () => {
        assert.ok((await send(a, { action: 'build', kind: 'arcane', x: -9, z: -1 })).ok);
        const token = a.reconnectionToken;
        a.reconnection.enabled = false;
        a.connection.close();
        await until(() => local.state.hostId === b.sessionId);
        assert.ok((await send(b, { action: 'startWave' })).ok);
        const restored = attach(await client.reconnect(token));
        await until(() => restored.state.players?.get(a.sessionId)?.connected);
        assert.equal(local.state.hostId, b.sessionId, 'returning host does not steal leadership');
        const previous =
          local.state.players.get(b.sessionId)!.gold + local.state.players.get(a.sessionId)!.gold;
        await restored.leave();
        await until(() => local.state.players.size === 3);
        assert.equal(local.state.players.get(b.sessionId)!.gold, previous);
        assert.ok([...local.state.towers.values()].every((tower) => tower.owner === b.sessionId));
        await assert.rejects(() => client.joinById(b.roomId));
      },
    );
    await t.test(
      'expired reservation removes player; all remaining players can rematch in the same room',
      async () => {
        const original = local.allowReconnection.bind(local);
        local.allowReconnection = (client, _seconds) => original(client, 0.15);
        c.reconnection.enabled = false;
        c.connection.close();
        await until(() => !local.state.players.has(c.sessionId));
        local.allowReconnection = original;
        assert.equal(local.state.players.size, 2);
        local.state.phase = 'defeat';
        local.state.baseHp = 0;
        assert.equal((await send(d, { action: 'restart' })).ok, false);
        assert.ok((await send(b, { action: 'restart' })).ok);
        await until(() => d.state.lobby && d.state.run === 1);
        assert.equal(d.state.towers.size, 0);
        assert.equal(d.state.speed, 1);
        assert.equal(d.state.players.get(d.sessionId).gold, 240);
        const newcomer = attach(await client.joinById(b.roomId, { name: 'Erin' }));
        await until(() => newcomer.state.players?.size === 3);
        assert.equal(newcomer.state.lobby, true);
      },
    );
  } finally {
    await Promise.all(rooms.filter((r) => r.connection.isOpen).map((r) => r.leave().catch(() => {})));
    await server.gracefullyShutdown(false);
  }
});

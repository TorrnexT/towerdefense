import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { MAP_IDS, MAPS, placementError, type MapId } from '@emberwatch/shared';
import { startServer } from '../../src/index';
import type { DefenseRoom } from '../../src/room';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean) {
  const end = Date.now() + 6000;
  while (!fn()) {
    if (Date.now() > end) throw new Error('Map synchronization timeout');
    await delay(20);
  }
}
let seq = 0;
function send(room: Room, payload: Record<string, unknown>): Promise<any> {
  const id = String(++seq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Map command timeout')), 3000);
    const off = room.onMessage('result', (r) => {
      if (r.id === id) {
        off();
        clearTimeout(timer);
        resolve(r);
      }
    });
    room.send('command', { id, ...payload });
  });
}
test('map options, lobby selection, route synchronization, isolation and reconnection over WebSockets', async (t) => {
  const server = await startServer(2572),
    client = new Client('http://127.0.0.1:2572'),
    rooms: Room[] = [];
  const attach = (room: Room) => {
    rooms.push(room);
    room.onMessage('result', () => {});
    room.onMessage('shot', () => {});
    room.onMessage('impact', () => {});
    return room;
  };
  try {
    await assert.rejects(() => client.create('endless', { mapId: 'invalid' }));
    await assert.rejects(() => client.create('coop', { mapId: '__proto__' }));
    for (const mapId of MAP_IDS) {
      const r = attach(await client.create('endless', { mapId }));
      await until(() => r.state.players?.size === 1);
      assert.equal(r.state.mapId, mapId);
    }
    const a = attach(await client.create('coop', { mapId: 'silberfurt' }));
    const b = attach(await client.joinById(a.roomId, { mapId: 'glutspalten' }));
    await until(() => b.state.players?.size === 2);
    assert.equal(b.state.mapId, 'silberfurt', 'join options cannot override the map');
    assert.equal((await send(b, { action: 'setMap', mapId: 'frostklamm' })).ok, false);
    for (const room of [a, b]) await send(room, { action: 'ready', ready: true });
    assert.ok((await send(a, { action: 'setMap', mapId: 'frostklamm' })).ok);
    await until(() => b.state.mapId === 'frostklamm');
    assert.ok([...b.state.players.values()].every((p: any) => !p.ready));
    assert.equal(rooms[0].state.mapId, 'waldtal');
    for (const room of [a, b]) await send(room, { action: 'ready', ready: true });
    assert.ok((await send(a, { action: 'startGame' })).ok);
    assert.equal((await send(a, { action: 'setMap', mapId: 'glutspalten' })).ok, false);
    const local = matchMaker.getLocalRoomById(a.roomId) as DefenseRoom;
    // Server validation agrees with the same map geometry used in placement previews.
    assert.equal((await send(a, { action: 'build', kind: 'ballista', x: 0, z: 3 })).ok, false);
    let site: { x: number; z: number } | undefined;
    for (let x = -12; x < 13 && !site; x++)
      for (let z = -8; z < 9 && !site; z++)
        if (!placementError({ x, z }, [], MAPS.frostklamm)) site = { x, z };
    const built = await send(a, { action: 'build', kind: 'ballista', ...site });
    assert.ok(built.ok);
    await send(a, { action: 'startWave' });
    await until(() => b.state.enemies?.size >= 3);
    assert.deepEqual(
      [...b.state.enemies.values()].slice(0, 3).map((e: any) => e.routeId),
      MAPS.frostklamm.routes.map((r) => r.id),
    );
    const token = b.reconnectionToken,
      id = b.sessionId;
    b.reconnection.enabled = false;
    b.connection.close();
    await until(() => !local.state.players.get(id)!.connected);
    const restored = attach(await client.reconnect(token));
    await until(() => restored.state.players?.get(id)?.connected);
    assert.equal(restored.state.mapId, 'frostklamm');
    assert.equal(restored.sessionId, id);
    assert.ok(
      [...restored.state.enemies.values()].every((e: any) =>
        MAPS.frostklamm.routes.some((r) => r.id === e.routeId),
      ),
    );
    local.state.phase = 'defeat';
    await send(a, { action: 'restart' });
    await until(() => restored.state.lobby);
    assert.equal(restored.state.mapId, 'frostklamm');
    await send(a, { action: 'setMap', mapId: 'glutspalten' });
    await until(() => restored.state.mapId === 'glutspalten');
  } finally {
    await Promise.all(rooms.filter((r) => r.connection.isOpen).map((r) => r.leave().catch(() => {})));
    await server.gracefullyShutdown(false);
  }
});

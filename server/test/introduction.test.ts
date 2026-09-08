import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '@emberwatch/shared/simulation';
function setup(coop = false) {
  const s = new Simulation();
  s.introductionsEnabled = true;
  s.state.mode = coop ? 'coop' : 'solo';
  s.addPlayer('a');
  if (coop) s.addPlayer('b');
  assert.ok(s.command('a', { id: 'start', action: 'startWave' }).ok);
  s.advance(0.25);
  return s;
}
const ack = (s: Simulation, p: string, id = p) =>
  s.command(p, { id, action: 'ackIntroduction', kind: s.state.introduction });
test('first spawned archetype freezes all simulation until acknowledged; no duplicate introduction in run', () => {
  const s = setup();
  assert.equal(s.state.introduction, 'goblin');
  assert.equal(s.state.paused, true);
  assert.equal(s.state.enemies.size, 1);
  const before = JSON.stringify(s.state.toJSON());
  for (let i = 0; i < 100; i++) s.advance(0.25);
  assert.equal(JSON.stringify(s.state.toJSON()), before);
  assert.equal(s.command('a', { id: 'bad', action: 'ackIntroduction', kind: 'ogre' }).ok, false);
  assert.ok(ack(s, 'a').ok);
  assert.equal(s.state.paused, false);
  for (let i = 0; i < 40; i++) s.advance(0.25);
  assert.equal(s.state.introduction, '');
  assert.ok(s.state.enemies.size > 1);
});
test('coop waits for every reserved member; acknowledgement is idempotent and visibility cannot resume an introduction', () => {
  const s = setup(true);
  s.setPaused('visibility', true);
  s.setPaused('visibility', false);
  assert.equal(s.state.paused, true);
  assert.ok(ack(s, 'a').ok);
  assert.ok(ack(s, 'a').ok);
  assert.equal(s.state.paused, true);
  s.state.players.get('b')!.connected = false;
  s.updatePresence();
  assert.equal(s.state.paused, true);
  assert.equal(ack(s, 'b').ok, false);
  s.state.players.get('b')!.connected = true;
  s.updatePresence();
  assert.ok(ack(s, 'b').ok);
  assert.equal(s.state.paused, false);
});
test('permanent departure removes its pending vote; independent code pauses remain active', () => {
  const s = setup(true);
  s.setPaused('script', true);
  ack(s, 'a');
  s.removePlayer('b');
  assert.equal(s.state.introduction, '');
  assert.equal(s.state.paused, true);
  s.setPaused('script', false);
  assert.equal(s.state.paused, false);
});
test('ogre has its own introduction and restarting resets discoveries', () => {
  const s = setup();
  ack(s, 'a');
  s.state.enemies.clear();
  s.state.phase = 'preparing';
  s.state.wave = 2;
  s.command('a', { id: 'wave3', action: 'startWave' });
  for (let i = 0; i < 500 && !s.state.introduction; i++) s.step();
  assert.equal(s.state.introduction, 'ogre');
  ack(s, 'a', 'ogre');
  s.state.phase = 'defeat';
  s.command('a', { id: 'restart', action: 'restart' });
  s.command('a', { id: 'newstart', action: 'startWave' });
  s.step();
  assert.equal(s.state.introduction, 'goblin');
});

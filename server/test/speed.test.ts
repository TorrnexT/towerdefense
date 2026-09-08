import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_SPEEDS } from '@emberwatch/shared';
import { Simulation } from '../src/simulation';

function game() {
  const s = new Simulation();
  s.addPlayer('alice');
  return s;
}

test('speed defaults to 1 and only accepts 1, 2, 5 or 10 without charging gold', () => {
  const s = game();
  assert.equal(s.state.speed, 1);
  for (const speed of GAME_SPEEDS) {
    assert.ok(s.command('alice', { id: `speed-${speed}`, action: 'setSpeed', speed }).ok);
    assert.equal(s.state.speed, speed);
  }
  for (const [i, speed] of [0, -1, 3, 100, Infinity, NaN, '10', null, {}].entries()) {
    assert.equal(s.command('alice', { id: `bad-${i}`, action: 'setSpeed', speed }).ok, false);
    assert.equal(s.state.speed, 10);
  }
  assert.equal(s.state.players.get('alice')!.gold, 240);
  assert.equal(s.command('unknown', { id: 'stranger', action: 'setSpeed', speed: 2 }).ok, false);
});

for (const speed of GAME_SPEEDS) {
  test(`${speed}x real-time driver matches identical fixed-step combat including projectiles and gold`, () => {
    const fast = game(),
      reference = game();
    for (const s of [fast, reference]) {
      s.command('alice', { id: 'build', action: 'build', kind: 'fire', x: -9, z: -1 });
      s.command('alice', { id: 'wave', action: 'startWave' });
    }
    fast.command('alice', { id: 'speed', action: 'setSpeed', speed });
    for (let i = 0; i < 40; i++) fast.advance(0.05);
    for (let i = 0; i < 40 * speed; i++) reference.step();
    assert.deepEqual({ ...fast.state.toJSON(), speed: 1 }, reference.state.toJSON());
  });
}

test('speed scales build countdown; switching back to normal takes effect immediately', () => {
  const s = game();
  s.state.countdown = 15;
  s.command('alice', { id: 'fast', action: 'setSpeed', speed: 10 });
  for (let i = 0; i < 20; i++) s.advance(0.05);
  assert.ok(Math.abs(s.state.countdown - 5) < 1e-8);
  s.command('alice', { id: 'normal', action: 'setSpeed', speed: 1 });
  s.advance(0.05);
  assert.ok(Math.abs(s.state.countdown - 4.95) < 1e-8);
});

test('pause never banks accelerated time; speed is retained and commands remain blocked', () => {
  const s = game();
  s.command('alice', { id: 'fast', action: 'setSpeed', speed: 10 });
  s.state.countdown = 15;
  s.state.paused = true;
  s.advance(60);
  assert.equal(s.state.countdown, 15);
  assert.equal(s.command('alice', { id: 'paused', action: 'setSpeed', speed: 1 }).ok, false);
  s.state.paused = false;
  s.advance(0.05);
  assert.ok(Math.abs(s.state.countdown - 14.5) < 1e-8);
  assert.equal(s.state.speed, 10);
  s.state.phase = 'defeat';
  const ended = s.state.toJSON();
  s.advance(1);
  assert.deepEqual(s.state.toJSON(), ended);
  assert.equal(s.command('alice', { id: 'ended', action: 'setSpeed', speed: 1 }).ok, false);
  assert.equal(game().state.speed, 1);
});

test('duplicate speed commands never overwrite a later selected speed', () => {
  const s = game();
  const first = { id: 'one', action: 'setSpeed', speed: 2 };
  assert.ok(s.command('alice', first).ok);
  s.command('alice', { id: 'two', action: 'setSpeed', speed: 10 });
  assert.ok(s.command('alice', first).ok);
  assert.equal(s.state.speed, 10);
});

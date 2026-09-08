import { Simulation } from '@emberwatch/shared/simulation';
import { missionUnlocked, type StartOptions, type Command } from '@emberwatch/shared';
let simulation: Simulation | undefined;
let hidden = false;
let lastState = '';
const emit = () => {
  if (simulation) {
    const state = simulation.state.toJSON(),
      text = JSON.stringify(state);
    if (text !== lastState) {
      lastState = text;
      postMessage({ type: 'state', state });
    }
  }
};
self.onmessage = (
  event: MessageEvent<{ type: string; options?: StartOptions; command?: Command; hidden?: boolean }>,
) => {
  try {
    const m = event.data;
    if (m.type === 'start') {
      const options = m.options || {};
      simulation = new Simulation(options);
      simulation.introductionsEnabled = true;
      simulation.setPaused('visibility', hidden);
      simulation.addPlayer('local', options.name, options);
      if (simulation.mission && !missionUnlocked(simulation.mission.id, options.completed || 0))
        throw new Error('Diese Mission ist noch gesperrt.');
      simulation.onShot = (shot) => postMessage({ type: 'shot', shot });
      simulation.onImpact = (impact) => postMessage({ type: 'impact', impact });
      emit();
      postMessage({ type: 'started' });
    } else if (m.type === 'command' && simulation) {
      const result = simulation.command('local', m.command);
      emit();
      postMessage({ type: 'result', result });
    } else if (m.type === 'snapshot' && simulation) {
      postMessage({ type: 'state', state: simulation.state.toJSON() });
    } else if (m.type === 'visibility') {
      hidden = !!m.hidden;
      last = performance.now();
      if (simulation) {
        simulation.setPaused('visibility', hidden);
        emit();
      }
    }
  } catch (e) {
    postMessage({ type: 'error', error: (e as Error).message });
  }
};
let last = performance.now();
setInterval(() => {
  const now = performance.now(),
    delta = (now - last) / 1000;
  last = now;
  if (simulation && !hidden) {
    simulation.advance(delta);
    emit();
  }
}, 50);

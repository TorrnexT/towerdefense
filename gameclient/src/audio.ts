import { TOWERS, PROJECTILE_STYLE, type TowerKind } from '@emberwatch/shared';
export class GameAudio {
  enabled = false;
  private context?: AudioContext;
  private last = 0;
  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.context ??= new AudioContext();
      void this.context.resume();
    }
    return this.enabled;
  }
  shot(kind: TowerKind) {
    if (!this.enabled || !this.context || this.context.currentTime - this.last < 0.07) return;
    const c = this.context;
    this.last = c.currentTime;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type =
      PROJECTILE_STYLE[kind] === 'bolt' ? 'triangle' : TOWERS[kind].type === 'arcane' ? 'sine' : 'sawtooth';
    o.frequency.setValueAtTime(
      PROJECTILE_STYLE[kind] === 'bolt'
        ? 420
        : TOWERS[kind].type === 'arcane'
          ? 680
          : PROJECTILE_STYLE[kind] === 'shell'
            ? 90
            : 130,
      c.currentTime,
    );
    o.frequency.exponentialRampToValueAtTime(65, c.currentTime + 0.13);
    g.gain.setValueAtTime(0.025, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.2);
  }
  dispose() {
    void this.context?.close();
  }
}

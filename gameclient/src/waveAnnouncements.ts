import type { GameView } from '@emberwatch/shared';

export type WaveMoment = Pick<GameView, 'wave' | 'completedWaves' | 'phase'>;
export type WaveAnnouncement = { kind: 'start' | 'final' | 'complete'; wave: number };

/** Only announce observed transitions, never a snapshot received on reconnect. */
export function waveAnnouncement(
  previous: WaveMoment | null,
  current: WaveMoment,
  finalWave?: number,
): WaveAnnouncement | null {
  if (!previous || current.wave < previous.wave || ['victory', 'defeat'].includes(current.phase)) return null;
  if (current.phase === 'combat' && current.wave > previous.wave)
    return { kind: current.wave === finalWave ? 'final' : 'start', wave: current.wave };
  if (current.phase === 'preparing' && current.completedWaves > previous.completedWaves)
    return { kind: 'complete', wave: current.completedWaves };
  return null;
}

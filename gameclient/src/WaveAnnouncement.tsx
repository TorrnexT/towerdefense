import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Swords, Crown, ShieldCheck } from 'lucide-react';
import { getMission, type GameView } from '@emberwatch/shared';
import {
  waveAnnouncement,
  type WaveMoment,
  type WaveAnnouncement as Announcement,
} from './waveAnnouncements';

const COPY = {
  start: { top: 'WELLE', bottom: 'BEGINNT!', note: 'Haltet die Stellung!', Icon: Swords },
  final: { top: 'LETZTE', bottom: 'WELLE!', note: 'Alles steht auf dem Spiel.', Icon: Crown },
  complete: {
    top: 'WELLE',
    bottom: 'ABGESCHLOSSEN!',
    note: 'Verstärkt eure Verteidigung.',
    Icon: ShieldCheck,
  },
};

export function WaveAnnouncement({
  state,
  enabled,
  sessionId,
}: {
  state: GameView;
  enabled: boolean;
  sessionId: string;
}) {
  const runKey = `${sessionId}:${state.ruleSet}:${state.missionId}:${state.mapId}:${state.run}`;
  const previous = useRef<{ key: string; moment: WaveMoment } | null>(null);
  const [pending, setPending] = useState<Announcement | null>(null);
  const [shown, setShown] = useState<Announcement | null>(null);
  const finalWave = state.ruleSet === 'campaign' ? getMission(state.missionId)?.waves : undefined;
  const { wave, completedWaves, phase, paused, introduction } = state;
  useEffect(() => {
    const moment = { wave, completedWaves, phase };
    if (!enabled || previous.current?.key !== runKey || phase === 'victory' || phase === 'defeat') {
      previous.current = enabled ? { key: runKey, moment } : null;
      setPending(null);
      setShown(null);
      return;
    }
    const event = waveAnnouncement(previous.current.moment, moment, finalWave);
    previous.current = { key: runKey, moment };
    if (event) {
      setPending(event);
      setShown(null);
    }
  }, [enabled, runKey, wave, completedWaves, phase, finalWave]);
  // Enemy introductions pause the first spawn. Announce the wave after dismissal.
  useEffect(() => {
    if (!enabled || paused || introduction || !pending) return;
    setShown(pending);
    setPending(null);
  }, [enabled, paused, introduction, pending]);
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), shown.kind === 'final' ? 3000 : 2400);
    return () => window.clearTimeout(timer);
  }, [shown]);
  const copy = shown && COPY[shown.kind];
  return (
    <div className="wave-announcement-layer" role="status" aria-live="polite" aria-atomic="true">
      {shown && copy && enabled && !paused && !introduction && (
        <div
          key={`${runKey}:${shown.kind}:${shown.wave}`}
          className={`wave-announcement ${shown.kind}`}
          style={{ '--announcement-duration': shown.kind === 'final' ? '3000ms' : '2400ms' } as CSSProperties}
        >
          <div className="wave-announcement-aura" aria-hidden="true" />
          <div className="wave-announcement-ring" aria-hidden="true" />
          <div className="wave-announcement-sparks" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <i
                key={i}
                style={
                  { '--spark-angle': `${i * 30}deg`, '--spark-delay': `${(i % 3) * 45}ms` } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="wave-announcement-content">
            <div className="wave-announcement-medal" aria-hidden="true">
              <copy.Icon strokeWidth={2.5} />
            </div>
            <span className="wave-announcement-number">
              WELLE {String(shown.wave).padStart(2, '0')}
              {finalWave ? ` / ${finalWave}` : ''}
            </span>
            <strong className="wave-announcement-title">
              <span>{copy.top}</span>
              <span>{copy.bottom}</span>
            </strong>
            <span className="wave-announcement-note">{copy.note}</span>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { X, FlaskConical, ArrowRight, Lock, Check } from 'lucide-react';
import {
  TOWERS,
  towerUnlocked,
  TOWER_UNLOCK_LEVELS,
  towerStats,
  PRISM_BEAM,
  towerEffect,
  researchCost,
  availableResearch,
  MAX_RESEARCH_RANK,
  RESEARCH_GAINS,
  type TowerKind,
} from '@emberwatch/shared';
import { TowerCard } from './TowerCard';
import { TowerStars } from './TowerStars';
import { useDialog } from './useDialog';
import { profileStore, type Profile } from './profile';
export function TowerResearch({
  profile,
  previews,
  initial,
  onClose,
}: {
  profile: Profile;
  previews: Partial<Record<TowerKind, string>>;
  initial?: TowerKind;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<TowerKind>(initial || 'ballista'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const ref = useDialog(onClose, busy),
    rank = profile.research[kind] || 0,
    points = availableResearch(profile.xp, profile.research),
    max = rank >= MAX_RESEARCH_RANK,
    cost = researchCost(rank),
    current = towerStats(kind, 1, rank),
    next = towerStats(kind, 1, Math.min(15, rank + 1)),
    gains = RESEARCH_GAINS[kind];
  const unlocked = towerUnlocked(kind, profile.completed, profile.xp);
  async function upgrade() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await profileStore.upgradeTower(kind, rank);
      setMessage(
        `${TOWERS[kind].name} verbessert. ${rank + 1 === 15 ? 'Drei goldene Sterne!' : (rank + 1) % 5 === 0 ? 'Ein Stern ist jetzt vollständig!' : 'Eine weitere Zacke leuchtet.'}`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const effect = towerEffect(kind, 1, rank),
    nextEffect = towerEffect(kind, 1, Math.min(15, rank + 1));
  const stats = [
    ...(effect
      ? [
          [
            effect.kind === 'slow' ? 'Verlangsamung (%)' : 'Schaden / Sek. über Zeit',
            effect.kind === 'slow' ? effect.slow * 100 : effect.dps,
            effect.kind === 'slow' ? nextEffect!.slow * 100 : nextEffect!.dps,
          ],
        ]
      : []),
    ...(kind === 'prism'
      ? [
          ['Laser / Sek.', current.damage / PRISM_BEAM.duration, next.damage / PRISM_BEAM.duration],
          ['Strahldauer (s)', current.beamDuration, next.beamDuration],
        ]
      : [['Schaden', current.damage, next.damage]]),
    ['Angriffe / Sek.', current.attacks, next.attacks],
    ['Reichweite', current.range, next.range],
    ...(current.splash
      ? [[kind === 'fire' ? 'Kegelbreite ±' : 'Explosionsradius', current.splash, next.splash]]
      : []),
  ] as [string, number, number][];
  return (
    <div className="modal-backdrop research-backdrop">
      <section
        className="research-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="research-title"
        tabIndex={-1}
        ref={ref}
      >
        <header className="screen-header">
          <div>
            <span className="eyebrow">DIE WERKSTATT DER WACHT</span>
            <h2 id="research-title">Türme</h2>
          </div>
          <button className="icon-button" aria-label="Forschung schließen" onClick={onClose} disabled={busy}>
            <X />
          </button>
        </header>
        <div className="research-balance">
          <FlaskConical size={20} />
          <strong>{points} Forschungspunkte</strong>
          <span>50 pro Missionssieg oder 10 Endlos-Wellen</span>
        </div>
        <div className="research-body">
          <div className="research-catalog" aria-label="Turmsammlung">
            {(Object.keys(TOWERS) as TowerKind[]).map((k) => (
              <TowerCard
                key={k}
                kind={k}
                rank={profile.research[k] || 0}
                preview={previews[k]}
                lockedLevel={
                  towerUnlocked(k, profile.completed, profile.xp) ? undefined : TOWER_UNLOCK_LEVELS[k]
                }
                selected={k === kind}
                disabled={busy}
                aria-label={`${TOWERS[k].name} erforschen`}
                onClick={() => {
                  setKind(k);
                  setMessage('');
                }}
              />
            ))}
          </div>
          <section className="research-detail" aria-label="Forschungsdetails">
            <div
              className="research-portrait"
              style={{ '--tower-color': TOWERS[kind].color } as React.CSSProperties}
            >
              <img src={previews[kind]} alt="" />
              <TowerStars rank={rank} />
            </div>
            <span className="eyebrow">
              {unlocked ? 'FREIGESCHALTET' : 'NOCH GESPERRT'} · {rank} / 15 VERBESSERUNGEN
            </span>
            <h3>{TOWERS[kind].name}</h3>
            <p>
              Jede Zacke: +{fmt(gains.damage * 100)} % Schaden, +{fmt(gains.attacks * 100)} % Angriffstempo
              und +{fmt(gains.range * 100)} % Reichweite
              {gains.splash
                ? `, +${fmt(gains.splash * 100)} % ${kind === 'fire' ? 'Kegelbreite' : 'Explosionsradius'}`
                : ''}{' '}
              auf die Grundwerte.
            </p>
            <dl className="research-stats">
              {stats.map(([label, a, b]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {fmt(a)}{' '}
                    {!max && (
                      <>
                        <ArrowRight size={13} />
                        <strong>{fmt(b)}</strong>
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <button
              className="primary research-upgrade"
              disabled={busy || max || !unlocked || points < cost}
              onClick={upgrade}
            >
              {max ? <Check size={18} /> : !unlocked ? <Lock size={18} /> : <FlaskConical size={18} />}{' '}
              {max
                ? 'Drei Sterne erreicht'
                : !unlocked
                  ? `Freischaltung auf Level ${TOWER_UNLOCK_LEVELS[kind]}`
                  : busy
                    ? 'Wird verbessert …'
                    : `Aufwerten · ${cost} FP`}
            </button>
            {unlocked && !max && points < cost && (
              <small className="research-shortfall">Noch {cost - points} Forschungspunkte benötigt.</small>
            )}
            <p className="research-notice">
              Dauerhaft für neue Durchläufe. Gold-Aufwertungen im Kampf verstärken diese Werte zusätzlich.
            </p>
            <p className="research-feedback" role="status">
              {message}
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

import {
  LEVEL_THRESHOLDS,
  profileLevel,
  slotCount,
  availableResearch,
  MAPS,
  MAP_IDS,
} from '@emberwatch/shared';
import { X, Shield, LogIn, UserPlus } from 'lucide-react';
import { useDialog } from './useDialog';
import type { Profile } from './profile';

function levelProgress(xp: number) {
  const level = profileLevel(0, xp);
  const threshold = (n: number) => LEVEL_THRESHOLDS[n - 1] ?? 1300 + (n - 8) * 200;
  const start = threshold(level),
    next = threshold(level + 1);
  return {
    level,
    next,
    earned: xp - start,
    required: next - start,
    percent: ((xp - start) / (next - start)) * 100,
  };
}
export function LevelRing({ xp }: { xp: number }) {
  const { level, percent } = levelProgress(xp);
  return (
    <span
      className="level-ring"
      role="img"
      aria-label={`Level ${level} · ${Math.floor(percent)} % bis zum nächsten Level`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="level-ring-track" cx="32" cy="32" r="27" />
        <circle
          className="level-ring-fill"
          cx="32"
          cy="32"
          r="27"
          pathLength="100"
          strokeDasharray={`${percent} 100`}
        />
      </svg>
      <strong>{level}</strong>
    </span>
  );
}
export function AccountDialog({
  profile,
  onClose,
  offline,
  canUpdate,
}: {
  profile: Profile;
  onClose: () => void;
  offline: { status: string; update: boolean; applyUpdate: () => void };
  canUpdate: boolean;
}) {
  const ref = useDialog(onClose),
    progress = levelProgress(profile.xp);
  const runs = Object.values(profile.statistics);
  const best = Math.max(0, ...Object.values(profile.records), ...runs.map((r) => r.waves));
  const fmt = (n: number) => n.toLocaleString('de-DE');
  return (
    <div className="modal-backdrop account-backdrop" onClick={onClose}>
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        className="modal account-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close icon-button" aria-label="Account schließen" onClick={onClose}>
          <X />
        </button>
        <span className="eyebrow">DEIN ACCOUNT</span>
        <h2 id="account-title">Account</h2>
        <p>Deine Wacht. Dein Fortschritt auf diesem Gerät.</p>
        <div className="account-level">
          <LevelRing xp={profile.xp} />
          <div>
            <h3>Level {progress.level}</h3>
            <strong>{fmt(profile.xp)} EP insgesamt</strong>
            <p>
              Noch {fmt(progress.next - profile.xp)} EP bis Level {progress.level + 1}
            </p>
          </div>
        </div>
        <div
          className="account-xp"
          role="progressbar"
          aria-label="Erfahrung im aktuellen Level"
          aria-valuemin={0}
          aria-valuemax={progress.required}
          aria-valuenow={progress.earned}
        >
          <i style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="account-xp-caption">
          <span>
            {fmt(progress.earned)} / {fmt(progress.required)} EP
          </span>
          <span>{Math.floor(progress.percent)} %</span>
        </div>
        <dl className="account-stats">
          {[
            ['Längste Wacht', `${fmt(best)} Wellen`],
            ['Besiegte Gegner¹', fmt(runs.reduce((n, r) => n + r.kills, 0))],
            ['Kampagnenfortschritt', `${profile.completed} / 15 Missionen`],
            ['Siege¹', fmt(runs.filter((r) => r.victory).length)],
            ['Turmslots', `${slotCount(profile.completed, profile.xp)} / 10`],
            ['Forschungspunkte', fmt(availableResearch(profile.xp, profile.research))],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <details className="account-records">
          <summary>Endless-Rekorde je Karte</summary>
          <dl>
            {MAP_IDS.map((id) => (
              <div key={id}>
                <dt>{MAPS[id].name}</dt>
                <dd>{profile.records[id]} Wellen</dd>
              </div>
            ))}
          </dl>
        </details>
        <p className="account-note">
          ¹ Seit Einführung der Statistik. Im Koop zählen gemeinsame Abschüsse und Siege.
        </p>
        <div className="account-auth">
          <button className="primary" disabled>
            <UserPlus size={17} />
            Registrieren
          </button>
          <button className="secondary" disabled>
            <LogIn size={17} />
            Login
          </button>
        </div>
        <p className="account-note">
          <Shield size={13} /> Verschlüsselt lokal gespeichert · Accounts folgen später.
        </p>
        {offline.status && <p className="offline-status">{offline.status}</p>}
        {offline.update && canUpdate && (
          <button className="secondary" onClick={offline.applyUpdate}>
            Update laden
          </button>
        )}
      </section>
    </div>
  );
}

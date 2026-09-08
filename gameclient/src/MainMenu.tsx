import { LevelRing } from './AccountDialog';
import { MAPS, MAP_IDS, type MapId } from '@emberwatch/shared';
import { useEffect, useRef, type CSSProperties } from 'react';
import { Flame, Swords, Users, ChevronRight, Play, Volume2, VolumeX, HelpCircle, Trophy } from 'lucide-react';

interface Props {
  mapId: MapId;
  loaded: boolean;
  progress: number;
  assetError: boolean;
  busy: boolean;
  error: string;
  sound: boolean;
  best: number;
  canResume: boolean;
  running: boolean;
  onSolo: () => void;
  onMulti: () => void;
  onTowers: () => void;
  onAccount: () => void;
  xp: number;
  onResume: () => void;
  onSound: () => void;
  onHelp: () => void;
}
export function MainMenu(props: Props) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section ref={panel} tabIndex={-1} className="main-menu" aria-label="Hauptmenü">
      <div className="menu-embers" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i
            key={i}
            style={
              {
                '--x': `${(i * 47 + 11) % 100}%`,
                '--delay': `${-i * 1.7}s`,
                '--duration': `${9 + (i % 7)}s`,
                '--sway': `${(i % 2 ? 1 : -1) * (30 + i * 3)}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="menu-content">
        <div className="menu-brand">
          <div className="menu-sigil" aria-hidden="true">
            <span />
            <Flame strokeWidth={1.2} />
          </div>
          <span className="menu-kicker">DIE WACHT BEGINNT</span>
          <h1>Emberwatch</h1>
          <p>
            Fünf Feuer. Eine gemeinsame Wacht.
            <br />
            Schreibe deine Geschichte.
          </p>
        </div>
        <nav className="menu-choices" aria-label="Spielmodus">
          <button
            className="menu-choice solo-choice"
            aria-label="Einzelspieler"
            disabled={props.busy || !props.loaded}
            onClick={props.onSolo}
          >
            <span className="menu-choice-icon">
              <Swords />
            </span>
            <span>
              <strong>Einzelspieler</strong>
              <small>Deine Strategie. Deine Verteidigung.</small>
            </span>
            <ChevronRight className="menu-choice-arrow" />
          </button>
          <button
            className="menu-choice multi-choice"
            aria-label="Multispieler"
            disabled={props.busy || !props.loaded}
            onClick={props.onMulti}
          >
            <span className="menu-choice-icon">
              <Users />
            </span>
            <span>
              <strong>Multispieler</strong>
              <small>Gemeinsam wachen · Bis zu 4 Hüter</small>
            </span>
            <ChevronRight className="menu-choice-arrow" />
          </button>
          <button
            className="menu-choice towers-choice"
            aria-label="Türme"
            disabled={props.busy || !props.loaded}
            onClick={props.onTowers}
          >
            <span className="menu-choice-icon">
              <Swords />
            </span>
            <span>
              <strong>Türme</strong>
              <small>Deine Sammlung · Forschung & Sterne</small>
            </span>
            <ChevronRight className="menu-choice-arrow" />
          </button>
          <button className="menu-choice account-choice" aria-label="Account" onClick={props.onAccount}>
            <span className="menu-choice-icon">
              <LevelRing xp={props.xp} />
            </span>
            <span>
              <strong>Account</strong>
              <small>Dein Level · Fortschritt & Statistik</small>
            </span>
            <ChevronRight className="menu-choice-arrow" />
          </button>
        </nav>
        {props.canResume && (
          <button className="menu-resume" disabled={props.busy} onClick={props.onResume}>
            <Play size={16} /> Spiel fortsetzen <span>Zurück ins Tal</span>
          </button>
        )}
        <div className="menu-status" aria-live="polite">
          {props.assetError ? (
            <>
              <p>Das Tal konnte nicht geladen werden.</p>
              <button className="menu-retry" onClick={() => location.reload()}>
                Erneut laden
              </button>
            </>
          ) : props.error ? (
            <p className="menu-error" role="alert">
              {props.error}
            </p>
          ) : !props.loaded ? (
            <>
              <span>Das Tal erwacht … {Math.round(props.progress * 100)} %</span>
              <div className="menu-load">
                <i style={{ width: `${props.progress * 100}%` }} />
              </div>
            </>
          ) : props.busy ? (
            <span>Deine Wacht wird vorbereitet …</span>
          ) : props.error ? (
            <p className="menu-error" role="alert">
              {props.error}
            </p>
          ) : props.running ? (
            <span>Dein Durchlauf läuft im Hintergrund weiter.</span>
          ) : props.best > 0 ? (
            <span className="menu-record">
              <Trophy size={13} /> Deine längste Wacht: {props.best} Wellen
            </span>
          ) : (
            <span>KAMPAGNE & ENDLESS</span>
          )}
        </div>
      </div>
      <div className="menu-location" aria-hidden="true">
        <span>
          {String(MAP_IDS.indexOf(props.mapId) + 1).padStart(2, '0')} — {MAPS[props.mapId].name.toUpperCase()}
        </span>
        <strong>Verteidige die letzte Glut.</strong>
      </div>
      <footer className="menu-footer">
        <div>
          <button
            className="icon-button"
            aria-label={props.sound ? 'Ton ausschalten' : 'Ton einschalten'}
            onClick={props.onSound}
          >
            {props.sound ? <Volume2 /> : <VolumeX />}
          </button>
          <button className="icon-button" aria-label="Spielanleitung" onClick={props.onHelp}>
            <HelpCircle />
          </button>
        </div>
      </footer>
    </section>
  );
}

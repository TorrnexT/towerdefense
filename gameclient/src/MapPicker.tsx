import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, ChevronRight, Flag, Map as MapIcon, X } from 'lucide-react';
import { MAPS, MAP_IDS, entrances, routeSegments, type MapId, type MapDefinition } from '@emberwatch/shared';
import { BIOME_COLORS } from './landscape';
const hex = (color: number) => '#' + color.toString(16).padStart(6, '0');
export function MapPreview({
  map,
  children,
  foreground,
}: {
  map: MapDefinition;
  children?: ReactNode;
  foreground?: ReactNode;
}) {
  const colors = BIOME_COLORS[map.biome];
  const line = (points: { x: number; z: number }[]) => points.map((p) => `${p.x},${p.z}`).join(' ');
  return (
    <svg
      className="map-preview"
      viewBox="-16 -12 32 24"
      role="img"
      aria-label={`${map.name}: ${entrances(map).length} Eingänge, ${map.routes.length} Routen`}
    >
      <rect x="-16" y="-12" width="32" height="24" rx="2" fill={hex(colors.background)} />
      <polygon points={line(map.outline)} fill={hex(colors.ground)} />
      {children}
      {map.waterways.map((w, i) => (
        <polyline
          key={i}
          points={line(w.points)}
          fill="none"
          stroke={hex(colors.water)}
          strokeWidth={w.radius * 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {routeSegments(map).map(({ a, b }, i) => (
        <line
          key={i}
          x1={a.x}
          y1={a.z}
          x2={b.x}
          y2={b.z}
          stroke={hex(colors.road)}
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      ))}
      {map.bridges.map((b, i) => (
        <line
          key={i}
          x1={b.a.x}
          y1={b.a.z}
          x2={b.b.x}
          y2={b.b.z}
          stroke={b.style === 'wood' ? '#926744' : '#d2d8d3'}
          strokeWidth={b.width}
        />
      ))}
      {map.obstacles.map((o, i) => (
        <circle
          key={i}
          cx={o.x}
          cy={o.z}
          r={o.r}
          fill={hex(o.kind === 'trees' ? colors.leaf : colors.rock)}
          stroke="#15282030"
          strokeWidth={0.2}
        />
      ))}
      {entrances(map).map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.z} r={1.05} fill="#685b83" stroke="#e2cafa" strokeWidth={0.25} />
          <path
            d={`M${p.x - 0.4},${p.z - 0.35} L${p.x + 0.45},${p.z} L${p.x - 0.4},${p.z + 0.35}`}
            fill="none"
            stroke="#fff1d5"
            strokeWidth={0.25}
          />
        </g>
      ))}
      <g transform={`translate(${map.base.x} ${map.base.z})`}>
        <rect
          x="-1.25"
          y="-1"
          width="2.5"
          height="2.1"
          rx=".3"
          fill="#f2dc9f"
          stroke="#534b40"
          strokeWidth={0.25}
        />
        <path d="M-.5,-1 V-2.6 H.7 V-1.8 H-.5" stroke="#ffe6a1" strokeWidth={0.3} fill="#e5aa6e" />
      </g>
      {foreground}
    </svg>
  );
}
interface Props {
  mode: 'solo' | 'coop';
  selected: MapId;
  busy: boolean;
  error: string;
  best: (id: MapId) => number;
  onClose: () => void;
  onConfirm: (id: MapId) => void;
}
export function MapPicker({ mode, selected, busy, error, best, onClose, onConfirm }: Props) {
  const [choice, setChoice] = useState(selected),
    dialog = useRef<HTMLElement>(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      el = dialog.current;
    el?.focus({ preventScroll: true });
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!latest.current.busy) latest.current.onClose();
      }
      if (e.key !== 'Tab' || !el) return;
      const targets = [...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],
        first = targets[0],
        last = targets[targets.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === el)) {
        e.preventDefault();
        first?.focus();
      }
    }
    el?.addEventListener('keydown', key);
    return () => {
      el?.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const map = MAPS[choice];
  return (
    <div className="modal-backdrop map-backdrop">
      <section
        ref={dialog}
        tabIndex={-1}
        className="map-selector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-title"
      >
        <header>
          <span className="eyebrow">FÜNF TÄLER. DEINE WACHT.</span>
          <h2 id="map-title">Wähle dein Schlachtfeld.</h2>
          <button
            className="icon-button"
            aria-label="Kartenauswahl schließen"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="map-options" role="group" aria-label="Verfügbare Maps">
          {MAP_IDS.map((id, i) => (
            <button
              key={id}
              className={'map-option' + (choice === id ? ' selected' : '')}
              aria-label={MAPS[id].name}
              aria-pressed={choice === id}
              disabled={busy}
              onClick={() => setChoice(id)}
              style={{ '--map-accent': BIOME_COLORS[MAPS[id].biome].accent } as CSSProperties}
            >
              <span className="map-number">
                0{i + 1}
                {choice === id && <Check size={14} />}
              </span>
              <MapPreview map={MAPS[id]} />
              <strong>{MAPS[id].name}</strong>
              <small>
                {entrances(MAPS[id]).length} {entrances(MAPS[id]).length === 1 ? 'Eingang' : 'Eingänge'} ·{' '}
                {MAPS[id].routes.length} {MAPS[id].routes.length === 1 ? 'Route' : 'Routen'}
              </small>
              <span className="map-record">
                {best(id) > 0 ? `Rekord: ${best(id)} Wellen` : 'Eine neue Herausforderung'}
              </span>
            </button>
          ))}
        </div>
        <div className="map-summary">
          <div>
            <span className="damage-tag">
              <MapIcon size={13} /> {map.name}
            </span>
            <p>{map.description}</p>
            <small>
              <Flag size={12} /> Goldene Festung · Violette Eingänge · Alle Maps freigeschaltet
            </small>
          </div>
          <button className="primary" disabled={busy} onClick={() => onConfirm(choice)}>
            {busy ? 'Wird vorbereitet …' : mode === 'solo' ? 'Spiel starten' : 'Karte übernehmen'}
            <ChevronRight size={17} />
          </button>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

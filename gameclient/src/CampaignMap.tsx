import { useEffect, useRef, useState } from 'react';
import { X, Plus, Minus, LocateFixed, Lock, Check, Flag, ChevronRight, Trophy, Users } from 'lucide-react';
import { MISSIONS, MAPS, getMission, type Mission } from '@emberwatch/shared';
import { useDialog } from './useDialog';
interface Props {
  completed: number;
  selected?: string;
  coop?: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSelect: (m: Mission) => void;
}
export function CampaignMap(p: Props) {
  const [selected, setSelected] = useState(
    () => getMission(p.selected) || MISSIONS[Math.min(p.completed, 14)],
  );
  const selection = useRef(selected);
  selection.current = selected;
  const ref = useDialog(p.onClose, p.busy),
    viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 }),
    state = useRef(view);
  state.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{ x: number; y: number; distance: number; view: typeof view } | null>(null),
    moved = useRef(false);
  const size = 1100;
  function bounded(v: typeof view) {
    const r = viewport.current?.getBoundingClientRect();
    if (!r) return v;
    const w = size * v.scale;
    return {
      ...v,
      x: w < r.width ? (r.width - w) / 2 : Math.max(r.width - w, Math.min(0, v.x)),
      y: w < r.height ? (r.height - w) / 2 : Math.max(r.height - w, Math.min(0, v.y)),
    };
  }
  function center() {
    const r = viewport.current?.getBoundingClientRect();
    if (!r) return;
    const scale = Math.max(0.55, Math.min(1, Math.min(r.width, r.height) / 720));
    setView(
      bounded({
        x: r.width * 0.5 - selection.current.x * size * scale,
        y: r.height * 0.5 - selection.current.y * size * scale,
        scale,
      }),
    );
  }
  function zoom(factor: number, cx?: number, cy?: number) {
    const r = viewport.current?.getBoundingClientRect();
    if (!r) return;
    const v = state.current,
      s = Math.min(2.2, Math.max(0.35, v.scale * factor)),
      x = cx ?? r.width / 2,
      y = cy ?? r.height / 2;
    setView(bounded({ scale: s, x: x - ((x - v.x) * s) / v.scale, y: y - ((y - v.y) * s) / v.scale }));
  }
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => center());
    observer.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', wheel);
    };
  }, []);
  function anchor() {
    const points = [...pointers.current.values()];
    if (!points.length) {
      gesture.current = null;
      return;
    }
    const a = points[0],
      b = points[1] || a;
    gesture.current = {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      view: state.current,
    };
  }
  function down(e: React.PointerEvent) {
    if (e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    anchor();
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.current.values()],
      a = points[0],
      b = points[1] || a,
      g = gesture.current,
      x = (a.x + b.x) / 2,
      y = (a.y + b.y) / 2;
    if (Math.hypot(x - g.x, y - g.y) > 5 || points.length > 1) moved.current = true;
    const r = viewport.current!.getBoundingClientRect(),
      s = Math.min(
        2.2,
        Math.max(0.35, g.view.scale * (g.distance ? Math.hypot(a.x - b.x, a.y - b.y) / g.distance : 1)),
      );
    setView(
      bounded({
        scale: s,
        x: x - r.left - ((g.x - r.left - g.view.x) * s) / g.view.scale,
        y: y - r.top - ((g.y - r.top - g.view.y) * s) / g.view.scale,
      }),
    );
  }
  function up(e: React.PointerEvent) {
    if (!moved.current) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-mission]');
      const mission = getMission(el?.dataset.mission);
      if (mission) setSelected(mission);
    }
    pointers.current.delete(e.pointerId);
    anchor();
  }
  const unlocked = selected.number <= p.completed + 1,
    won = selected.number <= p.completed;
  return (
    <div className="campaign-backdrop">
      <section
        className="campaign-screen"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-title"
      >
        <header className="campaign-header">
          <div>
            <span className="eyebrow">DIE REISE DER HÜTER</span>
            <h2 id="campaign-title">Eine Welt. Fünf Feuer.</h2>
          </div>
          <span className="campaign-progress">
            <Trophy size={16} />
            {p.completed} / 15
          </span>
          <button className="icon-button" aria-label="Kampagne schließen" onClick={p.onClose}>
            <X />
          </button>
        </header>
        <div
          className="campaign-viewport"
          ref={viewport}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            anchor();
          }}
        >
          <div
            className="campaign-atlas"
            style={{
              width: size,
              height: size,
              transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
            }}
          >
            <img
              className="campaign-world-art"
              src="/assets/campaign/world.webp"
              srcSet="/assets/campaign/world-small.webp 768w, /assets/campaign/world.webp 1254w"
              sizes="(max-width: 600px) 768px, 1254px"
              alt="Fantasy-Weltkarte mit Waldtal, Silberfurt, Bernsteinhain, Frostklamm und Glutspalten"
              draggable={false}
            />
            <svg className="campaign-route" viewBox="0 0 1100 1100" aria-hidden="true">
              <polyline
                points={MISSIONS.map((m) => `${m.x * size},${m.y * size}`).join(' ')}
                fill="none"
                stroke="#172b2bd9"
                strokeWidth="9"
                strokeLinejoin="round"
              />
              <polyline
                points={MISSIONS.map((m) => `${m.x * size},${m.y * size}`).join(' ')}
                fill="none"
                stroke="#ecd295"
                strokeWidth="3"
                strokeDasharray="6 9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {MISSIONS.map((m) => (
              <button
                key={m.id}
                className={`mission-node ${m.number <= p.completed ? 'won' : m.number === p.completed + 1 ? 'available' : 'locked'} ${m.id === selected.id ? 'selected' : ''}`}
                data-mission={m.id}
                style={{
                  left: m.x * size,
                  top: m.y * size,
                  transform: `translate(-50%,-50%) scale(${1 / view.scale})`,
                }}
                aria-label={`Mission ${m.number}: ${m.name}${m.number > p.completed + 1 ? ', gesperrt' : ''}`}
                aria-pressed={m.id === selected.id}
                onClick={(e) => {
                  if (e.detail === 0) setSelected(m);
                }}
              >
                <span>
                  {m.number <= p.completed ? (
                    <Check size={20} />
                  ) : m.number > p.completed + 1 ? (
                    <Lock size={17} />
                  ) : (
                    m.number
                  )}
                </span>
                <small>{m.number}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="campaign-controls">
          <button className="icon-button" aria-label="Kampagnenkarte vergrößern" onClick={() => zoom(1.25)}>
            <Plus />
          </button>
          <button className="icon-button" aria-label="Kampagnenkarte verkleinern" onClick={() => zoom(0.8)}>
            <Minus />
          </button>
          <button className="icon-button" aria-label="Mission zentrieren" onClick={center}>
            <LocateFixed />
          </button>
        </div>
        <aside className="mission-detail" aria-live="polite">
          <img src={`/assets/campaign/${selected.mapId}-small.webp`} alt="" />
          <div className="mission-detail-body">
            <span className="eyebrow">
              {MAPS[selected.mapId].name} · MISSION {String(selected.number).padStart(2, '0')}
            </span>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
            <div className="mission-meta">
              <span>
                <Flag size={14} />
                {selected.waves} Wellen
              </span>
              <span>
                {won ? <Check size={14} /> : <Trophy size={14} />} {'+100 EP + 50 FP je Sieg'}
              </span>
            </div>
            {p.coop && (
              <small className="coop-map-note">
                <Users size={12} /> Freigabe aller Hüter berücksichtigt
              </small>
            )}
            <button className="primary" disabled={p.busy || !unlocked} onClick={() => p.onSelect(selected)}>
              {!unlocked
                ? 'Vorherige Mission abschließen'
                : p.coop
                  ? 'Mission wählen'
                  : 'Team zusammenstellen'}
              <ChevronRight size={16} />
            </button>
            {p.error && (
              <p className="error-text" role="alert">
                {p.error}
              </p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

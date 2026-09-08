import { useEffect, useRef, useState } from 'react';
import { X, Lock, Plus, ChevronRight, Shield, GripVertical } from 'lucide-react';
import {
  TOWERS,
  slotCount,
  profileLevel,
  LEVEL_THRESHOLDS,
  loadoutError,
  type TowerKind,
  type ResearchRanks,
  availableResearch,
} from '@emberwatch/shared';
import { TowerCard } from './TowerCard';
import { useDialog } from './useDialog';
interface Props {
  loadout: TowerKind[];
  completed: number;
  xp: number;
  research: ResearchRanks;
  onResearch: (kind: TowerKind) => void;
  previews: Partial<Record<TowerKind, string>>;
  busy: boolean;
  error: string;
  label: string;
  onClose: () => void;
  onConfirm: (k: TowerKind[]) => void;
}
export function TeamPicker(p: Props) {
  const count = slotCount(p.completed, p.xp),
    ref = useDialog(p.onClose, p.busy);
  const [slots, setSlots] = useState<(TowerKind | null)[]>(() =>
    Array.from({ length: 10 }, (_, i) => p.loadout[i] || null),
  );
  const [picked, setPicked] = useState<TowerKind | null>(null),
    [hint, setHint] = useState(''),
    [ghost, setGhost] = useState<{ kind: TowerKind; x: number; y: number } | null>(null);
  const latest = useRef({ slots, count, busy: p.busy });
  latest.current = { slots, count, busy: p.busy };
  const drag = useRef<{
    kind: TowerKind;
    x: number;
    y: number;
    active: boolean;
    touch: boolean;
    timer?: ReturnType<typeof setTimeout>;
    pointerId: number;
  } | null>(null);
  const suppress = useRef(false);
  function put(kind: TowerKind, index: number) {
    if (index >= latest.current.count) {
      setHint('Dieser Slot ist noch gesperrt.');
      return;
    }
    setSlots((old) => {
      const next = [...old],
        from = next.indexOf(kind);
      if (from === index) return old;
      if (from >= 0) next[from] = next[index];
      next[index] = kind;
      return next;
    });
    setPicked(null);
    setHint(`${TOWERS[kind].name} in Slot ${index + 1}.`);
  }
  useEffect(() => {
    const cancel = () => {
      if (drag.current?.timer) clearTimeout(drag.current.timer);
      drag.current = null;
      setGhost(null);
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return;
        if (d.touch) {
          cancel();
          return;
        }
        d.active = true;
      }
      e.preventDefault();
      setGhost({ kind: d.kind, x: e.clientX, y: e.clientY });
      const strip = document.querySelector('.team-slots');
      if (strip) {
        const r = strip.getBoundingClientRect();
        if (e.clientY > r.top && e.clientY < r.bottom)
          strip.scrollLeft += e.clientX < r.left + 40 ? -14 : e.clientX > r.right - 40 ? 14 : 0;
      }
    };
    const touchMove = (e: TouchEvent) => {
      if (drag.current?.active) e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (d.active) {
        suppress.current = true;
        const target = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>('[data-team-slot]');
        if (target) put(d.kind, Number(target.dataset.teamSlot));
        else setHint('Auf einen freien oder belegten Slot ziehen.');
        setTimeout(() => {
          suppress.current = false;
        }, 100);
      }
      cancel();
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary) cancel();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        e.stopImmediatePropagation();
        cancel();
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('pointerdown', down);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', cancel);
    };
  }, []);
  function start(e: React.PointerEvent, kind: TowerKind) {
    if (p.busy || !e.isPrimary || e.button !== 0) return;
    const d = {
      kind,
      x: e.clientX,
      y: e.clientY,
      active: false,
      touch: e.pointerType !== 'mouse',
      pointerId: e.pointerId,
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    drag.current = d;
    if (d.touch)
      d.timer = setTimeout(() => {
        if (drag.current === d) {
          d.active = true;
          setGhost({ kind, x: d.x, y: d.y });
        }
      }, 240);
  }
  function choose(kind: TowerKind, detail = 1) {
    if (suppress.current && detail > 0) return;
    setPicked(kind);
    setHint(`${TOWERS[kind].name} gewählt. Tippe auf einen Slot.`);
  }
  const team = slots.slice(0, count).filter((k): k is TowerKind => !!k),
    error = loadoutError(team, p.completed, p.xp);
  return (
    <div className="modal-backdrop team-backdrop">
      <section
        className="team-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-title"
        tabIndex={-1}
        ref={ref}
      >
        <header className="screen-header">
          <div>
            <span className="eyebrow">DEINE HÜTER. DEIN PLAN.</span>
            <h2 id="team-title">Stelle deine Wacht auf.</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Turmauswahl schließen"
            disabled={p.busy}
            onClick={p.onClose}
          >
            <X />
          </button>
        </header>
        <div className="team-level">
          <Shield size={17} />
          <strong>Spielstand-Level {profileLevel(p.completed, p.xp)}</strong>
          <span>
            {p.xp} EP · {team.length}/{count} Plätze · {availableResearch(p.xp, p.research)} FP
          </span>
        </div>
        <div className="team-slots" aria-label="Deine Turmslots">
          {slots.map((kind, i) => (
            <div className={'team-slot ' + (i >= count ? 'locked' : '')} key={i} data-team-slot={i}>
              <span className="slot-number">{String(i + 1).padStart(2, '0')}</span>
              {i >= count ? (
                <div className="slot-lock">
                  <Lock size={20} />
                  <strong>Level {i - 1}</strong>
                  <small>{LEVEL_THRESHOLDS[i - 2]} EP</small>
                </div>
              ) : kind ? (
                <>
                  <TowerCard
                    kind={kind}
                    rank={p.research[kind] || 0}
                    preview={p.previews[kind]}
                    compact
                    selected={picked === kind}
                    disabled={p.busy}
                    aria-label={`Slot ${i + 1}: ${TOWERS[kind].name}`}
                    onPointerDown={(e) => start(e, kind)}
                    onClick={(e) => {
                      if (suppress.current && e.detail > 0) return;
                      picked ? put(picked, i) : choose(kind, e.detail);
                    }}
                  />
                  <button
                    className="slot-remove"
                    aria-label={`${TOWERS[kind].name} entfernen`}
                    disabled={p.busy}
                    onClick={() => setSlots((old) => old.map((k, j) => (j === i ? null : k)))}
                  >
                    <X size={13} />
                  </button>
                </>
              ) : (
                <button
                  className="slot-empty"
                  aria-label={`Slot ${i + 1} belegen`}
                  disabled={p.busy}
                  onClick={() =>
                    picked ? put(picked, i) : setHint('Wähle zuerst einen Turm aus dem Katalog.')
                  }
                >
                  <Plus />
                  <span>Turm ablegen</span>
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="team-catalog-heading">
          <strong>DEIN ARSENAL</strong>
          <span>
            <GripVertical size={13} /> Ziehen oder Turm und Slot antippen
          </span>
        </div>
        <div className="team-catalog">
          {(Object.keys(TOWERS) as TowerKind[]).map((kind) => (
            <div className="team-catalog-entry" key={kind}>
              <TowerCard
                kind={kind}
                rank={p.research[kind] || 0}
                preview={p.previews[kind]}
                selected={picked === kind || team.includes(kind)}
                disabled={p.busy}
                aria-label={`${TOWERS[kind].name} auswählen`}
                onPointerDown={(e) => start(e, kind)}
                onClick={(e) => choose(kind, e.detail)}
              />
              <button
                className="research-card-action"
                disabled={p.busy}
                aria-label={`${TOWERS[kind].name} aufwerten`}
                onClick={() => p.onResearch(kind)}
              >
                Erforschen · {p.research[kind] || 0}/15
              </button>
            </div>
          ))}
        </div>
        <footer className="team-footer">
          <p role="status">
            {p.error || hint || 'Jeder Turmtyp belegt einen Slot. Im Kampf kannst du ihn mehrfach bauen.'}
          </p>
          <button className="primary" disabled={p.busy || !!error} onClick={() => p.onConfirm(team)}>
            {p.busy ? 'Wird vorbereitet …' : p.label}
            <ChevronRight size={17} />
          </button>
        </footer>
      </section>
      {ghost && (
        <div className="team-drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
          <TowerCard
            rank={p.research[ghost.kind] || 0}
            kind={ghost.kind}
            preview={p.previews[ghost.kind]}
            compact
            tabIndex={-1}
          />
        </div>
      )}
    </div>
  );
}

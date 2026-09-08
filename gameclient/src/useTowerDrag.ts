import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameView, Point, TowerKind } from '@emberwatch/shared';
import type { World } from './world';

interface Options {
  world: World | null;
  game: GameView;
  status: string;
  busy: boolean;
  validate: (kind: TowerKind, point: Point | null) => string | null;
  onStart: () => void;
  onReject: (reason: string) => void;
  onDrop: (kind: TowerKind, point: Point) => void;
}
interface Preview {
  kind: TowerKind;
  x: number;
  y: number;
  point: Point | null;
  error: string | null;
}
interface Gesture {
  id: number;
  kind: TowerKind;
  source: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  touch: boolean;
  displayed?: Preview;
  hold?: ReturnType<typeof setTimeout>;
}

export function useTowerDrag(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  function mapPoint(x: number, y: number) {
    const world = latest.current.world;
    // Pointer capture changes the event target, so inspect the surface below the pointer.
    if (!world || document.elementFromPoint(x, y) !== world.renderer.domElement) return null;
    return world.screenPoint(x, y);
  }
  function update(x: number, y: number) {
    const drag = gesture.current;
    if (!drag) return;
    drag.x = x;
    drag.y = y;
    if (!drag.moved) {
      if (Math.hypot(x - drag.startX, y - drag.startY) < 8) return;
      drag.moved = true;
      latest.current.onStart();
      latest.current.world?.select(drag.kind, null);
    }
    const point = mapPoint(x, y);
    const error = latest.current.validate(drag.kind, point);
    latest.current.world?.preview(point, error);
    drag.displayed = { kind: drag.kind, x, y, point, error };
    setPreview(drag.displayed);
  }
  function cancel() {
    const drag = gesture.current;
    if (!drag) return;
    if (drag.hold) clearTimeout(drag.hold);
    gesture.current = null;
    if (drag.source.hasPointerCapture(drag.id)) drag.source.releasePointerCapture(drag.id);
    const world = latest.current.world;
    if (world) {
      world.controls.enabled = true;
      if (drag.moved) world.select(null, null);
    }
    setPreview(null);
  }
  function start(event: ReactPointerEvent<HTMLButtonElement>, kind: TowerKind) {
    if (gesture.current || !event.isPrimary || event.button !== 0 || !latest.current.world) return;
    if (event.pointerType === 'mouse') {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    gesture.current = {
      id: event.pointerId,
      kind,
      source: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      touch: event.pointerType !== 'mouse',
    };
    const d = gesture.current;
    if (d.touch)
      d.hold = setTimeout(() => {
        if (gesture.current === d) {
          d.moved = true;
          latest.current.onStart();
          latest.current.world?.select(d.kind, null);
          update(d.x, d.y);
        }
      }, 240);
    latest.current.world.controls.enabled = false;
  }
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (event.pointerId !== gesture.current?.id) return;
      const d = gesture.current!;
      if (
        d.touch &&
        !d.moved &&
        Math.abs(event.clientX - d.startX) > 8 &&
        Math.abs(event.clientX - d.startX) > Math.abs(event.clientY - d.startY)
      ) {
        cancel();
        return;
      }
      event.preventDefault();
      update(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => {
      const drag = gesture.current;
      if (!drag || event.pointerId !== drag.id) return;
      event.preventDefault();
      if (!drag.moved) {
        cancel();
        return;
      }
      // Release jitter must not move a green preview across an obstacle boundary.
      // A significant final movement is evaluated; leaving the canvas always cancels.
      const onMap = !!mapPoint(event.clientX, event.clientY);
      const shown = drag.displayed;
      const tolerance = drag.touch ? 8 : 2;
      if (!shown || Math.hypot(event.clientX - shown.x, event.clientY - shown.y) > tolerance)
        update(event.clientX, event.clientY);
      const point = onMap ? drag.displayed?.point : null;
      const error = point ? latest.current.validate(drag.kind, point) : null;
      const kind = drag.kind;
      cancel();
      if (error) latest.current.onReject(error);
      else if (point) latest.current.onDrop(kind, point);
    };
    const interrupted = (event: PointerEvent) => {
      if (event.pointerId === gesture.current?.id) cancel();
    };
    const anotherPointer = (event: PointerEvent) => {
      if (gesture.current && event.pointerId !== gesture.current.id) cancel();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    const touchMove = (e: TouchEvent) => {
      if (gesture.current?.moved) e.preventDefault();
    };
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', interrupted);
    window.addEventListener('lostpointercapture', interrupted);
    window.addEventListener('pointerdown', anotherPointer, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancel();
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', interrupted);
      window.removeEventListener('lostpointercapture', interrupted);
      window.removeEventListener('pointerdown', anotherPointer, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useEffect(() => {
    if (
      options.status !== 'online' ||
      ['defeat', 'victory'].includes(options.game.phase) ||
      options.game.paused
    )
      cancel();
    else if (gesture.current?.moved) update(gesture.current.x, gesture.current.y);
  }, [options.game, options.status, options.busy]);
  return { preview, start, cancel };
}

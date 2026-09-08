import { useEffect } from 'react';

/** One delegated spring system for mouse, touch and keyboard controls. */
export function useUiMotion() {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Map<HTMLElement, Animation>();
    const pointers = new Map<number, HTMLElement>();
    const keys = new Map<string, HTMLElement>();
    const recentlyReleased = new WeakMap<HTMLElement, number>();
    const control = (target: EventTarget | null) => {
      const element = target instanceof Element ? target.closest<HTMLElement>('button, a[href]') : null;
      return element?.closest('.app') && !element.matches(':disabled, [aria-disabled="true"]')
        ? element
        : null;
    };
    const spring = (element: HTMLElement, pressed: boolean) => {
      if (reduced.matches || !element.isConnected) {
        animations.get(element)?.cancel();
        animations.delete(element);
        return;
      }
      const current = parseFloat(getComputedStyle(element).scale) || 1;
      animations.get(element)?.cancel();
      const target = pressed ? (element.classList.contains('tower-card') ? 0.96 : 0.92) : 1;
      // A damped spring, with a small release impulse for a tactile pop.
      const duration = pressed ? 160 : 520;
      const velocity = pressed ? 0 : 2.3;
      const frames: Keyframe[] = Array.from({ length: 33 }, (_, i) => {
        const t = ((i / 32) * duration) / 1000;
        const displacement = current - target;
        const value =
          target +
          Math.exp(-13 * t) *
            (displacement * Math.cos(19 * t) + ((velocity + 13 * displacement) / 19) * Math.sin(19 * t));
        return { offset: i / 32, scale: String(i === 32 ? target : value) };
      });
      const animation = element.animate(frames, {
        duration,
        easing: 'linear',
        fill: pressed ? 'forwards' : 'none',
      });
      animations.set(element, animation);
      animation.finished
        .then(() => {
          if (!pressed && animations.get(element) === animation) {
            animations.delete(element);
            animation.cancel();
          }
        })
        .catch(() => {});
    };
    const release = (element: HTMLElement) => {
      recentlyReleased.set(element, performance.now());
      spring(element, false);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const element = control(event.target);
      if (!element) return;
      pointers.set(event.pointerId, element);
      spring(element, true);
    };
    const up = (event: PointerEvent) => {
      const element = pointers.get(event.pointerId);
      if (!element) return;
      pointers.delete(event.pointerId);
      release(element);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat || !['Enter', ' '].includes(event.key)) return;
      const element = control(event.target);
      if (!element) return;
      keys.set(event.key, element);
      spring(element, true);
    };
    const keyUp = (event: KeyboardEvent) => {
      const element = keys.get(event.key);
      if (!element) return;
      keys.delete(event.key);
      release(element);
    };
    const click = (event: MouseEvent) => {
      const element = control(event.target);
      // Screen readers and programmatic keyboard clicks may have no pointer sequence.
      if (
        element &&
        performance.now() - (recentlyReleased.get(element) ?? -1000) > 100 &&
        ![...keys.values()].includes(element)
      )
        release(element);
    };
    const reset = () => {
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
      pointers.clear();
      keys.clear();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('lostpointercapture', up, true);
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);
    window.addEventListener('click', click, true);
    window.addEventListener('blur', reset);
    reduced.addEventListener('change', reset);
    return () => {
      reset();
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('lostpointercapture', up, true);
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('blur', reset);
      reduced.removeEventListener('change', reset);
    };
  }, []);
}

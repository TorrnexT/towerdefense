import { useEffect, useRef } from 'react';
export function useDialog(close: () => void, busy = false) {
  const ref = useRef<HTMLElement>(null),
    latest = useRef({ close, busy });
  latest.current = { close, busy };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      el = ref.current;
    el?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!latest.current.busy) latest.current.close();
      }
      if (e.key !== 'Tab' || !el) return;
      const list = [
        ...el.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]'),
      ].filter((x) => x.getClientRects().length);
      if (e.shiftKey && (document.activeElement === list[0] || document.activeElement === el)) {
        e.preventDefault();
        list.at(-1)?.focus();
      } else if (!e.shiftKey && (document.activeElement === list.at(-1) || document.activeElement === el)) {
        e.preventDefault();
        list[0]?.focus();
      }
    };
    el?.addEventListener('keydown', key);
    return () => {
      el?.removeEventListener('keydown', key);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

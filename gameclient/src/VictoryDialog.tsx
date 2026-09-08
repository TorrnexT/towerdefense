import type { ReactNode } from 'react';
import { useDialog } from './useDialog';
export function VictoryDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useDialog(onClose);
  return (
    <div className="modal-backdrop">
      <section
        ref={ref}
        tabIndex={-1}
        className="modal victory"
        role="dialog"
        aria-modal="true"
        aria-labelledby="victory-title"
      >
        {children}
      </section>
    </div>
  );
}

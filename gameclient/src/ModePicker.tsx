import { X, Map, Infinity, ChevronRight, Users, Swords } from 'lucide-react';
import type { GameMode, RuleSet } from '@emberwatch/shared';
import { useDialog } from './useDialog';
export function ModePicker({
  mode,
  onClose,
  onSelect,
}: {
  mode: GameMode;
  onClose: () => void;
  onSelect: (rule: RuleSet) => void;
}) {
  const ref = useDialog(onClose),
    Icon = mode === 'coop' ? Users : Swords;
  return (
    <div className="modal-backdrop mode-backdrop">
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-title"
        className="mode-picker"
      >
        <button className="modal-close icon-button" aria-label="Modusauswahl schließen" onClick={onClose}>
          <X />
        </button>
        <span className="eyebrow">
          <Icon size={14} />
          {mode === 'coop' ? 'MULTISPIELER' : 'EINZELSPIELER'}
        </span>
        <h2 id="mode-title">Wohin führt deine Wacht?</h2>
        <div className="mode-choices">
          <button aria-label="Kampagne" onClick={() => onSelect('campaign')}>
            <img src={`${import.meta.env.BASE_URL}assets/campaign/world-small.webp`} alt="" />
            <div>
              <Map />
              <strong>Kampagne</strong>
              <p>
                15 Missionen. Fünf Kapitel.
                <br />
                Deine Reise beginnt hier.
              </p>
              <ChevronRight />
            </div>
          </button>
          <button aria-label="Endless" onClick={() => onSelect('endless')}>
            <img src={`${import.meta.env.BASE_URL}assets/campaign/glutspalten-small.webp`} alt="" />
            <div>
              <Infinity />
              <strong>Endless</strong>
              <p>
                Welle um Welle.
                <br />
                Wie lange hältst du stand?
              </p>
              <ChevronRight />
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}

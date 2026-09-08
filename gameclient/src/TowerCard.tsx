import type { ButtonHTMLAttributes } from 'react';
import { TowerStars } from './TowerStars';
import { Coins, Crosshair, Sparkles, Flame, Bomb, Droplets, Snowflake } from 'lucide-react';
import { TOWERS, DAMAGE_LABELS, PROJECTILE_STYLE, type TowerKind } from '@emberwatch/shared';
export function TowerCard({
  kind,
  rank = 0,
  unavailable = false,
  preview,
  selected = false,
  poor = false,
  compact = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind: TowerKind;
  rank?: number;
  unavailable?: boolean;
  preview?: string;
  selected?: boolean;
  poor?: boolean;
  compact?: boolean;
}) {
  const t = TOWERS[kind],
    Icon =
      kind === 'frost'
        ? Snowflake
        : t.type === 'poison'
          ? Droplets
          : PROJECTILE_STYLE[kind] === 'shell'
            ? Bomb
            : t.type === 'physical'
              ? Crosshair
              : t.type === 'arcane'
                ? Sparkles
                : Flame;
  return (
    <button
      {...props}
      className={`tower-card ${kind} ${selected ? 'selected' : ''} ${compact ? 'compact' : ''} ${props.className || ''}`}
      disabled={props.disabled || unavailable}
      data-unavailable={unavailable || undefined}
      aria-description={`${rank} von 15 Forschungsstufen, ${Math.floor(rank / 5)} volle Sterne`}
      data-tower={kind}
      style={{ '--tower-color': t.color, ...props.style } as React.CSSProperties}
      onDragStart={(e) => e.preventDefault()}
    >
      <TowerStars rank={rank} />
      {['inferno', 'venom', 'frost'].includes(kind) && (
        <span className="card-effect">
          {kind === 'inferno' ? 'Brand' : kind === 'venom' ? 'Gift' : 'Verlangsamt'}
        </span>
      )}
      <span className="card-type">
        <Icon size={13} />
        {DAMAGE_LABELS[t.type]}
      </span>
      <img src={preview} alt="" draggable={false} className="tower-preview" />
      <span className="card-name">{t.name}</span>
      <span className={'card-price ' + (poor ? 'poor' : '')}>
        <Coins size={13} />
        {t.cost}
      </span>
    </button>
  );
}

const points = Array.from({ length: 10 }, (_, i) => {
  const angle = -Math.PI / 2 + (i * Math.PI) / 5,
    radius = i % 2 ? 4.4 : 10;
  return `${12 + Math.cos(angle) * radius},${12 + Math.sin(angle) * radius}`;
});
export function TowerStars({ rank = 0 }: { rank?: number }) {
  const count = Math.max(1, Math.ceil(rank / 5));
  return (
    <span
      className="tower-stars"
      role="img"
      aria-label={`${Math.floor(rank / 5)} volle Sterne, ${rank % 5} von 5 Zacken, Forschungsstufe ${rank} von 15`}
    >
      {Array.from({ length: count }, (_, star) => {
        const filled = Math.min(5, Math.max(0, rank - star * 5));
        return (
          <svg key={star} viewBox="0 0 24 24" className={filled === 5 ? 'full-star' : ''} aria-hidden="true">
            {Array.from({ length: 5 }, (_, tip) => (
              <polygon
                key={tip}
                points={`12,12 ${points[(tip * 2 + 9) % 10]} ${points[tip * 2]} ${points[tip * 2 + 1]}`}
                fill={tip < filled ? '#f6c763' : '#58616a'}
              />
            ))}
            <polygon
              points={points.join(' ')}
              fill="none"
              stroke={filled === 5 ? '#ffe6a0' : '#91989c'}
              strokeWidth=".9"
            />
          </svg>
        );
      })}
    </span>
  );
}

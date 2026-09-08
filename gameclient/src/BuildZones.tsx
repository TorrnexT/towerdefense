import { useId } from 'react';
import {
  BUILD_MODES,
  MAPS,
  PLAYER_COLORS,
  territoryPolygons,
  type BuildMode,
  type GameView,
} from '@emberwatch/shared';
import { MapPreview } from './MapPicker';
export function BuildZones({
  state,
  disabled,
  onChange,
}: {
  state: GameView;
  disabled: boolean;
  onChange: (mode: BuildMode, owners: string[]) => void;
}) {
  const clipId = useId(),
    map = MAPS[state.mapId],
    mode = state.buildMode || 'all';
  const owners = state.zoneOwners?.length
    ? state.zoneOwners
    : Object.values(state.players)
        .sort((a, b) => a.color - b.color)
        .map((p) => p.id);
  const polygons = territoryPolygons(map, mode, owners.length);
  const name = (id: string) => state.players[id]?.name || 'Freies Gebiet';
  function assign(index: number, id: string) {
    const next = [...owners],
      other = next.indexOf(id);
    if (other < 0) return;
    [next[index], next[other]] = [next[other], next[index]];
    onChange(mode, next);
  }
  return (
    <details className="build-zones">
      <summary>
        Baugebiete <strong>{BUILD_MODES[mode]}</strong>
      </summary>
      {disabled && (
        <p>
          {state.lobby
            ? 'Nur der Host kann die Baugebiete ändern; während einer laufenden Aktion bitte kurz warten.'
            : 'Die Aufteilung ist für diesen Durchlauf festgelegt.'}
        </p>
      )}
      <div className="zone-modes" role="group" aria-label="Aufteilung der Baugebiete">
        {(Object.keys(BUILD_MODES) as BuildMode[]).map((m) => (
          <button
            key={m}
            className="secondary"
            aria-pressed={m === mode}
            disabled={disabled}
            onClick={() => onChange(m, owners)}
          >
            {BUILD_MODES[m]}
          </button>
        ))}
      </div>
      <div className="zone-map" aria-label="Vorschau der Baugebiete">
        <MapPreview
          map={map}
          foreground={
            mode !== 'all' &&
            polygons.map((poly, i) => {
              const x = poly.reduce((v, p) => v + p.x, 0) / poly.length,
                z = poly.reduce((v, p) => v + p.z, 0) / poly.length;
              return (
                <g key={i} transform={`translate(${x} ${z})`}>
                  <circle
                    r={0.85}
                    fill="#19352d"
                    stroke={PLAYER_COLORS[state.players[owners[i]]?.color || 0]}
                    strokeWidth={0.2}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={1}
                    fill="#fff0cf"
                    fontWeight="700"
                  >
                    {i + 1}
                  </text>
                </g>
              );
            })
          }
        >
          <defs>
            <clipPath id={clipId}>
              <polygon points={map.outline.map((p) => `${p.x},${p.z}`).join(' ')} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {polygons.map((poly, i) => (
              <polygon
                key={i}
                points={poly.map((p) => `${p.x},${p.z}`).join(' ')}
                fill={mode === 'all' ? '#d5d899' : PLAYER_COLORS[state.players[owners[i]]?.color || 0]}
                fillOpacity={0.38}
                stroke="#fff6d4"
                strokeWidth={0.12}
              />
            ))}
          </g>
        </MapPreview>
      </div>
      {mode === 'all' ? (
        <p>Alle Spieler dürfen auf allen gültigen Bauflächen bauen.</p>
      ) : (
        <>
          <div className="zone-assignments">
            {owners.map((owner, i) => (
              <label key={i} style={{ borderLeftColor: PLAYER_COLORS[state.players[owner]?.color || 0] }}>
                <span>Gebiet {i + 1}</span>
                {state.lobby ? (
                  <select
                    aria-label={`Spieler für Gebiet ${i + 1}`}
                    disabled={disabled}
                    value={owner}
                    onChange={(e) => assign(i, e.target.value)}
                  >
                    {Object.values(state.players).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong>{name(owner)}</strong>
                )}
              </label>
            ))}
          </div>
          <p>
            {mode === 'sectors'
              ? 'Nummerierung ab Norden im Uhrzeigersinn.'
              : mode === 'columns'
                ? 'Nummerierung von links nach rechts.'
                : 'Nummerierung von oben nach unten.'}{' '}
            Die Turmmitte bestimmt das Baugebiet. Wege und Hindernisse bleiben gesperrt.
          </p>
        </>
      )}
      {state.lobby && (
        <p>
          Die Aufteilung kann schon vor dem Beitritt weiterer Spieler gewählt werden. Allein steht dir die
          ganze Karte zur Verfügung. Neue Spieler oder Änderungen erfordern eine erneute Bereitschaft.
        </p>
      )}
    </details>
  );
}

import { BALANCE, TOWERS, type Point, type TowerKind } from './index';
import { placementError, type MapDefinition } from './maps';
/** One placement/cost/limit decision for both preview and authoritative command. */
export function buildError(
  kind: TowerKind,
  point: Point,
  towers: Iterable<Point>,
  map: MapDefinition,
  gold: number,
): string | null {
  const placed = [...towers];
  const collision = placementError(point, placed, map);
  if (collision) return collision;
  if (placed.length >= BALANCE.maxTowers) return 'Alle 60 Turmplätze sind belegt.';
  if (gold < TOWERS[kind].cost) return 'Nicht genug Gold.';
  return null;
}

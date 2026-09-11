import { MAP_IDS, type MapId } from './maps';
import { TOWERS, type TowerKind, type ResearchRanks } from './index';
export type RuleSet = 'endless' | 'campaign';
export interface Mission {
  id: string;
  number: number;
  name: string;
  description: string;
  mapId: MapId;
  waves: number;
  healthMultiplier: number;
  damageMultiplier: number;
  x: number;
  y: number;
}
const names = [
  'Erste Wacht',
  'Am alten Tor',
  'Belagerung im Tal',
  'An den Ufern',
  'Zwei Brücken',
  'Stromwacht',
  'Goldene Pfade',
  'Die alten Ruinen',
  'Zangenangriff',
  'Schneewacht',
  'Eisige Gabelung',
  'Halt in der Klamm',
  'Ascheregen',
  'Drei Feuerwege',
  'Die letzte Bastion',
];
const descriptions = [
  'Entzünde das erste Wachtfeuer und halte vier Wellen vor den Toren des Waldtals auf.',
  'Verteidige das alte Westtor: Der Angriff kommt aus dem Osten und zieht zwischen Ruinen durch die Waldschleifen.',
  'Ein Fluss teilt das Tal. Halte die beiden Brücken und führe deine Verteidigung vor der Festung zusammen.',
  'Zwei Wege führen über den Fluss. Sichere die Ufer, bevor die Gegner die Brücken erreichen.',
  'Die Angreifer wechseln sich an beiden Brücken ab. Nutze die gemeinsame Engstelle vor der Festung.',
  'Das Wasser steigt, der Ansturm wächst. Halte beide Flussübergänge bis zum letzten Angriff.',
  'Zwei Eingänge öffnen sich im goldenen Wald. Verbinde ihre Verteidigung am gemeinsamen Schlussweg.',
  'Zwischen den Ruinen sammelt sich die nächste Angriffswelle. Verstärke die Wacht entlang der Kurven.',
  'Der Feind greift von beiden Seiten an. Teile deine Kräfte und bewahre den gemeinsamen Rückzugsweg.',
  'Drei Routen schneiden durch die Schneefelder. Die knappen Bauflächen machen jede Reichweite wichtig.',
  'Eine Gabelung bringt weitere Gegner aus der Kälte. Decke mehrere Felspassagen mit deinen Türmen ab.',
  'Zwölf Wellen drängen durch die Klamm. Halte die Brücken und die letzte Stellung im Eis.',
  'Über den Lavaströmen liegen drei getrennte Wege. Errichte deine Wacht auf den Basaltinseln.',
  'Der Angriff verteilt sich über alle Feuerwege. Sichere die späte Zusammenführung vor der Bastion.',
  'Vier Eingänge bedrohen die letzte Bastion. Sichere die getrennten Feuerwege und überstehe vierzehn Wellen.',
];
const waves = [4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 12, 12, 13, 14];
// Normalized positions match the generated five-biome world illustration.
const positions = [
  [0.31, 0.84],
  [0.24, 0.73],
  [0.32, 0.65],
  [0.62, 0.83],
  [0.77, 0.73],
  [0.76, 0.54],
  [0.64, 0.6],
  [0.47, 0.49],
  [0.55, 0.36],
  [0.29, 0.32],
  [0.32, 0.21],
  [0.44, 0.23],
  [0.6, 0.28],
  [0.79, 0.32],
  [0.78, 0.16],
];
export const MISSIONS: Mission[] = names.map((name, i) => ({
  id: `mission-${String(i + 1).padStart(2, '0')}`,
  number: i + 1,
  name,
  description: descriptions[i],
  mapId: MAP_IDS[Math.floor(i / 3)],
  waves: waves[i],
  healthMultiplier: 1 + i * 0.05,
  damageMultiplier: 1 + i * 0.03,
  x: positions[i][0],
  y: positions[i][1],
}));
export const LEVEL_THRESHOLDS = [0, 100, 300, 500, 700, 900, 1100, 1300] as const;
export const DEFAULT_LOADOUT: TowerKind[] = ['ballista', 'arcane', 'fire'];
export const TOWER_UNLOCK_LEVELS: Record<TowerKind, number> = {
  ballista: 1,
  arcane: 1,
  fire: 1,
  grenade: 2,
  frost: 2,
  sniper: 3,
  venom: 3,
  repeater: 4,
  inferno: 4,
  runemortar: 5,
  prism: 6,
  ember: 7,
  meteor: 8,
};
export function towerUnlocked(kind: TowerKind, completed: number, xp = completed * 100) {
  return profileLevel(completed, xp) >= TOWER_UNLOCK_LEVELS[kind];
}
export function getMission(id: unknown) {
  return MISSIONS.find((m) => m.id === id);
}
export function profileLevel(completed: number, xp = completed * 100) {
  return LEVEL_THRESHOLDS.filter((x) => x <= xp).length + Math.max(0, Math.floor((xp - 1300) / 200));
}
export function slotCount(completed: number, xp = completed * 100) {
  return Math.min(10, 2 + profileLevel(completed, xp));
}
export function validCompleted(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MISSIONS.length;
}
export function loadoutError(value: unknown, completed: number, xp = completed * 100): string | null {
  if (!Array.isArray(value) || !value.length || value.length > slotCount(completed, xp))
    return `Wähle 1 bis ${slotCount(completed, xp)} Türme.`;
  if (value.some((x) => typeof x !== 'string' || !Object.hasOwn(TOWERS, x))) return 'Unbekannter Turm.';
  if (new Set(value).size !== value.length) return 'Jeden Turmtyp nur einmal mitnehmen.';
  const locked = (value as TowerKind[]).find((kind) => !towerUnlocked(kind, completed, xp));
  if (locked) return `${TOWERS[locked].name} wird auf Level ${TOWER_UNLOCK_LEVELS[locked]} freigeschaltet.`;
  return null;
}
export interface RunOptions {
  ruleSet?: RuleSet;
  missionId?: string;
  mapId?: MapId;
}
export interface PlayerOptions {
  xp?: number;
  research?: ResearchRanks;
  name?: unknown;
  completed?: number;
  loadout?: TowerKind[];
}
export type StartOptions = RunOptions & PlayerOptions;
export function missionUnlocked(id: string, completed: number) {
  const m = getMission(id);
  return !!m && m.number <= completed + 1;
}

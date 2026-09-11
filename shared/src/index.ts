import type { BuildMode } from './territories';
import { RESEARCH_GAINS, type ResearchRanks, type ProgressReward } from './research';
export * from './research';
export * from './build';
import type { MapId } from './maps';
export * from './maps';
export * from './campaign';
export const GAME_SPEEDS = [1, 2, 5, 10] as const;
export const PLAYER_COLORS = ['#e2bd72', '#82cab8', '#b6a1ed', '#ed9c91'] as const;
export type GameMode = 'solo' | 'coop';
export type GameSpeed = (typeof GAME_SPEEDS)[number];
export type TowerKind =
  | 'ballista'
  | 'arcane'
  | 'fire'
  | 'grenade'
  | 'sniper'
  | 'repeater'
  | 'runemortar'
  | 'prism'
  | 'ember'
  | 'meteor'
  | 'inferno'
  | 'venom'
  | 'frost';
export type EnemyKind = 'goblin' | 'ogre' | 'wraith';
export type DamageType = 'physical' | 'arcane' | 'fire' | 'poison';
export type DamageValues = Record<DamageType, number>;
export interface Point {
  x: number;
  z: number;
}
export interface Point3 extends Point {
  y: number;
}
/** Server collision volumes match the visible monster silhouettes. */
export const ENEMY_COLLIDERS = {
  goblin: { height: 0.52, radius: 0.38 },
  ogre: { height: 0.85, radius: 0.65 },
  wraith: { height: 0.65, radius: 0.44 },
} satisfies Record<EnemyKind, { height: number; radius: number }>;
export const PROJECTILES = {
  inferno: { speed: 9, radius: 0.15, homing: true },
  venom: { speed: 7, radius: 0.18, homing: false },
  frost: { speed: 10, radius: 0.14, homing: true },
  ballista: { speed: 14, radius: 0.07, homing: false },
  arcane: { speed: 10, radius: 0.14, homing: true },
  fire: { speed: 8, radius: 0.18, homing: true },
  grenade: { speed: 7, radius: 0.18, homing: false },
  sniper: { speed: 22, radius: 0.07, homing: false },
  repeater: { speed: 17, radius: 0.07, homing: false },
  runemortar: { speed: 7, radius: 0.18, homing: false },
  prism: { speed: 12, radius: 0.14, homing: true },
  ember: { speed: 12, radius: 0.12, homing: true },
  meteor: { speed: 7, radius: 0.24, homing: false },
} satisfies Record<TowerKind, { speed: number; radius: number; homing: boolean }>;
export const BALANCE = {
  tick: 0.05,
  projectileLifetime: 3,
  maxProjectiles: 256,
  grenadeArc: 3.2,
  grenadeMinFlight: 0.65,
  grenadeMaxFlight: 1.4,
  startGold: 240,
  baseHp: 100,
  buildPause: 15,
  maxTowerLevel: 5,
  maxEnemies: 100,
  maxTowers: 60,
  reconnectSeconds: 60,
  maxPlayers: 4,
  coopHealthPerPlayer: 0.85,
  coopDamagePerPlayer: 0.2,
  sellPercent: 70,
  waveHealthGrowth: 1.12,
  levelHealthGrowth: 1.18,
  levelDamageGrowth: 1.3,
  maxSpeedMultiplier: 1.5,
  enemySpawnInterval: 0.85,
} as const;
export const TOWERS = {
  ballista: {
    name: 'Balliste',
    subtitle: 'Schnell & zielsicher',
    type: 'physical',
    color: '#b5cc85',
    cost: 100,
    damage: 17,
    attacks: 1.25,
    range: 4.8,
    splash: 0,
    description:
      'Schnelle Bolzen nehmen einzelne Gegner ins Visier. Ein verlässlicher Anfang für deine Verteidigung.',
  },
  arcane: {
    name: 'Arkanobelisk',
    subtitle: 'Durchbricht Rüstung',
    type: 'arcane',
    color: '#bda5f5',
    cost: 140,
    damage: 48,
    attacks: 0.7,
    range: 5.2,
    splash: 0,
    description:
      'Gebündelte Runenenergie trifft hart. Besonders wirkungsvoll gegen die Rüstung der Eisenoger.',
  },
  fire: {
    name: 'Feuerturm',
    subtitle: 'Entfacht Flächenschaden',
    type: 'fire',
    color: '#eea26b',
    cost: 160,
    damage: 25,
    attacks: 0.65,
    range: 4.5,
    splash: 1.65,
    description:
      'Spuckt einen breiten Flammenstoß. Alle Gegner im Feuerkegel erleiden fortlaufend Feuerschaden.',
  },
  grenade: {
    name: 'Granatwerfer',
    subtitle: 'Sprengt Gegnergruppen',
    type: 'physical',
    color: '#e2c16e',
    cost: 190,
    damage: 55,
    attacks: 0.45,
    range: 6.2,
    splash: 2.4,
    description:
      'Schwere Granaten fliegen im Bogen und explodieren bei Kontakt oder am Boden. Physischer Schaden in einem großen Umkreis.',
  },
  sniper: {
    name: 'Scharfschützenturm',
    subtitle: 'Ein Schuss. Ein Ziel.',
    type: 'physical',
    color: '#90b2c5',
    cost: 180,
    damage: 85,
    attacks: 0.4,
    range: 8,
    splash: 0,
    description: 'Präzise Fernschüsse treffen einzelne Gegner mit schweren Bolzen.',
  },
  repeater: {
    name: 'Repetierturm',
    subtitle: 'Kurze, schnelle Salven',
    type: 'physical',
    color: '#c5b88d',
    cost: 145,
    damage: 9,
    attacks: 3,
    range: 3.8,
    splash: 0,
    description: 'Schnelle Bolzen halten nahe Gegner unter ständigem Beschuss.',
  },
  runemortar: {
    name: 'Runenmörser',
    subtitle: 'Runen aus dem Himmel',
    type: 'arcane',
    color: '#9dc6f1',
    cost: 220,
    damage: 60,
    attacks: 0.5,
    range: 5.8,
    splash: 1.7,
    description: 'Arkane Granaten fliegen im Bogen und brechen gepanzerte Gruppen auf.',
  },
  prism: {
    name: 'Prismenlanze',
    subtitle: 'Reichweite trifft Magie',
    type: 'arcane',
    color: '#d79fe5',
    cost: 210,
    damage: 100,
    attacks: 0.35,
    range: 7.2,
    splash: 0,
    description: 'Ein anhaltender arkaner Laser verfolgt ein Ziel und verursacht kontinuierlich Schaden.',
  },
  ember: {
    name: 'Glutspucker',
    subtitle: 'Ein Funkenhagel',
    type: 'fire',
    color: '#ee8064',
    cost: 135,
    damage: 8,
    attacks: 3,
    range: 3.1,
    splash: 0,
    description: 'Ein schneller Strom einzelner Glutkugeln trifft Gegner auf kurze Entfernung.',
  },
  meteor: {
    name: 'Meteorturm',
    subtitle: 'Die Glut fällt herab',
    type: 'fire',
    color: '#ffb876',
    cost: 260,
    damage: 110,
    attacks: 0.28,
    range: 6.8,
    splash: 2.6,
    description: 'Schwere Feuerbrocken schlagen in weitem Bogen ein und verbrennen große Gruppen.',
  },
  inferno: {
    name: 'Brandbake',
    subtitle: 'Entfacht anhaltenden Brand',
    type: 'fire',
    color: '#ff9454',
    cost: 175,
    damage: 12,
    attacks: 0.7,
    range: 4.8,
    splash: 0,
    description:
      'Treffer entzünden das Ziel: 12 Feuerschaden pro Sekunde für 4 Sekunden. Erneute Treffer erneuern den Brand; er stapelt sich nicht.',
  },
  venom: {
    name: 'Giftkessel',
    subtitle: 'Vergiftet Gegnergruppen',
    type: 'poison',
    color: '#a5df69',
    cost: 200,
    damage: 8,
    attacks: 0.5,
    range: 5.4,
    splash: 1.5,
    description:
      'Giftphiolen treffen im Bogen: 8 Giftschaden pro Sekunde für 6 Sekunden auf alle Ziele im Einschlagsbereich. Gift und Brand wirken gleichzeitig.',
  },
  frost: {
    name: 'Frostobelisk',
    subtitle: 'Bremst den Ansturm',
    type: 'arcane',
    color: '#89e3f2',
    cost: 155,
    damage: 10,
    attacks: 0.8,
    range: 4.6,
    splash: 1.1,
    description:
      'Eissplitter verlangsamen Gegner im Einschlagsbereich für 2,5 Sekunden um 35 %. Nur die stärkste Verlangsamung wirkt.',
  },
} satisfies Record<
  TowerKind,
  {
    name: string;
    subtitle: string;
    type: DamageType;
    color: string;
    cost: number;
    damage: number;
    attacks: number;
    range: number;
    splash: number;
    description: string;
  }
>;
export const ENEMIES = {
  goblin: {
    name: 'Koboldläufer',
    hp: 45,
    speed: 2.1,
    reward: 14,
    damage: { physical: 4, arcane: 0, fire: 0, poison: 0 },
    defense: { physical: 0, arcane: 0, fire: 0, poison: 0 },
  },
  ogre: {
    name: 'Eisenoger',
    hp: 150,
    speed: 1.25,
    reward: 28,
    damage: { physical: 12, arcane: 0, fire: 0, poison: 0 },
    defense: { physical: 110, arcane: 5, fire: 20, poison: 15 },
  },
  wraith: {
    name: 'Runengeist',
    hp: 80,
    speed: 1.8,
    reward: 21,
    damage: { physical: 0, arcane: 8, fire: 0, poison: 0 },
    defense: { physical: 10, arcane: 130, fire: 0, poison: 50 },
  },
} satisfies Record<
  EnemyKind,
  { name: string; hp: number; speed: number; reward: number; damage: DamageValues; defense: DamageValues }
>;
export const DAMAGE_LABELS: Record<DamageType, string> = {
  physical: 'Physisch',
  arcane: 'Arkan',
  fire: 'Feuer',
  poison: 'Gift',
};
export interface TowerEffect {
  kind: 'burn' | 'poison' | 'slow';
  duration: number;
  dps: number;
  slow: number;
}
export function towerEffect(kind: TowerKind, level = 1, research = 0): TowerEffect | undefined {
  const multiplier = 1.62 ** (level - 1) * (1 + RESEARCH_GAINS[kind].damage * research);
  if (kind === 'inferno') return { kind: 'burn', duration: 4, dps: 12 * multiplier, slow: 0 };
  if (kind === 'venom') return { kind: 'poison', duration: 6, dps: 8 * multiplier, slow: 0 };
  if (kind === 'frost')
    return {
      kind: 'slow',
      duration: 2.5 + 0.2 * (level - 1),
      dps: 0,
      slow: Math.min(0.6, 0.35 + 0.04 * (level - 1) + 0.003 * research),
    };
}
export const FIRE_BREATH = { duration: 0.8 };
export const PRISM_BEAM = { duration: 1.2, durationPerLevel: 0.2, durationPerResearch: 0.04 };
export function towerStats(kind: TowerKind, level = 1, research = 0) {
  const b = TOWERS[kind],
    r = Math.max(0, Math.min(15, research)),
    gains = RESEARCH_GAINS[kind];
  return {
    ...b,
    beamDuration:
      kind === 'prism'
        ? PRISM_BEAM.duration + (level - 1) * PRISM_BEAM.durationPerLevel + r * PRISM_BEAM.durationPerResearch
        : 0,
    damage:
      Math.round(b.damage * (1 + gains.damage * r) * 1.62 ** (level - 1) * (r ? 100 : 1)) / (r ? 100 : 1),
    attacks: b.attacks * (1 + gains.attacks * r) * (1 + (level - 1) * 0.09),
    range: b.range * (1 + gains.range * r) + 0.22 * (level - 1),
    splash: b.splash * (1 + gains.splash * r),
    upgradeCost: level < 5 ? Math.round(b.cost * 0.8 * 1.65 ** (level - 1)) : 0,
  };
}
export function enemyStats(kind: EnemyKind, wave: number, teamSize = 1) {
  const b = ENEMIES[kind];
  const allies = Math.max(1, Math.min(BALANCE.maxPlayers, teamSize));
  const level = 1 + Math.floor((wave - 1) / 5);
  const multiplier = Math.min(
    Number.MAX_SAFE_INTEGER / 100,
    BALANCE.levelDamageGrowth ** (level - 1) * (1 + BALANCE.coopDamagePerPlayer * (allies - 1)),
  );
  return {
    ...b,
    level,
    hp: Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.round(
        b.hp *
          (1 + BALANCE.coopHealthPerPlayer * (allies - 1)) *
          BALANCE.waveHealthGrowth ** (wave - 1) *
          BALANCE.levelHealthGrowth ** (level - 1),
      ),
    ),
    speed: b.speed * Math.min(BALANCE.maxSpeedMultiplier, 1 + 0.012 * (wave - 1)),
    reward: Math.round(b.reward * (1 + 0.12 * (level - 1))) * allies,
    damage: {
      physical: b.damage.physical * multiplier,
      arcane: b.damage.arcane * multiplier,
      fire: b.damage.fire * multiplier,
    },
  };
}
export function damageAfterDefense(damage: number, defense: number) {
  return (damage * 100) / (100 + Math.max(0, defense));
}
export function waveComposition(wave: number): EnemyKind[] {
  return Array.from({ length: Math.min(BALANCE.maxEnemies, 7 + wave * 3) }, (_, i) =>
    wave >= 5 && i % 5 === 3 ? 'wraith' : wave >= 3 && i % 4 === 2 ? 'ogre' : 'goblin',
  );
}
export type Command = { id: string } & (
  | { action: 'build'; kind: TowerKind; x: number; z: number }
  | { action: 'upgrade' | 'sell'; towerId: string }
  | { action: 'startWave' | 'startGame' | 'restart' }
  | { action: 'ready'; ready: boolean }
  | { action: 'setName'; name: string }
  | { action: 'setMap'; mapId: MapId }
  | { action: 'setMission'; missionId: string }
  | { action: 'setLoadout'; loadout: TowerKind[]; xp?: number; research?: ResearchRanks }
  | { action: 'setSpeed'; speed: GameSpeed }
  | { action: 'setAutoStart'; enabled: boolean }
  | { action: 'setBuildZones'; mode: BuildMode; owners: string[] }
  | { action: 'ackIntroduction'; kind: EnemyKind }
);
export interface TowerView extends Point {
  research?: number;
  id: string;
  owner: string;
  kind: TowerKind;
  level: number;
  invested: number;
  angle: number;
}
export interface EnemyView extends Point {
  burn?: number;
  poison?: number;
  slow?: number;
  slowAmount?: number;
  routeId: string;
  teamSize: number;
  id: string;
  kind: EnemyKind;
  level: number;
  wave: number;
  progress: number;
  hp: number;
  maxHp: number;
  speed: number;
}
export interface PlayerView {
  xp?: number;
  research?: ResearchRanks;
  rewards?: Record<string, ProgressReward>;
  victories: Record<string, { hp: number; kills: number }>;
  completed: number;
  loadout: TowerKind[];
  name: string;
  color: number;
  introReady?: boolean;
  ready: boolean;
  id: string;
  gold: number;
  connected: boolean;
}
export interface GameView {
  ruleSet: 'endless' | 'campaign';
  missionId: string;
  mapId: MapId;
  mode: GameMode;
  lobby: boolean;
  hostId: string;
  teamSize: number;
  run: number;
  speed: GameSpeed;
  phase: 'preparing' | 'combat' | 'defeat' | 'victory';
  wave: number;
  completedWaves: number;
  baseHp: number;
  kills: number;
  autoStart: boolean;
  countdown: number;
  remaining: number;
  buildMode?: BuildMode;
  zoneOwners?: string[];
  introduction?: string;
  paused: boolean;
  towers: Record<string, TowerView>;
  enemies: Record<string, EnemyView>;
  projectiles: Record<string, ProjectileView>;
  players: Record<string, PlayerView>;
}
export interface ProjectileView extends Point3 {
  sourceId?: string;
  targetId?: string;
  id: string;
  kind: TowerKind;
  vx: number;
  vy: number;
  vz: number;
}
export interface ImpactEvent {
  projectileId: string;
  kind: TowerKind;
  at: Point3;
  splash: number;
}
export interface ShotEvent {
  kind: TowerKind;
  from: Point;
  to: Point;
  splash: number;
}
export interface CommandResult {
  id: string;
  ok: boolean;
  error?: string;
  towerId?: string;
}

export function sellRefund(invested: number) {
  return Math.floor((invested * BALANCE.sellPercent) / 100);
}

export const PROJECTILE_STYLE: Record<TowerKind, 'bolt' | 'arcane' | 'fire' | 'shell'> = {
  inferno: 'fire',
  venom: 'shell',
  frost: 'arcane',
  ballista: 'bolt',
  sniper: 'bolt',
  repeater: 'bolt',
  arcane: 'arcane',
  prism: 'arcane',
  fire: 'fire',
  ember: 'fire',
  grenade: 'shell',
  runemortar: 'shell',
  meteor: 'shell',
};

export * from './territories';

export * from './campaign-maps';

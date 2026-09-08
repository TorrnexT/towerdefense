import { schema, t, type SchemaType } from '@colyseus/schema';
import type { TowerKind, EnemyKind, GameSpeed, GameMode, MapId } from './index';
export const VictoryState = schema(
  { hp: t.number().default(0), kills: t.number().default(0) },
  'VictoryState',
);
export const RewardState = schema(
  {
    xp: t.number().default(100),
    research: t.number().default(50),
    missionId: t.string().default(''),
    wave: t.number().default(0),
  },
  'RewardState',
);
export const PlayerState = schema(
  {
    completed: t.number().default(0),
    xp: t.number().default(0),
    research: t.map('number'),
    rewards: t.map(RewardState),
    victories: t.map(VictoryState),
    loadout: t.array('string'),
    name: t.string().default('Hüter'),
    color: t.number().default(0),
    introReady: t.boolean().default(false),
    ready: t.boolean().default(false),
    id: t.string().default(''),
    gold: t.number().default(240),
    connected: t.boolean().default(true),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;
export const TowerState = schema(
  {
    id: t.string().default(''),
    owner: t.string().default(''),
    kind: t.string<TowerKind>().default('ballista'),
    level: t.number().default(1),
    research: t.number().default(0),
    invested: t.number().default(0),
    x: t.number().default(0),
    z: t.number().default(0),
    angle: t.number().default(0),
  },
  'TowerState',
);
export type TowerState = SchemaType<typeof TowerState>;
export const EnemyState = schema(
  {
    burn: t.number().default(0),
    poison: t.number().default(0),
    slow: t.number().default(0),
    slowAmount: t.number().default(0),
    id: t.string().default(''),
    kind: t.string<EnemyKind>().default('goblin'),
    routeId: t.string().default('main'),
    level: t.number().default(1),
    wave: t.number().default(1),
    teamSize: t.number().default(1),
    progress: t.number().default(0),
    hp: t.number().default(0),
    maxHp: t.number().default(0),
    speed: t.number().default(0),
    x: t.number().default(0),
    z: t.number().default(0),
  },
  'EnemyState',
);
export type EnemyState = SchemaType<typeof EnemyState>;
export const ProjectileState = schema(
  {
    sourceId: t.string().default(''),
    targetId: t.string().default(''),
    id: t.string().default(''),
    kind: t.string<TowerKind>().default('ballista'),
    x: t.number().default(0),
    y: t.number().default(0),
    z: t.number().default(0),
    vx: t.number().default(0),
    vy: t.number().default(0),
    vz: t.number().default(0),
  },
  'ProjectileState',
);
export type ProjectileState = SchemaType<typeof ProjectileState>;
export const GameState = schema(
  {
    ruleSet: t.string<'endless' | 'campaign'>().default('endless'),
    missionId: t.string().default(''),
    mapId: t.string<MapId>().default('waldtal'),
    mode: t.string<GameMode>().default('solo'),
    lobby: t.boolean().default(false),
    hostId: t.string().default(''),
    teamSize: t.number().default(1),
    run: t.number().default(0),
    phase: t.string().default('preparing'),
    speed: t.number<GameSpeed>().default(1),
    wave: t.number().default(0),
    completedWaves: t.number().default(0),
    baseHp: t.number().default(100),
    kills: t.number().default(0),
    autoStart: t.boolean().default(true),
    countdown: t.number().default(-1),
    remaining: t.number().default(0),
    buildMode: t.string<'all' | 'columns' | 'rows' | 'sectors'>().default('all'),
    zoneOwners: t.array('string'),
    introduction: t.string().default(''),
    paused: t.boolean().default(false),
    towers: t.map(TowerState),
    enemies: t.map(EnemyState),
    projectiles: t.map(ProjectileState),
    players: t.map(PlayerState),
  },
  'GameState',
);
export type GameState = SchemaType<typeof GameState>;

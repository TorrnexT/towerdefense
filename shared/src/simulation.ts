import { createId } from './index';
import {
  BALANCE,
  validXp,
  validResearch,
  REWARD_XP,
  REWARD_RESEARCH,
  PROJECTILE_STYLE,
  DEFAULT_LOADOUT,
  getMission,
  missionUnlocked,
  validCompleted,
  loadoutError,
  type RunOptions,
  type PlayerOptions,
  GAME_SPEEDS,
  PROJECTILES,
  ENEMY_COLLIDERS,
  type Point3,
  type DamageType,
  type ImpactEvent,
  TOWERS,
  ENEMIES,
  battleMap,
  isMapId,
  getRoute,
  damageAfterDefense,
  sellRefund,
  distance,
  enemyStats,
  pathPosition,
  buildError,
  BUILD_MODES,
  territoryError,
  towerStats,
  PRISM_BEAM,
  FIRE_BREATH,
  towerEffect,
  type TowerEffect,
  waveComposition,
  type Command,
  type CommandResult,
  type EnemyKind,
  type ShotEvent,
  type TowerKind,
} from './index';
import {
  GameState,
  PlayerState,
  VictoryState,
  RewardState,
  TowerState,
  EnemyState,
  ProjectileState,
} from './schema';

import { sweptSphere, lerpPoint } from './collision';

interface Flight {
  sourceId?: string;
  range?: number;
  effect?: TowerEffect;
  owner: string;
  targetId: string;
  damage: number;
  type: DamageType;
  splash: number;
  age: number;
  duration: number;
  from: Point3;
  destination: Point3;
}
export class Simulation {
  state = new GameState();
  /** Enabled by interactive session adapters; headless simulations can omit presentations. */
  introductionsEnabled = false;
  private introduced = new Set<EnemyKind>();
  private pauseReasons = new Set<string>();
  /** Code-only pause API. Independent reasons cannot accidentally resume one another. */
  setPaused(reason: string, paused: boolean) {
    if (paused) this.pauseReasons.add(reason);
    else this.pauseReasons.delete(reason);
    this.refreshPause();
  }
  private refreshPause() {
    const s = this.state;
    if (s.introduction && s.players.size && [...s.players.values()].every((p) => p.introReady))
      s.introduction = '';
    s.paused =
      !!s.introduction || this.pauseReasons.size > 0 || ![...s.players.values()].some((p) => p.connected);
    if (s.paused) this.accumulator = 0;
  }
  constructor(options: RunOptions = {}) {
    this.configure(options);
  }
  configure(options: RunOptions) {
    if (options.ruleSet !== undefined && !['endless', 'campaign'].includes(options.ruleSet))
      throw new Error('Unbekannter Spielmodus.');
    if (options.mapId !== undefined && !isMapId(options.mapId)) throw new Error('Unbekannte Karte.');
    this.state.ruleSet = options.ruleSet || 'endless';
    if (this.state.ruleSet === 'campaign') {
      const mission = getMission(options.missionId);
      if (!mission) throw new Error('Unbekannte Mission.');
      this.state.missionId = mission.id;
      this.state.mapId = mission.mapId;
    } else {
      if (options.missionId) throw new Error('Eine Mission gehört zur Kampagne.');
      this.state.missionId = '';
      this.state.mapId = options.mapId || 'waldtal';
    }
  }
  get mission() {
    return getMission(this.state.missionId);
  }
  private finished() {
    return ['victory', 'defeat'].includes(this.state.phase);
  }
  private rewardRun = createId();
  private sequence = 0;
  private accumulator = 0;
  private cooldowns = new Map<string, number>();
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;
  private routeSequence = 0;
  get map() {
    return battleMap(this.state);
  }
  private receipts = new Map<string, CommandResult>();
  private ailments = new Map<
    string,
    Partial<Record<'burn' | 'poison', { remaining: number; dps: number; owner: string }>>
  >();
  private flights = new Map<string, Flight>();
  onImpact: (impact: ImpactEvent) => void = () => {};
  onShot: (shot: ShotEvent) => void = () => {};
  addPlayer(id: string, name: unknown = 'Hüter', options: PlayerOptions = {}) {
    const completed = options.completed === undefined ? 0 : options.completed;
    if (!validCompleted(completed)) throw new Error('Ungültiger Fortschritt.');
    if (
      (!this.state.lobby || !this.state.players.size) &&
      this.mission &&
      !missionUnlocked(this.mission.id, completed)
    )
      throw new Error('Diese Mission ist noch gesperrt.');
    const loadout = options.loadout === undefined ? DEFAULT_LOADOUT : options.loadout;
    const xp = options.xp === undefined ? completed * 100 : options.xp;
    const research = options.research === undefined ? {} : options.research;
    if (!validXp(xp) || !validResearch(research, xp)) throw new Error('Ungültige Forschung oder Erfahrung.');
    const error = loadoutError(loadout, completed, xp);
    if (error) throw new Error(error);
    const p = new PlayerState();
    p.id = id;
    p.completed = completed;
    p.xp = xp;
    for (const [kind, rank] of Object.entries(research)) p.research.set(kind, rank);
    p.loadout.push(...loadout);
    p.name =
      typeof name === 'string'
        ? name
            .normalize('NFKC')
            .replace(/[\p{C}]/gu, '')
            .trim()
            .slice(0, 20) || 'Hüter'
        : 'Hüter';
    p.color =
      [0, 1, 2, 3].find((color) => ![...this.state.players.values()].some((p) => p.color === color)) ?? 0;
    if (!this.state.hostId) this.state.hostId = id;
    p.gold = BALANCE.startGold;
    this.state.players.set(id, p);
    if (this.state.lobby) this.resetZoneRoster();
    if (this.state.lobby) for (const member of this.state.players.values()) member.ready = false;
    this.updatePresence();
  }
  private resetZoneRoster() {
    const s = this.state;
    s.zoneOwners.splice(
      0,
      s.zoneOwners.length,
      ...[...s.players.values()].sort((a, b) => a.color - b.color).map((p) => p.id),
    );
    for (const p of s.players.values()) p.ready = false;
  }
  updatePresence() {
    const s = this.state;
    const connected = [...s.players.values()].filter((p) => p.connected);
    if (!s.players.get(s.hostId)?.connected) s.hostId = connected[0]?.id || s.hostId;
    this.refreshPause();
  }
  removePlayer(id: string) {
    const s = this.state,
      player = s.players.get(id);
    s.players.delete(id);
    this.updatePresence();
    // A reserved, disconnected member can inherit too, so an empty room can recover.
    if (!s.players.has(s.hostId)) s.hostId = [...s.players.keys()][0] || '';
    const heir = s.players.get(s.hostId);
    if (s.lobby) this.resetZoneRoster();
    else if (heir)
      for (let i = 0; i < s.zoneOwners.length; i++) if (s.zoneOwners[i] === id) s.zoneOwners[i] = heir.id;
    if (s.mode === 'coop' && !s.lobby && heir && player) {
      heir.gold += player.gold;
      for (const tower of s.towers.values()) if (tower.owner === id) tower.owner = heir.id;
      for (const flight of this.flights.values()) if (flight.owner === id) flight.owner = heir.id;
      for (const effects of this.ailments.values())
        for (const effect of Object.values(effects)) if (effect.owner === id) effect.owner = heir.id;
    }
  }
  private restart() {
    this.rewardRun = createId();
    const s = this.state;
    s.towers.clear();
    s.enemies.clear();
    s.projectiles.clear();
    this.cooldowns.clear();
    this.flights.clear();
    this.ailments.clear();
    this.queue = [];
    this.introduced.clear();
    s.introduction = '';
    this.accumulator = 0;
    this.spawnTimer = 0;
    s.phase = 'preparing';
    s.wave = 0;
    s.completedWaves = 0;
    s.kills = 0;
    s.baseHp = BALANCE.baseHp;
    s.countdown = -1;
    s.remaining = 0;
    s.speed = 1;
    s.teamSize = 1;
    s.lobby = s.mode === 'coop';
    s.run++;
    this.resetZoneRoster();
    for (const p of s.players.values()) {
      p.gold = BALANCE.startGold;
      p.ready = false;
      p.introReady = false;
    }
    this.refreshPause();
  }
  command(playerId: string, raw: unknown): CommandResult {
    const invalid = (id = '', error = 'Ungültiger Befehl.'): CommandResult => ({ id, ok: false, error });
    if (!raw || typeof raw !== 'object') return invalid();
    const c = raw as Command;
    if (typeof c.id !== 'string' || c.id.length < 1 || c.id.length > 80) return invalid();
    const key = playerId + ':' + c.id;
    const old = this.receipts.get(key);
    if (old) return old;
    let result: CommandResult;
    const player = this.state.players.get(playerId);
    if (c.action === 'ackIntroduction') {
      if (!player?.connected || !this.state.introduction || c.kind !== this.state.introduction)
        return invalid(c.id, 'Diese Gegnervorstellung ist nicht aktiv.');
      player.introReady = true;
      this.refreshPause();
      const result = { id: c.id, ok: true };
      this.receipts.set(key, result);
      return result;
    }
    if (!player || !player.connected || this.state.paused)
      result = invalid(c.id, 'Das Spiel ist gerade pausiert.');
    else if (
      this.state.mode === 'coop' &&
      [
        'startGame',
        'startWave',
        'setAutoStart',
        'setBuildZones',
        'setSpeed',
        'restart',
        'setMap',
        'setMission',
      ].includes(c.action) &&
      playerId !== this.state.hostId
    )
      result = invalid(c.id, 'Das kann nur der Host.');
    else if (c.action === 'restart' && this.finished()) {
      this.restart();
      result = { id: c.id, ok: true };
    } else if (this.finished()) result = invalid(c.id, 'Dieser Durchlauf ist beendet.');
    else if (
      c.action === 'setMap' &&
      this.state.ruleSet === 'endless' &&
      this.state.mode === 'coop' &&
      this.state.lobby
    ) {
      if (!isMapId(c.mapId)) result = invalid(c.id, 'Unbekannte Karte.');
      else {
        if (this.state.mapId !== c.mapId) {
          this.state.mapId = c.mapId;
          this.routeSequence = 0;
          for (const p of this.state.players.values()) p.ready = false;
        }
        result = { id: c.id, ok: true };
      }
    } else if (c.action === 'setMission' && this.state.ruleSet === 'campaign' && this.state.lobby) {
      const mission = getMission(c.missionId);
      if (
        !mission ||
        [...this.state.players.values()].some((p) => !missionUnlocked(c.missionId, p.completed))
      )
        result = invalid(c.id, 'Diese Mission muss für alle Hüter freigeschaltet sein.');
      else {
        if (this.state.missionId !== mission.id) {
          this.state.missionId = mission.id;
          this.state.mapId = mission.mapId;
          for (const p of this.state.players.values()) p.ready = false;
        }
        result = { id: c.id, ok: true };
      }
    } else if (c.action === 'setLoadout' && this.state.lobby) {
      const xp = c.xp === undefined ? player.xp : c.xp;
      const research = c.research === undefined ? Object.fromEntries(player.research) : c.research;
      const error =
        !validXp(xp) || !validResearch(research, xp)
          ? 'Ungültige Forschung oder Erfahrung.'
          : loadoutError(c.loadout, player.completed, xp);
      if (error) result = invalid(c.id, error);
      else {
        if (
          player.xp !== xp ||
          JSON.stringify(Object.fromEntries(player.research)) !== JSON.stringify(research) ||
          JSON.stringify([...player.loadout]) !== JSON.stringify(c.loadout)
        ) {
          player.xp = xp;
          player.research.clear();
          for (const [kind, rank] of Object.entries(research)) player.research.set(kind, rank);
          player.loadout.splice(0, player.loadout.length, ...c.loadout);
          player.ready = false;
        }
        result = { id: c.id, ok: true };
      }
    } else if (c.action === 'setName' && this.state.lobby) {
      if (typeof c.name !== 'string' || c.name.length > 100) result = invalid(c.id);
      else {
        player.name =
          c.name
            .normalize('NFKC')
            .replace(/[\p{C}]/gu, '')
            .trim()
            .slice(0, 20) || 'Hüter';
        result = { id: c.id, ok: true };
      }
    } else if (c.action === 'ready' && this.state.lobby) {
      if (typeof c.ready !== 'boolean') result = invalid(c.id);
      else if (c.ready && this.mission && !missionUnlocked(this.mission.id, player.completed))
        result = invalid(c.id, 'Diese Mission ist noch gesperrt.');
      else {
        player.ready = c.ready;
        result = { id: c.id, ok: true };
      }
    } else if (c.action === 'setBuildZones') {
      const s = this.state;
      if (s.mode !== 'coop' || !s.lobby)
        result = invalid(c.id, 'Baugebiete können nur in der Koop-Lobby geändert werden.');
      else if (
        !Object.hasOwn(BUILD_MODES, c.mode) ||
        !Array.isArray(c.owners) ||
        c.owners.length !== s.players.size ||
        new Set(c.owners).size !== c.owners.length ||
        c.owners.some((id) => !s.players.has(id))
      )
        result = invalid(c.id, 'Ungültige Baugebiete oder Spielerzuordnung.');
      else {
        if (s.buildMode !== c.mode || JSON.stringify([...s.zoneOwners]) !== JSON.stringify(c.owners)) {
          s.buildMode = c.mode;
          s.zoneOwners.splice(0, s.zoneOwners.length, ...c.owners);
          for (const p of s.players.values()) p.ready = false;
        }
        result = { id: c.id, ok: true };
      }
    } else if (c.action === 'startGame' && this.state.lobby) {
      if (
        [...this.state.players.values()].some(
          (p) =>
            !p.ready ||
            !p.connected ||
            !!loadoutError([...p.loadout], p.completed, p.xp) ||
            (this.mission && !missionUnlocked(this.mission.id, p.completed)),
        )
      )
        result = invalid(c.id, 'Alle Hüter müssen verbunden und bereit sein.');
      else {
        this.state.lobby = false;
        this.state.teamSize = this.state.players.size;
        result = { id: c.id, ok: true };
      }
    } else if (this.state.lobby) result = invalid(c.id, 'Die Gruppe ist noch in der Lobby.');
    else if (c.action === 'build') {
      if (!Object.hasOwn(TOWERS, c.kind)) result = invalid(c.id);
      else if (!player.loadout.includes(c.kind))
        result = invalid(c.id, 'Diesen Turm hast du nicht mitgenommen.');
      else {
        const def = TOWERS[c.kind as TowerKind];
        const error =
          (this.state.mode === 'coop'
            ? territoryError(c, this.map, this.state.buildMode, [...this.state.zoneOwners], playerId)
            : null) || buildError(c.kind, c, this.state.towers.values(), this.map, player.gold);
        if (error) result = invalid(c.id, error);
        else {
          const t = new TowerState();
          t.id = 't' + ++this.sequence;
          t.owner = playerId;
          t.kind = c.kind;
          t.research = player.research.get(c.kind) || 0;
          t.x = c.x;
          t.z = c.z;
          t.invested = def.cost;
          player.gold -= def.cost;
          this.state.towers.set(t.id, t);
          result = { id: c.id, ok: true, towerId: t.id };
        }
      }
    } else if (c.action === 'upgrade' || c.action === 'sell') {
      const t = this.state.towers.get(c.towerId);
      if (!t || t.owner !== playerId) result = invalid(c.id, 'Dieser Turm gehört dir nicht.');
      else if (c.action === 'sell') {
        player.gold += sellRefund(t.invested);
        this.state.towers.delete(t.id);
        this.cooldowns.delete(t.id);
        for (const p of this.state.projectiles.values()) if (p.sourceId === t.id) this.removeProjectile(p.id);
        result = { id: c.id, ok: true };
      } else {
        const cost = towerStats(t.kind, t.level, t.research).upgradeCost;
        if (t.level >= BALANCE.maxTowerLevel) result = invalid(c.id, 'Maximale Stufe erreicht.');
        else if (player.gold < cost) result = invalid(c.id, 'Nicht genug Gold.');
        else {
          player.gold -= cost;
          t.invested += cost;
          t.level++;
          result = { id: c.id, ok: true, towerId: t.id };
        }
      }
    } else if (c.action === 'setAutoStart') {
      if (typeof c.enabled !== 'boolean') result = invalid(c.id, 'Ungültiger Wellenstart-Modus.');
      else {
        if (this.state.autoStart !== c.enabled) {
          this.state.autoStart = c.enabled;
          if (this.state.phase === 'preparing')
            this.state.countdown = c.enabled && this.state.wave > 0 ? BALANCE.buildPause : -1;
        }
        result = { id: c.id, ok: true };
      }
    } else if (c.action === 'setSpeed') {
      if (!GAME_SPEEDS.includes(c.speed)) result = invalid(c.id, 'Ungültige Spielgeschwindigkeit.');
      else {
        this.state.speed = c.speed;
        result = { id: c.id, ok: true };
      }
    } else if (c.action === 'startWave') {
      if (this.state.phase !== 'preparing') result = invalid(c.id, 'Die aktuelle Welle läuft noch.');
      else {
        this.startWave();
        result = { id: c.id, ok: true };
      }
    } else result = invalid(c.id);
    this.receipts.set(key, result);
    if (this.receipts.size > 2048) this.receipts.delete(this.receipts.keys().next().value!);
    return result;
  }
  private startWave() {
    const s = this.state;
    s.wave++;
    s.phase = 'combat';
    s.countdown = 0;
    this.queue = waveComposition(s.wave);
    this.routeSequence = 0;
    s.remaining = this.queue.length;
    this.spawnTimer = 0;
  }
  spawn(kind: EnemyKind) {
    const stats = enemyStats(kind, this.state.wave, this.state.teamSize);
    const e = new EnemyState();
    e.id = 'e' + ++this.sequence;
    e.kind = kind;
    e.routeId = this.map.routes[this.routeSequence++ % this.map.routes.length].id;
    e.wave = this.state.wave;
    e.teamSize = this.state.teamSize;
    e.level = stats.level;
    e.hp = Math.round(stats.hp * (this.mission?.healthMultiplier ?? 1));
    e.maxHp = e.hp;
    e.speed = stats.speed;
    Object.assign(e, pathPosition(0, this.map, e.routeId));
    this.state.enemies.set(e.id, e);
    return e;
  }
  /** Real-time driver: speed changes the number of fixed steps, never collision step size. */
  advance(realSeconds: number) {
    if (!Number.isFinite(realSeconds) || realSeconds <= 0) return;
    if (this.state.paused || this.finished() || !this.state.players.size) {
      this.accumulator = 0;
      return;
    }
    this.accumulator += Math.min(realSeconds, 0.25) * this.state.speed;
    while (this.accumulator + 1e-9 >= BALANCE.tick) {
      this.accumulator = Math.max(0, this.accumulator - BALANCE.tick);
      this.step();
      if (this.finished() || this.state.paused) {
        this.accumulator = 0;
        break;
      }
    }
  }
  step(dt = BALANCE.tick as number) {
    const s = this.state;
    if (s.lobby || s.paused || this.finished() || !s.players.size) return;
    if (s.phase === 'preparing') {
      if (s.autoStart && s.countdown >= 0) {
        s.countdown = Math.max(0, s.countdown - dt);
        if (s.countdown <= 0) this.startWave();
      }
      return;
    }
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0) {
      const kind = this.queue.shift()!;
      this.spawn(kind);
      this.spawnTimer += BALANCE.enemySpawnInterval;
      if (this.introductionsEnabled && !this.introduced.has(kind)) {
        this.introduced.add(kind);
        s.introduction = kind;
        for (const player of s.players.values()) player.introReady = false;
        this.refreshPause();
        return;
      }
    }
    this.tickAilments(dt);
    // Move targets first, retaining their old positions for relative swept collisions.
    const previous = new Map<string, Point3>();
    for (const e of s.enemies.values()) {
      previous.set(e.id, { x: e.x, y: ENEMY_COLLIDERS[e.kind].height, z: e.z });
      e.progress += e.speed * (1 - e.slowAmount * Math.min(1, e.slow / dt)) * dt;
      e.slow = Math.max(0, e.slow - dt);
      if (!e.slow) e.slowAmount = 0;
      Object.assign(e, pathPosition(e.progress, this.map, e.routeId));
    }
    this.moveProjectiles(dt, previous);
    for (const e of s.enemies.values()) {
      if (e.progress >= getRoute(this.map, e.routeId).length) {
        const damage = enemyStats(e.kind, e.wave, e.teamSize).damage;
        s.baseHp = Math.max(
          0,
          s.baseHp - Object.values(damage).reduce((a, b) => a + b, 0) * (this.mission?.damageMultiplier ?? 1),
        );
        s.enemies.delete(e.id);
        this.ailments.delete(e.id);
        if (s.baseHp <= 0) {
          s.phase = 'defeat';
          s.countdown = 0;
          s.projectiles.clear();
          this.flights.clear();
          this.ailments.clear();
          for (const remaining of s.enemies.values()) {
            remaining.burn = remaining.poison = remaining.slow = remaining.slowAmount = 0;
          }
          break;
        }
      }
    }
    if (s.phase === 'combat')
      for (const t of s.towers.values()) {
        const cooldown = (this.cooldowns.get(t.id) ?? 0) - dt;
        this.cooldowns.set(t.id, cooldown);
        if (cooldown > 0 || s.projectiles.size >= BALANCE.maxProjectiles) continue;
        const stats = towerStats(t.kind, t.level, t.research);
        let target: EnemyState | undefined;
        for (const e of s.enemies.values())
          if (
            distance(t, e) <= stats.range &&
            (!target ||
              getRoute(this.map, e.routeId).length - e.progress <
                getRoute(this.map, target.routeId).length - target.progress)
          )
            target = e;
        if (!target) continue;
        this.cooldowns.set(
          t.id,
          t.kind === 'prism'
            ? Math.max(1 / stats.attacks, stats.beamDuration + 0.25)
            : t.kind === 'fire'
              ? Math.max(1 / stats.attacks, FIRE_BREATH.duration + 0.1)
              : 1 / stats.attacks,
        );
        this.launch(t, target);
      }
    s.remaining = this.queue.length + s.enemies.size;
    if (s.phase === 'combat' && s.remaining === 0 && s.projectiles.size === 0) {
      s.completedWaves = s.wave;
      if ((!this.mission && s.wave % 10 === 0) || (this.mission && s.wave >= this.mission.waves)) {
        const id = `${this.rewardRun}:${s.wave}`;
        for (const p of s.players.values()) {
          if (p.rewards.has(id)) continue;
          const reward = new RewardState();
          reward.xp = REWARD_XP;
          reward.research = REWARD_RESEARCH;
          reward.missionId = s.missionId;
          reward.wave = s.wave;
          p.rewards.set(id, reward);
          p.xp += REWARD_XP;
        }
      }
      if (this.mission && s.wave >= this.mission.waves) {
        s.phase = 'victory';
        s.countdown = 0;
        for (const p of s.players.values()) {
          if (p.completed === this.mission.number - 1) p.completed++;
          const award = p.victories.get(this.mission.id) || new VictoryState();
          award.hp = Math.max(award.hp, s.baseHp);
          award.kills = Math.max(award.kills, s.kills);
          p.victories.set(this.mission.id, award);
        }
      } else {
        s.phase = 'preparing';
        s.countdown = s.autoStart ? BALANCE.buildPause : -1;
      }
    }
  }
  private hurt(e: EnemyState, damage: number, type: DamageType, ownerId: string) {
    const s = this.state;
    if (!s.enemies.has(e.id)) return;
    e.hp = Math.max(0, e.hp - damageAfterDefense(damage, ENEMIES[e.kind].defense[type]));
    if (e.hp > 0) return;
    s.enemies.delete(e.id);
    this.ailments.delete(e.id);
    s.kills++;
    const reward = enemyStats(e.kind, e.wave, e.teamSize).reward;
    if (s.mode === 'coop') {
      const members = [...s.players.values()],
        share = Math.floor(reward / members.length);
      for (let i = 0; i < members.length; i++)
        members[(i + s.kills) % members.length].gold += share + (i < reward % members.length ? 1 : 0);
    } else {
      const owner = s.players.get(ownerId);
      if (owner) owner.gold += reward;
    }
  }
  private applyEffect(e: EnemyState, effect: TowerEffect, owner: string) {
    if (effect.kind === 'slow') {
      if (effect.slow >= e.slowAmount) {
        e.slowAmount = effect.slow;
        e.slow = effect.duration;
      }
      return;
    }
    const effects = this.ailments.get(e.id) || {},
      old = effects[effect.kind];
    // One instance per damage type: stronger hits replace, equal hits refresh; weak hits cannot prolong a stronger dose.
    if (!old || effect.dps >= old.dps) {
      effects[effect.kind] = { remaining: effect.duration, dps: effect.dps, owner };
      e[effect.kind] = effect.duration;
      this.ailments.set(e.id, effects);
    }
  }
  private tickAilments(dt: number) {
    for (const [id, effects] of this.ailments) {
      const e = this.state.enemies.get(id);
      if (!e) {
        this.ailments.delete(id);
        continue;
      }
      for (const kind of ['burn', 'poison'] as const) {
        const effect = effects[kind];
        if (!effect) continue;
        this.hurt(
          e,
          effect.dps * Math.min(dt, effect.remaining),
          kind === 'burn' ? 'fire' : 'poison',
          effect.owner,
        );
        effect.remaining = Math.max(0, effect.remaining - dt);
        e[kind] = effect.remaining;
        if (!this.state.enemies.has(id)) break;
        if (effect.remaining < 1e-8) {
          delete effects[kind];
          e[kind] = 0;
        }
      }
      if (!Object.keys(effects).length) this.ailments.delete(id);
    }
  }
  private launch(t: TowerState, target: EnemyState) {
    const stats = towerStats(t.kind, t.level, t.research),
      config = PROJECTILES[t.kind];
    const p = new ProjectileState();
    p.id = 'p' + ++this.sequence;
    p.kind = t.kind;
    p.x = t.x;
    p.y = (t.kind === 'arcane' ? 2.05 : 1.8) + (t.level >= 3 ? 0.2 : 0);
    p.z = t.z;
    const from = { x: p.x, y: p.y, z: p.z };
    if (t.kind === 'fire') {
      const angle = Math.atan2(target.x - t.x, target.z - t.z);
      t.angle = angle;
      p.sourceId = t.id;
      p.vx = Math.sin(angle) * stats.range;
      p.vz = Math.cos(angle) * stats.range;
      p.vy = stats.splash;
      this.flights.set(p.id, {
        sourceId: t.id,
        range: stats.range,
        owner: t.owner,
        targetId: target.id,
        damage: stats.damage / FIRE_BREATH.duration,
        type: 'fire',
        splash: stats.splash,
        age: 0,
        duration: FIRE_BREATH.duration,
        from,
        destination: { x: p.vx, y: 0, z: p.vz },
      });
      this.state.projectiles.set(p.id, p);
      this.onShot({ kind: t.kind, from, to: target, splash: stats.splash });
      return;
    }
    if (t.kind === 'prism') {
      p.sourceId = t.id;
      p.targetId = target.id;
      t.angle = Math.atan2(target.x - t.x, target.z - t.z);
      this.flights.set(p.id, {
        sourceId: t.id,
        range: stats.range,
        owner: t.owner,
        targetId: target.id,
        damage: stats.damage / PRISM_BEAM.duration,
        type: stats.type,
        splash: 0,
        age: 0,
        duration: stats.beamDuration,
        from,
        destination: { x: target.x, y: ENEMY_COLLIDERS[target.kind].height, z: target.z },
      });
      this.state.projectiles.set(p.id, p);
      this.onShot({ kind: t.kind, from, to: target, splash: 0 });
      return;
    }
    const grenade = PROJECTILE_STYLE[t.kind] === 'shell';
    let destination = { x: target.x, y: grenade ? 0.12 : ENEMY_COLLIDERS[target.kind].height, z: target.z };
    let duration = 0;
    // Aim ahead along the actual path. Bolts and grenades do not steer after launch.
    for (let i = 0; i < 4; i++) {
      duration =
        Math.hypot(destination.x - from.x, destination.y - from.y, destination.z - from.z) / config.speed;
      if (grenade)
        duration = Math.max(BALANCE.grenadeMinFlight, Math.min(BALANCE.grenadeMaxFlight, duration));
      if (!config.homing)
        destination = {
          ...destination,
          ...pathPosition(
            target.progress + target.speed * (duration - target.slowAmount * Math.min(duration, target.slow)),
            this.map,
            target.routeId,
          ),
        };
    }
    const length = Math.hypot(destination.x - p.x, destination.y - p.y, destination.z - p.z) || 1;
    p.vx = ((destination.x - p.x) / length) * config.speed;
    p.vy = ((destination.y - p.y) / length) * config.speed;
    p.vz = ((destination.z - p.z) / length) * config.speed;
    if (grenade) {
      p.vx = (destination.x - p.x) / duration;
      p.vy = (destination.y - p.y + 4 * BALANCE.grenadeArc) / duration;
      p.vz = (destination.z - p.z) / duration;
    }
    t.angle = Math.atan2(destination.x - t.x, destination.z - t.z);
    // Damage and ownership belong to the fired projectile, even after upgrades or a sale.
    this.flights.set(p.id, {
      owner: t.owner,
      targetId: target.id,
      damage: stats.damage,
      effect: towerEffect(t.kind, t.level, t.research),
      type: stats.type,
      splash: stats.splash,
      age: 0,
      duration,
      from,
      destination,
    });
    this.state.projectiles.set(p.id, p);
    this.onShot({ kind: t.kind, from, to: destination, splash: stats.splash });
  }
  private removeProjectile(id: string) {
    this.state.projectiles.delete(id);
    this.flights.delete(id);
  }
  private moveProjectiles(dt: number, previous: Map<string, Point3>) {
    const s = this.state;
    for (const p of s.projectiles.values()) {
      const f = this.flights.get(p.id)!;
      if (p.kind === 'fire') {
        if (!s.towers.has(f.sourceId!)) {
          this.removeProjectile(p.id);
          continue;
        }
        const elapsed = Math.min(dt, Math.max(0, f.duration - f.age));
        for (const enemy of [...s.enemies.values()]) {
          if (enemy.progress >= getRoute(this.map, enemy.routeId).length) continue;
          const dx = enemy.x - p.x,
            dz = enemy.z - p.z;
          const forward = (dx * p.vx + dz * p.vz) / f.range!;
          const side = Math.abs(dx * p.vz - dz * p.vx) / f.range!;
          if (forward >= 0 && Math.hypot(dx, dz) <= f.range! && side <= (forward / f.range!) * f.splash)
            this.hurt(enemy, f.damage * elapsed, 'fire', f.owner);
        }
        f.age += elapsed;
        if (f.age >= f.duration - 1e-9) this.removeProjectile(p.id);
        continue;
      }
      if (p.kind === 'prism') {
        const source = s.towers.get(f.sourceId!),
          target = s.enemies.get(f.targetId);
        if (
          !source ||
          !target ||
          target.progress >= getRoute(this.map, target.routeId).length ||
          distance(source, target) > f.range!
        ) {
          this.removeProjectile(p.id);
          continue;
        }
        source.angle = Math.atan2(target.x - source.x, target.z - source.z);
        const elapsed = Math.min(dt, Math.max(0, f.duration - f.age));
        this.hurt(target, f.damage * elapsed, f.type, f.owner);
        f.age += elapsed;
        if (f.age >= f.duration - 1e-9 || !s.enemies.has(target.id)) this.removeProjectile(p.id);
        continue;
      }
      const config = PROJECTILES[p.kind];
      const from = { x: p.x, y: p.y, z: p.z };
      const target = s.enemies.get(f.targetId);
      if (config.homing && target) {
        const dx = target.x - p.x,
          dy = ENEMY_COLLIDERS[target.kind].height - p.y,
          dz = target.z - p.z;
        const length = Math.hypot(dx, dy, dz) || 1;
        p.vx = (dx / length) * config.speed;
        p.vy = (dy / length) * config.speed;
        p.vz = (dz / length) * config.speed;
      }
      f.age += dt;
      let to: Point3;
      const grenade = PROJECTILE_STYLE[p.kind] === 'shell';
      if (grenade) {
        const u = Math.min(1, f.age / f.duration);
        to = lerpPoint(f.from, f.destination, u);
        to.y += 4 * BALANCE.grenadeArc * u * (1 - u);
        p.vy = (f.destination.y - f.from.y + 4 * BALANCE.grenadeArc * (1 - 2 * u)) / f.duration;
      } else to = { x: p.x + p.vx * dt, y: p.y + p.vy * dt, z: p.z + p.vz * dt };
      let hit: EnemyState | undefined;
      let contact = 1;
      for (const e of s.enemies.values()) {
        const collider = ENEMY_COLLIDERS[e.kind];
        const end = { x: e.x, y: collider.height, z: e.z };
        const fraction = sweptSphere(
          from,
          to,
          previous.get(e.id) || end,
          end,
          collider.radius + config.radius,
        );
        if (fraction !== null && (!hit || fraction < contact)) {
          contact = fraction;
          hit = e;
        }
      }
      // Shells also detonate at their ground destination, even if the original target died.
      const ground = grenade && f.age >= f.duration;
      if (hit || ground) {
        const at = hit ? lerpPoint(from, to, contact) : to;
        for (const e of [...s.enemies.values()]) {
          const end = { x: e.x, y: ENEMY_COLLIDERS[e.kind].height, z: e.z };
          const position = hit ? lerpPoint(previous.get(e.id) || end, end, contact) : end;
          if (e.id !== hit?.id && (!f.splash || distance(position, at) > f.splash)) continue;
          this.hurt(e, f.damage, f.type, f.owner);
          if (s.enemies.has(e.id) && f.effect) this.applyEffect(e, f.effect, f.owner);
        }
        this.removeProjectile(p.id);
        this.onImpact({ projectileId: p.id, kind: p.kind, at, splash: f.splash });
      } else if (
        f.age >= BALANCE.projectileLifetime ||
        to.y < 0 ||
        Math.abs(to.x) > this.map.width ||
        Math.abs(to.z) > this.map.depth
      ) {
        this.removeProjectile(p.id);
      } else Object.assign(p, to);
    }
  }
}

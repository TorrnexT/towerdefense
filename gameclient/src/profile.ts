import {
  DEFAULT_LOADOUT,
  TOWERS,
  validXp,
  validResearch,
  availableResearch,
  researchCost,
  MAX_RESEARCH_RANK,
  REWARD_XP,
  REWARD_RESEARCH,
  type ResearchRanks,
  type ProgressReward,
  MAP_IDS,
  MISSIONS,
  getMission,
  loadoutError,
  validCompleted,
  type GameView,
  type MapId,
  type TowerKind,
} from '@emberwatch/shared';
export interface Profile {
  version: 1;
  xp: number;
  research: ResearchRanks;
  claimed: string[];
  completed: number;
  loadout: TowerKind[];
  records: Record<MapId, number>;
  missions: Record<string, { hp: number; kills: number }>;
  statistics: Record<string, { kills: number; waves: number; victory: boolean }>;
}
export const PROFILE_KEY = 'emberwatch-profile-v1',
  BACKUP_KEY = PROFILE_KEY + '-backup';
export const freshProfile = (): Profile => ({
  version: 1,
  xp: 0,
  research: {},
  claimed: [],
  completed: 0,
  loadout: [...DEFAULT_LOADOUT],
  records: Object.fromEntries(MAP_IDS.map((id) => [id, 0])) as Record<MapId, number>,
  missions: {},
  statistics: {},
});
const encode = (value: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < value.length; i += 32768)
    binary += String.fromCharCode(...value.subarray(i, i + 32768));
  return btoa(binary);
};
const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
function validate(value: unknown): Profile {
  const p = value as Profile;
  if (p && p.statistics === undefined) p.statistics = {};
  if (!p?.statistics || typeof p.statistics !== 'object' || Array.isArray(p.statistics))
    throw new Error('Ungültige Statistik.');
  for (const [id, r] of Object.entries(p.statistics))
    if (
      id.length > 160 ||
      !r ||
      !Number.isSafeInteger(r.kills) ||
      r.kills < 0 ||
      !Number.isSafeInteger(r.waves) ||
      r.waves < 0 ||
      typeof r.victory !== 'boolean'
    )
      throw new Error('Ungültige Statistik.');
  // Older encrypted saves derived all experience from campaign first wins.
  if (p && p.xp === undefined && p.research === undefined && p.claimed === undefined) {
    p.xp = p.completed * 100;
    p.research = {};
    p.claimed = [];
  }
  if (
    !p ||
    p.version !== 1 ||
    !validCompleted(p.completed) ||
    !validXp(p.xp) ||
    !validResearch(p.research, p.xp) ||
    !Array.isArray(p.claimed) ||
    p.claimed.some((id) => typeof id !== 'string' || id.length > 100) ||
    new Set(p.claimed).size !== p.claimed.length ||
    loadoutError(p.loadout, p.completed, p.xp) ||
    !p.records ||
    !p.missions
  )
    throw new Error('Ungültiger Spielstand.');
  for (const id of MAP_IDS)
    if (!Number.isSafeInteger(p.records[id]) || p.records[id] < 0) throw new Error('Ungültiger Rekord.');
  for (const [id, r] of Object.entries(p.missions))
    if (
      !getMission(id) ||
      !Number.isFinite(r.hp) ||
      r.hp < 0 ||
      r.hp > 100 ||
      !Number.isSafeInteger(r.kills) ||
      r.kills < 0
    )
      throw new Error('Ungültiger Missionsrekord.');
  for (let i = 0; i < p.completed; i++)
    if (!p.missions[MISSIONS[i].id]) throw new Error('Unvollständiger Fortschritt.');
  return p;
}
let keyPromise: Promise<CryptoKey> | undefined;
function key() {
  return (keyPromise ??= new Promise<CryptoKey>((resolve, reject) => {
    if (!crypto.subtle) {
      reject(new Error('Für den verschlüsselten Spielstand ist HTTPS oder localhost erforderlich.'));
      return;
    }
    const request = indexedDB.open('emberwatch-vault', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onerror = () => reject(new Error('Der lokale Schlüsselspeicher ist nicht verfügbar.'));
    request.onsuccess = async () => {
      const db = request.result;
      try {
        const existing = await new Promise<CryptoKey | undefined>((res, rej) => {
          const r = db.transaction('keys').objectStore('keys').get('profile');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        if (existing) {
          db.close();
          resolve(existing);
          return;
        }
        if (localStorage.getItem(PROFILE_KEY) || localStorage.getItem(BACKUP_KEY))
          throw new Error(
            'Der Schlüssel zum vorhandenen Spielstand fehlt. Die Daten wurden nicht überschrieben.',
          );
        const generated = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
        await new Promise<void>((res, rej) => {
          const t = db.transaction('keys', 'readwrite');
          t.objectStore('keys').put(generated, 'profile');
          t.oncomplete = () => res();
          t.onerror = () => rej(t.error);
        });
        db.close();
        resolve(generated);
      } catch (e) {
        db.close();
        reject(e);
      }
    };
  }).catch((e) => {
    keyPromise = undefined;
    throw e;
  }));
}
export async function sealProfile(profile: Profile) {
  const secret = await key();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(validate(profile)));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(PROFILE_KEY) },
    secret,
    bytes,
  );
  return JSON.stringify({ v: 1, iv: encode(iv), data: encode(new Uint8Array(data)) });
}
export async function openProfile(text: string): Promise<Profile> {
  const secret = await key();
  const record = JSON.parse(text);
  if (record.v !== 1 || typeof record.iv !== 'string' || typeof record.data !== 'string')
    throw new Error('Unbekanntes Speicherformat.');
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(record.iv), additionalData: new TextEncoder().encode(PROFILE_KEY) },
    secret,
    decode(record.data),
  );
  return validate(JSON.parse(new TextDecoder().decode(data)));
}
class RejectedMutation extends Error {}
type Mutation = (profile: Profile) => void;
export class ProfileStore {
  value = freshProfile();
  error = '';
  ready = false;
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private unsaved: Mutation[] = [];
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit() {
    for (const fn of this.listeners) fn();
  }
  private locked<T>(fn: () => Promise<T>) {
    if (!window.isSecureContext)
      return Promise.reject(new Error('Für den lokalen Spielstand ist HTTPS oder localhost erforderlich.'));
    if (!navigator.locks)
      return Promise.reject(new Error('Dieser Browser unterstützt den sicheren Spielstandzugriff nicht.'));
    return navigator.locks.request('emberwatch-profile', fn);
  }
  async load() {
    try {
      await this.locked(async () => {
        const text = localStorage.getItem(PROFILE_KEY);
        if (text) {
          try {
            this.value = await openProfile(text);
          } catch {
            const backup = localStorage.getItem(BACKUP_KEY);
            if (backup) {
              this.value = await openProfile(backup);
              this.error =
                'Die letzte gültige Sicherung wurde geladen. Speichern ist bis zur Wiederherstellung angehalten.';
              this.ready = true;
              return;
            }
            throw new Error(
              'Der Spielstand ist beschädigt oder sein Schlüssel fehlt. Er wurde nicht überschrieben.',
            );
          }
        } else {
          if (localStorage.getItem(BACKUP_KEY))
            throw new Error('Die Hauptfassung fehlt. Die Sicherung wurde nicht überschrieben.');
          const p = freshProfile();
          for (const id of MAP_IDS) {
            const old = Number(
              localStorage.getItem(`emberwatch-best-${id}`) ??
                (id === 'waldtal' ? localStorage.getItem('emberwatch-best') : 0),
            );
            p.records[id] = Number.isSafeInteger(old) && old > 0 ? old : 0;
          }
          const sealed = await sealProfile(p);
          localStorage.setItem(PROFILE_KEY, sealed);
          this.value = await openProfile(localStorage.getItem(PROFILE_KEY)!);
          for (const id of MAP_IDS) localStorage.removeItem(`emberwatch-best-${id}`);
          localStorage.removeItem('emberwatch-best');
        }
        this.ready = true;
      });
    } catch (e) {
      this.error = (e as Error).message || 'Spielstand konnte nicht geladen werden.';
    }
    this.emit();
  }
  update(mutate: Mutation) {
    const task = this.queue
      .then(() =>
        this.locked(async () => {
          if (!this.ready || this.error) throw new Error(this.error || 'Spielstand wird geladen.');
          const old = localStorage.getItem(PROFILE_KEY);
          if (!old) throw new Error('Der Spielstand wurde außerhalb des Spiels entfernt.');
          const p = await openProfile(old);
          mutate(p);
          const sealed = await sealProfile(p);
          localStorage.setItem(BACKUP_KEY, old);
          localStorage.setItem(PROFILE_KEY, sealed);
          this.value = p;
          this.emit();
        }),
      )
      .catch((e) => {
        if (e instanceof RejectedMutation) throw e;
        this.unsaved.push(mutate);
        this.error = (e as Error).message || 'Speichern fehlgeschlagen. Prüfe den freien Speicher.';
        this.emit();
        throw e;
      });
    this.queue = task.catch(() => {});
    return task;
  }
  saveTeam(loadout: TowerKind[]) {
    return this.update((p) => {
      const e = loadoutError(loadout, p.completed, p.xp);
      if (e) throw new RejectedMutation(e);
      p.loadout = [...loadout];
    });
  }
  claimRewards(rewards: Record<string, ProgressReward>) {
    return this.update((p) => {
      const claimed = new Set(p.claimed);
      for (const [id, reward] of Object.entries(rewards)) {
        if (claimed.has(id)) continue;
        const mission = getMission(reward.missionId);
        if (
          id.length > 100 ||
          reward.xp !== REWARD_XP ||
          reward.research !== REWARD_RESEARCH ||
          !Number.isSafeInteger(reward.wave) ||
          reward.wave <= 0 ||
          (reward.missionId ? !mission || reward.wave !== mission.waves : reward.wave % 10 !== 0)
        )
          throw new RejectedMutation('Ungültige Belohnung.');
        p.xp += reward.xp;
        claimed.add(id);
      }
      p.claimed = [...claimed];
    });
  }
  upgradeTower(kind: TowerKind, expectedRank: number) {
    return this.update((p) => {
      const rank = p.research[kind] || 0;
      if (!Object.hasOwn(TOWERS, kind)) throw new RejectedMutation('Unbekannter Turm.');
      if (rank !== expectedRank)
        throw new RejectedMutation('Dieser Turm wurde bereits verändert. Bitte prüfe den aktuellen Stand.');
      if (rank >= MAX_RESEARCH_RANK) throw new RejectedMutation('Drei volle Sterne erreicht.');
      if (availableResearch(p.xp, p.research) < researchCost(rank))
        throw new RejectedMutation('Nicht genug Forschungspunkte.');
      p.research[kind] = rank + 1;
    });
  }
  recordStatistics(id: string, state: GameView) {
    const sample = { kills: state.kills, waves: state.completedWaves, victory: state.phase === 'victory' };
    const old = this.value.statistics[id];
    if (old && old.kills >= sample.kills && old.waves >= sample.waves && (old.victory || !sample.victory))
      return Promise.resolve();
    return this.update((p) => {
      const previous = p.statistics[id];
      p.statistics[id] = {
        kills: Math.max(previous?.kills || 0, sample.kills),
        waves: Math.max(previous?.waves || 0, sample.waves),
        victory: !!previous?.victory || sample.victory,
      };
    });
  }
  record(state: GameView) {
    return this.update((p) => {
      if (state.ruleSet === 'endless')
        p.records[state.mapId] = Math.max(p.records[state.mapId], state.completedWaves);
      else if (state.phase === 'victory') {
        const m = getMission(state.missionId);
        if (!m || m.number > p.completed + 1) return;
        const old = p.missions[m.id];
        p.missions[m.id] = {
          hp: Math.max(old?.hp || 0, state.baseHp),
          kills: Math.max(old?.kills || 0, state.kills),
        };
        p.completed = Math.max(p.completed, m.number);
      }
    });
  }
  async restoreBackup() {
    await this.locked(async () => {
      const b = localStorage.getItem(BACKUP_KEY);
      if (!b) throw new Error('Keine Sicherung vorhanden.');
      const p = await openProfile(b);
      localStorage.setItem(PROFILE_KEY, b);
      this.value = p;
      this.error = '';
      this.ready = true;
    });
    this.emit();
  }
  async retry() {
    this.error = '';
    await this.load();
    if (!this.error) {
      const pending = this.unsaved.splice(0);
      for (let i = 0; i < pending.length; i++) {
        try {
          await this.update(pending[i]);
        } catch {
          this.unsaved.push(...pending.slice(i + 1));
          return;
        }
      }
    }
  }
}
export const profileStore = new ProfileStore();
window.addEventListener('storage', (e) => {
  if (e.key === PROFILE_KEY) void profileStore.load();
});

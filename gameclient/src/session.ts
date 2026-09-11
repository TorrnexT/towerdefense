import { createId } from '@emberwatch/shared';
import { GameConnection, type ConnectionStatus } from './network';
import { profileStore } from './profile';
import type {
  Command,
  CommandResult,
  GameView,
  ImpactEvent,
  ShotEvent,
  StartOptions,
  GameMode,
  MapId,
} from '@emberwatch/shared';
export class GameSession {
  private remote = new GameConnection();
  private worker?: Worker;
  private state?: GameView;
  private mode: GameMode = 'solo';
  private pending = new Map<
    string,
    { resolve: (r: CommandResult) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private listeners = new Set<(s: { toJSON: () => GameView }) => void>();
  onState: (s: GameView) => void = () => {};
  onStatus: (s: ConnectionStatus) => void = () => {};
  onRoom: () => void = () => {};
  onError: (s: string) => void = () => {};
  onShot: (s: ShotEvent) => void = () => {};
  onImpact: (s: ImpactEvent) => void = () => {};
  playerId = '';
  private localId = '';
  private localRoom = {
    roomId: '',
    sessionId: 'local',
    state: { toJSON: () => this.state! },
    connection: { isOpen: true },
    leave: async () => {
      this.stopLocal();
    },
    onStateChange: (fn: (s: { toJSON: () => GameView }) => void) => {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
  };
  get room() {
    return this.mode === 'coop' ? this.remote.room : this.worker ? this.localRoom : undefined;
  }
  getState = () => this.state;
  get local() {
    return this.mode === 'solo' && !!this.worker;
  }
  constructor() {
    this.remote.onRoom = () => {
      if (this.mode !== 'coop') return;
      this.playerId = this.remote.playerId;
      this.onRoom();
    };
    this.remote.onState = (s) => {
      if (this.mode === 'coop') this.receive(s);
    };
    this.remote.onStatus = (s) => {
      if (this.mode === 'coop') this.onStatus(s);
    };
    this.remote.onError = (e) => {
      if (this.mode === 'coop') this.onError(e);
    };
    this.remote.onShot = (s) => {
      if (this.mode === 'coop') this.onShot(s);
    };
    this.remote.onImpact = (s) => {
      if (this.mode === 'coop') this.onImpact(s);
    };
    document.addEventListener('visibilitychange', this.visibility);
  }
  private receive(s: GameView) {
    this.state = s;
    this.onState(s);
    for (const fn of this.listeners) fn({ toJSON: () => s });
  }
  private visibility = () => {
    this.worker?.postMessage({ type: 'visibility', hidden: document.hidden });
  };
  hasPreviousSession() {
    return this.remote.hasPreviousSession();
  }
  async connect(fresh = false, mapId?: MapId) {
    if (fresh)
      return this.enter('solo', undefined, undefined, mapId, {
        ruleSet: this.state?.ruleSet,
        missionId: this.state?.missionId || undefined,
      });
    if (!new URL(location.href).searchParams.has('room')) {
      this.onError('Kein Koop-Raum zum Wiederverbinden vorhanden.');
      this.onStatus('offline');
      return false;
    }
    this.mode = 'coop';
    return this.remote.connect(false, undefined, {
      completed: profileStore.value.completed,
      xp: profileStore.value.xp,
      research: profileStore.value.research,
      loadout: profileStore.value.loadout,
    });
  }
  async enter(mode: GameMode, code?: string, name?: string, mapId?: MapId, extra: StartOptions = {}) {
    const profile = profileStore.value;
    const options: StartOptions = {
      ...extra,
      name,
      completed: profile.completed,
      xp: profile.xp,
      research: profile.research,
      loadout: extra.loadout || profile.loadout,
      ...(mapId ? { mapId } : {}),
    };
    this.onError('');
    document.addEventListener('visibilitychange', this.visibility);
    if (mode === 'coop') {
      const previous = this.mode;
      this.mode = 'coop';
      const ok = await this.remote.enter('coop', code, name, mapId, options);
      if (ok) this.stopLocal();
      else {
        this.mode = previous;
        if (previous === 'solo' && this.worker) {
          this.playerId = 'local';
          this.onStatus('online');
          this.worker.postMessage({ type: 'snapshot' });
        }
      }
      return ok;
    }
    this.onStatus('connecting');
    this.stopLocal();
    this.remote.dispose();
    this.mode = 'solo';
    this.playerId = 'local';
    this.onRoom();
    this.localId = 'local-' + createId();
    this.localRoom.roomId = this.localId;
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
    sessionStorage.removeItem('emberwatch-room');
    return new Promise<boolean>((resolve) => {
      const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      let started = false;
      const timer = setTimeout(() => fail('Das lokale Spiel konnte nicht gestartet werden.'), 12000);
      const fail = (error: string) => {
        clearTimeout(timer);
        this.onError(error);
        this.onStatus('offline');
        this.stopLocal();
        resolve(false);
      };
      worker.onerror = () => fail('Die lokale Simulation konnte nicht geladen werden.');
      worker.onmessage = (e) => {
        if (this.worker !== worker || this.mode !== 'solo') return;
        const m = e.data;
        if (m.type === 'started') {
          started = true;
          clearTimeout(timer);
          this.onStatus('online');
          this.visibility();
          resolve(true);
        } else if (m.type === 'state') this.receive(m.state);
        else if (m.type === 'shot') this.onShot(m.shot);
        else if (m.type === 'impact') this.onImpact(m.impact);
        else if (m.type === 'result') {
          const p = this.pending.get(m.result.id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(m.result.id);
            p.resolve(m.result);
          }
        } else if (m.type === 'error') {
          if (!started) fail(m.error);
          else this.onError(m.error);
        }
      };
      worker.postMessage({ type: 'start', options });
    });
  }
  send(command: Command): Promise<CommandResult> {
    if (this.mode === 'coop') return this.remote.send(command);
    if (!this.worker) return Promise.resolve({ id: command.id, ok: false, error: 'Kein laufendes Spiel.' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.id);
        resolve({ id: command.id, ok: false, error: 'Die lokale Simulation antwortet nicht.' });
      }, 5000);
      this.pending.set(command.id, { resolve, timer });
      this.worker!.postMessage({ type: 'command', command });
    });
  }
  private stopLocal() {
    this.worker?.terminate();
    this.worker = undefined;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ id, ok: false, error: 'Durchlauf beendet.' });
    }
    this.pending.clear();
  }
  leaveToMenu() {
    this.stopLocal();
    this.remote.dispose();
    this.mode = 'solo';
    this.state = undefined;
    this.playerId = '';
    sessionStorage.removeItem('emberwatch-room');
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
  }
  dispose() {
    this.stopLocal();
    this.remote.dispose();
    document.removeEventListener('visibilitychange', this.visibility);
  }
}

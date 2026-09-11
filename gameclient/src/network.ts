import { Client, type Room } from '@colyseus/sdk';
import type {
  MapId,
  StartOptions,
  GameMode,
  GameView,
  Command,
  CommandResult,
  ShotEvent,
  ImpactEvent,
} from '@emberwatch/shared';
export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';
export class GameConnection {
  private client = new Client(
    new URL(import.meta.env.VITE_SERVER_URL || window.location.origin, window.location.origin).href,
  );
  room?: Room;
  playerId = '';
  private generation = 0;
  private pending = new Map<
    string,
    { resolve: (r: CommandResult) => void; timer: ReturnType<typeof setTimeout> }
  >();
  onRoom: () => void = () => {};
  onState: (s: GameView) => void = () => {};
  onStatus: (s: ConnectionStatus) => void = () => {};
  onError: (message: string) => void = () => {};
  onImpact: (s: ImpactEvent) => void = () => {};
  onShot: (s: ShotEvent) => void = () => {};
  private storage(action: 'get' | 'set' | 'remove', value = '') {
    try {
      if (action === 'get') return sessionStorage.getItem('emberwatch-room');
      if (action === 'set') sessionStorage.setItem('emberwatch-room', value);
      else sessionStorage.removeItem('emberwatch-room');
    } catch {}
    return null;
  }
  hasPreviousSession() {
    const coop = new URL(location.href).searchParams.has('room');
    if (!coop) this.storage('remove');
    return coop;
  }
  async connect(fresh = false, mapId?: MapId, options: StartOptions = {}) {
    const code = fresh ? undefined : new URL(location.href).searchParams.get('room') || undefined;
    return this.open(code ? 'coop' : 'solo', code, undefined, !fresh, mapId, options);
  }
  async enter(mode: GameMode, code?: string, name?: string, mapId?: MapId, options: StartOptions = {}) {
    if (code?.trim() === this.room?.roomId && this.room?.connection.isOpen) {
      this.onError('');
      return true;
    }
    return this.open(mode, code?.trim() || undefined, name, false, mapId, options);
  }
  private async open(
    mode: GameMode,
    code?: string,
    name?: string,
    resume = false,
    mapId?: MapId,
    extra: StartOptions = {},
  ) {
    const generation = ++this.generation;
    this.onStatus('connecting');
    this.onError('');
    try {
      const token = resume ? this.storage('get') : null;
      const options = { ...extra, name: name || this.savedName(), ...(mapId ? { mapId } : {}) };
      let room: Room | undefined;
      if (token && (!code || token.split(':')[0] === code)) {
        try {
          room = await this.client.reconnect(token);
        } catch {
          this.storage('remove');
        }
      }
      if (!room)
        room =
          mode === 'coop' && code
            ? await this.client.joinById(code, options)
            : await this.client.create(mode === 'coop' ? 'coop' : 'endless', options);
      if (generation !== this.generation) {
        await room.leave();
        return false;
      }
      const old = this.room;
      this.clearPending();
      this.room = room;
      this.playerId = room.sessionId;
      this.onRoom();
      room.reconnection.minUptime = 0;
      room.reconnection.maxRetries = 30;
      room.reconnection.maxDelay = 3000;
      if (room.name === 'coop') this.storage('set', room.reconnectionToken);
      else this.storage('remove');
      const url = new URL(location.href);
      if (room.name === 'coop') url.searchParams.set('room', room.roomId);
      else url.searchParams.delete('room');
      history.replaceState(null, '', url);
      const current = () => this.room === room;
      room.onStateChange((state) => {
        if (current()) this.onState(state.toJSON() as GameView);
      });
      room.onMessage('shot', (s: ShotEvent) => {
        if (current()) this.onShot(s);
      });
      room.onMessage('impact', (s: ImpactEvent) => {
        if (current()) this.onImpact(s);
      });
      room.onMessage('result', (r: CommandResult) => {
        if (!current()) return;
        const p = this.pending.get(r.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(r.id);
          p.resolve(r);
        }
      });
      room.onDrop(() => {
        if (current()) this.onStatus('reconnecting');
      });
      room.onReconnect(() => {
        if (current()) {
          if (room.name === 'coop') this.storage('set', room.reconnectionToken);
          else this.storage('remove');
          this.onStatus('online');
        }
      });
      room.onLeave(() => {
        if (current()) {
          this.storage('remove');
          this.clearPending();
          this.onStatus('offline');
        }
      });
      room.onError(() => {
        if (current()) this.onStatus('offline');
      });
      if (room.state?.players) this.onState(room.state.toJSON() as GameView);
      this.onStatus('online');
      if (old && old !== room) await old.leave().catch(() => {});
      return true;
    } catch (error) {
      if (generation === this.generation) {
        this.onError(
          mode === 'coop'
            ? 'Raum nicht verfügbar: Er ist voll, abgelaufen oder der Durchlauf läuft bereits. Prüfe den Code (Groß-/Kleinschreibung beachten).'
            : 'Der Game-Server ist nicht erreichbar. Bitte versuche es erneut.',
        );
        this.onStatus(this.room?.connection.isOpen ? 'online' : 'offline');
      }
      return false;
    }
  }
  private savedName() {
    try {
      return localStorage.getItem('emberwatch-name') || 'Hüter';
    } catch {
      return 'Hüter';
    }
  }
  private clearPending() {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ id, ok: false, error: 'Verbindung zum Raum beendet.' });
    }
    this.pending.clear();
  }
  send(command: Command): Promise<CommandResult> {
    return new Promise((resolve) => {
      if (!this.room?.connection.isOpen) {
        resolve({ id: command.id, ok: false, error: 'Keine Verbindung zum Spiel.' });
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(command.id);
        resolve({ id: command.id, ok: false, error: 'Keine Bestätigung erhalten. Bitte Verbindung prüfen.' });
      }, 5000);
      this.pending.set(command.id, { resolve, timer });
      this.room.send('command', command);
    });
  }
  dispose() {
    this.generation++;
    const room = this.room;
    this.room = undefined;
    void room?.leave().catch(() => {});
    this.clearPending();
  }
}

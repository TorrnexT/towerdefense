import { Room, ServerError, type Client } from '@colyseus/core';
import { BALANCE, type StartOptions } from '@emberwatch/shared';
import { GameState } from '@emberwatch/shared/schema';
import { Simulation } from './simulation';
export class DefenseRoom extends Room<{ state: GameState }> {
  maxClients = 1;
  simulation = new Simulation();
  state = this.simulation.state;
  onCreate(options?: StartOptions) {
    this.simulation.introductionsEnabled = true;
    try {
      this.simulation.configure(options || {});
    } catch (e) {
      throw new ServerError(400, (e as Error).message);
    }
    this.patchRate = 50;
    this.simulation.onShot = (shot) => this.broadcast('shot', shot);
    this.simulation.onImpact = (impact) => this.broadcast('impact', impact);
    this.onMessage('command', (client, command) => {
      const result = this.simulation.command(client.sessionId, command);
      if (result.ok && this.state.mode === 'coop') {
        if (!this.state.lobby) void this.lock();
        else if (this.clients.length < this.maxClients) void this.unlock();
      }
      client.send('result', result);
    });
    this.onMessage('*', (client) =>
      client.send('result', { id: '', ok: false, error: 'Unbekannter Befehl.' }),
    );
    this.setSimulationInterval((delta) => this.simulation.advance(delta / 1000), 50);
  }
  onJoin(client: Client, options?: StartOptions) {
    if (this.state.mode === 'coop' && !this.state.lobby)
      throw new ServerError(400, 'Der Durchlauf läuft bereits. Bitte warte auf die nächste Lobby.');
    try {
      this.simulation.addPlayer(client.sessionId, options?.name, options);
    } catch (e) {
      throw new ServerError(400, (e as Error).message);
    }
  }
  onDrop(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    this.simulation.updatePresence();
    this.allowReconnection(client, BALANCE.reconnectSeconds);
  }
  onReconnect(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = true;
    this.simulation.updatePresence();
  }
  onLeave(client: Client) {
    this.simulation.removePlayer(client.sessionId);
    if (this.state.lobby && this.clients.length < this.maxClients) void this.unlock();
  }
}

/** Private, invitation-only rooms. Joining always uses the explicit room ID. */
export class CoopRoom extends DefenseRoom {
  maxClients = BALANCE.maxPlayers;
  async onCreate(options?: StartOptions) {
    this.state.mode = 'coop';
    this.state.lobby = true;
    await this.setPrivate(true);
    super.onCreate(options);
  }
}

import { BuildZones } from './BuildZones';
import React, { useState, useEffect, useRef } from 'react';
import { Map as MapIcon, Users, X, Crown, Check, Copy, LogOut, Link, Plus, ArrowRight } from 'lucide-react';
import {
  MAPS,
  PLAYER_COLORS,
  TOWERS,
  getMission,
  profileLevel,
  slotCount,
  type GameMode,
  type BuildMode,
  type GameView,
} from '@emberwatch/shared';

interface Props {
  state: GameView;
  playerId: string;
  roomId: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onEnter: (mode: GameMode, code?: string, name?: string) => Promise<void>;
  onChooseMap: () => void;
  onZones: (mode: BuildMode, owners: string[]) => void;
  onTeam: () => void;
  onName: (name: string) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
}
export function PartyPanel({
  state,
  playerId,
  roomId,
  busy,
  error,
  onClose,
  onEnter,
  onChooseMap,
  onZones,
  onTeam,
  onName,
  onReady,
  onStart,
}: Props) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.focus({ preventScroll: true });
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !element) return;
      const targets = [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary',
        ),
      ];
      const first = targets[0],
        last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) {
        event.preventDefault();
        first?.focus();
      }
    };
    element?.addEventListener('keydown', trapFocus);
    return () => {
      element?.removeEventListener('keydown', trapFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('emberwatch-name') || '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const coop = state.mode === 'coop';
  const members = Object.values(state.players);
  const player = state.players[playerId];
  const host = state.hostId === playerId;
  const allReady =
    members.length > 0 &&
    members.every(
      (p) =>
        p.ready &&
        p.connected &&
        (!getMission(state.missionId) || getMission(state.missionId)!.number <= p.completed + 1),
    );
  const invite = new URL(location.origin + location.pathname);
  invite.searchParams.set('room', roomId);
  function saveName(value: string) {
    setName(value);
    try {
      localStorage.setItem('emberwatch-name', value);
    } catch {}
  }
  function join() {
    let id = code.trim();
    try {
      id = new URL(id).searchParams.get('room') || id;
    } catch {}
    void onEnter('coop', id, name);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.href);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <div className="modal-backdrop party-backdrop" onClick={!state.lobby ? onClose : undefined}>
      <section
        ref={dialog}
        tabIndex={-1}
        className={'modal party-modal' + (state.lobby ? ' in-lobby' : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="party-title"
        onClick={(e) => e.stopPropagation()}
      >
        {!state.lobby && (
          <button className="modal-close icon-button" aria-label="Koop schließen" onClick={onClose}>
            <X size={18} />
          </button>
        )}
        <Users size={30} />
        <span className="eyebrow">GEMEINSAM DAS TAL VERTEIDIGEN</span>
        <h2 id="party-title">
          {coop ? (state.lobby ? 'Versammelt die Hüter.' : 'Eure Gefährten.') : 'Zu viert. Eine Festung.'}
        </h2>
        {coop ? (
          <>
            {state.lobby && (
              <label className="party-field">
                Dein Name
                <input
                  aria-label="Dein Name"
                  value={name}
                  onChange={(e) => saveName(e.target.value)}
                  onBlur={() => onName(name)}
                  maxLength={20}
                  placeholder={player?.name || 'Hüter'}
                  autoComplete="nickname"
                />
              </label>
            )}
            <div className="party-code">
              <span>RAUMCODE</span>
              <strong data-testid="room-code">{roomId}</strong>
              <b>{members.length} / 4</b>
            </div>
            <div className="party-map">
              <MapIcon size={17} />
              <span>
                <small>SCHLACHTFELD</small>
                <strong>{getMission(state.missionId)?.name || MAPS[state.mapId].name}</strong>
              </span>
              {state.lobby && host && (
                <button className="secondary" disabled={busy} onClick={onChooseMap}>
                  Karte ändern
                </button>
              )}
            </div>
            <BuildZones state={state} disabled={busy || !host || !state.lobby} onChange={onZones} />
            {state.lobby && (
              <div className="party-team">
                <div>
                  <strong>Deine Wacht · Level {profileLevel(player?.completed || 0, player?.xp)}</strong>
                  <small>
                    {player?.loadout.map((k) => TOWERS[k].name).join(' · ')} ({player?.loadout.length}/
                    {slotCount(player?.completed || 0, player?.xp)})
                  </small>
                </div>
                <button className="secondary" disabled={busy} onClick={onTeam}>
                  Team bearbeiten
                </button>
              </div>
            )}
            <div className="party-members">
              {[0, 1, 2, 3].map((slot) => {
                const member = members.find((p) => p.color === slot);
                return (
                  <div key={slot} className={'party-member' + (!member ? ' vacant' : '')}>
                    <span className="player-emblem" style={{ background: PLAYER_COLORS[slot] }}>
                      {member ? member.name.slice(0, 1).toLocaleUpperCase() : '+'}
                    </span>
                    {member ? (
                      <>
                        <span>
                          <strong>
                            {member.name}
                            {member.id === playerId ? ' (du)' : ''}
                          </strong>
                          <small>
                            {!member.connected
                              ? 'Verbindung verloren · Platz für 60 s reserviert'
                              : state.lobby
                                ? member.ready
                                  ? 'Bereit'
                                  : 'Bereitet sich vor'
                                : `${member.gold} Gold`}
                          </small>
                        </span>
                        {member.id === state.hostId ? (
                          <Crown size={17} aria-label="Host" />
                        ) : state.lobby && member.ready ? (
                          <Check size={17} />
                        ) : null}
                      </>
                    ) : (
                      <span>{state.lobby ? 'Platz für einen Gefährten' : 'Unbesetzter Platz'}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {state.lobby ? (
              <>
                <div className="party-ready-actions">
                  <button
                    className={player?.ready ? 'secondary ready-active' : 'primary'}
                    disabled={busy || !player?.connected}
                    onClick={() => onReady(!player?.ready)}
                  >
                    <Check size={16} />
                    {player?.ready ? 'Bereit – zurücknehmen' : 'Ich bin bereit'}
                  </button>
                  {host ? (
                    <button className="primary" disabled={busy || !allReady} onClick={onStart}>
                      Gemeinsam starten <ArrowRight size={16} />
                    </button>
                  ) : (
                    <p className="party-note">
                      {allReady
                        ? 'Alles bereit. Der Host startet das Spiel.'
                        : 'Warte, bis alle bereit sind.'}
                    </p>
                  )}
                </div>
                <button className="secondary party-copy" onClick={copy}>
                  <Copy size={16} />
                  {copied ? 'Einladungslink kopiert' : 'Einladungslink kopieren'}
                </button>
                {copyError && (
                  <label className="party-field">
                    Link zum Kopieren
                    <input
                      aria-label="Einladungslink"
                      readOnly
                      value={invite.href}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                )}
                <p className="party-note">
                  Jeder startet mit 240 Gold. Abschussgold wird im Team geteilt. Nach dem Start baut ihr in
                  Ruhe; der Host startet die erste Welle.
                </p>
              </>
            ) : (
              <p className="party-note">
                {state.players[state.hostId]?.name} steuert Wellen und Tempo. Neue Spieler können in der
                nächsten Lobby beitreten. Die Teamstärke bleibt bis zum nächsten Durchlauf gleich.
              </p>
            )}
            {confirmLeave ? (
              <div className="party-leave-confirm">
                <p>
                  Die Gruppe verlassen? Deine Türme und dein übriges Gold übernimmt im laufenden Spiel der
                  Host.
                </p>
                <button className="secondary" disabled={busy} onClick={() => onEnter('solo')}>
                  Gruppe verlassen
                </button>
                <button className="sell-button" onClick={() => setConfirmLeave(false)}>
                  Bleiben
                </button>
              </div>
            ) : (
              <button className="sell-button" disabled={busy} onClick={() => setConfirmLeave(true)}>
                <LogOut size={15} /> Zurück zum Solo
              </button>
            )}
          </>
        ) : (
          <>
            <p>
              Erstelle einen privaten Raum und lade bis zu drei Freunde ein. Oder schließe dich ihrer
              Verteidigung an.
            </p>
            <label className="party-field">
              Dein Name
              <input
                aria-label="Dein Name"
                value={name}
                onChange={(e) => saveName(e.target.value)}
                maxLength={20}
                placeholder="Hüter"
                autoComplete="nickname"
              />
            </label>
            <button className="primary" disabled={busy} onClick={() => onEnter('coop', undefined, name)}>
              <Plus size={17} /> Koop-Raum erstellen
            </button>
            <div className="party-divider">ODER BEITRETEN</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <label className="party-field">
                Raumcode oder Einladungslink
                <input
                  aria-label="Raumcode oder Einladungslink"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Code deiner Gruppe"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <button className="secondary" disabled={busy || !code.trim()}>
                <Link size={16} /> Raum beitreten
              </button>
            </form>
            <p className="party-note">
              Alle müssen denselben Game-Server erreichen. Im WLAN teilt ihr die Netzwerkadresse des
              Computers.
            </p>
          </>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

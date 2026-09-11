import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Home,
  Users,
  Shield,
  Coins,
  Waves,
  FastForward,
  Flame,
  Sparkles,
  Crosshair,
  Bomb,
  ChevronRight,
  ArrowUpRight,
  X,
  Volume2,
  VolumeX,
  HelpCircle,
  Maximize,
  Plus,
  Minus,
  Play,
  Trophy,
  Heart,
  Swords,
  RotateCcw,
  MousePointer2,
  Check,
  Radio,
  Move,
  Target,
  Zap,
  ArrowUp,
  Skull,
} from 'lucide-react';
import {
  MAPS,
  battleMap,
  MISSIONS,
  DEFAULT_LOADOUT,
  getMission,
  profileLevel,
  availableResearch,
  type ResearchRanks,
  slotCount,
  type StartOptions,
  type RuleSet,
  type MapId,
  PLAYER_COLORS,
  type GameMode,
  BALANCE,
  GAME_SPEEDS,
  type GameSpeed,
  type EnemyKind,
  TOWERS,
  ENEMIES,
  DAMAGE_LABELS,
  towerStats,
  PRISM_BEAM,
  towerEffect,
  enemyStats,
  sellRefund,
  buildError,
  territoryError,
  type BuildMode,
  waveComposition,
  type TowerKind,
  type GameView,
  type Command,
} from '@emberwatch/shared';
import { Assets, World } from './world';
import type { ConnectionStatus } from './network';
import { GameSession } from './session';
import { profileStore } from './profile';
import { WaveAnnouncement } from './WaveAnnouncement';
import { VictoryDialog } from './VictoryDialog';
import { TowerResearch } from './TowerResearch';
import { TowerCard } from './TowerCard';
import { TeamPicker } from './TeamPicker';
import { CampaignMap } from './CampaignMap';
import { ModePicker } from './ModePicker';
import { GameAudio } from './audio';
import { useTowerDrag } from './useTowerDrag';
import { useUiMotion } from './useUiMotion';
import { PartyPanel } from './PartyPanel';
import { EnemyIntroduction } from './EnemyIntroduction';
import { AccountDialog } from './AccountDialog';
import { MainMenu } from './MainMenu';
import { MapPicker } from './MapPicker';

import './style.css';
import { useOffline } from './offline';

const empty: GameView = {
  ruleSet: 'endless',
  missionId: '',
  mapId: 'waldtal',
  mode: 'solo',
  lobby: false,
  hostId: '',
  teamSize: 1,
  run: 0,
  speed: 1,
  phase: 'preparing',
  wave: 0,
  completedWaves: 0,
  baseHp: 100,
  kills: 0,
  autoStart: true,
  countdown: -1,
  remaining: 0,
  paused: false,
  towers: {},
  enemies: {},
  projectiles: {},
  players: {},
};
function App() {
  useUiMotion();
  const offline = useOffline();
  const host = useRef<HTMLDivElement>(null),
    world = useRef<World | null>(null),
    connection = useRef<GameSession | null>(null),
    audio = useRef(new GameAudio());
  const [state, setState] = useState<GameView>(empty),
    [status, setStatus] = useState<ConnectionStatus>('idle'),
    [loaded, setLoaded] = useState(false),
    [progress, setProgress] = useState(0),
    [assetError, setAssetError] = useState(false),
    [previews, setPreviews] = useState<Partial<Record<TowerKind, string>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [enemyId, setEnemyId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(''),
    [sound, setSound] = useState(false),
    [help, setHelp] = useState(false),
    [party, setParty] = useState(false),
    [menu, setMenu] = useState(true),
    [accountOpen, setAccountOpen] = useState(false),
    [researchMenu, setResearchMenu] = useState<TowerKind | null>(null),
    [mapPicker, setMapPicker] = useState<'solo' | 'coop' | null>(null),
    [connectionError, setConnectionError] = useState(''),
    [profile, setProfile] = useState(profileStore.value),
    [profileReady, setProfileReady] = useState(false),
    [saveError, setSaveError] = useState(''),
    [modePicker, setModePicker] = useState<GameMode | null>(null),
    [chosenRule, setChosenRule] = useState<RuleSet>('campaign'),
    [campaignPicker, setCampaignPicker] = useState<'solo' | 'coop' | null>(null),
    [teamPicker, setTeamPicker] = useState<{
      mode: GameMode;
      options: StartOptions;
      purpose: 'start' | 'lobby';
    } | null>(null);
  const introAssets = useRef<Assets | null>(null);
  const best = profile.records[state.mapId] || 0;
  const earnedRewards = JSON.stringify(state.players[connection.current?.playerId || '']?.rewards || {});
  useEffect(() => {
    if (!profileReady) return;
    const rewards = JSON.parse(earnedRewards);
    const count = Object.keys(rewards).filter((id) => !profileStore.value.claimed.includes(id)).length;
    if (!count) return;
    void profileStore
      .claimRewards(rewards)
      .then(() => {
        setToast(`+${count * 100} EP · +${count * 50} Forschungspunkte`);
      })
      .catch(() => {});
  }, [earnedRewards, profileReady]);
  const earnedVictories = JSON.stringify(state.players[connection.current?.playerId || '']?.victories || {});
  useEffect(() => {
    if (!profileReady) return;
    const awards = JSON.parse(earnedVictories) as Record<string, { hp: number; kills: number }>;
    for (const mission of MISSIONS) {
      const r = awards[mission.id];
      if (r)
        void profileStore
          .record({
            ...state,
            ruleSet: 'campaign',
            phase: 'victory',
            missionId: mission.id,
            baseHp: r.hp,
            kills: r.kills,
          })
          .catch(() => {});
    }
  }, [earnedVictories, profileReady]);
  useEffect(() => {
    const c = connection.current;
    if (!profileReady || !c?.playerId) return;
    const capture = () => {
      const current = c.getState();
      if (!current?.wave || current.lobby) return;
      const id = `${c.room?.roomId || c.playerId}:${current.run}`;
      void profileStore.recordStatistics(id, current).catch(() => {});
    };
    capture();
    const timer = setInterval(capture, 1000);
    return () => {
      clearInterval(timer);
      capture();
    };
  }, [profileReady, state.run, state.phase, status]);
  const mission = getMission(state.missionId);
  const finished = ['defeat', 'victory'].includes(state.phase);
  const player = state.players[connection.current?.playerId || ''];
  const coop = state.mode === 'coop';
  const researchSnapshot = JSON.stringify(profile.research);
  useEffect(() => {
    const c = connection.current;
    if (!c || status !== 'online' || !state.lobby || !player || (player.xp || 0) > profile.xp) return;
    if (player.xp === profile.xp && JSON.stringify(player.research || {}) === researchSnapshot) return;
    void c
      .send({
        id: crypto.randomUUID(),
        action: 'setLoadout',
        loadout: player.loadout,
        xp: profile.xp,
        research: profile.research,
      })
      .then((result) => {
        if (!result.ok) setToast(result.error || 'Forschung konnte nicht übernommen werden.');
      });
  }, [researchSnapshot, profile.xp, state.lobby, status]);

  const kinds = player?.loadout || profile.loadout;
  if (world.current) world.current.research = player?.research || {};
  const isHost = !coop || state.hostId === connection.current?.playerId;
  const gold = player?.gold ?? BALANCE.startGold;
  const drag = useTowerDrag({
    world: world.current,
    game: state,
    status,
    busy,
    validate: (kind, point) => {
      const live = connection.current?.getState() || state;
      const member = live.players[connection.current?.playerId || ''];
      if (status !== 'online' || live.paused) return 'Verbindung unterbrochen.';
      if (busy || live.lobby || ['defeat', 'victory'].includes(live.phase))
        return 'Bauen gerade nicht möglich.';
      if (!member?.loadout.includes(kind)) return 'Diesen Turm hast du nicht mitgenommen.';
      return point
        ? (live.mode === 'coop'
            ? territoryError(
                point,
                battleMap(live),
                live.buildMode || 'all',
                live.zoneOwners || [],
                member.id,
              )
            : null) || buildError(kind, point, Object.values(live.towers), battleMap(live), member.gold)
        : 'Ziehe den Turm auf die Map.';
    },
    onStart: () => {
      setSelectedId(null);
      setEnemyId(null);
      setToast('');
    },
    onReject: setToast,
    onDrop: (kind, point) => {
      void send({ action: 'build', kind, ...point });
    },
  });
  const buildKind = drag.preview?.kind || null;
  const point = drag.preview?.point || null;
  const selected = selectedId ? state.towers[selectedId] : undefined;
  const ownTower = selected?.owner === connection.current?.playerId;
  const enemy = enemyId ? state.enemies[enemyId] : undefined;
  const kind = buildKind || selected?.kind;
  const stats = kind
    ? towerStats(kind, selected?.level || 1, selected?.research ?? player?.research?.[kind] ?? 0)
    : undefined;
  const effect = kind
    ? towerEffect(kind, selected?.level || 1, selected?.research ?? player?.research?.[kind] ?? 0)
    : undefined;
  const placeError = drag.preview?.error || null;
  const speed = state.speed || 1;
  const nextSpeed = GAME_SPEEDS[(GAME_SPEEDS.indexOf(speed) + 1) % GAME_SPEEDS.length];
  const nextWave = state.wave + (state.phase === 'preparing' ? 1 : 0);
  const nextEnemies = waveComposition(Math.max(1, nextWave));
  useEffect(() => {
    const c = new GameSession();
    connection.current = c;
    c.onState = (s) => {
      setState(s);
      if (world.current) world.current.playerId = c.playerId;
      world.current?.update(s);
    };
    c.onStatus = setStatus;
    c.onError = setConnectionError;
    c.onRoom = () => {
      setSelectedId(null);
      setEnemyId(null);
      setState(empty);
      world.current?.update(empty);
    };
    c.onImpact = (s) => world.current?.impact(s);
    c.onShot = (s) => {
      audio.current.shot(s.kind);
    };
    const syncProfile = () => {
      setProfile({ ...profileStore.value });
      setProfileReady(profileStore.ready);
      setSaveError(profileStore.error);
    };
    const unsubscribe = profileStore.subscribe(syncProfile);
    void profileStore.load().then(() => {
      if (c.hasPreviousSession() && profileStore.ready && !profileStore.error) {
        setMenu(false);
        void c.connect();
      }
    });
    const assets = new Assets();
    introAssets.current = assets;
    let cancelled = false;
    assets
      .load(setProgress)
      .then(() => {
        if (cancelled || !host.current) return;
        const w = new World(host.current, assets);
        world.current = w;
        w.playerId = c.playerId;
        setPreviews(assets.previews());
        setLoaded(true);
        w.onPick = (p, t, e) => {
          if (t) {
            setSelectedId(t);
            setEnemyId(null);
          } else if (e) {
            setEnemyId(e);
            setSelectedId(null);
          } else {
            setSelectedId(null);
            setEnemyId(null);
          }
        };
        if (import.meta.env.DEV && new URLSearchParams(location.search).has('verify'))
          (window as unknown as { __game: unknown }).__game = {
            world: w,
            connection: c,
            getState: () => c.getState(),
            profile: profileStore,
          };
      })
      .catch((error) => {
        console.error('Assets konnten nicht geladen werden', error);
        if (!cancelled) setAssetError(true);
      });
    return () => {
      cancelled = true;
      unsubscribe();
      c.dispose();
      world.current?.dispose();
      audio.current.dispose();
    };
  }, []);
  useEffect(() => {
    if (!buildKind) world.current?.select(null, selectedId);
  }, [buildKind, selectedId, loaded]);
  useEffect(() => {
    if (loaded) world.current?.update(state);
  }, [loaded]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!profileReady || !state.completedWaves) return;
    if (state.ruleSet === 'endless') void profileStore.record(state).catch(() => {});
  }, [state.mapId, state.completedWaves, state.ruleSet, state.phase, state.missionId, profileReady]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedId(null);
        setEnemyId(null);
        setHelp(false);
        setParty(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  function close() {
    drag.cancel();
    setSelectedId(null);
    setEnemyId(null);
  }
  async function send(
    payload:
      | Omit<Extract<Command, { action: 'build' }>, 'id'>
      | Omit<Extract<Command, { action: 'upgrade' | 'sell' }>, 'id'>
      | { action: 'startWave' | 'startGame' | 'restart' }
      | { action: 'ready'; ready: boolean }
      | { action: 'setName'; name: string }
      | { action: 'setMap'; mapId: MapId }
      | { action: 'setMission'; missionId: string }
      | { action: 'setLoadout'; loadout: TowerKind[]; xp?: number; research?: ResearchRanks }
      | { action: 'ackIntroduction'; kind: EnemyKind }
      | { action: 'setAutoStart'; enabled: boolean }
      | { action: 'setBuildZones'; mode: BuildMode; owners: string[] }
      | { action: 'setSpeed'; speed: GameSpeed },
  ) {
    const locksUi = payload.action !== 'setName';
    if ((busy && locksUi) || status !== 'online') return;
    if (locksUi) setBusy(true);
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const result = await connection.current!.send({ ...payload, id } as Command);
    if (locksUi) setBusy(false);
    if (!result.ok) setToast(result.error || 'Das hat nicht geklappt.');
    else if (payload.action === 'setMap') setMapPicker(null);
    else if (payload.action === 'setMission') setCampaignPicker(null);
    else if (payload.action === 'build') {
      setSelectedId(result.towerId || null);
      setToast('');
    } else if (payload.action === 'sell') {
      close();
      setToast('Turm verkauft.');
    }
  }
  async function enter(
    mode: GameMode,
    code?: string,
    name?: string,
    mapId?: MapId,
    extra: StartOptions = {},
  ) {
    if (busy) return;
    close();
    setBusy(true);
    const ok = await connection.current?.enter(mode, code, name, mapId, extra);
    setBusy(false);
    if (ok) {
      setParty(false);
      setConnectionError('');
      setMenu(false);
      setMapPicker(null);
      setCampaignPicker(null);
      setTeamPicker(null);
      setModePicker(null);
    }
  }
  async function restart() {
    close();
    if (coop) {
      await send({ action: 'restart' });
      return;
    }
    setTeamPicker({
      mode: 'solo',
      purpose: 'start',
      options: { ruleSet: state.ruleSet, missionId: state.missionId || undefined, mapId: state.mapId },
    });
  }
  function showMenu() {
    close();
    setParty(false);
    setHelp(false);
    setConnectionError('');
    setMenu(true);
  }
  function chooseSolo() {
    setConnectionError('');
    setModePicker('solo');
  }
  function chooseMulti() {
    close();
    setConnectionError('');
    if (!navigator.onLine) {
      setConnectionError('Koop benötigt eine Internet- oder Netzwerkverbindung.');
      return;
    }
    if (coop && status === 'online') {
      setMenu(false);
      setParty(true);
    } else setModePicker('coop');
  }
  function chooseRule(rule: RuleSet) {
    const mode = modePicker!;
    setModePicker(null);
    setChosenRule(rule);
    if (mode === 'coop') {
      setParty(true);
      return;
    }
    if (rule === 'campaign') setCampaignPicker('solo');
    else setMapPicker('solo');
  }
  async function partyEnter(mode: GameMode, code?: string, name?: string) {
    if (mode === 'solo') {
      connection.current?.leaveToMenu();
      setState(empty);
      world.current?.update(empty);
      setParty(false);
      setMenu(true);
      setStatus('idle');
      return;
    }
    if (code) {
      await enter('coop', code, name, undefined, { ruleSet: chosenRule });
      return;
    }
    setTeamPicker({
      mode: 'coop',
      purpose: 'start',
      options: {
        name,
        ruleSet: chosenRule,
        ...(chosenRule === 'campaign' ? { missionId: MISSIONS[0].id } : { mapId: 'waldtal' as MapId }),
      },
    });
  }
  async function confirmTeam(loadout: TowerKind[]) {
    if (!teamPicker || busy) return;
    setBusy(true);
    try {
      await profileStore.saveTeam(loadout);
      if (teamPicker.purpose === 'lobby') {
        const result = await connection.current!.send({
          id: crypto.randomUUID(),
          action: 'setLoadout',
          loadout,
          xp: profileStore.value.xp,
          research: profileStore.value.research,
        });
        if (!result.ok) {
          setToast(result.error || 'Team konnte nicht gespeichert werden.');
          return;
        }
        setTeamPicker(null);
      } else {
        const { mode, options } = teamPicker;
        const ok = await connection.current?.enter(
          mode,
          undefined,
          typeof options.name === 'string' ? options.name : undefined,
          options.mapId,
          { ...options, loadout },
        );
        if (ok) {
          setMenu(false);
          setTeamPicker(null);
          setMapPicker(null);
          setCampaignPicker(null);
          setParty(false);
          setConnectionError('');
        }
      }
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function nextMission() {
    if (!mission || mission.number >= 15) return;
    const next = MISSIONS[mission.number];
    if (coop) {
      await send({ action: 'restart' });
      await send({ action: 'setMission', missionId: next.id });
    } else
      setTeamPicker({ mode: 'solo', purpose: 'start', options: { ruleSet: 'campaign', missionId: next.id } });
  }
  return (
    <div className={'app' + (buildKind ? ' is-dragging' : '') + (menu ? ' in-menu' : '')}>
      <WaveAnnouncement
        state={state}
        sessionId={connection.current?.room?.roomId || ''}
        enabled={
          loaded &&
          status === 'online' &&
          !menu &&
          !state.lobby &&
          !help &&
          !party &&
          !teamPicker &&
          !campaignPicker &&
          !mapPicker &&
          !accountOpen &&
          !researchMenu
        }
      />
      {drag.preview && !point && (
        <div className="drag-cursor" aria-hidden="true" style={{ left: drag.preview.x, top: drag.preview.y }}>
          <img src={previews[drag.preview.kind]} alt="" draggable={false} />
        </div>
      )}
      <div className="hud-resources" aria-label="Ressourcen">
        <div className="resources">
          <div className="resource gold">
            <Coins />
            <div>
              <small>GOLD</small>
              <strong key={gold} data-testid="gold">
                {gold}
              </strong>
            </div>
          </div>
          <div className="resource health">
            <Heart />
            <div>
              <small>FESTUNG</small>
              <strong>
                {Math.ceil(state.baseHp)}
                <em>/ 100</em>
              </strong>
            </div>
          </div>
        </div>
      </div>
      <div className="top-actions">
        <button
          className="icon-button"
          aria-label={sound ? 'Ton ausschalten' : 'Ton einschalten'}
          onClick={() => setSound(audio.current.toggle())}
        >
          {sound ? <Volume2 /> : <VolumeX />}
        </button>
        <button className="icon-button" aria-label="Spielanleitung" onClick={() => setHelp(true)}>
          <HelpCircle />
        </button>
      </div>
      <button
        className="party-button icon-button"
        aria-label={coop ? 'Gruppe anzeigen' : 'Koop spielen'}
        title={coop ? 'Gruppe anzeigen' : 'Koop spielen'}
        onClick={() => {
          close();
          setParty(true);
          setConnectionError('');
        }}
      >
        <Users size={20} />
        <span>{coop ? `${Object.keys(state.players).length}/4` : 'KOOP'}</span>
      </button>
      <button className="icon-button menu-return" aria-label="Hauptmenü" title="Hauptmenü" onClick={showMenu}>
        <Home />
      </button>
      <section className="wave-panel" aria-label="Wellensteuerung">
        <span className="hud-map-name">{mission ? mission.name : MAPS[state.mapId].name}</span>
        <div className="wave-heading">
          <Waves size={16} />
          <span>
            WELLE <strong>{String(Math.max(1, nextWave)).padStart(2, '0')}</strong>
          </span>
          <button
            className={'speed-button' + (speed > 1 ? ' accelerated' : '')}
            aria-label={`Spielgeschwindigkeit: ${speed}×. Auf ${nextSpeed}× wechseln`}
            title={`Spieltempo ${speed}× · Klicken für ${nextSpeed}×`}
            disabled={
              busy || !isHost || state.lobby || !loaded || status !== 'online' || state.paused || finished
            }
            onClick={() => send({ action: 'setSpeed', speed: nextSpeed })}
          >
            <FastForward size={14} />
            <strong>{speed}×</strong>
          </button>
        </div>
        {state.phase === 'combat' ? (
          <div className="combat-status">
            <Swords size={16} />
            <span>{state.remaining} Gegner verbleiben</span>
            <span className="pulse" />
          </div>
        ) : (
          <button
            className="primary start-wave"
            disabled={busy || !isHost || state.lobby || status !== 'online' || !loaded || finished}
            onClick={() => send({ action: 'startWave' })}
          >
            <Play size={16} fill="currentColor" />
            {!isHost
              ? 'Host startet die Welle'
              : state.countdown >= 0
                ? 'Jetzt starten'
                : state.wave > 0
                  ? 'Nächste Welle starten'
                  : 'Erste Welle starten'}
            {state.countdown >= 0 && <span>{Math.ceil(state.countdown)} s</span>}
          </button>
        )}
        <button
          className="auto-wave-toggle"
          aria-pressed={!state.autoStart}
          aria-label="Nächste Runde nicht automatisch starten"
          title={isHost ? 'Automatischen Wellenstart umschalten' : 'Nur der Host kann den Wellenstart ändern'}
          disabled={
            busy || !isHost || state.lobby || status !== 'online' || !loaded || state.paused || finished
          }
          onClick={() => send({ action: 'setAutoStart', enabled: !state.autoStart })}
        >
          <span aria-hidden="true">{state.autoStart ? '○' : '✓'}</span>
          {state.autoStart ? 'Auto-Start an' : 'Auto-Start aus'}
        </button>
        <div className="wave-enemies" aria-label="Gegner dieser Welle">
          {(['goblin', 'ogre', 'wraith'] as const)
            .filter((k) => nextEnemies.includes(k))
            .map((k) => (
              <span
                key={k}
                title={ENEMIES[k].name}
                aria-label={`${ENEMIES[k].name}: ${nextEnemies.filter((e) => e === k).length}`}
              >
                <i className={'enemy-dot ' + k} />
                <b>×{nextEnemies.filter((e) => e === k).length}</b>
              </span>
            ))}
        </div>
      </section>
      <main className="layout">
        <section className="battlefield" aria-label="Spielfeld">
          <div className="world" ref={host} />
          <div className="camera-controls">
            <button
              className="icon-button"
              title="Vergrößern"
              aria-label="Vergrößern"
              onClick={() => world.current?.zoom(1.2)}
            >
              <Plus />
            </button>
            <button
              className="icon-button"
              title="Verkleinern"
              aria-label="Verkleinern"
              onClick={() => world.current?.zoom(1 / 1.2)}
            >
              <Minus />
            </button>
            <span />
            <button
              className="icon-button"
              title="Kamera zurücksetzen"
              aria-label="Kamera zurücksetzen"
              onClick={() => world.current?.resetCamera()}
            >
              <Maximize size={17} />
            </button>
          </div>
          {buildKind && (
            <div className={'build-hint ' + (point && placeError ? 'invalid' : '')}>
              <MousePointer2 size={16} />
              {point
                ? placeError || 'Loslassen zum Bauen · Esc zum Abbrechen'
                : 'Ziehe den Turm auf eine freie Stelle.'}
            </div>
          )}
          <div className="tower-dock" style={{ '--team-size': kinds.length } as React.CSSProperties}>
            <div className="dock-heading">
              <span>
                {state.ruleSet === 'endless'
                  ? `Belohnung bei Welle ${(Math.floor(state.completedWaves / 10) + 1) * 10}: 100 EP · 50 FP`
                  : 'VERTEIDIGUNG'}
              </span>
              <span>
                Ziehen zum Bauen <ChevronRight size={12} />
              </span>
            </div>
            <div className="tower-cards">
              {kinds.map((k) => (
                <TowerCard
                  key={k}
                  kind={k}
                  rank={player?.research?.[k] || 0}
                  preview={previews[k]}
                  poor={gold < TOWERS[k].cost}
                  className={buildKind === k ? 'dragging' : ''}
                  onPointerDown={(e) => drag.start(e, k)}
                  disabled={
                    !loaded || state.lobby || busy || status !== 'online' || finished || gold < TOWERS[k].cost
                  }
                  aria-label={`${TOWERS[k].name} auf die Map ziehen, ${TOWERS[k].cost} Gold`}
                  title={`${TOWERS[k].name}: auf die Map ziehen und loslassen`}
                />
              ))}
            </div>
          </div>
          {!loaded && (
            <div className="loading-layer">
              <span className="loading-rune">
                <Flame size={32} />
              </span>
              <h2>{assetError ? 'Das Tal konnte nicht laden.' : 'Das Tal erwacht.'}</h2>
              <p>
                {assetError
                  ? 'Bitte prüfe die Verbindung und versuche es erneut.'
                  : 'Modelle und Spielwelt werden vorbereitet …'}
              </p>
              {assetError ? (
                <button className="primary" onClick={() => location.reload()}>
                  Erneut laden
                </button>
              ) : (
                <div className="loading-track">
                  <i style={{ width: `${progress * 100}%` }} />
                </div>
              )}
            </div>
          )}
        </section>
        <aside
          className={
            'sidebar ' +
            (kind || enemy ? 'has-selection' : '') +
            (buildKind ? ' building' : '') +
            (point ? ' has-point' : '')
          }
        >
          <div className="sidebar-scroll">
            {kind && stats ? (
              <section key={selected?.id || buildKind || enemy?.id} className="detail-panel">
                <div className="section-heading">
                  <span>
                    {selected
                      ? ownTower
                        ? 'DEIN TURM'
                        : `TURM VON ${state.players[selected.owner]?.name || 'GEFÄHRTE'}`
                      : 'TURM BAUEN'}
                  </span>
                  <button className="icon-button" aria-label="Auswahl schließen" onClick={close}>
                    <X size={17} />
                  </button>
                </div>
                <div key={`${kind}-${selected?.level || 1}`} className={'detail-hero ' + kind}>
                  <img src={previews[kind]} alt={TOWERS[kind].name} />
                  <span className="detail-level">
                    {selected ? `STUFE ${selected.level} / 5` : 'STUFE 1 / 5'}
                  </span>
                </div>
                <h2>{TOWERS[kind].name}</h2>
                {selected && coop && (
                  <div className="tower-owner">
                    <i style={{ background: PLAYER_COLORS[state.players[selected.owner]?.color || 0] }} />
                    {state.players[selected.owner]?.name}
                    {ownTower ? ' · dein Turm' : ' · verwaltet diesen Turm'}
                  </div>
                )}
                <span className={'damage-tag ' + kind}>
                  {DAMAGE_LABELS[stats.type]} · {TOWERS[kind].subtitle}
                </span>
                <p className="detail-description">{TOWERS[kind].description}</p>
                {effect && (
                  <p className="effect-description">
                    {effect.kind === 'slow'
                      ? `${Math.round(effect.slow * 100)} % langsamer`
                      : `${effect.dps.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${effect.kind === 'burn' ? 'Feuer' : 'Gift'}schaden / s`}{' '}
                    · {effect.duration.toLocaleString('de-DE')} s nach Einschlag
                  </p>
                )}
                {kind === 'prism' && (
                  <p className="effect-detail">
                    Laser: {stats.beamDuration.toLocaleString('de-DE')} s · Nach Aufwertung:{' '}
                    {towerStats(
                      kind,
                      Math.min(5, (selected?.level || 1) + 1),
                      selected?.research || 0,
                    ).beamDuration.toLocaleString('de-DE')}{' '}
                    s
                  </p>
                )}
                <div className="stat-grid">
                  <span>
                    <Swords />
                    {kind === 'prism' ? 'Laser / s' : 'Schaden'}
                    <strong>
                      {(kind === 'prism' ? stats.damage / PRISM_BEAM.duration : stats.damage).toLocaleString(
                        'de-DE',
                        { maximumFractionDigits: 2 },
                      )}
                    </strong>
                  </span>
                  <span>
                    <Zap />
                    Angriffe / s<strong>{stats.attacks.toFixed(2)}</strong>
                  </span>
                  <span>
                    <Target />
                    Reichweite<strong>{stats.range.toFixed(1)}</strong>
                  </span>
                  <span>
                    {stats.splash ? kind === 'grenade' ? <Bomb /> : <Flame /> : <Shield />}
                    {stats.splash ? (kind === 'fire' ? 'Kegelbreite ±' : 'Flächenradius') : 'Stufe'}
                    <strong>{stats.splash || `${selected?.level || 1} / 5`}</strong>
                  </span>
                </div>
                {buildKind ? (
                  <div className="detail-actions">
                    <p className={placeError ? 'error-text' : ''}>
                      {placeError || 'Loslassen zum Bauen. Escape bricht ab.'}
                    </p>
                  </div>
                ) : (
                  selected &&
                  ownTower && (
                    <div className="detail-actions">
                      {selected.level < 5 ? (
                        <>
                          <div className="upgrade-preview">
                            <ArrowUpRight size={16} />
                            <span>
                              Nächste Stufe{' '}
                              <b>
                                {(
                                  towerStats(selected.kind, selected.level + 1, selected.research || 0)
                                    .damage / (selected.kind === 'prism' ? PRISM_BEAM.duration : 1)
                                ).toLocaleString('de-DE', { maximumFractionDigits: 2 })}{' '}
                                {selected.kind === 'prism' ? 'Laser / s' : 'Schaden'}
                              </b>
                            </span>
                          </div>
                          <button
                            className="primary"
                            disabled={busy || gold < stats.upgradeCost || status !== 'online' || finished}
                            onClick={() => send({ action: 'upgrade', towerId: selected.id })}
                          >
                            <ArrowUp size={17} />
                            Aufwerten{' '}
                            <span>
                              <Coins size={14} />
                              {stats.upgradeCost}
                            </span>
                          </button>
                        </>
                      ) : (
                        <div className="max-level">
                          <Check size={16} />
                          Maximale Stufe erreicht
                        </div>
                      )}
                      <button
                        className="sell-button"
                        disabled={busy || status !== 'online' || finished}
                        onClick={() => send({ action: 'sell', towerId: selected.id })}
                      >
                        Turm verkaufen <span>+{sellRefund(selected.invested)} Gold</span>
                      </button>
                    </div>
                  )
                )}
              </section>
            ) : enemy ? (
              <section key={selected?.id || buildKind || enemy?.id} className="detail-panel">
                <div className="section-heading">
                  <span>GEGNER IM VISIER</span>
                  <button className="icon-button" aria-label="Auswahl schließen" onClick={close}>
                    <X size={17} />
                  </button>
                </div>
                <div className={'enemy-sigil ' + enemy.kind}>
                  <Skull size={42} />
                </div>
                <h2>{ENEMIES[enemy.kind].name}</h2>
                <span className="damage-tag">Stufe {enemy.level}</span>
                <p className="detail-description">
                  {Math.ceil(enemy.hp)} / {enemy.maxHp} Leben
                  {(enemy.burn || 0) > 0 && (
                    <span className="enemy-status burn">Brand · {enemy.burn!.toFixed(1)} s</span>
                  )}
                  {(enemy.poison || 0) > 0 && (
                    <span className="enemy-status poison">Vergiftet · {enemy.poison!.toFixed(1)} s</span>
                  )}
                  {(enemy.slow || 0) > 0 && (
                    <span className="enemy-status slow">
                      Verlangsamt · {Math.round((enemy.slowAmount || 0) * 100)} % · {enemy.slow!.toFixed(1)} s
                    </span>
                  )}
                </p>
                <div className="stat-grid">
                  {Object.entries(ENEMIES[enemy.kind].defense).map(([k, v]) => (
                    <span key={k}>
                      <Shield />
                      {DAMAGE_LABELS[k as keyof typeof DAMAGE_LABELS]}
                      <strong>{v}</strong>
                    </span>
                  ))}
                  <span>
                    <Move />
                    Tempo<strong>{(enemy.speed * (1 - (enemy.slowAmount || 0))).toFixed(1)}</strong>
                  </span>
                </div>
                <p className="detail-description">
                  Basisschaden:{' '}
                  {Object.entries(enemyStats(enemy.kind, enemy.wave, enemy.teamSize).damage)
                    .filter(([, v]) => v > 0)
                    .map(
                      ([k, v]) =>
                        `${Number((v * (mission?.damageMultiplier || 1)).toFixed(2)).toLocaleString('de-DE')} ${DAMAGE_LABELS[k as keyof typeof DAMAGE_LABELS]}`,
                    )
                    .join(', ')}
                </p>
              </section>
            ) : null}
          </div>
        </aside>
      </main>
      {toast && (
        <div key={toast} className="toast" role="status">
          {toast}
          <button aria-label="Hinweis schließen" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {!menu && (status === 'reconnecting' || status === 'offline') && (
        <div className="modal-backdrop">
          <div className="modal">
            <Radio size={32} />
            <span className="eyebrow">VERBINDUNG</span>
            <h2>
              {status === 'reconnecting' ? 'Einen Augenblick, Hüter.' : 'Die Verbindung ist unterbrochen.'}
            </h2>
            <p>
              {status === 'reconnecting'
                ? coop
                  ? 'Deine Gruppe kann weiterspielen. Dein Platz, Gold und deine Türme bleiben 60 Sekunden für dich reserviert.'
                  : 'Dein Spiel pausiert. Wir versuchen, dich innerhalb von 60 Sekunden zurück ins Tal zu bringen.'
                : connectionError ||
                  'Der Game-Server ist nicht erreichbar oder dein Spielraum ist abgelaufen.'}
            </p>
            {status === 'offline' && (
              <>
                <button
                  className="primary"
                  onClick={() => {
                    if (coop) void connection.current?.connect();
                    else {
                      showMenu();
                      setModePicker('solo');
                    }
                  }}
                >
                  Erneut verbinden <RotateCcw size={16} />
                </button>
                <button
                  className="sell-button"
                  onClick={() => {
                    showMenu();
                    setModePicker('solo');
                  }}
                >
                  Neues Solospiel
                </button>
                <button className="sell-button" onClick={showMenu}>
                  Zum Hauptmenü
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {!menu && state.phase === 'defeat' && !teamPicker && status === 'online' && (
        <div className="modal-backdrop">
          <div className="modal defeat">
            <span className="defeat-icon">
              <Shield size={38} />
            </span>
            <span className="eyebrow">DAS TAL WIRD DICH ERINNERN</span>
            <h2>Die letzte Glut.</h2>
            <p>
              Die Festung ist gefallen.
              <br />
              Eine neue Verteidigung wartet auf dich.
            </p>
            <div className="end-stats">
              <span>
                <strong>{state.completedWaves}</strong>Wellen überlebt
              </span>
              <span>
                <strong>{state.kills}</strong>Gegner besiegt
              </span>
            </div>
            <div className="record-line">
              <Trophy size={16} />
              Dein Rekord: {best} Wellen
            </div>
            <button className="primary" disabled={busy || !isHost} onClick={restart}>
              <RotateCcw size={17} />
              {coop ? (isHost ? 'Gemeinsam neu starten' : 'Warte auf den Host') : 'Neuer Durchlauf'}
              <ChevronRight size={17} />
            </button>
            <button className="sell-button" onClick={showMenu}>
              Zum Hauptmenü
            </button>
            {coop && (
              <button className="sell-button" onClick={() => setParty(true)}>
                Gruppe anzeigen / verlassen
              </button>
            )}
          </div>
        </div>
      )}
      {menu && (
        <MainMenu
          xp={profile.xp}
          onAccount={() => setAccountOpen(true)}
          onTowers={() => setResearchMenu('ballista')}
          mapId={state.mapId}
          loaded={loaded && profileReady && !saveError}
          progress={progress}
          assetError={assetError}
          busy={busy || status === 'connecting'}
          error={saveError || connectionError}
          sound={sound}
          best={best}
          canResume={!!player && status === 'online'}
          running={!!player && state.phase === 'combat' && !state.paused}
          onSolo={chooseSolo}
          onMulti={chooseMulti}
          onResume={() => setMenu(false)}
          onSound={() => setSound(audio.current.toggle())}
          onHelp={() => setHelp(true)}
        />
      )}
      {!mapPicker &&
        !campaignPicker &&
        !teamPicker &&
        !modePicker &&
        (party || (!menu && state.lobby)) &&
        (menu || status === 'online' || status === 'connecting') && (
          <PartyPanel
            state={state}
            playerId={connection.current?.playerId || ''}
            roomId={connection.current?.room?.roomId || ''}
            busy={busy}
            error={connectionError}
            onClose={() => setParty(false)}
            onEnter={partyEnter}
            onTeam={() => {
              setToast('');
              setTeamPicker({ mode: 'coop', purpose: 'lobby', options: {} });
            }}
            onZones={(mode, owners) => void send({ action: 'setBuildZones', mode, owners })}
            onChooseMap={() => {
              setToast('');
              if (state.ruleSet === 'campaign') setCampaignPicker('coop');
              else setMapPicker('coop');
            }}
            onName={(name) => send({ action: 'setName', name })}
            onReady={(ready) => send({ action: 'ready', ready })}
            onStart={() => {
              setParty(false);
              void send({ action: 'startGame' });
            }}
          />
        )}
      {mapPicker && !teamPicker && (
        <MapPicker
          mode={mapPicker}
          selected={state.mapId}
          busy={busy}
          error={connectionError || toast}
          best={(id) => profile.records[id]}
          onClose={() => setMapPicker(null)}
          onConfirm={(id) =>
            mapPicker === 'solo'
              ? setTeamPicker({ mode: 'solo', purpose: 'start', options: { ruleSet: 'endless', mapId: id } })
              : void send({ action: 'setMap', mapId: id })
          }
        />
      )}
      {modePicker && (
        <ModePicker mode={modePicker} onClose={() => setModePicker(null)} onSelect={chooseRule} />
      )}
      {campaignPicker && !teamPicker && (
        <CampaignMap
          completed={
            campaignPicker === 'coop'
              ? Math.min(...Object.values(state.players).map((p) => p.completed))
              : profile.completed
          }
          selected={campaignPicker === 'coop' ? state.missionId : undefined}
          coop={campaignPicker === 'coop'}
          busy={busy}
          error={toast || connectionError}
          onClose={() => setCampaignPicker(null)}
          onSelect={(m) =>
            campaignPicker === 'coop'
              ? void send({ action: 'setMission', missionId: m.id })
              : setTeamPicker({
                  mode: 'solo',
                  purpose: 'start',
                  options: { ruleSet: 'campaign', missionId: m.id },
                })
          }
        />
      )}
      {teamPicker && (
        <TeamPicker
          loadout={teamPicker.purpose === 'lobby' ? player?.loadout || profile.loadout : profile.loadout}
          xp={profile.xp}
          research={profile.research}
          onResearch={setResearchMenu}
          completed={teamPicker.purpose === 'lobby' ? player?.completed || 0 : profile.completed}
          previews={previews}
          busy={busy}
          error={toast || connectionError || saveError}
          label={
            teamPicker.purpose === 'lobby'
              ? 'Team übernehmen'
              : teamPicker.mode === 'coop'
                ? 'Lobby erstellen'
                : 'In die Schlacht'
          }
          onClose={() => setTeamPicker(null)}
          onConfirm={confirmTeam}
        />
      )}
      {!menu && state.phase === 'victory' && !state.lobby && !teamPicker && !campaignPicker && (
        <VictoryDialog onClose={showMenu}>
          <Trophy size={40} />
          <span className="eyebrow">DIE WACHT HAT BESTANDEN</span>
          <h2 id="victory-title">Das Feuer brennt weiter.</h2>
          <p>
            {mission?.name} · {state.completedWaves} Wellen überstanden
          </p>
          <div className="end-stats">
            <span>
              <strong>{Math.ceil(state.baseHp)}</strong>Festungsleben
            </span>
            <span>
              <strong>{state.kills}</strong>Gegner besiegt
            </span>
          </div>
          <p>
            +100 EP · +50 Forschungspunkte
            <br />
            Spielstand-Level {profileLevel(profile.completed, profile.xp)} ·{' '}
            {slotCount(profile.completed, profile.xp)} Turmslots
          </p>
          <div className="victory-actions">
            {mission && mission.number < 15 && (
              <button
                className="primary"
                disabled={busy || !isHost || profile.completed < mission.number}
                onClick={nextMission}
              >
                Nächste Mission
                <ChevronRight size={17} />
              </button>
            )}
            <button className="secondary" disabled={busy || !isHost} onClick={restart}>
              Mission wiederholen
            </button>
            <div className="victory-navigation">
              <button
                className="sell-button"
                onClick={() => {
                  if (coop) {
                    if (isHost) void send({ action: 'restart' }).then(() => setCampaignPicker('coop'));
                    else showMenu();
                  } else setCampaignPicker('solo');
                }}
              >
                Zur Kampagnenkarte
              </button>
              <button className="sell-button" onClick={showMenu}>
                Zum Hauptmenü
              </button>
            </div>
          </div>
        </VictoryDialog>
      )}
      {state.introduction && introAssets.current && player && (
        <EnemyIntroduction
          key={`${state.run}:${state.introduction}`}
          kind={state.introduction as EnemyKind}
          assets={introAssets.current}
          players={state.players}
          playerId={player.id}
          busy={busy || status !== 'online'}
          onConfirm={() => void send({ action: 'ackIntroduction', kind: state.introduction as EnemyKind })}
        />
      )}
      {accountOpen && (
        <AccountDialog
          profile={profile}
          onClose={() => setAccountOpen(false)}
          offline={offline}
          canUpdate={!player || finished}
        />
      )}
      {researchMenu && (
        <TowerResearch
          profile={profile}
          previews={previews}
          initial={researchMenu}
          onClose={() => setResearchMenu(null)}
        />
      )}
      {saveError && (
        <div className="save-error" role="alert">
          <strong>Spielstand konnte nicht gesichert werden</strong>
          <p>{saveError}</p>
          <button onClick={() => void profileStore.retry()}>Erneut versuchen</button>
          <button onClick={() => void profileStore.restoreBackup().catch((e) => setSaveError(e.message))}>
            Sicherung wiederherstellen
          </button>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close icon-button"
              aria-label="Anleitung schließen"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <span className="eyebrow">EMBERWATCH</span>
            <h2>Steuerung</h2>
            <ol>
              <li>
                <strong>Türme ziehen</strong>Ziehe einen Turm mit Maus oder Finger auf eine freie Fläche neben
                dem Weg. Die Vorschau zeigt seine Reichweite. Loslassen baut; rote Stellen sind gesperrt.
                Loslassen außerhalb der Map oder Escape bricht ab.
              </li>
              <li>
                <strong>Wellen abwehren</strong>Starte die erste Welle selbst. Danach hast du zwischen den
                Wellen 15 Sekunden Bauzeit.
              </li>
              <li>
                <strong>Stärker werden</strong>Jeder Abschuss gibt Gold. Wähle einen gebauten Turm und werte
                ihn bis Stufe 5 auf. Verkauf gibt 70 % des investierten Goldes zurück.
              </li>
              <li>
                <strong>Das Tal erkunden</strong>Mausrad oder zwei Finger zum Zoomen. Rechte Maustaste oder
                zwei Finger zum Verschieben. Tippe Gegner an, um ihre Werte zu sehen.
              </li>
            </ol>
            <p>Gegner werden mit jeder Welle stärker. Dein Rekord: {best} überlebte Wellen.</p>
            <button className="primary" onClick={() => setHelp(false)}>
              Verstanden. Auf ins Tal. <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);

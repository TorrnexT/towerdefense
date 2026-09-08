import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ENEMIES, type EnemyKind, type PlayerView } from '@emberwatch/shared';
import { Assets } from './world';
import { useDialog } from './useDialog';
const descriptions: Record<EnemyKind, { title: string; text: string; traits: string[] }> = {
  goblin: {
    title: 'Klein. Schnell. Gefährlich.',
    text: 'Koboldläufer sprinten zur Festung. Ihre geringe Lebensenergie und fehlende Rüstung machen sie anfällig für schnelle Angriffe. Lass sie nicht durch deine Verteidigung schlüpfen.',
    traits: ['Sehr schnell', 'Wenig Leben', 'Keine Verteidigung'],
  },
  ogre: {
    title: 'Eine wandelnde Belagerung.',
    text: 'Der Eisenoger ist langsam, hält aber viel aus. Seine schwere Rüstung fängt physische Angriffe ab. Arkane Türme sind besonders wirksam. Erreicht er die Festung, richtet er hohen Schaden an.',
    traits: ['Viel Leben', 'Hohe physische Rüstung', 'Langsam'],
  },
  wraith: {
    title: 'Magie trifft auf Widerstand.',
    text: 'Runengeister widerstehen arkanen Angriffen und Gift besonders gut. Setze Feuer oder physische Angriffe ein. An der Festung verursachen sie Arkanschaden.',
    traits: ['Hohe Arkanverteidigung', 'Giftresistent', 'Anfällig für Feuer'],
  },
};
function EnemyPortrait({ assets, kind }: { assets: Assets; kind: EnemyKind }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    scene.add(new THREE.HemisphereLight(0xffeedb, 0x315747, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 5, 4);
    scene.add(light);
    const model = assets.model(kind, 2.7);
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model),
      center = box.getCenter(new THREE.Vector3());
    camera.position.set(3.3, center.y + 1.4, 5.4);
    camera.lookAt(center);
    const mixer = new THREE.AnimationMixer(model),
      clips = assets.models.get(kind)?.animations || [];
    const clip = clips.find((c) => /idle/i.test(c.name)) || clips[0];
    if (clip) mixer.clipAction(clip).play();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    let frame = 0,
      last = performance.now();
    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced.matches) mixer.update(dt);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [assets, kind]);
  return (
    <div
      ref={host}
      className="enemy-intro-portrait"
      role="img"
      aria-label={`3D-Vorschau: ${ENEMIES[kind].name}`}
    />
  );
}
export function EnemyIntroduction({
  kind,
  assets,
  players,
  playerId,
  busy,
  onConfirm,
}: {
  kind: EnemyKind;
  assets: Assets;
  players: Record<string, PlayerView>;
  playerId: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const ready = !!players[playerId]?.introReady,
    members = Object.values(players);
  const ref = useDialog(() => {
    if (!ready) onConfirm();
  }, busy);
  const description = descriptions[kind];
  return (
    <div className="modal-backdrop enemy-intro-backdrop">
      <section
        ref={ref}
        tabIndex={-1}
        className="modal enemy-intro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="enemy-intro-title"
      >
        <span className="eyebrow">NEUER GEGNER · SPIEL PAUSIERT</span>
        <h2 id="enemy-intro-title">{ENEMIES[kind].name}</h2>
        <EnemyPortrait assets={assets} kind={kind} />
        <h3>{description.title}</h3>
        <p>{description.text}</p>
        <div className="enemy-traits">
          {description.traits.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <button className="primary enemy-intro-confirm" disabled={busy || ready} onClick={onConfirm}>
          {ready ? 'Warte auf die Gruppe …' : 'Verstanden · Weiter'}
          {members.length > 1 && (
            <span>
              {members.filter((p) => p.introReady).length} / {members.length}
            </span>
          )}
        </button>
        {members.length > 1 && (
          <div className="intro-readiness" aria-live="polite">
            {members.map((p) => (
              <span key={p.id} className={p.introReady ? 'is-ready' : ''}>
                {p.introReady ? '✓' : '…'} {p.name}
                {!p.connected && ' · getrennt'}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

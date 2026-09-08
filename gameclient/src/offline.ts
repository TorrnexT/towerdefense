import { useEffect, useState } from 'react';
export function useOffline() {
  const [status, setStatus] = useState(import.meta.env.PROD ? 'Offlinepaket wird geladen …' : ''),
    [update, setUpdate] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setStatus('Offline benötigt HTTPS');
      return;
    }
    let alive = true;
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => {
        const inspect = () => {
          if (!alive) return;
          if (reg.waiting) setUpdate(reg.waiting);
          if (reg.active) setStatus('Offline bereit');
        };
        const watch = () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            inspect();
            if (alive && worker.state === 'redundant' && !reg.active)
              setStatus('Offlinepaket unvollständig · bitte erneut laden');
          });
        };
        inspect();
        watch();
        reg.addEventListener('updatefound', watch);
        void navigator.serviceWorker.ready.then(() => {
          if (alive) setStatus('Offline bereit');
        });
      })
      .catch(() => {
        if (alive) setStatus('Offlinepaket konnte nicht geladen werden');
      });
    return () => {
      alive = false;
    };
  }, []);
  function applyUpdate() {
    if (!update) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    update.postMessage({ type: 'activate' });
  }
  return { status, update: !!update, applyUpdate };
}

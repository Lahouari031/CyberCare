/* ═══════════════════════════════════════════════════
   CyberCare — Service Worker
   Cache-first strategy : tout fonctionne hors ligne
   ═══════════════════════════════════════════════════ */

const CACHE_NAME = 'cybercare-v1';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 jours

/* Fichiers à mettre en cache immédiatement à l'installation */
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Martian+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap'
];

/* ── INSTALL : précache les ressources essentielles ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[CyberCare SW] Précache des ressources...');
      return cache.addAll(PRECACHE_URLS).catch(err => {
        /* Si les fonts Google échouent (pas de réseau), on ignore */
        console.warn('[CyberCare SW] Précache partiel (fonts non disponibles hors ligne):', err);
        return cache.add('./index.html');
      });
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE : supprime les anciens caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[CyberCare SW] Suppression ancien cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH : stratégie Cache First avec fallback réseau ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Ignore les requêtes non-GET et les extensions navigateur */
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  /* Stratégie pour les fonts Google : Network first, puis cache */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  /* Stratégie principale : Cache First */
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        /* Revalide en arrière-plan si connecté */
        fetch(request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response));
          }
        }).catch(() => {});
        return cached;
      }

      /* Pas en cache : fetch réseau puis mise en cache */
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => {
        /* Fallback ultime : retourner index.html (SPA) */
        if (request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

/* ── MESSAGE : forcer la mise à jour du cache ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ cleared: true });
    });
  }
});

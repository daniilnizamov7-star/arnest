// sw.js — Service Worker для CAN RUSH PWA
const CACHE_NAME = 'can-rush-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;600;700&display=swap'
];

// ── INSTALL: кэшируем статику ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Кэширование статики...');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: чистим старые кэши ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: стратегия Cache-First + Network fallback ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API запросы к Supabase — network-first
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503
        });
      })
    );    return;
  }

  // Статика и шрифты — cache-first
  if (request.destination === 'font' || 
      url.href.includes('googleapis') || 
      url.href.includes('cloudflare')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // HTML и основные ресурсы — cache-first с fallback на offline.html
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return cached || response;
        
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Не кэшируем динамические API-ответы
          if (!request.url.includes('rest/v1')) {
            cache.put(request, clone);
          }
        });
        return response;
      }).catch(() => {
        // Fallback для навигации — можно создать offline.html
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return cached;
      });
    })
  );
});

// ── PUSH: уведомления (опционально) ──
self.addEventListener('push', (event) => {
  if (!event.data) return;  const data = event.data.json();
  const options = {
    body: data.body || 'Новое обновление в CAN RUSH!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'play', title: '🎮 Играть', icon: '/icons/icon-192x192.png' },
      { action: 'close', title: '✕ Закрыть' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'CAN RUSH', options)
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'play' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});

// ── BACKGROUND SYNC (для отправки рекордов офлайн) ──
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-score') {
    event.waitUntil(
      // Здесь можно добавить логику отправки накопленных рекордов
      console.log('[SW] Sync: отправка сохранённых рекордов...')
    );
  }
});
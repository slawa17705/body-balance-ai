// Простейший Service Worker
self.addEventListener('install', event => {
    console.log('✅ Service Worker установлен');
});

self.addEventListener('fetch', event => {
    // Просто пропускаем все запросы
    event.respondWith(fetch(event.request));
});
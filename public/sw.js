// ==================== НАСТРОЙКИ КЭШИРОВАНИЯ ====================
const CACHE_NAME = 'fitness-ai-v2';
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.ico',
    '/icon-512.png'
];

// ==================== УСТАНОВКА ====================
self.addEventListener('install', event => {
    console.log('✅ Service Worker установлен');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Кэшируем статические файлы');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => self.skipWaiting())
            .catch(err => console.error('❌ Ошибка при установке:', err))
    );
});

// ==================== АКТИВАЦИЯ ====================
self.addEventListener('activate', event => {
    console.log('🔥 Service Worker активирован');

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`🗑️ Удаляем старый кэш: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ==================== ОБРАБОТКА ЗАПРОСОВ ====================
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // 🔴 ВАЖНО: Пропускаем API-запросы (они идут напрямую на сервер)
    if (url.pathname.startsWith('/api/')) {
        // Не перехватываем API-запросы
        return;
    }
    
    // 🔴 Пропускаем POST, PUT, DELETE запросы
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Пропускаем запросы к chrome-extension
    if (url.protocol === 'chrome-extension:') {
        return;
    }
    
    // 🔵 Для статических файлов — стратегия Cache First
    if (STATIC_CACHE_URLS.some(staticUrl => url.pathname === staticUrl)) {
        event.respondWith(handleStaticRequest(event));
        return;
    }
    
    // 🔵 Для остальных GET-запросов — сеть с fallback в кэш
    event.respondWith(handleOtherRequest(event));
});

// Для статических файлов: Кэш -> Сеть
async function handleStaticRequest(event) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(event.request);
        return networkResponse;
    } catch (error) {
        return new Response('Оффлайн режим', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Для других GET-запросов: Сеть -> Кэш
async function handleOtherRequest(event) {
    try {
        const networkResponse = await fetch(event.request);
        return networkResponse;
    } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        return cachedResponse || fetch(event.request);
    }
}

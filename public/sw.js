// ==================== НАСТРОЙКИ КЭШИРОВАНИЯ ====================
const CACHE_NAME = 'fitness-ai-v2';
const API_ENDPOINTS = ['/api/trainer', '/api/diet', '/api/energy'];
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
            .then(() => {
                console.log('🚀 Пропускаем ожидание');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('❌ Ошибка при установке:', err);
            })
    );
});

// ==================== АКТИВАЦИЯ ====================
self.addEventListener('activate', event => {
    console.log('🔥 Service Worker активирован');

    event.waitUntil(
        // Очищаем старые кэши
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`🗑️ Удаляем старый кэш: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
            .then(() => {
                console.log('👑 Claiming clients');
                return self.clients.claim();
            })
    );
});

// ==================== ОБРАБОТКА ЗАПРОСОВ ====================
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1. ИГНОРИРУЕМ не-GET запросы и chrome-extension
    if (event.request.method !== 'GET') return;
    if (url.protocol === 'chrome-extension:') return;

    // 2. API запросы рекомендаций (особая логика)
    if (API_ENDPOINTS.includes(url.pathname)) {
        event.respondWith(handleApiRequest(event));
        return;
    }

    // 3. Статические файлы (стратегия Cache First)
    if (STATIC_CACHE_URLS.some(staticUrl => url.pathname === staticUrl)) {
        event.respondWith(handleStaticRequest(event));
        return;
    }

    // 4. Остальные запросы - пробуем сеть, потом кэш
    event.respondWith(handleOtherRequest(event));
});

// ==================== СТРАТЕГИИ КЭШИРОВАНИЯ ====================

// Для API: Сеть -> Кэш (с сохранением в кэш)
async function handleApiRequest(event) {
    const cache = await caches.open(CACHE_NAME);
    const request = event.request;

    try {
        // 1. Пробуем загрузить из сети
        console.log(`🌐 Загрузка API: ${request.url}`);
        const networkResponse = await fetch(request);

        // Проверяем успешность ответа
        if (!networkResponse.ok) {
            throw new Error(`HTTP ${networkResponse.status}`);
        }

        // 2. Сохраняем в кэш для оффлайн-использования
        const responseClone = networkResponse.clone();
        cache.put(request, responseClone);
        console.log(`💾 API сохранено в кэш: ${request.url}`);

        return networkResponse;

    } catch (error) {
        console.warn(`⚠️ Сеть недоступна для API ${request.url}:`, error.message);

        // 3. Пробуем взять из кэша
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            console.log(`📦 Используем кэшированный API ответ: ${request.url}`);
            return cachedResponse;
        }

        // 4. Fallback ответ
        console.log(`🆘 Нет кэша для API ${request.url}, возвращаем fallback`);
        return new Response(JSON.stringify({
            success: false,
            error: "Оффлайн режим. Нет кэшированных данных.",
            offline: true,
            timestamp: new Date().toISOString()
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Для статических файлов: Кэш -> Сеть
async function handleStaticRequest(event) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(event.request);

    if (cachedResponse) {
        console.log(`📦 Статический файл из кэша: ${event.request.url}`);
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(event.request);
        console.log(`🌐 Загружаем статический файл: ${event.request.url}`);
        return networkResponse;
    } catch (error) {
        console.error(`❌ Ошибка загрузки статического файла ${event.request.url}:`, error);
        // Можно вернуть fallback страницу
        return new Response('Оффлайн режим', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Для других запросов: Сеть -> Кэш
async function handleOtherRequest(event) {
    try {
        const networkResponse = await fetch(event.request);
        console.log(`🌐 Сеть: ${event.request.url}`);
        return networkResponse;
    } catch (error) {
        console.warn(`⚠️ Сеть недоступна для ${event.request.url}:`, error.message);

        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);

        if (cachedResponse) {
            console.log(`📦 Используем кэш: ${event.request.url}`);
            return cachedResponse;
        }

        // Если ничего нет - возвращаем оригинальный fetch
        return fetch(event.request);
    }
}

// ==================== ФОНОВАЯ СИНХРОНИЗАЦИЯ ====================
self.addEventListener('sync', event => {
    if (event.tag === 'sync-api-requests') {
        console.log('🔄 Фоновая синхронизация API запросов');
        event.waitUntil(syncPendingRequests());
    }
});

// Синхронизация отложенных запросов
async function syncPendingRequests() {
    // Здесь можно реализовать синхронизацию отложенных запросов
    // Например, если пользователь делал запросы оффлайн
    console.log('✅ Фоновая синхронизация завершена');
}

// ==================== PUSH УВЕДОМЛЕНИЯ ====================
self.addEventListener('push', event => {
    const options = {
        body: event.data?.text() || 'Новые рекомендации доступны!',
        icon: '/icon-512.png',
        badge: '/icon-512.png',
        vibrate: [200, 100, 200],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 'fitness-recommendation'
        },
        actions: [
            {
                action: 'open',
                title: 'Открыть приложение'
            },
            {
                action: 'close',
                title: 'Закрыть'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('Баланс тела', options)
    );
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'open') {
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(windowClients => {
                for (const client of windowClients) {
                    if (client.url === '/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
        );
    }
});

console.log('✅ Service Worker загружен и готов к работе');
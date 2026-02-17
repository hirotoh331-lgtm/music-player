// バージョンを v4 に変更（HTML/JSを書き換えたので数字を上げます）
const CACHE_NAME = 'music-player-v4';

// オフラインでも開けるようにしたいファイル一覧
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json',
    './icon.png'
];

// 1. インストール時：ファイルをキャッシュする
self.addEventListener('install', function(event) {
    self.skipWaiting(); // 待機せずにすぐ新しいSWを有効にする
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('キャッシュを開きました');
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. 有効化時（Activate）：古いキャッシュを削除する
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('古いキャッシュを削除します:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// 3. 通信時（ネットワーク優先）
self.addEventListener('fetch', function(event) {
    event.respondWith(
        // まずインターネットに取りに行く
        fetch(event.request)
            .then(function(response) {
                // ネットから正常に取得できたら
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // 次回のために、取得した最新版をキャッシュに保存しておく
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then(function(cache) {
                        cache.put(event.request, responseToCache);
                    });

                return response;
            })
            .catch(function() {
                // ネットに繋がらない（オフライン）等の場合は、キャッシュから返す
                return caches.match(event.request);
            })
    );
});
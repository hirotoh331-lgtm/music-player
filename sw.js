// バージョンを v1 から v2 に変更（必須）
const CACHE_NAME = 'music-player-v2';

// オフラインでも開けるようにしたいファイル一覧
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './icon.png'
];

// 1. インストール時：ファイルをキャッシュする
self.addEventListener('install', function(event) {
    // インストールが終わったら待機せずにすぐ有効化する（更新を早く反映させるため）
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('キャッシュを開きました');
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. 有効化時（Activate）：古いキャッシュ（v1など）を削除する
// ※これを入れないと、スマホの中に古いファイルが残り続けます
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    // 現在のキャッシュ名(v2)以外はすべて削除
                    if (cacheName !== CACHE_NAME) {
                        console.log('古いキャッシュを削除します:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // 開いているページをすぐに新しいSWで制御する
    return self.clients.claim();
});

// 3. 通信時：キャッシュがあればそれを使う、なければネットに取りに行く
self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
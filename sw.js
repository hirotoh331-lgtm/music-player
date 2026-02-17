const CACHE_NAME = 'music-player-v1';
// オフラインでも開けるようにしたいファイル一覧
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './icon.png'
];

// 1. インストール時：ファイルをキャッシュ（保存）する
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('キャッシュを開きました');
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. 通信時：キャッシュがあればそれを使う、なければネットに取りに行く
self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // キャッシュが見つかればそれを返す
                if (response) {
                    return response;
                }
                // なければ通常通りネットに取りに行く
                return fetch(event.request);
            })
    );
});
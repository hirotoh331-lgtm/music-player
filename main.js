// --- 1. 要素の取得 ---
const fileInput = document.getElementById('file-input');
const audioPlayer = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const loopBtn = document.getElementById('loop-btn');
const songTitle = document.getElementById('song-title');
const playlistDiv = document.getElementById('playlist');

// --- グローバル変数 ---
let db;
let currentObjectUrl = null;

// プレイリスト管理用の変数
let playlistData = []; 
let currentIndex = -1; 

// --- 2. データベース初期化 ---
const request = indexedDB.open('MusicPlayerDB', 1);

request.onupgradeneeded = function(event) {
    db = event.target.result;
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    }
};

request.onsuccess = function(event) {
    db = event.target.result;
    console.log('DB接続成功');
    loadPlaylist(); 
};

request.onerror = function() {
    alert('データベースを開けませんでした');
};

// --- 3. 曲の保存処理 ---
fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const songData = { name: file.name, blob: file, created: new Date() };

    const addRequest = store.add(songData);

    addRequest.onsuccess = function() {
        loadPlaylist();
    };

    fileInput.value = '';
});

// --- 4. プレイリストの読み込みと表示 ---
function loadPlaylist() {
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = function() {
        const songs = getAllRequest.result;
        playlistData = songs;
        renderPlaylist();
    };
}

function renderPlaylist() {
    playlistDiv.innerHTML = '';

    if (playlistData.length === 0) {
        playlistDiv.innerHTML = '<p style="color: #888; text-align:center;">保存された曲はありません</p>';
        return;
    }

    playlistData.forEach(function(song, index) {
        const item = document.createElement('div');
        item.className = 'playlist-item';

        if (index === currentIndex) {
            item.classList.add('playing');
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'song-name';
        nameSpan.textContent = song.name;
        
        nameSpan.addEventListener('click', () => {
            playSongAtIndex(index);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑';
        deleteBtn.className = 'delete-btn';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSong(song.id);
        });

        item.appendChild(nameSpan);
        item.appendChild(deleteBtn);
        playlistDiv.appendChild(item);
    });
}

// --- 5. 指定した番号の曲を再生する機能（通知バー操作を追加！） ---
function playSongAtIndex(index) {
    if (index < 0 || index >= playlistData.length) {
        console.log("再生リストの範囲外です。停止します。");
        return;
    }

    currentIndex = index;
    const songInfo = playlistData[currentIndex];

    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const getRequest = store.get(songInfo.id);

    getRequest.onsuccess = function() {
        const song = getRequest.result;
        if (song) {
            // 前の曲のメモリ解放
            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
            }

            const fileUrl = URL.createObjectURL(song.blob);
            currentObjectUrl = fileUrl;

            songTitle.textContent = song.name;
            audioPlayer.src = fileUrl;
            
            renderPlaylist(); 
            playBtn.disabled = false;
            
            // 再生開始
            playAudio();

            // ▼▼▼ ここからがステップ4の追加部分 ▼▼▼
            // Media Session API: Androidの通知バーやロック画面を設定する
            if ('mediaSession' in navigator) {
                
                // 1. 通知バーに表示するタイトルやアーティスト名
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: song.name,
                    artist: 'My Player',
                    album: 'Local Music'
                    // artwork: [{ src: 'icon.png', sizes: '512x512', type: 'image/png' }] // アイコンがあれば有効化
                });

                // 2. 通知バーのボタンを押した時の動きを設定
                
                // 再生ボタン
                navigator.mediaSession.setActionHandler('play', function() {
                    playAudio();
                });
                
                // 一時停止ボタン
                navigator.mediaSession.setActionHandler('pause', function() {
                    pauseAudio();
                });

                // 前の曲へ
                navigator.mediaSession.setActionHandler('previoustrack', function() {
                    if (currentIndex > 0) {
                        playSongAtIndex(currentIndex - 1);
                    }
                });

                // 次の曲へ
                navigator.mediaSession.setActionHandler('nexttrack', function() {
                    if (currentIndex < playlistData.length - 1) {
                        playSongAtIndex(currentIndex + 1);
                    }
                });
            }
            // ▲▲▲ ここまで追加 ▲▲▲
        }
    };
}

// --- 6. 連続再生の制御 ---
audioPlayer.addEventListener('ended', function() {
    // ループOFFの時だけ次の曲へ
    const nextIndex = currentIndex + 1;
    if (nextIndex < playlistData.length) {
        playSongAtIndex(nextIndex);
    } else {
        playBtn.textContent = '▶️';
    }
});

// --- 7. 基本操作 ---
playBtn.addEventListener('click', function() {
    if (audioPlayer.paused) {
        playAudio();
    } else {
        pauseAudio();
    }
});

function playAudio() {
    audioPlayer.play().catch(e => console.log('再生エラー:', e));
    playBtn.textContent = '⏸️';
}

function pauseAudio() {
    audioPlayer.pause();
    playBtn.textContent = '▶️';
}

loopBtn.addEventListener('click', function() {
    audioPlayer.loop = !audioPlayer.loop;
    if (audioPlayer.loop) {
        loopBtn.textContent = '🔁 ON';
        loopBtn.classList.add('active-loop');
    } else {
        loopBtn.textContent = '🔁 OFF';
        loopBtn.classList.remove('active-loop');
    }
});

function deleteSong(id) {
    if (!confirm('この曲を削除しますか？')) return;

    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const deleteRequest = store.delete(id);

    deleteRequest.onsuccess = function() {
        loadPlaylist();
    };
}
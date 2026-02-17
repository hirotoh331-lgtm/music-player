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
// 【変更】バージョンを 1 から 2 に上げました
const request = indexedDB.open('MusicPlayerDB', 2);

request.onupgradeneeded = function(event) {
    db = event.target.result;
    
    // 既存の songs ストア
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    }

    // 【追加】新しい playlists ストアを作成
    if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
    }
};

request.onsuccess = function(event) {
    db = event.target.result;
    console.log('DB接続成功 (v2)');
    // 最初はすべての曲を表示する
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
        loadPlaylist(); // 全曲リストを再読み込み
    };

    fileInput.value = '';
});

// --- 4. プレイリスト（全曲）の読み込みと表示 ---
function loadPlaylist() {
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = function() {
        const songs = getAllRequest.result;
        playlistData = songs; // グローバル変数を更新
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
            // 曲の削除は少し複雑になるため、全曲表示モードの時のみ許可するなどの制御が理想ですが
            // ここでは簡易的に songs ストアから削除するようにしています
            deleteSong(song.id);
        });

        item.appendChild(nameSpan);
        item.appendChild(deleteBtn);
        playlistDiv.appendChild(item);
    });
}

// --- 5. 指定した番号の曲を再生する機能 ---
function playSongAtIndex(index) {
    if (index < 0 || index >= playlistData.length) {
        console.log("再生リストの範囲外です。停止します。");
        return;
    }

    currentIndex = index;
    const songInfo = playlistData[currentIndex];

    // 再生時には常に songs ストアから Blob を取得する
    // (プレイリスト機能で songInfo は ID と Name しか持っていない可能性があるため)
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const getRequest = store.get(songInfo.id);

    getRequest.onsuccess = function() {
        const song = getRequest.result;
        if (song) {
            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
            }

            const fileUrl = URL.createObjectURL(song.blob);
            currentObjectUrl = fileUrl;

            songTitle.textContent = song.name;
            audioPlayer.src = fileUrl;
            
            renderPlaylist(); 
            playBtn.disabled = false;
            
            playAudio();

            // Media Session API 設定
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: song.name,
                    artist: 'My Player',
                    album: 'Local Music'
                });

                navigator.mediaSession.setActionHandler('play', function() { playAudio(); });
                navigator.mediaSession.setActionHandler('pause', function() { pauseAudio(); });
                navigator.mediaSession.setActionHandler('previoustrack', function() {
                    if (currentIndex > 0) playSongAtIndex(currentIndex - 1);
                });
                navigator.mediaSession.setActionHandler('nexttrack', function() {
                    if (currentIndex < playlistData.length - 1) playSongAtIndex(currentIndex + 1);
                });
            }
        }
    };
}

// --- 6. 連続再生の制御 ---
audioPlayer.addEventListener('ended', function() {
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
        // 現在表示しているリストの種類によって再読み込み処理を変えるのが理想ですが
        // 一旦基本の全曲リスト再読み込みを行います
        loadPlaylist();
    };
}

// ==========================================
// ▼▼▼ 以下、新しく追加したプレイリスト機能 ▼▼▼
// ==========================================

/**
 * ① 新しいプレイリストを作成する関数
 */
function createNewPlaylist(playlistName) {
    if (!playlistName) return;

    const transaction = db.transaction(['playlists'], 'readwrite');
    const store = transaction.objectStore('playlists');

    const newPlaylist = {
        name: playlistName,
        songIds: [], 
        created: new Date()
    };

    const request = store.add(newPlaylist);

    request.onsuccess = function() {
        alert(`プレイリスト「${playlistName}」を作成しました！`);
    };

    request.onerror = function() {
        console.error('プレイリスト作成失敗');
    };
}

/**
 * ② 指定したプレイリストに、曲を追加する関数
 */
function addSongToPlaylist(playlistId, songId) {
    // IDは数値型である必要があるので変換
    playlistId = Number(playlistId);
    songId = Number(songId);

    const transaction = db.transaction(['playlists'], 'readwrite');
    const store = transaction.objectStore('playlists');

    const getRequest = store.get(playlistId);

    getRequest.onsuccess = function() {
        const playlist = getRequest.result;

        if (!playlist) {
            console.error('プレイリストが見つかりません');
            return;
        }

        if (!playlist.songIds.includes(songId)) {
            playlist.songIds.push(songId);
            
            const updateRequest = store.put(playlist);
            updateRequest.onsuccess = function() {
                console.log(`プレイリスト「${playlist.name}」に曲を追加しました`);
                alert(`プレイリスト「${playlist.name}」に曲を追加しました！`);
            };
        } else {
            alert('この曲は既に追加されています');
        }
    };
}

/**
 * ③ プレイリストの中身を取得して再生準備する関数
 */
function loadSongsFromPlaylist(playlistId) {
    playlistId = Number(playlistId);
    
    const transaction = db.transaction(['playlists', 'songs'], 'readonly');
    const playlistStore = transaction.objectStore('playlists');
    const songStore = transaction.objectStore('songs');

    const playlistRequest = playlistStore.get(playlistId);

    playlistRequest.onsuccess = function() {
        const playlist = playlistRequest.result;
        if (!playlist || playlist.songIds.length === 0) {
            alert('このプレイリストは空か、存在しません');
            return;
        }

        console.log(`プレイリスト「${playlist.name}」を読み込み中...`);
        
        // 曲IDリストから実際の曲データを取得
        const promises = playlist.songIds.map(id => {
            return new Promise((resolve) => {
                const songRequest = songStore.get(id);
                songRequest.onsuccess = () => resolve(songRequest.result);
            });
        });

        Promise.all(promises).then(songs => {
            // 削除された曲などを除外
            const validSongs = songs.filter(song => song !== undefined);
            
            // 再生リストをこのプレイリストの内容に書き換え
            playlistData = validSongs;
            currentIndex = -1; 
            
            renderPlaylist(); 
            playSongAtIndex(0); // 1曲目から再生開始
            
            console.log(`プレイリスト「${playlist.name}」の再生を開始します`);
        });
    };
}

/**
 * デバッグ用：全てのプレイリストをコンソールに表示
 */
function showAllPlaylists() {
    const transaction = db.transaction(['playlists'], 'readonly');
    const store = transaction.objectStore('playlists');
    const request = store.getAll();
    request.onsuccess = function() {
        console.log('保存されているプレイリスト一覧:', request.result);
        alert('コンソール(F12)に一覧を表示しました');
    };
}
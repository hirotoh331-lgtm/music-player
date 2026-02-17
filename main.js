// --- 1. 要素の取得 ---
const fileInput = document.getElementById('file-input');
const audioPlayer = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const loopBtn = document.getElementById('loop-btn');
const songTitle = document.getElementById('song-title');
const mainView = document.getElementById('main-view');
const tabAll = document.getElementById('tab-all');
const tabPlaylists = document.getElementById('tab-playlists');
const fileInputWrapper = document.getElementById('file-input-wrapper');
const modal = document.getElementById('playlist-modal');
const modalList = document.getElementById('modal-list');
const modalClose = document.getElementById('modal-close');
const installBtn = document.getElementById('install-btn');

// --- グローバル変数 ---
let db;
let currentObjectUrl = null;
let playlistData = []; 
let currentIndex = -1; 
let currentViewMode = 'all'; // 'all', 'playlists', 'folder'
let currentFolderId = null;
let deferredPrompt; // インストールイベント保存用

// --- 2. データベース初期化 ---
const request = indexedDB.open('MusicPlayerDB', 2);

request.onupgradeneeded = function(event) {
    db = event.target.result;
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    }
    if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
    }
};

request.onsuccess = function(event) {
    db = event.target.result;
    console.log('DB接続成功');
    switchTab('all');
};

// --- 3. インストールボタン機能 (PWA) ---
window.addEventListener('beforeinstallprompt', (e) => {
    // Chromeが自動で出すインストールバナーをキャンセル
    e.preventDefault();
    // イベントを保存しておく
    deferredPrompt = e;
    // ボタンを表示する
    installBtn.style.display = 'block';
});

installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    // インストールプロンプトを表示
    deferredPrompt.prompt();
    // ユーザーの選択結果を待つ
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`インストール結果: ${outcome}`);
    // イベントは一度しか使えないのでリセット
    deferredPrompt = null;
    installBtn.style.display = 'none';
});


// --- 4. タブ切り替え ---
tabAll.addEventListener('click', () => switchTab('all'));
tabPlaylists.addEventListener('click', () => switchTab('playlists'));

function switchTab(mode) {
    currentViewMode = mode;
    currentFolderId = null;

    if (mode === 'all') {
        tabAll.classList.add('active');
        tabPlaylists.classList.remove('active');
        fileInputWrapper.style.display = 'block';
        loadAllSongs();
    } else {
        tabAll.classList.remove('active');
        tabPlaylists.classList.add('active');
        fileInputWrapper.style.display = 'none';
        loadPlaylistsView();
    }
}

// --- 5. リスト表示の共通ロジック ---
// 引数 songs: 表示する曲のリスト
// 引数 showAddBtn: 「＋(プレイリストへ追加)」を表示するか
function renderSongList(songs, showAddBtn) {
    // フォルダ表示時は、ヘッダー（戻るボタン等）を残すため、全クリアせずにリスト部分だけ更新したい
    // だが簡易実装のため、folderモードの時は loadSongsFromPlaylist 内で処理する
    // ここでは主に 'all' モード用として使う、またはfolderモードの下請けとして使う
    
    // コンテナをクリアする場合（folderモード以外）
    if (currentViewMode === 'all') {
        mainView.innerHTML = '';
    }

    if (!songs || songs.length === 0) {
        const msg = document.createElement('p');
        msg.style.color = '#888';
        msg.style.textAlign = 'center';
        msg.style.padding = '20px';
        msg.textContent = '曲がありません';
        mainView.appendChild(msg);
        return;
    }

    songs.forEach(function(song, index) {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        
        // 再生中の曲をハイライト（IDで比較するほうが確実）
        // ただし playlistData と表示順が一致している前提
        if (playlistData[index] && playlistData[index].id === song.id && index === currentIndex) {
            item.classList.add('playing');
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'song-name';
        nameSpan.textContent = song.name;
        nameSpan.addEventListener('click', () => {
            // 現在のリストを再生対象にする
            playlistData = songs;
            playSongAtIndex(index);
            // UI更新
            document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('playing'));
            item.classList.add('playing');
        });

        item.appendChild(nameSpan);

        // 「＋」ボタン（プレイリストに追加）
        if (showAddBtn) {
            const addBtn = document.createElement('button');
            addBtn.textContent = '➕';
            addBtn.className = 'action-btn';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openAddToPlaylistModal(song.id);
            });
            item.appendChild(addBtn);
        }

        // 削除ボタン
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑';
        deleteBtn.className = 'action-btn';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDelete(song.id);
        });
        item.appendChild(deleteBtn);

        mainView.appendChild(item);
    });
}

// --- 6. 削除処理の分岐 ---
function handleDelete(songId) {
    if (currentViewMode === 'all') {
        // 全削除
        if (!confirm('この曲を端末から完全に削除しますか？')) return;
        const t = db.transaction(['songs'], 'readwrite');
        t.objectStore('songs').delete(songId).onsuccess = () => loadAllSongs();
    
    } else if (currentViewMode === 'folder' && currentFolderId) {
        // プレイリストから除外
        if (!confirm('プレイリストから除外しますか？（曲データは消えません）')) return;
        removeSongFromPlaylist(currentFolderId, songId);
    }
}

// プレイリストからIDを除去する関数
function removeSongFromPlaylist(playlistId, songId) {
    const transaction = db.transaction(['playlists'], 'readwrite');
    const store = transaction.objectStore('playlists');
    
    store.get(playlistId).onsuccess = function(e) {
        const playlist = e.target.result;
        if (playlist) {
            // IDを除外した新しい配列を作る
            const newSongIds = playlist.songIds.filter(id => id !== songId);
            
            // 変更があれば保存
            if (newSongIds.length !== playlist.songIds.length) {
                playlist.songIds = newSongIds;
                store.put(playlist).onsuccess = function() {
                    // 画面を再読み込み
                    loadSongsFromPlaylist(playlistId);
                };
            }
        }
    };
}


// --- 7. 各画面の読み込み ---

function loadAllSongs() {
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    store.getAll().onsuccess = function(e) {
        const songs = e.target.result;
        renderSongList(songs, true); // true = ＋ボタンあり
    };
}

function loadPlaylistsView() {
    const transaction = db.transaction(['playlists'], 'readonly');
    const store = transaction.objectStore('playlists');
    store.getAll().onsuccess = function(e) {
        renderFolders(e.target.result);
    };
}

function renderFolders(playlists) {
    mainView.innerHTML = '';

    const createBtn = document.createElement('button');
    createBtn.className = 'create-playlist-btn';
    createBtn.textContent = '➕ 新しいプレイリストを作成';
    createBtn.addEventListener('click', () => {
        const name = prompt('プレイリスト名を入力してください:');
        if (name) createNewPlaylist(name);
    });
    mainView.appendChild(createBtn);

    playlists.forEach(pl => {
        const folder = document.createElement('div');
        folder.className = 'folder-item';
        folder.innerHTML = `
            <div class="folder-icon">📂</div>
            <div class="folder-info">
                <div style="font-weight:bold;">${pl.name}</div>
                <div style="font-size:0.8rem; color:#888;">${pl.songIds.length}曲</div>
            </div>
            <div style="font-size:1.5rem;">›</div>
        `;
        folder.addEventListener('click', () => openPlaylistFolder(pl.id));
        mainView.appendChild(folder);
    });
}

function openPlaylistFolder(id) {
    currentViewMode = 'folder';
    currentFolderId = id;
    loadSongsFromPlaylist(id);
}

function loadSongsFromPlaylist(playlistId) {
    const transaction = db.transaction(['playlists', 'songs'], 'readonly');
    const plStore = transaction.objectStore('playlists');
    const songStore = transaction.objectStore('songs');

    plStore.get(playlistId).onsuccess = function(e) {
        const playlist = e.target.result;
        if (!playlist) return;

        const promises = playlist.songIds.map(id => {
            return new Promise(resolve => {
                songStore.get(id).onsuccess = (ev) => resolve(ev.target.result);
            });
        });

        Promise.all(promises).then(songs => {
            // nullを除外
            const validSongs = songs.filter(s => s !== undefined);
            
            // 画面構築
            mainView.innerHTML = '';
            
            // 戻るボタン
            const backBtn = document.createElement('button');
            backBtn.className = 'back-btn';
            backBtn.textContent = '← プレイリスト一覧に戻る';
            backBtn.addEventListener('click', () => switchTab('playlists'));
            mainView.appendChild(backBtn);

            // ヘッダー
            const header = document.createElement('div');
            header.style.padding = '0 10px 10px';
            header.innerHTML = `<strong>📂 ${playlist.name}</strong> (${validSongs.length}曲)`;
            mainView.appendChild(header);

            // リスト描画 (＋ボタンは非表示)
            // ここでグローバルの mainView に追記させる形になる
            renderSongList(validSongs, false);
        });
    };
}


// --- 8. 基本機能（再生・追加・モーダル） ---

fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const t = db.transaction(['songs'], 'readwrite');
    t.objectStore('songs').add({ name: file.name, blob: file, created: new Date() }).onsuccess = function() {
        if (currentViewMode === 'all') loadAllSongs();
    };
    fileInput.value = '';
});

function playSongAtIndex(index) {
    if (index < 0 || index >= playlistData.length) return;
    currentIndex = index;
    const songInfo = playlistData[currentIndex];

    // 再生時は常にsongsストアから最新のBlobを取る
    const t = db.transaction(['songs'], 'readonly');
    t.objectStore('songs').get(songInfo.id).onsuccess = function(e) {
        const song = e.target.result;
        if (song) {
            if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = URL.createObjectURL(song.blob);
            
            songTitle.textContent = song.name;
            audioPlayer.src = currentObjectUrl;
            
            playBtn.disabled = false;
            playAudio();
            setupMediaSession(song.name);
            
            // 再生中表示の更新
            document.querySelectorAll('.playlist-item').forEach((el, idx) => {
               // 簡易的にindexで比較（リストの並び順が変わっていない前提）
               if(idx === index) el.classList.add('playing');
               else el.classList.remove('playing');
            });
        }
    };
}

function openAddToPlaylistModal(songId) {
    modal.style.display = 'flex';
    modalList.innerHTML = '読み込み中...';
    const t = db.transaction(['playlists'], 'readonly');
    t.objectStore('playlists').getAll().onsuccess = function(e) {
        const playlists = e.target.result;
        modalList.innerHTML = '';
        if (playlists.length === 0) {
            modalList.innerHTML = '<p>プレイリストがありません</p>';
        }
        playlists.forEach(pl => {
            const btn = document.createElement('button');
            btn.textContent = `📂 ${pl.name}`;
            btn.addEventListener('click', () => {
                addSongToPlaylist(pl.id, songId);
                modal.style.display = 'none';
            });
            modalList.appendChild(btn);
        });
    };
}
modalClose.addEventListener('click', () => modal.style.display = 'none');

function createNewPlaylist(name) {
    const t = db.transaction(['playlists'], 'readwrite');
    t.objectStore('playlists').add({ name: name, songIds: [], created: new Date() }).onsuccess = () => loadPlaylistsView();
}

function addSongToPlaylist(playlistId, songId) {
    const t = db.transaction(['playlists'], 'readwrite');
    const store = t.objectStore('playlists');
    store.get(playlistId).onsuccess = function(e) {
        const pl = e.target.result;
        if (!pl.songIds.includes(songId)) {
            pl.songIds.push(songId);
            store.put(pl).onsuccess = () => alert(`「${pl.name}」に追加しました`);
        } else {
            alert('既に追加されています');
        }
    };
}

// Play Control
playBtn.addEventListener('click', () => audioPlayer.paused ? playAudio() : pauseAudio());
function playAudio() { audioPlayer.play(); playBtn.textContent = '⏸️'; }
function pauseAudio() { audioPlayer.pause(); playBtn.textContent = '▶️'; }

audioPlayer.addEventListener('ended', () => {
    if (currentIndex < playlistData.length - 1) playSongAtIndex(currentIndex + 1);
    else playBtn.textContent = '▶️';
});

loopBtn.addEventListener('click', () => {
    audioPlayer.loop = !audioPlayer.loop;
    loopBtn.textContent = audioPlayer.loop ? '🔁 ON' : '🔁 OFF';
    loopBtn.classList.toggle('active-loop');
});

function setupMediaSession(title) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: title });
        navigator.mediaSession.setActionHandler('play', playAudio);
        navigator.mediaSession.setActionHandler('pause', pauseAudio);
        navigator.mediaSession.setActionHandler('previoustrack', () => {
             if (currentIndex > 0) playSongAtIndex(currentIndex - 1);
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
             if (currentIndex < playlistData.length - 1) playSongAtIndex(currentIndex + 1);
        });
    }
}
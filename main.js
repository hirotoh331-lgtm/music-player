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
let currentViewMode = 'all'; 
let currentFolderId = null;
let deferredPrompt; 

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

// --- 3. インストールボタン (PWA) ---
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'block';
});

installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
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
function renderSongList(songs, showAddBtn, isInsidePlaylist = false) {
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
        
        if (playlistData[index] && playlistData[index].id === song.id && index === currentIndex) {
            item.classList.add('playing');
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'song-name';
        nameSpan.textContent = song.name;
        nameSpan.addEventListener('click', () => {
            playlistData = songs;
            playSongAtIndex(index);
            document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('playing'));
            item.classList.add('playing');
        });
        item.appendChild(nameSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';

        if (isInsidePlaylist) {
            const upBtn = document.createElement('button');
            upBtn.textContent = '⬆️';
            upBtn.className = 'order-btn';
            if (index === 0) upBtn.disabled = true;
            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                movePlaylistSong(currentFolderId, index, -1);
            });
            actionsDiv.appendChild(upBtn);

            const downBtn = document.createElement('button');
            downBtn.textContent = '⬇️';
            downBtn.className = 'order-btn';
            if (index === songs.length - 1) downBtn.disabled = true;
            downBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                movePlaylistSong(currentFolderId, index, 1);
            });
            actionsDiv.appendChild(downBtn);
        }

        if (showAddBtn) {
            const addBtn = document.createElement('button');
            addBtn.textContent = '➕';
            addBtn.className = 'action-btn';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openAddToPlaylistModal(song.id);
            });
            actionsDiv.appendChild(addBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑';
        deleteBtn.className = 'action-btn';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDelete(song.id);
        });
        actionsDiv.appendChild(deleteBtn);

        item.appendChild(actionsDiv);
        mainView.appendChild(item);
    });
}

// --- 6. 順番入れ替え・削除ロジック ---
function movePlaylistSong(playlistId, index, direction) {
    const t = db.transaction(['playlists'], 'readwrite');
    const store = t.objectStore('playlists');

    store.get(playlistId).onsuccess = function(e) {
        const pl = e.target.result;
        if (!pl) return;

        const songId = pl.songIds[index];
        pl.songIds.splice(index, 1);
        pl.songIds.splice(index + direction, 0, songId);

        store.put(pl).onsuccess = function() {
            loadSongsFromPlaylist(playlistId);
        };
    };
}

function handleDelete(songId) {
    if (currentViewMode === 'all') {
        if (!confirm('この曲を端末から完全に削除しますか？')) return;
        const t = db.transaction(['songs'], 'readwrite');
        t.objectStore('songs').delete(songId).onsuccess = () => loadAllSongs();
    
    } else if (currentViewMode === 'folder' && currentFolderId) {
        if (!confirm('プレイリストから除外しますか？（曲データは消えません）')) return;
        removeSongFromPlaylist(currentFolderId, songId);
    }
}

function removeSongFromPlaylist(playlistId, songId) {
    const transaction = db.transaction(['playlists'], 'readwrite');
    const store = transaction.objectStore('playlists');
    
    store.get(playlistId).onsuccess = function(e) {
        const playlist = e.target.result;
        if (playlist) {
            playlist.songIds = playlist.songIds.filter(id => id !== songId);
            store.put(playlist).onsuccess = function() {
                loadSongsFromPlaylist(playlistId);
            };
        }
    };
}

function deletePlaylist(playlistId) {
    if (!confirm('このプレイリストを削除しますか？（中の曲は消えません）')) return;
    const t = db.transaction(['playlists'], 'readwrite');
    t.objectStore('playlists').delete(playlistId).onsuccess = function() {
        loadPlaylistsView();
    };
}

// --- 7. 各画面の読み込み ---
function loadAllSongs() {
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    store.getAll().onsuccess = function(e) {
        const songs = e.target.result;
        renderSongList(songs, true, false); 
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
        
        const infoDiv = document.createElement('div');
        infoDiv.style.display = 'flex';
        infoDiv.style.alignItems = 'center';
        infoDiv.style.flexGrow = '1';
        infoDiv.innerHTML = `
            <div class="folder-icon">📂</div>
            <div class="folder-info">
                <div style="font-weight:bold;">${pl.name}</div>
                <div style="font-size:0.8rem; color:#888;">${pl.songIds.length}曲</div>
            </div>
        `;
        infoDiv.addEventListener('click', () => openPlaylistFolder(pl.id));
        folder.appendChild(infoDiv);

        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑';
        delBtn.className = 'delete-pl-btn';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deletePlaylist(pl.id);
        });
        folder.appendChild(delBtn);

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
            const validSongs = songs.filter(s => s !== undefined);
            
            mainView.innerHTML = '';
            
            const backBtn = document.createElement('button');
            backBtn.className = 'back-btn';
            backBtn.textContent = '← プレイリスト一覧に戻る';
            backBtn.addEventListener('click', () => switchTab('playlists'));
            mainView.appendChild(backBtn);

            const header = document.createElement('div');
            header.style.padding = '0 10px 10px';
            header.innerHTML = `<strong>📂 ${playlist.name}</strong> (${validSongs.length}曲)`;
            mainView.appendChild(header);

            renderSongList(validSongs, false, true);
        });
    };
}


// --- 8. 基本機能（一括アップロード対応） ---

fileInput.addEventListener('change', function(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // 複数ファイルをPromiseで並列処理
    const promises = Array.from(files).map(file => {
        return new Promise((resolve) => {
            const t = db.transaction(['songs'], 'readwrite');
            const req = t.objectStore('songs').add({ 
                name: file.name, 
                blob: file, 
                created: new Date() 
            });
            req.onsuccess = () => resolve();
            req.onerror = () => resolve(); // エラーでも止まらないように
        });
    });

    // 全部の保存が終わったら画面を更新
    Promise.all(promises).then(() => {
        if (currentViewMode === 'all') {
            loadAllSongs();
        } else {
            // プレイリスト画面にいたら、完了メッセージだけ出してあげる
            alert(`${files.length}曲を追加しました。「すべての曲」から確認できます。`);
        }
    });

    fileInput.value = '';
});

function playSongAtIndex(index) {
    if (index < 0 || index >= playlistData.length) return;
    currentIndex = index;
    const songInfo = playlistData[currentIndex];

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
            
            document.querySelectorAll('.playlist-item').forEach((el, idx) => {
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
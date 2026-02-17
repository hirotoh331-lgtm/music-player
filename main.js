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

// --- グローバル変数 ---
let db;
let currentObjectUrl = null;

// 再生リスト管理
let playlistData = []; 
let currentIndex = -1; 

// 現在の画面モード ('all' = すべての曲, 'playlists' = プレイリスト一覧, 'folder' = プレイリストの中身)
let currentViewMode = 'all'; 
let currentFolderId = null; // 今開いているプレイリストID

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
    // 初期表示は「すべての曲」
    switchTab('all');
};

// --- 3. UI操作（タブ切り替え） ---
tabAll.addEventListener('click', () => switchTab('all'));
tabPlaylists.addEventListener('click', () => switchTab('playlists'));

function switchTab(mode) {
    currentViewMode = mode;

    // タブの見た目を切り替え
    if (mode === 'all') {
        tabAll.classList.add('active');
        tabPlaylists.classList.remove('active');
        fileInputWrapper.style.display = 'block'; // 追加ボタン表示
        loadAllSongs(); // 全曲読み込み
    } else {
        tabAll.classList.remove('active');
        tabPlaylists.classList.add('active');
        fileInputWrapper.style.display = 'none'; // 追加ボタン非表示
        loadPlaylistsView(); // プレイリスト一覧読み込み
    }
}

// --- 4. 「すべての曲」表示処理 ---
function loadAllSongs() {
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const request = store.getAll();

    request.onsuccess = function() {
        // 再生リストを全曲で更新（※再生中にタブを変えても止まらないようにする工夫が必要ですが、今回はシンプルに上書き）
        // 理想的には「表示用リスト」と「再生用リスト」を分けるべきですが、複雑になるため
        // ここでは「画面を切り替えると再生リストも切り替わる」仕様にします。
        playlistData = request.result;
        renderSongList(true); // true = 「＋」ボタンを表示する
    };
}

function renderSongList(showAddBtn) {
    mainView.innerHTML = '';

    if (playlistData.length === 0) {
        mainView.innerHTML = '<p style="color: #888; text-align:center; padding:20px;">曲がありません</p>';
        return;
    }

    playlistData.forEach(function(song, index) {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        if (index === currentIndex) item.classList.add('playing');

        // 曲名
        const nameSpan = document.createElement('span');
        nameSpan.className = 'song-name';
        nameSpan.textContent = song.name;
        nameSpan.addEventListener('click', () => playSongAtIndex(index));

        item.appendChild(nameSpan);

        // 「＋」ボタン（プレイリストへ追加）
        if (showAddBtn) {
            const addBtn = document.createElement('button');
            addBtn.textContent = '➕';
            addBtn.className = 'action-btn';
            addBtn.title = "プレイリストに追加";
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
            if (currentViewMode === 'folder') {
                // プレイリストから除外する処理（今回は省略、実装難易度高いため）
                alert('プレイリストからの削除機能は未実装です');
            } else {
                deleteSong(song.id);
            }
        });
        item.appendChild(deleteBtn);

        mainView.appendChild(item);
    });
}

// --- 5. 「プレイリスト一覧」表示処理 ---
function loadPlaylistsView() {
    const transaction = db.transaction(['playlists'], 'readonly');
    const store = transaction.objectStore('playlists');
    const request = store.getAll();

    request.onsuccess = function() {
        const playlists = request.result;
        renderFolders(playlists);
    };
}

function renderFolders(playlists) {
    mainView.innerHTML = '';

    // 「新規作成」ボタン
    const createBtn = document.createElement('button');
    createBtn.className = 'create-playlist-btn';
    createBtn.textContent = '➕ 新しいプレイリストを作成';
    createBtn.addEventListener('click', () => {
        const name = prompt('プレイリスト名を入力してください:');
        if (name) createNewPlaylist(name);
    });
    mainView.appendChild(createBtn);

    // フォルダ一覧
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

// --- 6. プレイリストの中身を開く処理 ---
function openPlaylistFolder(id) {
    currentViewMode = 'folder';
    currentFolderId = id;

    // UI: 「戻るボタン」を表示
    mainView.innerHTML = '';
    const backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.textContent = '← プレイリスト一覧に戻る';
    backBtn.addEventListener('click', () => switchTab('playlists'));
    mainView.appendChild(backBtn);

    // 読み込み
    loadSongsFromPlaylist(id);
}

// --- 7. 曲の保存 ---
fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const songData = { name: file.name, blob: file, created: new Date() };

    store.add(songData).onsuccess = function() {
        if (currentViewMode === 'all') loadAllSongs();
    };
    fileInput.value = '';
});

// --- 8. 再生機能（変更なし） ---
function playSongAtIndex(index) {
    if (index < 0 || index >= playlistData.length) return;

    currentIndex = index;
    const songInfo = playlistData[currentIndex];

    // Blobを取得して再生
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const getRequest = store.get(songInfo.id);

    getRequest.onsuccess = function() {
        const song = getRequest.result;
        if (song) {
            if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = URL.createObjectURL(song.blob);
            
            songTitle.textContent = song.name;
            audioPlayer.src = currentObjectUrl;
            
            // UI更新（再生中クラスの付け替え）
            const items = document.querySelectorAll('.playlist-item');
            items.forEach((item, idx) => {
                if (idx === index) item.classList.add('playing');
                else item.classList.remove('playing');
            });
            
            playBtn.disabled = false;
            playAudio();
            setupMediaSession(song.name);
        }
    };
}

// --- 9. プレイリスト追加モーダル機能 ---
function openAddToPlaylistModal(songId) {
    modal.style.display = 'flex';
    modalList.innerHTML = '読み込み中...';

    const transaction = db.transaction(['playlists'], 'readonly');
    const store = transaction.objectStore('playlists');
    const request = store.getAll();

    request.onsuccess = function() {
        const playlists = request.result;
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

modalClose.addEventListener('click', () => {
    modal.style.display = 'none';
});

// --- 10. 共通ロジック（DB操作など） ---

function createNewPlaylist(name) {
    const transaction = db.transaction(['playlists'], 'readwrite');
    const store = transaction.objectStore('playlists');
    store.add({ name: name, songIds: [], created: new Date() }).onsuccess = function() {
        loadPlaylistsView();
    };
}

function addSongToPlaylist(playlistId, songId) {
    const transaction = db.transaction(['playlists'], 'readwrite');
    const store = transaction.objectStore('playlists');
    const getRequest = store.get(playlistId);

    getRequest.onsuccess = function() {
        const playlist = getRequest.result;
        if (!playlist.songIds.includes(songId)) {
            playlist.songIds.push(songId);
            store.put(playlist).onsuccess = () => alert(`「${playlist.name}」に追加しました`);
        } else {
            alert('既に追加されています');
        }
    };
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
            playlistData = songs.filter(s => s !== undefined);
            // プレイリスト曲一覧を表示（＋ボタンは非表示）
            
            // ヘッダーを追加（どのフォルダか分かるように）
            const header = document.createElement('div');
            header.style.padding = '10px';
            header.style.marginBottom = '10px';
            header.style.borderBottom = '1px solid #555';
            header.innerHTML = `<strong>📂 ${playlist.name}</strong> (${playlistData.length}曲)`;
            mainView.appendChild(header);

            // 曲リストを描画（既存の関数を利用するが、appendするので注意）
            // renderSongListは innerHTML='' してしまうので、ここでは手動で描画するか
            // renderSongListを改造する。今回はシンプルにここで描画ロジックを回します。
            
            if (playlistData.length === 0) {
                 const msg = document.createElement('p');
                 msg.textContent = '曲がありません';
                 msg.style.textAlign = 'center';
                 mainView.appendChild(msg);
            }

            playlistData.forEach((song, index) => {
                const item = document.createElement('div');
                item.className = 'playlist-item';
                item.innerHTML = `<span class="song-name">${song.name}</span>`;
                item.querySelector('.song-name').addEventListener('click', () => playSongAtIndex(index));
                mainView.appendChild(item);
            });
        });
    };
}

function deleteSong(id) {
    if (!confirm('本当に削除しますか？')) return;
    const t = db.transaction(['songs'], 'readwrite');
    t.objectStore('songs').delete(id).onsuccess = () => loadAllSongs();
}

// Media Session, Play/Pause, Loop logic
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
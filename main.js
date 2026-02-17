// --- 1. 要素の取得 ---
const fileInput = document.getElementById('file-input');
const audioPlayer = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const loopBtn = document.getElementById('loop-btn');
const songTitle = document.getElementById('song-title');
const playlistDiv = document.getElementById('playlist');

// データベースを入れる変数
let db;
// 前回のURLを削除するために保持する変数（メモリ節約用）
let currentObjectUrl = null;

// --- 2. データベースの初期化（開く・作る） ---
// アプリ起動時に1回だけ実行されます
const request = indexedDB.open('MusicPlayerDB', 1);

// DBがまだない時、またはバージョンが上がった時に実行される（倉庫の建設）
request.onupgradeneeded = function(event) {
    db = event.target.result;
    // 'songs'という名前の保存場所を作成
    // keyPath: 'id' は、データの背番号を 'id' という名前にするという意味
    // autoIncrement: true は、背番号を 1, 2, 3... と自動で振るという意味
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    }
};

// DBが無事に開けた時に実行される
request.onsuccess = function(event) {
    db = event.target.result;
    console.log('データベース接続成功');
    // 保存されている曲を表示する
    loadPlaylist();
};

// エラーが起きた時
request.onerror = function(event) {
    console.error('データベースエラー:', event.target.errorCode);
    alert('データベースを開けませんでした');
};

// --- 3. ファイル選択時の保存処理 ---
fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // トランザクション（読み書きの権限）を開始
    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');

    // 保存するデータを作る
    const songData = {
        name: file.name,
        blob: file, // 音楽データそのもの
        created: new Date() // 保存した日時
    };

    // データを追加する
    const addRequest = store.add(songData);

    addRequest.onsuccess = function() {
        alert('曲を保存しました！');
        loadPlaylist(); // リストを更新
    };

    addRequest.onerror = function() {
        alert('保存に失敗しました。容量オーバーの可能性があります。');
    };

    // ファイル選択状態をリセット（同じファイルを連続で選べるようにするため）
    fileInput.value = '';
});

// --- 4. プレイリスト（保存済み一覧）の表示 ---
function loadPlaylist() {
    // 読み取り専用でストアを開く
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    
    // すべてのデータを取得する
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = function() {
        const songs = getAllRequest.result;
        renderPlaylist(songs);
    };
}

// 取得したデータをもとにHTMLを作る関数
function renderPlaylist(songs) {
    playlistDiv.innerHTML = ''; // 一旦リストを空にする

    if (songs.length === 0) {
        playlistDiv.innerHTML = '<p style="color: #888; text-align:center;">保存された曲はありません</p>';
        return;
    }

    // 曲の数だけループしてHTMLを作る
    songs.forEach(function(song) {
        // コンテナ作成
        const item = document.createElement('div');
        item.className = 'playlist-item';
        
        // 曲名部分
        const nameSpan = document.createElement('span');
        nameSpan.className = 'song-name';
        nameSpan.textContent = song.name;
        // クリックしたら再生する設定
        nameSpan.addEventListener('click', () => playSongFromDB(song.id));

        // 削除ボタン
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑';
        deleteBtn.className = 'delete-btn';
        // クリックしたら削除する設定
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 親要素のクリックイベント（再生）を止める
            deleteSong(song.id);
        });

        // 画面に追加
        item.appendChild(nameSpan);
        item.appendChild(deleteBtn);
        playlistDiv.appendChild(item);
    });
}

// --- 5. データベースから曲を取り出して再生する ---
function playSongFromDB(id) {
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const getRequest = store.get(id);

    getRequest.onsuccess = function() {
        const song = getRequest.result;
        if (song) {
            // 前の曲のURLがあればメモリ解放（スマホの重さを軽減）
            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
            }

            // DBから取り出したBlob（ファイル）をURLに変換
            const fileUrl = URL.createObjectURL(song.blob);
            currentObjectUrl = fileUrl; // 次回消すために覚えておく

            // プレーヤーにセットして再生
            songTitle.textContent = song.name;
            audioPlayer.src = fileUrl;
            playBtn.disabled = false;
            
            // UIの更新（再生中クラスの付け替え）
            updateActiveItem(song.name);
            
            playAudio();
        }
    };
}

// 再生中の曲に色をつける関数
function updateActiveItem(songName) {
    const items = document.querySelectorAll('.playlist-item');
    items.forEach(item => {
        const name = item.querySelector('.song-name').textContent;
        if (name === songName) {
            item.classList.add('playing');
        } else {
            item.classList.remove('playing');
        }
    });
}

// --- 6. 曲の削除機能 ---
function deleteSong(id) {
    if (!confirm('この曲を削除しますか？')) return;

    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const deleteRequest = store.delete(id);

    deleteRequest.onsuccess = function() {
        loadPlaylist(); // リストを更新
    };
}

// --- 7. プレーヤーの基本操作（ステップ1と同じ） ---
playBtn.addEventListener('click', function() {
    if (audioPlayer.paused) {
        playAudio();
    } else {
        pauseAudio();
    }
});

function playAudio() {
    audioPlayer.play().catch(e => console.log('再生エラー(自動再生制限など):', e));
    playBtn.textContent = '⏸️'; // 停止マーク
}

function pauseAudio() {
    audioPlayer.pause();
    playBtn.textContent = '▶️'; // 再生マーク
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

audioPlayer.addEventListener('ended', function() {
    if (!audioPlayer.loop) {
        playBtn.textContent = '▶️';
    }
});
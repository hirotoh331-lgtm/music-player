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

// 【重要】プレイリスト管理用の変数
let playlistData = []; // 曲のリスト（IDと名前だけ持つ軽量なリスト）
let currentIndex = -1; // 今何番目の曲を再生しているか（0スタート）

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
    loadPlaylist(); // アプリ起動時にリストを読み込む
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
        // 保存したらリストを再読み込み
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
        
        // 【重要】重いデータ(blob)はメモリに常駐させず、必要な情報だけ配列に入れる
        // ここでは将来の拡張性を考えて、一旦全データを渡していますが、
        // 再生時には再度DBからBlobを取る方式にします。
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

    // 配列(playlistData)の中身を順番に処理
    playlistData.forEach(function(song, index) {
        const item = document.createElement('div');
        item.className = 'playlist-item';

        // 再生中の曲なら色を変える
        if (index === currentIndex) {
            item.classList.add('playing');
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'song-name';
        nameSpan.textContent = song.name;
        
        // 【重要】クリックしたら「この番号(index)の曲を再生して」と指示する
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

// --- 5. 指定した番号の曲を再生する機能 ---
function playSongAtIndex(index) {
    // 範囲外のチェック（リストの最後を超えたら停止）
    if (index < 0 || index >= playlistData.length) {
        console.log("再生リストの範囲外です。停止します。");
        return;
    }

    // インデックスを更新
    currentIndex = index;

    // 再生する曲の情報を配列から取得
    const songInfo = playlistData[currentIndex];

    // DBから「その曲の音楽データ(blob)」を取りに行く
    // ※配列にはblobを持たせていない（メモリ節約）ため
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
            
            // UI更新（再生中の曲を目立たせる）
            renderPlaylist(); // リストを再描画して色を更新
            playBtn.disabled = false;
            
            playAudio();
        }
    };
}

// --- 6. 連続再生の制御 ---
// 曲が終わった時に呼ばれるイベント
audioPlayer.addEventListener('ended', function() {
    // ループONの場合（audioPlayer.loop = true）は、
    // ブラウザが勝手にリピートするので、ここには来ない（または無視される）。
    // ループOFFの場合だけここに来る。

    // 次の曲へ進む
    const nextIndex = currentIndex + 1;

    // 次の曲があるかチェック
    if (nextIndex < playlistData.length) {
        // 次の曲を再生
        playSongAtIndex(nextIndex);
    } else {
        // 最後の曲だったので停止状態にする
        playBtn.textContent = '▶️';
        console.log('全曲再生終了');
        
        // 最初に戻したい場合はここを有効にする
        // playSongAtIndex(0); 
        // pauseAudio(); // 止めておく
    }
});

// --- 7. 基本操作（再生・停止・削除・ループ） ---

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

// ループボタン（1曲リピート）
loopBtn.addEventListener('click', function() {
    audioPlayer.loop = !audioPlayer.loop;
    if (audioPlayer.loop) {
        loopBtn.textContent = '🔁 ON'; // 1曲リピート中
        loopBtn.classList.add('active-loop');
    } else {
        loopBtn.textContent = '🔁 OFF'; // リピートなし（次は次の曲へ）
        loopBtn.classList.remove('active-loop');
    }
});

function deleteSong(id) {
    if (!confirm('この曲を削除しますか？')) return;

    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const deleteRequest = store.delete(id);

    deleteRequest.onsuccess = function() {
        // もし再生中の曲を消したら停止するなどの処理が必要だが、
        // まずはシンプルにリスト更新のみ行う
        // もし現在再生中の曲より前の曲を消すとindexがズレるが、次回再生時に直る
        loadPlaylist();
    };
}
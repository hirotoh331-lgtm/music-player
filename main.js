// --- 1. HTMLの部品（要素）をJavaScriptで使えるように取得する ---
const fileInput = document.getElementById('file-input');
const audioPlayer = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const loopBtn = document.getElementById('loop-btn');
const songTitle = document.getElementById('song-title');

// --- 2. ファイルが選択された時の動き ---
fileInput.addEventListener('change', function(event) {
    // 選択されたファイル（1つ目）を取り出す
    const file = event.target.files[0];

    // ファイルが空っぽなら何もしない
    if (!file) return;

    // 画面の曲名を更新する
    songTitle.textContent = file.name;

    // 【重要】ブラウザがこのファイルを再生できるように、
    // スマホ内部専用のURL（Blob URLといいます）を生成する
    // 例: blob:http://localhost:5500/xxxx-xxxx... みたいなURLができる
    const fileUrl = URL.createObjectURL(file);

    // オーディオタグにそのURLをセットする
    audioPlayer.src = fileUrl;

    // 再生ボタンを押せるように有効化する
    playBtn.disabled = false;
    
    // 準備ができたら自動で再生する（スマホだと自動再生されないこともある）
    playAudio();
});

// --- 3. 再生/一時停止ボタンが押された時の動き ---
playBtn.addEventListener('click', function() {
    // もし再生中なら停止、停止中なら再生する
    if (audioPlayer.paused) {
        playAudio();
    } else {
        pauseAudio();
    }
});

// 再生する関数
function playAudio() {
    audioPlayer.play();
    playBtn.textContent = '⏸️'; // アイコンを停止マークに変える
}

// 停止する関数
function pauseAudio() {
    audioPlayer.pause();
    playBtn.textContent = '▶️'; // アイコンを再生マークに変える
}

// --- 4. ループボタンが押された時の動き ---
loopBtn.addEventListener('click', function() {
    // 現在のループ状態を反転させる（trueならfalse、falseならtrue）
    audioPlayer.loop = !audioPlayer.loop;

    if (audioPlayer.loop) {
        loopBtn.textContent = '🔁 ON';
        loopBtn.classList.add('active-loop'); // 緑色にするクラスを追加
    } else {
        loopBtn.textContent = '🔁 OFF';
        loopBtn.classList.remove('active-loop'); // 緑色のクラスを削除
    }
});

// --- 5. 曲が終わった時の動き（ループOFFの時） ---
// 曲が終わったらアイコンを「再生」に戻す必要がある
audioPlayer.addEventListener('ended', function() {
    // ループONの場合は自動で最初に戻るので、ここはループOFFの時だけ動く
    if (!audioPlayer.loop) {
        playBtn.textContent = '▶️';
    }
});
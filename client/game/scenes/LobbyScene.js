class LobbyScene extends Phaser.Scene {
  constructor() { super('Lobby'); }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this.add.text(W / 2, H / 2 - 80, '🎮 WebRTC Shooter', {
      fontSize: '36px', color: '#f1f5f9', fontStyle: 'bold',
    }).setOrigin(0.5);

    // 名前入力
    const nameEl = document.getElementById('name-input');
    const roomEl = document.getElementById('room-input');
    const btnEl  = document.getElementById('join-btn');

    document.getElementById('lobby-ui').style.display = 'flex';

    btnEl.onclick = async () => {
      const name   = nameEl.value.trim() || 'Guest';
      const roomId = roomEl.value.trim() || 'default';
      btnEl.disabled = true;
      btnEl.textContent = '接続中...';

      try {
        const sync = new SyncManager(C.SERVER_URL);
        await sync.connect(name, roomId);
        document.getElementById('lobby-ui').style.display = 'none';
        this.scene.start('Game', { sync, displayName: name });
      } catch (e) {
        btnEl.disabled = false;
        btnEl.textContent = '参加する';
        alert('接続失敗: ' + e.message);
      }
    };
  }
}

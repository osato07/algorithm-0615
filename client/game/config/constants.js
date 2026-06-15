const C = {
  // ワールドサイズ
  WORLD_W: 1800,
  WORLD_H: 1500,

  // タイル
  TILE: 64,

  // 音声
  MAX_AUDIBLE_RANGE: 1200,
  AUDIO_SMOOTH: 0.06,

  // 同期
  MOVE_SEND_HZ: 20,

  // プレイヤーアイコン半径 (px, ゲーム座標)
  PLAYER_RADIUS: 28,
  VIDEO_ICON_PX: 64,    // スクリーン上の video 要素サイズ

  // 弾
  BULLET_RADIUS: 5,

  // 同一オリジン配信なので hostname:port をそのまま使う
  SERVER_URL: `ws://${location.host}`,
};

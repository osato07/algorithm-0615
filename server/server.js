'use strict';
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');
const Room    = require('./Room');

const PORT       = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const rooms      = new Map();

// ── MIME types ────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// ── HTTP 静的配信 ─────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  // URL を正規化（クエリ除去・ディレクトリは index.html）
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const filePath = path.join(CLIENT_DIR, urlPath);

  // パストラバーサル防止
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found: ' + urlPath);
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ── WebSocket (同じポートにアタッチ) ─────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  let userId = null;
  let roomId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      userId = randomUUID();
      roomId = msg.roomId || 'default';

      let room = rooms.get(roomId);
      if (!room) { room = new Room(roomId); rooms.set(roomId, room); }

      if (room.isFull) {
        ws.send(JSON.stringify({ type: 'error', reason: 'room full (max 4)' }));
        return;
      }

      room.addPlayer(ws, userId, msg.displayName || 'Guest');
      ws.send(JSON.stringify({ type: 'joined', userId, roomId }));
      console.log(`[room:${roomId}] +${msg.displayName} [${room.playerCount}/4]`);
      return;
    }

    const room = rooms.get(roomId);
    if (!room || !userId) return;
    room.handleMessage(userId, msg);
  });

  ws.on('close', () => {
    if (!roomId || !userId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.removePlayer(userId);
    console.log(`[room:${roomId}] -${userId.slice(0,8)} [${room.playerCount}/4]`);
    if (room.playerCount === 0) { rooms.delete(roomId); }
  });

  ws.on('error', (err) => console.error('[ws]', err.message));
});

httpServer.listen(PORT, () => {
  console.log(`\n  🎮  WebRTC Shooter`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
});

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const game = require('./game');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// ---------------------------------------------------------------- rooms
const rooms = new Map(); // id -> { state, clients: Map<ws, pid>, dirty }
const roomFile = (id) => path.join(DATA_DIR, `${id}.json`);

function loadRoom(id) {
  if (rooms.has(id)) return rooms.get(id);
  let state;
  try { state = JSON.parse(fs.readFileSync(roomFile(id), 'utf8')); } catch { state = game.newRoom(id); }
  const now = Date.now();
  const away = now - state.lastTick;
  const before = { dust: state.dust, revealed: state.puzzle.revealed };
  game.tick(state, now); // offline catch-up
  if (away > 60 * 1000) {
    const gained = Math.round(state.dust - before.dust);
    const charted = state.puzzle.revealed - before.revealed;
    state.feed.push({ t: now, text: `While everyone was away (${fmtDuration(away)}): +${gained.toLocaleString()} stardust${charted > 0 ? `, ${charted} star(s) charted` : ''}.` });
  }
  const r = { state, clients: new Map(), dirty: true };
  rooms.set(id, r);
  return r;
}

function fmtDuration(ms) {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}

function saveRoom(r) {
  const tmp = roomFile(r.state.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(r.state));
  fs.renameSync(tmp, roomFile(r.state.id));
  r.dirty = false;
}

const onlineSet = (r) => new Set(r.clients.values());

function broadcast(r) {
  const online = onlineSet(r);
  const now = Date.now();
  for (const [ws, pid] of r.clients) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'state', state: game.view(r.state, pid, online, now) }));
  }
}

// ---------------------------------------------------------------- sockets
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  let room = null, pid = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'join') {
      const id = String(msg.room || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
      const name = String(msg.name || '').trim().slice(0, 20);
      pid = String(msg.pid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
      if (!id || !name || !pid) return ws.send(JSON.stringify({ type: 'error', text: 'Need a name and a room code.' }));
      room = loadRoom(id);
      game.ensurePlayer(room.state, pid, name);
      room.clients.set(ws, pid);
      room.dirty = true;
      return broadcast(room);
    }
    if (!room) return;
    const online = onlineSet(room);
    game.tick(room.state, Date.now(), online);
    const err = game.act(room.state, pid, msg, online);
    if (err) ws.send(JSON.stringify({ type: 'error', text: err }));
    room.dirty = true;
    // clicks are frequent; let the regular tick broadcast them
    if (msg.type !== 'click' && msg.type !== 'hit' && msg.type !== 'notes') broadcast(room);
  });
  ws.on('close', () => {
    if (!room) return;
    room.clients.delete(ws);
    const stillHere = [...room.clients.values()].includes(pid);
    if (!stillHere && room.state.players[pid]) room.state.players[pid].lens = null; // free the lens for others
    room.dirty = true;
    if (room.clients.size === 0) { saveRoom(room); rooms.delete(room.state.id); }
    else broadcast(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) { game.tick(r.state, now, onlineSet(r)); r.dirty = true; broadcast(r); }
}, 250);

setInterval(() => { for (const r of rooms.values()) if (r.dirty) saveRoom(r); }, 5000);

function shutdown() { for (const r of rooms.values()) saveRoom(r); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log(`Starwright listening on http://localhost:${PORT}`));

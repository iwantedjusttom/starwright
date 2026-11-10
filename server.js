'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const game = require('./game');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const store = require('./storage');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
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
const loading = new Map(); // id -> Promise<room>, so simultaneous joins share one load
const saving = new Map(); // id -> Promise of the in-flight save, so a quick rejoin never loads stale data

function loadRoom(id) {
  if (rooms.has(id)) return Promise.resolve(rooms.get(id));
  if (!loading.has(id)) {
    loading.set(id, (async () => {
      await saving.get(id);
      const state = game.normalize((await store.load(id)) || game.newRoom(id));
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
    })().finally(() => loading.delete(id)));
  }
  return loading.get(id);
}

function fmtDuration(ms) {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}

function saveRoom(r) {
  const id = r.state.id;
  r.dirty = false;
  const p = (saving.get(id) || Promise.resolve())
    .then(() => store.save(id, r.state))
    .catch((e) => { r.dirty = true; console.error(e.message); })
    .finally(() => { if (saving.get(id) === p) saving.delete(id); });
  saving.set(id, p);
  return p;
}

const onlineSet = (r) => new Set(r.clients.values());

function broadcast(r) {
  const online = onlineSet(r);
  const now = Date.now();
  for (const [ws, pid] of r.clients) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'state', state: game.view(r.state, pid, online, now) }));
  }
}

function soonBroadcast(r) {
  if (r.soon) return;
  r.soon = setTimeout(() => { r.soon = null; broadcast(r); }, 80);
}

// ---------------------------------------------------------------- sockets
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  let room = null, pid = null, joining = null;
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'join') {
      const id = String(msg.room || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
      const name = String(msg.name || '').trim().slice(0, 20);
      pid = String(msg.pid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
      if (!id || !name || !pid) return ws.send(JSON.stringify({ type: 'error', text: 'Need a name and a room code.' }));
      joining = loadRoom(id);
      try { room = await joining; } catch (e) {
        console.error(e.message);
        return ws.send(JSON.stringify({ type: 'error', text: 'Could not load that crew\'s world. Try again in a moment.' }));
      }
      if (ws.readyState !== 1) return;
      game.ensurePlayer(room.state, pid, name);
      room.clients.set(ws, pid);
      room.dirty = true;
      return broadcast(room);
    }
    if (!room && joining) await joining.catch(() => {}); // don't drop inputs sent while the world loads
    if (!room) return;
    const online = onlineSet(room);
    game.tick(room.state, Date.now(), online);
    const err = game.act(room.state, pid, msg, online);
    if (err) ws.send(JSON.stringify({ type: 'error', text: err }));
    room.dirty = true;
    // clicks are frequent; let the regular tick broadcast them
    // Most actions update everyone right away; rapid clicks are batched into one update per ~80ms.
    if (msg.type === 'click' || msg.type === 'hit' || msg.type === 'notes') soonBroadcast(room);
    else broadcast(room);
  });
  ws.on('close', () => {
    if (!room) return;
    room.clients.delete(ws);
    const stillHere = [...room.clients.values()].includes(pid);
    if (!stillHere && room.state.players[pid]) room.state.players[pid].lens = null; // free the lens for others
    room.dirty = true;
    if (room.clients.size === 0) { rooms.delete(room.state.id); saveRoom(room); }
    else broadcast(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) { game.tick(r.state, now, onlineSet(r)); r.dirty = true; broadcast(r); }
}, 250);

setInterval(() => { for (const r of rooms.values()) if (r.dirty && !saving.has(r.state.id)) saveRoom(r); }, 5000);

async function shutdown() {
  await Promise.all([...rooms.values()].map(saveRoom));
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log(`Starwright listening on http://localhost:${PORT} (saving to ${store.kind})`));

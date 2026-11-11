'use strict';
const $ = (id) => document.getElementById(id);
const fmt = (n) => {
  n = Math.floor(n);
  if (n < 1e6) return n.toLocaleString();
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(2) + u[i];
};
const fmt1 = (n) => (n >= 100 ? fmt(n) : (Math.round(n * 10) / 10).toString());
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = (n) => String(n).padStart(2, '0');

// Update a panel in place: only changed text/attributes are touched, so buttons under the
// cursor survive re-renders (replacing them mid-click would swallow clicks).
const setHTML = (el, html) => {
  if (el._h === html) return;
  el._h = html;
  const t = document.createElement('template');
  t.innerHTML = html;
  morphChildren(el, t.content);
};
function morphChildren(a, b) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  bn.forEach((y, i) => {
    const x = an[i];
    if (!x) return a.appendChild(y);
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) return a.replaceChild(y, x);
    if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (x.tagName === 'SELECT' && x !== document.activeElement) x.value = y.getAttribute('data-value') ?? x.value;
    morphChildren(x, y);
  });
  for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
}

function pop(e, text, cls = '') {
  const d = document.createElement('div');
  d.className = 'pop ' + cls; d.textContent = text;
  d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 700);
}

let ws, S = null, selectedTier = null, joined = false;
const diveEndSeen = {};
// What you're holding: { kind: 'rune', id } or { kind: 'comp', id, rot }. focusId: the installed component being inspected.
let held = null, focusId = null, hoverCell = null;
const pid = localStorage.pid || (localStorage.pid = Math.random().toString(36).slice(2) + Date.now().toString(36));
$('name').value = localStorage.name || '';
$('room').value = new URLSearchParams(location.search).get('crew') || localStorage.room || '';

function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function connect() {
  const name = $('name').value.trim(), room = $('room').value.trim().toLowerCase();
  if (!name || !room) return toast('Pick a name and a crew code.');
  localStorage.name = name; localStorage.room = room;
  history.replaceState(null, '', `?crew=${encodeURIComponent(room)}`);
  if (ws) { ws.onclose = null; ws.close(); }
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { send({ type: 'join', room, name, pid }); $('conn-dot').classList.remove('off'); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'error') toast(m.text);
    if (m.type === 'state') { S = m.state; render(); }
  };
  ws.onclose = () => { $('conn-dot').classList.add('off'); toast('Disconnected. Reconnecting…'); setTimeout(connect, 2000); };
  joined = true;
  $('join').classList.add('hidden');
  $('close-join').classList.remove('hidden');
  $('roomlabel').textContent = room.toUpperCase();
}
$('join-form').onsubmit = (e) => { e.preventDefault(); connect(); };
$('open-join').onclick = () => { $('join').classList.remove('hidden'); $('name').focus(); };
$('close-join').onclick = () => { if (joined) $('join').classList.add('hidden'); };
$('copy-crew').onclick = async () => {
  const link = location.href;
  try { await navigator.clipboard.writeText(link); toast('Invite link copied. Send it to your crew!'); } catch { toast(`Invite link: ${link}`); }
};
if (localStorage.name && $('room').value) connect();

let toastTimer;
function toast(t) { $('toast').textContent = t; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2800); }

// ---------------------------------------------------------------- shared helpers
const EL = Engine.ELEMENTS, COMP = Engine.COMPONENTS, RAR = Engine.RARITIES;
const R = Engine.ROMAN;
const GLYPH = { lance: '✧', coil: '♨', lash: '◉', shield: '☾', plate: '▣', pump: '≈', capacitor: '◇', core: '✺', harvester: '✣' };
// Art: rune images are used when present in public/assets/runes/ (falls back to the element symbol otherwise).
const ART = { rune: {} };
for (const el of Engine.ELEMENT_KEYS) {
  const im = new Image();
  im.onload = () => { ART.rune[el] = im.src; if (S) render(); };
  im.src = `assets/runes/${el}.png`;
}
const runeImg = (r, cls) => (ART.rune[r.el] ? `<img class="${cls} rank-${Math.min(r.rank, 8)}" src="${ART.rune[r.el]}" alt="${EL[r.el].name} rune" draggable="false">` : `<span class="${cls} sym" style="color:${EL[r.el].color}">${EL[r.el].icon}</span>`);
const rarColor = (it) => RAR[it.rarity || 'common'].color;
const elBadge = (el, extra = '') => `<span class="element-badge" style="--element-color:${EL[el].color}">${EL[el].icon} ${EL[el].name}${extra}</span>`;
const modLines = (it) => (it.mods || []).map((m) => `<div class="inspect-buffs ${Engine.MODS[m.k].bad ? 'bad' : ''}">${Engine.MODS[m.k].bad ? '▼' : '▲'} ${esc(Engine.MODS[m.k].text(m.v))}</div>`).join('');
// Element combos: which ones are on right now, and which this component's sockets could make
function comboLine(it) {
  const active = Engine.combosOf(it), possible = Engine.possibleCombos(it).filter((k) => !active.includes(k));
  const C = Engine.COMBOS;
  const label = (k) => C[k].els ? C[k].els.map((e) => EL[e].icon).join('+') : 'same element';
  return active.map((k) => `<div class="combo on">✦ <b>${C[k].name}</b>: ${esc(C[k].text)}</div>`).join('') +
    possible.map((k) => `<div class="combo">◇ ${C[k].name} (${label(k)}): ${esc(C[k].text)}</div>`).join('');
}
const costLabel = (c) => `${fmt(c.essence)} ✧`;
const canAfford = (c) => (S.you.essence || 0) >= c.essence;
const me = () => S.you;
const allItems = () => [...(me().machine?.items || []), ...me().storage];
const findItem = (id) => allItems().find((it) => it.id === id);
const sqCount = (it) => Engine.shapeOf(it).length;

// A drawing of a component's shape: socket squares show the element they want (or the rune in them).
function shapeArt(it, rot = 0, px = 20) {
  const cells = Engine.cellsFor(it, rot), w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
  const socks = Engine.socketsOf(it), sockAt = new Map(socks.map((s, i) => [s.c, i]));
  let out = `<div class="shape-art" style="grid-template-columns:repeat(${w},${px}px);--px:${px}px;--component-color:${COMP[it.type].color}">`;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ci = cells.findIndex(([cx, cy]) => cx === x && cy === y);
    if (ci < 0) { out += '<i></i>'; continue; }
    const si = sockAt.get(ci);
    if (si === undefined) { out += '<i class="sq"></i>'; continue; }
    const el = socks[si].el, r = it.runes?.[si];
    out += `<i class="sq sk" style="--element-color:${EL[el].color}" title="${EL[el].name} socket">${r ? runeImg(r, 'sq-rune') : `<b>${EL[el].icon}</b>`}</i>`;
  }
  return out + '</div>';
}
// What a component does with its neighbours, in words.
const NEIGHBOUR_RULE = {
  capacitor: 'Boosts every <b>weapon</b> it touches (+40% × its own strength). Does nothing for non-weapons.',
  core: 'Boosts <b>everything</b> it touches (+35% × its own strength), but the whole machine loses 15% HP.',
  coil: 'Each Ember Coil it touches gets ×1.5 (and boosts it back). Clump them together.',
  lash: 'Gets +25% for every <b>empty</b> grid square next to it. Give it open space.',
};
function neighbourRule(it) {
  // Modifiers and combos can give any component a neighbour effect, even when its type has none.
  const extra = [];
  if (Engine.modVal(it, 'resonance')) extra.push(`<b>of Resonance</b>: +${Engine.modVal(it, 'resonance')}% to everything it touches`);
  if (Engine.modVal(it, 'draining')) extra.push(`<span class="warn"><b>Draining</b>: −${Engine.modVal(it, 'draining')}% to everything it touches</span>`);
  if (Engine.modVal(it, 'pack')) extra.push(`<b>of the Pack</b>: +${Engine.modVal(it, 'pack')}% to itself for each touching ${COMP[it.type].kind}`);
  const tw = Engine.combosOf(it).includes('twilight'), twMaybe = !tw && Engine.possibleCombos(it).includes('twilight');
  if (tw) extra.push('<b>Twilight</b> (active): +20% to everything it touches');
  else if (twMaybe) extra.push('<b>Twilight</b> (if you socket Sun + Moon): +20% to everything it touches');
  const base = NEIGHBOUR_RULE[it.type] || (extra.length ? 'Its type doesn\'t affect neighbours, but:' : 'Doesn\'t affect its neighbours. Put it wherever it fits (it can still be boosted by others).');
  return base + (extra.length ? `<ul class="nb-list">${extra.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
}
const pct = (f) => `${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)}%`;

// Pieces are held by their middle square: it stays under the cursor and rotation spins around it.
function handleIndex(it) {
  const cells = Engine.cellsFor(it, 0);
  const cx = cells.reduce((s, c) => s + c[0], 0) / cells.length, cy = cells.reduce((s, c) => s + c[1], 0) / cells.length;
  let best = 0, bd = Infinity;
  cells.forEach(([x, y], i) => { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd - 1e-9) { bd = d; best = i; } });
  return best;
}
// Top-left position that puts the piece's handle square on grid square (hx, hy) at rotation rot.
function anchorFor(it, rot, hx, hy) {
  const [cx, cy] = Engine.cellsFor(it, rot)[handleIndex(it)];
  return [hx - cx, hy - cy];
}
// Rotate an installed piece in place; if it doesn't fit, try nudging it up to 2 squares in any direction.
function rotateInstalled(it) {
  const m = me().machine, rot = (it.rot + 1) % 4;
  const [hcx, hcy] = Engine.cellsFor(it, it.rot)[handleIndex(it)];
  const [ax, ay] = anchorFor(it, rot, it.x + hcx, it.y + hcy);
  const kicks = [[0, 0]];
  for (let d = 1; d <= 2; d++) for (let dx = -d; dx <= d; dx++) for (let dy = -d; dy <= d; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === d) kicks.push([dx, dy]);
  kicks.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const rest = m.items.filter((o) => o.id !== it.id);
  for (const [dx, dy] of kicks) {
    const trial = { ...m, items: [...rest, { ...it, x: ax + dx, y: ay + dy, rot }] };
    if (Engine.fits(trial)) return send({ type: 'place', itemId: it.id, x: ax + dx, y: ay + dy, rot });
  }
  toast('No room to rotate it here. Move it somewhere roomier first.');
}

// What the machine would look like after the held thing is dropped on the hovered cell (for previews).
function trialMachine() {
  const m = me().machine;
  if (!m || !held || !hoverCell) return null;
  let [x, y] = hoverCell;
  const items = m.items.map((it) => ({ ...it, runes: [...it.runes] }));
  if (held.kind === 'comp') {
    const src = findItem(held.id); if (!src) return null;
    [x, y] = anchorFor(src, held.rot, x, y);
    const rest = items.filter((it) => it.id !== held.id);
    return { m: { ...m, items: [...rest, { ...src, runes: [...src.runes], x, y, rot: held.rot }] }, ok: null };
  }
  const sock = socketAt(x, y); if (!sock || sock.s < 0) return null;
  const rune = me().pouch.find((r) => r.id === held.id); if (!rune) return null;
  const it = items.find((o) => o.id === sock.item.id);
  it.runes[sock.s] = rune;
  return { m: { ...m, items }, ok: true };
}
// The installed item + socket index at a grid square, if that square is a socket.
function socketAt(x, y) {
  const m = me().machine;
  for (const it of m.items) {
    const cells = Engine.cellsFor(it, it.rot);
    const ci = cells.findIndex(([cx, cy]) => it.x + cx === x && it.y + cy === y);
    if (ci < 0) continue;
    const s = Engine.socketsOf(it).findIndex((sk) => sk.c === ci);
    return s < 0 ? { item: it, s: -1 } : { item: it, s };
  }
  return null;
}

// ---------------------------------------------------------------- input
$('chatform').onsubmit = (e) => { e.preventDefault(); const t = $('chat').value.trim(); if (t) send({ type: 'chat', text: t }); $('chat').value = ''; };
$('elementPick').onclick = (e) => { const el = e.target.closest('[data-el]')?.dataset.el; if (el) send({ type: 'element', el }); };

$('pouch').onclick = (e) => {
  const id = +e.target.closest('[data-rune]')?.dataset.rune; if (!id) return;
  held = held?.kind === 'rune' && held.id === id ? null : { kind: 'rune', id }; focusId = null; render();
};
$('storage').onclick = (e) => {
  const id = +e.target.closest('[data-item]')?.dataset.item; if (!id) return;
  held = held?.kind === 'comp' && held.id === id ? null : { kind: 'comp', id, rot: 0 }; focusId = null; render();
};
$('pouchActions').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.fuse) { const [el, rank] = b.dataset.fuse.split(':'); send({ type: 'fuseRunes', el, rank: +rank }); }
  if (b.dataset.act === 'salvageRune') { send({ type: 'salvage', runeId: held.id }); held = null; }
  if (b.dataset.act === 'salvageI') { const ids = me().pouch.filter((r) => r.rank === 1 && r.el !== me().el).map((r) => r.id); if (ids.length && confirm(`Salvage ${ids.length} rank I rune(s) that aren't your element?`)) send({ type: 'salvage', runeIds: ids }); }
  if (b.dataset.give) { send({ type: 'give', runeId: held.id, to: b.dataset.give }); held = null; }
  if (b.dataset.act === 'drop') { held = null; render(); }
};
$('expand').onclick = (e) => { const d = e.target.closest('button')?.dataset.expand; if (d) send({ type: 'expand', dir: d }); };
$('focus').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'hrot') return rotateHeld();
  if (a === 'hdrop') { held = null; return render(); }
  if (a === 'hupgrade') return send({ type: 'upgrade', itemId: held.id });
  if (a === 'hsalvage') { if (confirm('Salvage this component into Essence? Any runes in it go back to your pouch.')) { send({ type: 'salvage', itemId: held.id }); held = null; } return; }
  if (b.dataset.giveitem) { send({ type: 'give', itemId: held.id, to: b.dataset.giveitem }); held = null; return; }
  const it = findItem(focusId); if (!it) return;
  if (a === 'store') { send({ type: 'store', itemId: it.id }); focusId = null; }
  if (a === 'upgrade') send({ type: 'upgrade', itemId: it.id });
  if (a === 'move') { held = { kind: 'comp', id: it.id, rot: it.rot }; focusId = null; render(); }
  if (a === 'rot') rotateInstalled(it);
  if (b.dataset.unsocket) send({ type: 'unsocket', itemId: it.id, s: +b.dataset.unsocket });
  if (a === 'close') { focusId = null; render(); }
};
function rotateHeld() { if (held?.kind === 'comp') { held.rot = (held.rot + 1) % 4; render(); } }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && joined && !$('join').classList.contains('hidden')) { $('join').classList.add('hidden'); return; }
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'r' || e.key === 'R') rotateHeld();
  if (e.key === 'Escape') { held = null; focusId = null; if (joined) $('join').classList.add('hidden'); render(); }
});
$('machineGrid').addEventListener('pointerover', (e) => {
  const c = e.target.closest('[data-x]'); hoverCell = c ? [+c.dataset.x, +c.dataset.y] : null; renderMachine();
});
$('machineGrid').addEventListener('pointerleave', () => { hoverCell = null; renderMachine(); });
$('machineGrid').onclick = (e) => {
  const c = e.target.closest('[data-x]'); if (!c || !S) return;
  const x = +c.dataset.x, y = +c.dataset.y;
  if (held?.kind === 'comp') {
    const [ax, ay] = anchorFor(findItem(held.id), held.rot, x, y);
    send({ type: 'place', itemId: held.id, x: ax, y: ay, rot: held.rot }); held = null; return;
  }
  const sock = socketAt(x, y);
  if (held?.kind === 'rune') {
    if (sock && sock.s >= 0) { send({ type: 'socket', itemId: sock.item.id, s: sock.s, runeId: held.id }); held = null; }
    else toast('Drop runes onto a socket (the circles).');
    return;
  }
  focusId = sock ? sock.item.id : null; render();
};

function riftClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'tier') { selectedTier = +b.dataset.tier; render(); }
  else if (b.dataset.act === 'dive') send({ type: 'dive', tier: selectedTier });
  else if (b.dataset.act === 'recall') send({ type: 'recall' });
  else if (b.dataset.act === 'dismiss') { localStorage.seenDive = S.you.lastDive.at; render(); }
}
$('rift').onclick = riftClick;
$('riftBottom').onclick = riftClick;
$('rift').addEventListener('change', (e) => { if (e.target.id === 'recallSel') send({ type: 'recallPct', v: +e.target.value }); });

// ---------------------------------------------------------------- arena (overcharge while your machine fights)
const arena = $('arena');
let arenaMode = 'off', arenaCfg = null, targets = [], combo = 0, spawnTimer = null;
const seenLinks = new Set(), shownResults = new Set();
function setArena(mode, msg, cfg) {
  if (cfg) arenaCfg = cfg;
  arena.classList.toggle('hidden', mode === 'off');
  arena.classList.toggle('inert', mode === 'inert');
  if ($('arenaMsg').innerHTML !== (msg || '')) $('arenaMsg').innerHTML = msg || '';
  if (mode === arenaMode) return;
  arenaMode = mode;
  clearTimeout(spawnTimer);
  targets.forEach((t) => { clearTimeout(t.timer); t.el.remove(); });
  targets = []; seenLinks.clear();
  combo = 0; showCombo();
  if (mode === 'fight') spawnTimer = setTimeout(spawnLoop, 400);
}
function spawnLoop() {
  if (arenaMode !== 'fight') return;
  if (targets.filter((t) => !t.link && !t.block).length < arenaCfg.max) spawnTarget();
  spawnTimer = setTimeout(spawnLoop, arenaCfg.spawnMs * (0.7 + Math.random() * 0.6));
}
// Block targets: a red shield appears on the screen of whoever the enemy is about to hit. Click it in time.
const seenBlocks = new Set();
function syncBlocks() {
  const inc = arenaMode === 'fight' && S.dive?.incoming;
  if (!inc || inc.ttl > inc.window || seenBlocks.has(inc.id)) return;
  seenBlocks.add(inc.id);
  spawnTarget({ block: inc });
}
function syncLinks() {
  syncBlocks();
  if (arenaMode !== 'fight' || !S.dive) return;
  for (const l of S.dive.links) { if (!seenLinks.has(l.id)) { seenLinks.add(l.id); spawnTarget({ link: l }); } }
  for (const res of S.dive.linkResults) {
    if (shownResults.has(res.id)) continue;
    shownResults.add(res.id);
    if (!seenLinks.has(res.id)) continue;
    const rect = arena.getBoundingClientRect();
    pop({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, res.ok ? `⚡ LINKED with ${res.partner}!` : `link with ${res.partner} broke`, res.ok ? 'linked' : 'miss');
  }
}
function spawnTarget(opts = {}) {
  const link = opts.link, block = opts.block;
  const r = Math.round(arenaCfg.radius * (link ? 1.25 : block ? 1.4 : 1)), w = arena.clientWidth, h = arena.clientHeight;
  if (w < 4 * r || h < 4 * r) return;
  let x, y, tries = 0;
  const m = 14; // keep targets (and their shrinking timer ring) clear of the arena's edges
  do { x = r + m + Math.random() * (w - 2 * r - 2 * m); y = r + m + 16 + Math.random() * (h - 2 * r - 2 * m - 16); }
  while (tries++ < 12 && targets.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r + 6));
  const life = link ? link.ttl : block ? block.ttl : arenaCfg.lifeMs;
  const el = document.createElement('div');
  el.className = 'target' + (link ? ' linked' : block ? ' block' : '');
  el.style.cssText = `left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;--life:${life}ms` + (link ? `;--hue:${link.hue}` : '');
  el.innerHTML = link ? `<em>ϟ</em><span>⚡ ${esc(link.partner)}</span>` : block ? `<em>⬡</em><span>BLOCK! (${block.atk} dmg)</span>` : '<em>✦</em>';
  arena.appendChild(el);
  const t = { x, y, r, el, link, block };
  t.timer = setTimeout(() => {
    targets = targets.filter((o) => o !== t);
    el.classList.add('expired'); setTimeout(() => el.remove(), 250);
    if (block) { arena.classList.remove('hurt'); void arena.offsetWidth; arena.classList.add('hurt'); }
    if (!link && !block && combo) { combo = 0; showCombo('lost'); }
  }, life);
  targets.push(t);
}
function showCombo(state) {
  const el = $('combo');
  el.textContent = combo > 1 ? `${combo} × COMBO` : '';
  el.classList.toggle('lost', state === 'lost');
}
arena.addEventListener('pointerdown', (e) => {
  if (arenaMode !== 'fight') return;
  e.preventDefault();
  const rect = arena.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  let best = null, bestD = Infinity;
  for (const t of targets) { const d = Math.hypot(t.x - px, t.y - py); if (d <= t.r && d < bestD) { best = t; bestD = d; } }
  if (!best) { pop(e, 'miss', 'miss'); if (combo) { combo = 0; showCombo('lost'); } return; }
  clearTimeout(best.timer);
  targets = targets.filter((t) => t !== best);
  best.el.classList.add('popped'); setTimeout(() => best.el.remove(), 200);
  const acc = 1 - bestD / best.r;
  if (best.link) { send({ type: 'linkHit', id: best.link.id, acc }); pop(e, `⚡ now ${best.link.partner}!`, 'linked'); return; }
  if (best.block) { send({ type: 'block', id: best.block.id, acc }); pop(e, acc >= 0.85 ? 'PERFECT BLOCK! ⚔' : 'BLOCKED!', acc >= 0.85 ? 'crit' : 'linked'); return; }
  send({ type: 'hit', acc, combo });
  combo++; showCombo();
  pop(e, acc >= 0.85 ? 'OVERCHARGE!' : '+charge', acc >= 0.85 ? 'crit' : 'hit');
});

// ---------------------------------------------------------------- render
function render() {
  if (!S) return;
  $('essencehead').textContent = fmt(S.you.essence || 0);
  $('tierhead').textContent = S.tiers.max;
  $('reshead').textContent = fmt(S.you.machine ? Engine.stats(S.you.machine).resonance : 0);

  renderRift();
  renderMachine();
  renderCrew();
  syncLinks();
}

function renderCrew() {
  const online = S.players.filter((p) => p.online).length;
  $('online-count').textContent = `${online} / ${S.players.length}`;
  $('crew-total').textContent = pad2(S.players.length);
  $('crew-resonance').textContent = fmt(S.totalResonance);
  const inRift = S.dive ? S.dive.units.filter((u) => u.status === 'fighting').length : 0;
  $('crew-boost').textContent = inRift > 1 ? `×${(1 + 0.15 * (inRift - 1)).toFixed(2)} formation` : '';
  $('crew-boost').classList.toggle('hidden', inRift < 2);
  setHTML($('players'), S.players.map((p) => {
    const status = p.status ? 'In the Rift' : p.online ? (p.ref === S.you.ref ? 'In the workshop (you)' : 'In the workshop') : 'Away';
    return `<div class="crew-member ${p.online ? 'online' : 'offline'}"><span class="crew-avatar">${esc((p.name[0] || '?').toUpperCase())}</span>
      <span class="crew-member-text"><strong>${esc(p.name)}</strong><small>${status}</small></span>
      <span class="crew-element" style="color:${p.el ? EL[p.el].color : '#8a8fa8'}">${p.el ? EL[p.el].icon : '·'}<span>${fmt(p.resonance)}</span></span></div>`;
  }).join(''));

  const feed = $('feed');
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 30;
  const tone = (t) => (/💥|fell|destroyed|lost/.test(t) ? 'bad' : /🎉|🌀|⚡|🏳|⚔|♻|🎁|unlocked/.test(t) ? 'good' : '');
  setHTML(feed, S.feed.map((f) => `<div class="log-entry ${tone(f.text)}"><time class="log-time">${new Date(f.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time><span class="log-message">${esc(f.text)}</span></div>`).join(''));
  if (atBottom) feed.scrollTop = feed.scrollHeight;
}

function statRow(icon, label, now, after, f = fmt1) {
  const d = after == null ? 0 : after - now;
  return `<div class="machine-stat"><span class="stat-name"><span class="stat-icon">${icon}</span> ${label}</span><span class="stat-measure">${f(now)}${Math.abs(d) > 1e-6 ? ` <i class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${f(d)}</i>` : ''}</span></div>`;
}

function renderMachine() {
  const Y = me(), m = Y.machine;
  setHTML($('elementPick'), Y.el ? '' : `<div class="element-pick"><div class="label-row"><span>CHOOSE YOUR ELEMENT</span><small>to build your first machine</small></div>
    <p class="panel-description">Most runes you find will match your element, so your crew will need each other's runes to build great machines.</p>
    <div class="element-choices">${Engine.ELEMENT_KEYS.map((k) => `<button class="element-choice" data-el="${k}" style="--element-color:${EL[k].color}">${ART.rune[k] ? `<img src="${ART.rune[k]}" alt="">` : `<span class="sym">${EL[k].icon}</span>`}<b>${EL[k].name}</b></button>`).join('')}</div></div>`);
  $('machineWrap').classList.toggle('hidden', !m);
  if (!m) return;
  if (held && !findItem(held.id) && !Y.pouch.some((r) => r.id === held.id)) held = null;
  if (focusId && !m.items.some((it) => it.id === focusId)) focusId = null;
  const locked = Y.diving;
  $('machineBox').classList.toggle('locked', locked);
  $('core-label').innerHTML = locked ? '<span class="pulse-dot"></span> IN THE RIFT' : '<span class="pulse-dot"></span> CORE ONLINE';
  $('machine-sub').textContent = Y.el ? `/ ${EL[Y.el].name.toUpperCase()}-BOUND` : '';
  $('grid-dimensions').textContent = `${m.w} × ${m.h} CELLS`;

  // grid squares → item ids
  const occ = Array(m.w * m.h).fill(null), cellInfo = {};
  for (const it of m.items) Engine.cellsFor(it, it.rot).forEach(([cx, cy], ci) => {
    const k = (it.y + cy) * m.w + it.x + cx; occ[k] = it.id; cellInfo[k] = { it, ci };
  });
  // ghost for a held component
  const ghost = new Set(); let ghostOk = false, ghostOff = 0;
  if (held?.kind === 'comp' && hoverCell) {
    const trial = trialMachine(), src = findItem(held.id);
    ghostOk = !!trial && Engine.fits(trial.m);
    const [ax, ay] = anchorFor(src, held.rot, hoverCell[0], hoverCell[1]);
    Engine.cellsFor(src, held.rot).forEach(([cx, cy]) => {
      const gx = ax + cx, gy = ay + cy;
      if (gx < 0 || gy < 0 || gx >= m.w || gy >= m.h) ghostOff++;
      ghost.add(`${gx},${gy}`);
    });
  }
  const stats = Engine.stats(m);
  const fl = focusId && stats.links[focusId];
  // Labels written on the pieces around the one you clicked: "gives +40%" (helping it) / "gets +40%" (it helps them).
  const badges = {};
  if (fl) {
    const prod = (arr) => arr.reduce((p, l) => p * l.f, 1);
    const givers = {};
    for (const l of fl.in) if (l.from !== null && l.from !== focusId) (givers[l.from] = givers[l.from] || []).push(l);
    for (const [id, ls] of Object.entries(givers)) { const f = prod(ls); badges[id] = { text: f >= 1 ? `gives ${pct(f)}` : `drains ${pct(f)}`, cls: f >= 1 ? 'give' : 'drain' }; }
    for (const id of fl.out) {
      const f = prod(stats.links[id].in.filter((l) => l.from === focusId));
      const got = { text: f >= 1 ? `gets ${pct(f)}` : `loses ${pct(f)}`, cls: f >= 1 ? 'get' : 'drain' };
      badges[id] = !badges[id] ? got : badges[id].text.split(' ')[1] === got.text.split(' ')[1]
        ? { text: `↔ ${got.text.split(' ')[1]} both ways`, cls: 'both' } : { text: `${badges[id].text} · ${got.text}`, cls: 'both' };
    }
    if (fl.dead && fl.booster) badges[focusId] = { text: 'off: no runes', cls: 'drain' };
  }
  let html = '', bridges = '';
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const k = y * m.w + x, info = cellInfo[k];
    const cls = ['grid-slot'];
    let inner = '', style = '';
    if (info) {
      const { it, ci } = info, def = COMP[it.type];
      style = `--component-color:${def.color}`;
      cls.push('occupied');
      if (it.id === focusId) cls.push('selected');
      const same = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && occ[ny * m.w + nx] === it.id; };
      if (same(1, 0)) bridges += `<i class="bridge v" style="--x:${x};--y:${y};--c:${def.color}"></i>`;
      if (same(0, 1)) bridges += `<i class="bridge h" style="--x:${x};--y:${y};--c:${def.color}"></i>`;
      const socks = Engine.socketsOf(it);
      const s = socks.findIndex((sk) => sk.c === ci);
      if (s >= 0) {
        const r = it.runes[s], want = socks[s].el;
        cls.push('has-socket');
        style += `;--element-color:${EL[want].color}`;
        inner = r ? `${runeImg(r, 'tile-rune')}<span class="rank-tag" style="--element-color:${EL[r.el].color}">${R[r.rank]}</span>${r.el === want ? '' : `<span class="want">wants ${EL[want].name}</span>`}`
          : `<span class="empty-socket" style="--element-color:${EL[want].color}" title="Empty ${EL[want].name} socket">${EL[want].icon}</span><span class="want">${EL[want].name}</span>`;
        if (r && r.el !== want) cls.push('mismatch');
      } else inner = `<span class="tile-glyph" aria-hidden="true">${GLYPH[it.type] || '✦'}</span>`;
      if (ci === 0) inner += `<small class="tile-number" title="power">${fmt1(10 * (stats.power[it.id] || 0))}</small>`;
      if (badges[it.id] && ci === handleIndex(it)) inner += `<span class="badge ${badges[it.id].cls}">${badges[it.id].text}</span>`;
    }
    if (ghost.has(`${x},${y}`)) cls.push(ghostOk ? 'possible' : 'invalid');
    if (held?.kind === 'rune' && info && Engine.socketsOf(info.it).some((sk) => sk.c === info.ci)) cls.push('droppable');
    html += `<div class="${cls.join(' ')}" style="${style}" data-x="${x}" data-y="${y}">${inner}</div>`;
  }
  $('machineGrid').style.gridTemplateColumns = `repeat(${m.w}, var(--slot))`;
  setHTML($('machineGrid'), html + bridges);
  setHTML($('expand'), locked ? '' : `<button class="button small" data-expand="w" ${m.w >= Y.maxW || Y.essence < Y.expandCost ? 'disabled' : ''}>＋ Add column</button>
    <button class="button small" data-expand="h" ${m.h >= Y.maxH || Y.essence < Y.expandCost ? 'disabled' : ''}>＋ Add row</button>
    <span class="dim-label">${m.w >= Y.maxW && m.h >= Y.maxH ? 'MAX SIZE' : `${fmt(Y.expandCost)} ✧`}</span>`);

  // readout, with a live preview of whatever you're about to do
  const trial = trialMachine();
  const after = trial && (trial.ok || Engine.fits(trial.m)) ? Engine.stats(trial.m) : null;
  setHTML($('stats'), statRow('⚔', 'Damage / s', stats.dmg, after?.dmg) + statRow('♡', 'Hull HP', stats.hp, after?.hp)
    + statRow('⬡', 'Armor', stats.armor, after?.armor) + statRow('✚', 'Repair / s', stats.regen, after?.regen)
    + statRow('✧', 'Extra Runes', stats.loot * 100, after && after.loot * 100, (v) => Math.round(v) + '%')
    + statRow('⌁', 'Resonance', stats.resonance, after?.resonance, fmt));
  $('machine-power').textContent = fmt(stats.resonance);
  setHTML($('tier-note'), `Tier ${S.tiers.max + 1} unlocks at <b>${fmt(S.tiers.nextReq)}</b> <span>(${fmt(Math.max(0, S.tiers.nextReq - stats.resonance))} to go)</span>`);

  // inspection: an installed component (how it works with its neighbours), or the component you're holding
  const f = focusId && m.items.find((it) => it.id === focusId);
  const held2 = held?.kind === 'comp' && findItem(held.id);
  const nameOf = (id) => { const o = m.items.find((x) => x.id === id); return o ? esc(Engine.itemName(o)) : '?'; };
  const head = (it, where, rot) => `<div class="inspect-art">${shapeArt(it, rot, sqCount(it) > 4 ? 16 : 20)}<span class="art-corner">LVL ${it.lvl}</span></div>
    <div class="inspect-details"><div class="rarity-text" style="color:${rarColor(it)}">${RAR[it.rarity || 'common'].name.toUpperCase()} COMPONENT · ${where}</div>
    <div class="inspect-name" style="color:${rarColor(it)}">${esc(Engine.itemName(it))}${it.lvl > 1 ? ` <span class="lvl-plus">+${it.lvl - 1}</span>` : ''}</div>
    <div class="element-badges"><span class="takes-label">TAKES</span>${Engine.socketsOf(it).map((sk) => elBadge(sk.el)).join('')}</div>
    <p class="inspect-description">${esc(COMP[it.type].desc)} ${sqCount(it)} square${sqCount(it) === 1 ? '' : 's'}.</p>`;
  let panel;
  if (f && !locked) {
    const L = stats.links[f.id];
    const own = 10 * (stats.base[f.id] || 0), total = 10 * (stats.power[f.id] || 0);
    const parts = L.in.map((l) => `×${(Math.round(l.f * 100) / 100)} ${l.from === null ? `from ${esc(l.why)}` : `because it touches the ${nameOf(l.from)}`}`);
    const powerLine = L.dead ? '<span class="warn">Power 0: its sockets are empty, so it does nothing yet. Put a rune in it.</span>'
      : `Power <b class="gold">${fmt1(total)}</b>: ${fmt1(own)} from its runes and level${parts.length ? ', ' + parts.join(', ') : ''}.`;
    const nowLine = !L.booster && !L.out.length ? ''
      : L.dead ? '<p class="nb warn">Right now: boosting nothing, because its sockets are empty.</p>'
        : L.out.length ? `<p class="nb">Right now it's boosting: <b>${L.out.map(nameOf).join(', ')}</b>.</p>`
          : `<p class="nb warn">Right now: boosting nothing${f.type === 'capacitor' ? ' (it only helps weapons, and none touch it)' : ' (nothing it can help is touching it)'}.</p>`;
    panel = `<div class="inspect-panel" style="--inspect-color:${rarColor(f)}">${head(f, 'EQUIPPED', f.rot)}
      <p class="nb">${powerLine}</p><p class="nb"><b>Neighbours:</b> ${neighbourRule(f)}</p>${nowLine}
      ${modLines(f)}${comboLine(f)}
      <div class="inspect-actions">${Engine.socketsOf(f).map((sk, s) => f.runes[s] ? `<button class="button small ghost" data-unsocket="${s}">Remove ${EL[f.runes[s].el].icon} ${R[f.runes[s].rank]}</button>` : '').join('')}</div>
      <div class="inspect-actions"><button class="button small" data-act="rot">↻ Rotate</button><button class="button small" data-act="move">✥ Move</button>
      <button class="button small ghost" data-act="store">Store</button>
      ${f.lvl < Engine.MAX_LEVEL ? `<button class="button small" data-act="upgrade" ${canAfford(Engine.upgradeCost(f)) ? '' : 'disabled'}>↑ Upgrade · ${costLabel(Engine.upgradeCost(f))}</button>` : '<span class="dim-label">MAX LEVEL</span>'}
      <button class="button small ghost" data-act="close">✕</button></div></div></div>`;
  } else if (held2 && !locked) {
    const inStorage = Y.storage.some((it) => it.id === held2.id);
    const others = S.players.filter((p) => p.ref !== Y.ref);
    panel = `<div class="inspect-panel holding" style="--inspect-color:${rarColor(held2)}">${head(held2, inStorage ? 'IN STORAGE · HOLDING' : 'MOVING', held.rot)}
      <p class="nb"><b>Neighbours:</b> ${neighbourRule(held2)}</p>${modLines(held2)}${comboLine(held2)}
      <p class="nb hint-line">Move over your machine to see where it lands, then click to place it.</p>
      <div class="inspect-actions"><button class="button small" data-act="hrot">↻ Rotate (R)</button><button class="button small ghost" data-act="hdrop">Put it down (Esc)</button>
      ${inStorage && held2.lvl < Engine.MAX_LEVEL ? `<button class="button small" data-act="hupgrade" ${canAfford(Engine.upgradeCost(held2)) ? '' : 'disabled'}>↑ Upgrade · ${costLabel(Engine.upgradeCost(held2))}</button>` : ''}
      ${inStorage ? `<button class="button small ghost" data-act="hsalvage">♻ Salvage · +${Engine.itemEssence(held2)} ✧</button>` : ''}</div>
      ${inStorage && others.length ? `<div class="inspect-actions"><span class="dim-label">GIVE TO</span>${others.map((p) => `<button class="button small ghost" data-giveitem="${p.ref}">${p.el ? EL[p.el].icon + ' ' : ''}${esc(p.name)}</button>`).join('')}</div>` : ''}</div></div>`;
  } else {
    panel = `<div class="inspect-panel"><div class="inspect-placeholder"><span>◇</span><div>${locked ? 'Your machine is in the Rift. Recall it to make changes.' : 'Select a machine component or a stored item to reveal its properties.'}</div></div></div>`;
  }
  setHTML($('focus'), panel);

  setHTML($('helpline'), locked ? '🔒 Your machine is in the Rift. Recall it to make changes.'
    : held?.kind === 'comp' && hoverCell && !ghostOk ? `<span class="warn">${ghostOff ? `${ghostOff} square${ghostOff === 1 ? '' : 's'} would hang off the machine.` : 'That overlaps another component.'}</span> Press <b>R</b> to rotate, <b>Esc</b> to cancel.`
    : held?.kind === 'comp' ? 'The piece follows your cursor: click to place it. Press <b>R</b> to rotate, <b>Esc</b> to cancel.'
      : held?.kind === 'rune' ? 'Click a glowing socket to put the rune in. It swaps with any rune already there.'
        : 'Select a component to inspect it. Pick up a rune or a stored item to place it.');

  // storage: compact buttons; details appear in the inspection panel when you pick one up
  $('storage-count').textContent = `${Y.storage.length} ITEM${Y.storage.length === 1 ? '' : 'S'}`;
  setHTML($('storage'), Y.storage.length ? Y.storage.map((it) => `<button class="storage-item ${held?.kind === 'comp' && held.id === it.id ? 'selected' : ''}" data-item="${it.id}" style="--item-rarity:${rarColor(it)}">
      <span class="storage-icon" style="color:${COMP[it.type].color}">${shapeArt(it, 0, 9)}</span><span class="storage-item-text"><strong>${esc(Engine.itemName(it))}</strong>
      <small>${RAR[it.rarity || 'common'].name.toUpperCase()} · LEVEL ${it.lvl} · ${Engine.socketsOf(it).map((sk) => EL[sk.el].icon).join(' ')}</small></span></button>`).join('')
    : '<div class="empty-storage">Empty. Components drop in the Rift (bosses always drop one), each with a random shape, sockets and modifiers.</div>');

  // runes
  $('rune-count').textContent = `${Y.pouch.length} RUNE${Y.pouch.length === 1 ? '' : 'S'}`;
  setHTML($('pouch'), Y.pouch.length ? [...Y.pouch].sort((a, b) => a.el.localeCompare(b.el) || b.rank - a.rank)
    .map((r) => `<button class="rune-chip ${held?.kind === 'rune' && held.id === r.id ? 'selected' : ''}" data-rune="${r.id}" style="--element-color:${EL[r.el].color}" title="${EL[r.el].name} rune, rank ${R[r.rank]}">${runeImg(r, 'chip-rune')}<span class="roman">${R[r.rank]}</span></button>`).join('')
    : '<p class="pouch-caption">No loose runes. They drop in the Rift.</p>');
  const rg = {};
  for (const r of Y.pouch) { const k = `${r.el}:${r.rank}`; rg[k] = (rg[k] || 0) + 1; }
  const fuses = Object.entries(rg).filter(([k, n]) => n >= 3 && +k.split(':')[1] < Engine.MAX_RANK)
    .map(([k]) => { const [el, rank] = k.split(':'); return `<button data-fuse="${k}" class="button small">Fuse 3× ${EL[el].icon} ${R[rank]} → ${R[+rank + 1]}</button>`; });
  const others = S.players.filter((p) => p.ref !== Y.ref);
  const spareI = Y.pouch.filter((r) => r.rank === 1 && r.el !== Y.el);
  const heldRune = held?.kind === 'rune' && Y.pouch.find((r) => r.id === held.id);
  setHTML($('pouchActions'), `${fuses.length || spareI.length ? `<div class="inspect-actions">${fuses.join('')}${spareI.length ? `<button class="button small ghost" data-act="salvageI">♻ Salvage ${spareI.length} off-element rank I · +${spareI.length} ✧</button>` : ''}</div>` : ''}
    ${heldRune ? `<div class="inspect-actions"><button class="button small ghost" data-act="drop">Put it down (Esc)</button><button class="button small ghost" data-act="salvageRune">♻ Salvage · +${Engine.runeEssence(heldRune)} ✧</button>
      ${others.length ? `<span class="dim-label">GIVE TO</span>${others.map((p) => `<button data-give="${p.ref}" class="button small ghost">${p.el ? EL[p.el].icon + ' ' : ''}${esc(p.name)}</button>`).join('')}` : ''}</div>` : ''}
    <p class="pouch-caption">${heldRune ? 'Select a socket in the grid to place it.' : 'Select a rune, then select a socket in the grid.'}</p>`);

  setHTML($('compList'), Engine.COMPONENT_KEYS.map((k) => `<div class="comp-row"><span class="tile-glyph" style="--component-color:${COMP[k].color}">${GLYPH[k]}</span> <span><b>${COMP[k].name}</b>: ${esc(COMP[k].desc)}</span></div>`).join(''));
}

function renderRift() {
  const D = S.dive, Y = me();
  const bottom = (html) => setHTML($('riftBottom'), html);
  const unitRow = (u) => `<div class="health-row"><span>${u.el ? `<span style="color:${EL[u.el].color}">${EL[u.el].icon}</span> ` : ''}${u.me ? 'YOUR MACHINE' : esc(u.name).toUpperCase()} · ${u.status === 'fighting' ? 'HULL' : u.status === 'recalled' ? 'CAME HOME' : 'DESTROYED'}</span>
      <strong>${u.status === 'fighting' ? `${Math.round(100 * u.hp / u.maxHp)}%${u.charge > 0.05 ? ` <span class="gold">⚡×${(1 + u.charge).toFixed(1)}</span>` : ''}` : '—'}</strong></div>
    ${u.status === 'fighting' ? `<div class="bar green"><span style="width:${100 * u.hp / u.maxHp}%"></span></div>` : ''}`;

  // what happened on your last dive (until you dismiss it)
  const L = Y.lastDive;
  const summary = L && localStorage.seenDive != L.at && !Y.diving ? `<div class="dive-summary ${L.destroyed ? 'bad' : 'good'}">
      <b>${L.destroyed ? `💥 Destroyed on floor ${L.floor}` : `🏳 Home safe from floor ${L.floor}`}</b> · Tier ${L.tier}<br>
      Brought back <b>${fmt(L.essence || 0)} Essence</b>, ${L.runes} rune${L.runes === 1 ? '' : 's'}${L.comps.length ? ` and ${L.comps.map(esc).join(', ')}` : ''}.
      ${L.destroyed ? `<br>Lost: ${L.lostItems.length ? L.lostItems.map(esc).join(', ') : 'no components'}${L.lostRunes.length ? `, ${L.lostRunes.length} socketed rune(s)` : ''}.` : ''}
      <button class="button small ghost" data-act="dismiss">OK</button></div>` : '';

  if (Y.diving) {
    const e = D.enemy, mine = D.units.find((u) => u.me);
    setHTML($('rift'), `<span class="rift-active-title">✧ &nbsp; LIVE EXPEDITION / TIER ${pad2(D.tier)} · FLOOR ${D.floor}</span>
      <div class="enemy-frame ${e && e.boss ? 'boss' : ''}">${e ? `<div class="enemy-symbol">${e.boss ? '☠' : '◉'}</div><div class="enemy-name">${esc(e.name)}</div>
        <div class="health-row"><span>ENEMY INTEGRITY · HITS FOR ${e.atk}</span><strong>${fmt(e.hp)} / ${fmt(e.maxHp)}</strong></div><div class="bar red"><span style="width:${100 * e.hp / e.maxHp}%"></span></div>`
        : '<div class="enemy-symbol descending">✧</div><div class="enemy-name" style="color:#9fcfb2">Descending…</div><div class="health-row"><span>&nbsp;</span></div><div class="bar red"><span style="width:0"></span></div>'}</div>
      ${D.units.map(unitRow).join('')}
      <div class="battle-readout"><span>◈ Formation ×${D.formation.toFixed(2)}</span><span>Runes <b>${mine ? mine.runes : 0}</b> &nbsp; Parts <b>${mine ? mine.comps : 0}</b></span></div>`);
    $('arenaMeta').textContent = 'CLICK TARGETS · BLOCK THE RED SHIELDS';
    setArena('fight', '', D.arena);
    syncBlocks();
    bottom(`<div class="rift-actions"><button class="button ghost" data-act="recall">⚑ Recall now</button></div>
      <p class="rift-footnote">Your machine fights on its own. Click targets to <b>overcharge</b> it, click red <b>⬡ shields</b> to block incoming hits,
      and hit <b>ϟ linked targets</b> together with a crewmate. It comes home by itself at ${Math.round(Y.recallPct * 100)}% hull.</p>`);
    return;
  }
  // Just came home: keep the arena where it was (inert) for a moment so leftover clicks land on nothing.
  if (L && (diveEndSeen[L.at] ??= Date.now()) > Date.now() - 2500) setArena('inert', `<div class="arena-msg">${L.destroyed ? '💥 Destroyed!' : '🏳 Home safe'}</div>`);
  else setArena('off');
  const t = S.tiers.max;
  if (!selectedTier || selectedTier > t) selectedTier = t;
  const tier = D ? D.tier : selectedTier;
  const tiersShown = Math.max(5, t + 1);
  const mineRes = Y.machine ? Engine.stats(Y.machine).resonance : 0;
  const formation = S.players.filter((p) => p.el).slice(0, 5);
  setHTML($('rift'), `<div class="rift-visual"><div class="rift-stars"></div><div class="rift-ring"></div><span class="rift-gem">◈</span><div class="portal-caption">RIFT SIGNATURE · ${pad2(tier)}</div></div>
    ${summary}
    ${D ? `<div class="label-row"><span>DIVE UNDERWAY</span><small>Tier ${D.tier} · floor ${D.floor}</small></div>${D.units.map(unitRow).join('')}`
      : `<div class="label-row"><span>SELECT RIFT TIER</span><small>Highest unlocked: ${R[t] || t}</small></div>
      <div class="tier-buttons">${Array.from({ length: tiersShown }, (_, i) => i + 1).map((n) => n <= t
        ? `<button class="tier-button ${n === selectedTier ? 'selected' : ''}" data-act="tier" data-tier="${n}" aria-pressed="${n === selectedTier}">${pad2(n)}</button>`
        : `<button class="tier-button locked" disabled title="Unlocks at Resonance ${fmt(S.tiers.ladder.find((l) => l.tier === n)?.req ?? 0)}">🔒</button>`).join('')}</div>
      <p class="rift-footnote">Next: Tier ${t + 1} at Resonance <b>${fmt(S.tiers.nextReq)}</b> (your machine: ${fmt(mineRes)}).</p>`}
    <div class="label-row"><span>AUTOMATIC RECALL</span><small>Hull safety</small></div>
    <select class="rift-select" id="recallSel" data-value="${Y.recallPct}">${[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((v) => `<option value="${v}" ${Math.abs(v - Y.recallPct) < 0.01 ? 'selected' : ''}>Come home at ${Math.round(v * 100)}% hull integrity</option>`).join('')}</select>
    <button class="button primary dive-button" data-act="dive" ${!Y.machine ? 'disabled' : ''}><span>✧</span> ${D ? `JOIN THE TIER ${D.tier} DIVE` : 'SEND MACHINE INTO THE RIFT'} <span>↗</span></button>
    <p class="rift-footnote">Every kill drops Essence and runes; bosses always drop a component. Destroyed machines keep half and may lose parts.</p>
    <div class="formation-preview"><div class="subhead">ACTIVE FORMATION <span>+15% DAMAGE PER EXTRA MACHINE</span></div>
      <div class="formation-cards">${formation.map((p) => `<div class="formation-item"><span style="color:${EL[p.el].color}">${EL[p.el].icon}</span>${esc(p.ref === Y.ref ? 'You' : p.name)}<small>${p.status ? 'Diving' : p.online ? 'Ready' : 'Away'}</small></div>`).join('') || '<div class="formation-item"><span>✧</span>Nobody yet<small>—</small></div>'}</div>
      <p class="expedition-hint">Machines fight automatically. During a dive, <strong>click targets</strong> to overcharge, block attacks and build combos.</p></div>`);
  bottom('');
}

setInterval(render, 500);

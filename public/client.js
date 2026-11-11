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

let ws, S = null, selectedTier = null;
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
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => send({ type: 'join', room, name, pid });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'error') toast(m.text);
    if (m.type === 'state') { S = m.state; render(); }
  };
  ws.onclose = () => { toast('Disconnected. Reconnecting…'); setTimeout(connect, 2000); };
  $('join').classList.add('hidden'); $('game').classList.remove('hidden');
  $('roomlabel').textContent = `Crew: ${room}`;
}
$('go').onclick = connect;
$('room').onkeydown = (e) => { if (e.key === 'Enter') connect(); };
if (localStorage.name && $('room').value) connect();

let toastTimer;
function toast(t) { $('toast').textContent = t; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2500); }

// ---------------------------------------------------------------- shared helpers
const EL = Engine.ELEMENTS, COMP = Engine.COMPONENTS;
const R = Engine.ROMAN;
const runeChip = (r, extra = '') => `<span class="rune el-${r.el} ${extra}" data-rune="${r.id}" title="${EL[r.el].name} ${R[r.rank]}">${EL[r.el].icon}<sub>${R[r.rank]}</sub></span>`;
const RAR = Engine.RARITIES;
const compTitle = (it) => `<span style="color:${RAR[it.rarity || 'common'].color}">${esc(Engine.itemName(it))}</span>${it.lvl > 1 ? ` <span class="gold">+${it.lvl - 1}</span>` : ''}`;
const modList = (it) => (it.mods || []).map((m) => `<li class="${Engine.MODS[m.k].bad ? 'curse' : 'buff'}">${Engine.MODS[m.k].bad ? '▼' : '▲'} ${esc(Engine.MODS[m.k].text(m.v))}</li>`).join('');
// "Takes: ☀ Sun · ♨ Ember" — what runes a component wants, as coloured labels
const takes = (it) => `<span class="takes">Takes ${Engine.socketsOf(it).map((sk) => `<span class="elpill el-${sk.el}">${EL[sk.el].icon} ${EL[sk.el].name}</span>`).join('')}</span>`;
// Element combos: which ones are on right now, and which this component's sockets could make
function comboLine(it) {
  const active = Engine.combosOf(it), possible = Engine.possibleCombos(it).filter((k) => !active.includes(k));
  const C = Engine.COMBOS;
  const label = (k) => C[k].els ? C[k].els.map((e) => EL[e].icon).join('+') : 'same element';
  return (active.length ? `<div class="combo on">${active.map((k) => `✦ <b>${C[k].name}</b>: ${esc(C[k].text)}`).join('<br>')}</div>` : '') +
    (possible.length ? `<div class="combo">${possible.map((k) => `◇ ${C[k].name} (${label(k)}): ${esc(C[k].text)}`).join('<br>')}</div>` : '');
}
const costLabel = (c) => `${fmt(c.essence)} ✦`;
const canAfford = (c) => (S.you.essence || 0) >= c.essence;
const me = () => S.you;
const allItems = () => [...(me().machine?.items || []), ...me().storage];
const findItem = (id) => allItems().find((it) => it.id === id);
function miniShape(type, rot = 0, it = null) {
  const cells = Engine.cellsFor(it || type, rot), w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
  const socketAt = new Map((it ? Engine.socketsOf(it) : COMP[type].sockets).map((s) => [s.c, s.el]));
  let out = `<span class="mini" style="grid-template-columns:repeat(${w},16px)">`;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = cells.findIndex(([cx, cy]) => cx === x && cy === y);
    out += i < 0 ? '<i></i>' : `<i class="on" style="background:${COMP[type].color}">${socketAt.has(i) ? `<b class="el-${socketAt.get(i)}">${EL[socketAt.get(i)].icon}</b>` : ''}</i>`;
  }
  return out + '</span>';
}

// A large drawing of a component's shape: every square, with socket squares coloured and named by the element they want.
function bigShape(it, rot = 0) {
  const cells = Engine.cellsFor(it, rot), w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
  const socks = Engine.socketsOf(it), sockAt = new Map(socks.map((s, i) => [s.c, i]));
  let out = `<div class="bigshape" style="grid-template-columns:repeat(${w},46px)">`;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ci = cells.findIndex(([cx, cy]) => cx === x && cy === y);
    if (ci < 0) { out += '<i></i>'; continue; }
    const si = sockAt.get(ci);
    if (si === undefined) { out += `<i class="sq" style="--cc:${COMP[it.type].color}"></i>`; continue; }
    const el = socks[si].el, r = it.runes?.[si];
    out += `<i class="sq sk el-${el}" style="--cc:${COMP[it.type].color}"><b>${EL[el].icon}</b><span>${r ? `${EL[r.el].icon}${R[r.rank]}` : EL[el].name}</span></i>`;
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
  return base + (extra.length ? `<ul class="mods">${extra.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
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
$('chatform').onsubmit = (e) => { e.preventDefault(); send({ type: 'chat', text: $('chat').value }); $('chat').value = ''; };
$('elementPick').onclick = (e) => { const el = e.target.closest('[data-el]')?.dataset.el; if (el) send({ type: 'element', el }); };

$('pouch').onclick = (e) => {
  const id = +e.target.closest('[data-rune]')?.dataset.rune; if (!id) return;
  held = held?.kind === 'rune' && held.id === id ? null : { kind: 'rune', id }; focusId = null; render();
};
$('storage').onclick = (e) => {
  const b = e.target.closest('button');
  if (b?.dataset.upgrade) { send({ type: 'upgrade', itemId: +b.dataset.upgrade }); return; }
  if (b?.dataset.salvage) { if (confirm('Salvage this component into Essence? Any runes in it go back to your pouch.')) send({ type: 'salvage', itemId: +b.dataset.salvage }); return; }
  const id = +e.target.closest('[data-item]')?.dataset.item; if (!id) return;
  held = held?.kind === 'comp' && held.id === id ? null : { kind: 'comp', id, rot: 0 }; focusId = null; render();
};
$('pouchActions').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.fuse) { const [el, rank] = b.dataset.fuse.split(':'); send({ type: 'fuseRunes', el, rank: +rank }); }
  if (b.dataset.act === 'salvageRune') { send({ type: 'salvage', runeId: held.id }); held = null; }
  if (b.dataset.act === 'salvageI') { const ids = me().pouch.filter((r) => r.rank === 1 && r.el !== me().el).map((r) => r.id); if (ids.length && confirm(`Salvage ${ids.length} rank I rune(s) that aren't your element?`)) send({ type: 'salvage', runeIds: ids }); }
  if (b.dataset.give) { send({ type: 'give', [held.kind === 'rune' ? 'runeId' : 'itemId']: held.id, to: b.dataset.give }); held = null; }
  if (b.dataset.act === 'rotate') rotateHeld();
  if (b.dataset.act === 'drop') { held = null; render(); }
};
$('expand').onclick = (e) => { const d = e.target.closest('button')?.dataset.expand; if (d) send({ type: 'expand', dir: d }); };
$('focus').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'hrot') return rotateHeld();
  if (b.dataset.act === 'hdrop') { held = null; return render(); }
  const it = findItem(focusId); if (!it) return;
  if (b.dataset.act === 'store') { send({ type: 'store', itemId: it.id }); focusId = null; }
  if (b.dataset.act === 'upgrade') send({ type: 'upgrade', itemId: it.id });
  if (b.dataset.act === 'move') { held = { kind: 'comp', id: it.id, rot: it.rot }; focusId = null; render(); }
  if (b.dataset.act === 'rot') rotateInstalled(it);
  if (b.dataset.unsocket) send({ type: 'unsocket', itemId: it.id, s: +b.dataset.unsocket });
  if (b.dataset.act === 'close') { focusId = null; render(); }
};
function rotateHeld() { if (held?.kind === 'comp') { held.rot = (held.rot + 1) % 4; render(); } }
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'r' || e.key === 'R') rotateHeld();
  if (e.key === 'Escape') { held = null; focusId = null; render(); }
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
  if (targets.filter((t) => !t.link).length < arenaCfg.max) spawnTarget();
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
  do { x = r + Math.random() * (w - 2 * r); y = r + Math.random() * (h - 2 * r); }
  while (tries++ < 12 && targets.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r + 6));
  const life = link ? link.ttl : block ? block.ttl : arenaCfg.lifeMs;
  const el = document.createElement('div');
  el.className = 'target' + (link ? ' linked' : block ? ' block' : '');
  el.style.cssText = `left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;--life:${life}ms` + (link ? `;--hue:${link.hue}` : '');
  if (link) el.innerHTML = `<span>⚡ ${esc(link.partner)}</span>`;
  if (block) el.innerHTML = `<em>🛡</em><span>BLOCK! (${block.atk} dmg)</span>`;
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
  el.textContent = combo > 1 ? `Combo ×${combo}` : '';
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
  $('reshead').textContent = fmt(S.totalResonance);

  renderRift();
  renderMachine();
  syncLinks();

  setHTML($('players'), S.players.map((p) => `<div><span class="${p.online ? 'on' : 'off'}">●</span> ${p.el ? `<span class="elc el-${p.el}">${EL[p.el].icon}</span> ` : ''}${esc(p.name)}
    <span class="dim">· Resonance ${fmt(p.resonance)}${p.status ? ` · <span class="warn">${p.status}</span>` : ''}</span></div>`).join(''));

  const feed = $('feed');
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 30;
  setHTML(feed, S.feed.map((f) => `<div><span class="dim">${new Date(f.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> ${esc(f.text)}</div>`).join(''));
  if (atBottom) feed.scrollTop = feed.scrollHeight;
}

function statLine(label, now, after, f = fmt1) {
  const d = after == null ? 0 : after - now;
  return `<div class="stat"><span>${label}</span><b>${f(now)}</b>${Math.abs(d) > 1e-6 ? `<i class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${f(d)}</i>` : ''}</div>`;
}

function renderMachine() {
  const Y = me(), m = Y.machine;
  setHTML($('elementPick'), Y.el ? '' : `<div class="pick"><b>Choose your element to get your machine.</b> Most runes you find will match it,
    so you'll want to trade with your crew for the others.
    <div class="els">${Engine.ELEMENT_KEYS.map((k) => `<button data-el="${k}" class="el-${k}"><b>${EL[k].icon} ${EL[k].name}</b></button>`).join('')}</div></div>`);
  $('machineWrap').classList.toggle('hidden', !m);
  if (!m) return;
  if (held && !findItem(held.id) && !Y.pouch.some((r) => r.id === held.id)) held = null;
  if (focusId && !m.items.some((it) => it.id === focusId)) focusId = null;
  const locked = Y.diving;
  $('machineBox').classList.toggle('locked', locked);

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
      // e.g. two coils boosting each other
      badges[id] = !badges[id] ? got : badges[id].text.split(' ')[1] === got.text.split(' ')[1]
        ? { text: `↔ ${got.text.split(' ')[1]} both ways`, cls: 'both' } : { text: `${badges[id].text} · ${got.text}`, cls: 'both' };
    }
    if (fl.dead && fl.booster) badges[focusId] = { text: 'off: no runes', cls: 'drain' };
  }
  let html = '';
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const k = y * m.w + x, info = cellInfo[k];
    const cls = ['cell'];
    let inner = '', style = '';
    if (info) {
      const { it, ci } = info, def = COMP[it.type];
      style = `--cc:${def.color}`;
      cls.push('filled');
      if (it.id === focusId) cls.push('focused');
      const same = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && occ[ny * m.w + nx] === it.id; };
      if (!same(0, -1)) cls.push('bt'); if (!same(0, 1)) cls.push('bb'); if (!same(-1, 0)) cls.push('bl'); if (!same(1, 0)) cls.push('br');
      const socks = Engine.socketsOf(it);
      const s = socks.findIndex((sk) => sk.c === ci);
      if (s >= 0) {
        const r = it.runes[s], want = socks[s].el;
        cls.push('sockcell', 'el-' + want);
        inner = r ? `<span class="sock full el-${r.el} ${r.el === want ? '' : 'mismatch'}" title="${EL[r.el].name} ${R[r.rank]} in a ${EL[want].name} socket">${EL[r.el].icon}<sub>${R[r.rank]}</sub>${r.el === want ? '' : `<span class="want el-${want}">wants ${EL[want].name}</span>`}</span>`
          : `<span class="sock el-${want}" title="wants a ${EL[want].name} rune">${EL[want].icon}<span class="want">${EL[want].name}</span></span>`;
      }
      if (badges[it.id] && ci === handleIndex(it)) inner += `<span class="badge ${badges[it.id].cls}">${badges[it.id].text}</span>`;
      if (ci === 0) inner += `<span class="cname" style="color:${RAR[it.rarity || 'common'].color}">${esc(def.name.split(' ').pop())}${it.lvl > 1 ? ' +' + (it.lvl - 1) : ''}</span><span class="cpow">${fmt1(10 * (stats.power[it.id] || 0))}</span>`;
    }
    if (ghost.has(`${x},${y}`)) cls.push(ghostOk ? 'ghost-ok' : 'ghost-bad');
    if (held?.kind === 'rune' && info && Engine.socketsOf(info.it).some((sk) => sk.c === info.ci)) cls.push('droppable');
    html += `<div class="${cls.join(' ')}" style="${style}" data-x="${x}" data-y="${y}">${inner}</div>`;
  }
  $('machineGrid').style.gridTemplateColumns = `repeat(${m.w}, 52px)`;
  setHTML($('machineGrid'), html);
  setHTML($('expand'), locked ? '' : `<button class="small ghost" data-expand="w" ${m.w >= Y.maxW || Y.essence < Y.expandCost ? 'disabled' : ''}>+ column</button>
    <button class="small ghost" data-expand="h" ${m.h >= Y.maxH || Y.essence < Y.expandCost ? 'disabled' : ''}>+ row</button>
    <span class="dim">${fmt(Y.expandCost)} ✦</span>`);

  // stats with a live preview of whatever you're about to do
  const trial = trialMachine();
  const after = trial && (trial.ok || Engine.fits(trial.m)) ? Engine.stats(trial.m) : null;
  setHTML($('stats'), `<div class="statbox">${statLine('Damage/s', stats.dmg, after?.dmg)}${statLine('HP', stats.hp, after?.hp)}
    ${statLine('Armor', stats.armor, after?.armor)}${statLine('Repair/s', stats.regen, after?.regen)}
    ${statLine('Extra runes', stats.loot * 100, after && after.loot * 100, (v) => Math.round(v) + '%')}
    ${statLine('Resonance', stats.resonance, after?.resonance, fmt)}
    <div class="dim tiny">Tier ${S.tiers.max + 1} unlocks at ${fmt(S.tiers.nextReq)} (${fmt(Math.max(0, S.tiers.nextReq - stats.resonance))} to go)</div></div>`);

  // inspecting an installed component: what it takes, and exactly how it works with its neighbours
  const f = focusId && m.items.find((it) => it.id === focusId);
  const held2 = held?.kind === 'comp' && findItem(held.id);
  const nameOf = (id) => { const o = m.items.find((x) => x.id === id); return o ? esc(Engine.itemName(o)) : '?'; };
  let panel = '';
  if (f && !locked) {
    const L = stats.links[f.id];
    const own = 10 * (stats.base[f.id] || 0), total = 10 * (stats.power[f.id] || 0);
    // Power, in one sentence: what it has on its own, then each thing multiplying it.
    const parts = L.in.map((l) => `×${(Math.round(l.f * 100) / 100)} ${l.from === null ? `from ${esc(l.why)}` : `because it touches the ${nameOf(l.from)}`}`);
    const powerLine = L.dead ? '<span class="warn">Power 0: its sockets are empty, so it does nothing yet. Put a rune in it.</span>'
      : `Power <b class="gold">${fmt1(total)}</b>: ${fmt1(own)} from its runes and level${parts.length ? ', ' + parts.join(', ') : ''}.`;
    const isBooster = L.booster;
    const nowLine = !isBooster && !L.out.length ? ''
      : L.dead ? '<div class="nb warn">Right now: boosting nothing, because its sockets are empty.</div>'
        : L.out.length ? `<div class="nb">Right now it's boosting: <b>${L.out.map(nameOf).join(', ')}</b>.</div>`
          : `<div class="nb warn">Right now: boosting nothing${f.type === 'capacitor' ? ' (it only helps weapons, and none touch it)' : ' (nothing it can help is touching it)'}.</div>`;
    panel = `<div class="focusbox" style="border-color:${RAR[f.rarity || 'common'].color}">
      <div class="fhead">${bigShape(f, f.rot)}<div><b>${compTitle(f)}</b> <span class="dim">· ${RAR[f.rarity || 'common'].name}</span><br>
      <small>${esc(COMP[f.type].desc)}</small>${takes(f)}</div></div>
      <div class="nb">${powerLine}</div>
      <div class="nb"><b>Neighbours:</b> ${neighbourRule(f)}</div>
      ${nowLine}
      ${f.mods?.length ? `<ul class="mods">${modList(f)}</ul>` : ''}${comboLine(f)}
      <div class="row">${Engine.socketsOf(f).map((sk, s) => f.runes[s] ? `<button class="small ghost" data-unsocket="${s}">Remove ${EL[f.runes[s].el].icon} ${R[f.runes[s].rank]}</button>` : `<span class="dim small">empty ${EL[sk.el].icon} ${EL[sk.el].name} socket</span>`).join(' ')}</div>
      <div class="row">${f.lvl < Engine.MAX_LEVEL ? `<button class="small" data-act="upgrade" ${canAfford(Engine.upgradeCost(f)) ? '' : 'disabled'}>⬆ Upgrade to +${f.lvl} (${costLabel(Engine.upgradeCost(f))})</button>` : '<span class="dim small">Max level</span>'}
      <button class="small" data-act="move">Move</button><button class="small" data-act="rot">Rotate</button>
      <button class="small" data-act="store">Put in storage</button><button class="small ghost" data-act="close">✕</button></div></div>`;
  } else if (held2 && !locked) {
    // holding a component (from storage, or moving one): show its shape big, turned the way it will be placed
    panel = `<div class="focusbox" style="border-color:${RAR[held2.rarity || 'common'].color}">
      <div class="fhead">${bigShape(held2, held.rot)}<div><b>${compTitle(held2)}</b> <span class="dim">· ${RAR[held2.rarity || 'common'].name} · ${Engine.shapeOf(held2).length} square${Engine.shapeOf(held2).length === 1 ? '' : 's'}</span><br>
      <small>${esc(COMP[held2.type].desc)}</small>${takes(held2)}</div></div>
      <div class="nb"><b>Neighbours:</b> ${neighbourRule(held2)}</div>
      ${held2.mods?.length ? `<ul class="mods">${modList(held2)}</ul>` : ''}${comboLine(held2)}
      <div class="row"><button class="small" data-act="hrot">⟳ Rotate (R)</button><button class="small ghost" data-act="hdrop">Put it down (Esc)</button></div>
      <p class="hint">Move over your machine to see where it lands, then click to place it.</p></div>`;
  }
  setHTML($('focus'), panel);

  setHTML($('helpline'), locked ? '🔒 Your machine is in the Rift. Recall it to make changes.'
    : held?.kind === 'comp' && hoverCell && !ghostOk ? `<span class="warn">${ghostOff ? `${ghostOff} square${ghostOff === 1 ? '' : 's'} would hang off the machine.` : 'That overlaps another component.'}</span> Press <b>R</b> to rotate, <b>Esc</b> to cancel.`
    : held?.kind === 'comp' ? 'The piece follows your cursor: click to place it. Press <b>R</b> to rotate, <b>Esc</b> to cancel.'
      : held?.kind === 'rune' ? 'Click a glowing socket to put the rune in. It swaps with any rune already there.'
        : 'Click a rune or a stored component to pick it up. Click a component in the machine to inspect it.');

  // storage
  setHTML($('storage'), `<div class="dim small">Essence: <b class="gold">${fmt(Y.essence || 0)} ✦</b> (salvage spare runes and components to get more)</div>` +
    (Y.storage.length ? Y.storage.map((it) => `<div class="card ${held?.kind === 'comp' && held.id === it.id ? 'sel' : ''}" data-item="${it.id}" style="border-color:${RAR[it.rarity || 'common'].color}55">
      ${miniShape(it.type, held?.id === it.id ? held.rot : 0, it)}<div style="flex:1"><b>${compTitle(it)}</b> <span class="dim small">${RAR[it.rarity || 'common'].name}</span>
      <small>${esc(COMP[it.type].desc)} ${Engine.shapeOf(it).length} square${Engine.shapeOf(it).length === 1 ? '' : 's'}.</small>${takes(it)}${comboLine(it)}
      ${it.mods?.length ? `<ul class="mods">${modList(it)}</ul>` : ''}</div>
      <div class="cardbtns">${it.lvl < Engine.MAX_LEVEL ? `<button class="small ghost" data-upgrade="${it.id}" ${canAfford(Engine.upgradeCost(it)) ? '' : 'disabled'}>⬆ ${costLabel(Engine.upgradeCost(it))}</button>` : ''}
      <button class="small ghost" data-salvage="${it.id}">♻ +${Engine.itemEssence(it)} ✦</button></div></div>`).join('')
    : '<span class="dim">Empty. Components drop in the Rift (bosses always drop one), each with random rarity, sockets and modifiers.</span>'));

  // runes
  setHTML($('pouch'), Y.pouch.length ? [...Y.pouch].sort((a, b) => a.el.localeCompare(b.el) || b.rank - a.rank)
    .map((r) => runeChip(r, held?.kind === 'rune' && held.id === r.id ? 'sel' : '')).join('') : '<span class="dim">No loose runes.</span>');
  const rg = {};
  for (const r of Y.pouch) { const k = `${r.el}:${r.rank}`; rg[k] = (rg[k] || 0) + 1; }
  const fuses = Object.entries(rg).filter(([k, n]) => n >= 3 && +k.split(':')[1] < Engine.MAX_RANK)
    .map(([k]) => { const [el, rank] = k.split(':'); return `<button data-fuse="${k}" class="small">Fuse 3× ${EL[el].icon} ${R[rank]} → ${R[+rank + 1]}</button>`; });
  const others = S.players.filter((p) => p.ref !== Y.ref);
  const canGive = held && others.length && (held.kind === 'rune' || Y.storage.some((it) => it.id === held.id));
  const spareI = Y.pouch.filter((r) => r.rank === 1 && r.el !== Y.el);
  const heldRune = held?.kind === 'rune' && Y.pouch.find((r) => r.id === held.id);
  setHTML($('pouchActions'), `<div class="row">${fuses.join('')}${spareI.length ? `<button class="small ghost" data-act="salvageI">♻ Salvage ${spareI.length} off-element rank I (+${spareI.length} ✦)</button>` : ''}</div>
    ${held ? `<div class="row">${held.kind === 'comp' ? '<button class="small" data-act="rotate">Rotate (R)</button>' : ''}<button class="small ghost" data-act="drop">Put it down (Esc)</button>
      ${heldRune ? `<button class="small ghost" data-act="salvageRune">♻ Salvage (+${Engine.runeEssence(heldRune)} ✦)</button>` : ''}
      ${canGive ? `<span class="dim">Give it to:</span> ${others.map((p) => `<button data-give="${p.ref}" class="small ghost">${p.el ? EL[p.el].icon + ' ' : ''}${esc(p.name)}</button>`).join('')}` : ''}</div>` : ''}`);

  setHTML($('compList'), Engine.COMPONENT_KEYS.map((k) => `<div class="row">${miniShape(k)} <span><b>${COMP[k].name}</b>: ${esc(COMP[k].desc)}</span></div>`).join(''));
}

function renderRift() {
  const D = S.dive, Y = me();
  const bottom = (html) => setHTML($('riftBottom'), html);
  const units = (D) => `<div class="units">${D.units.map((u) => `<div class="unit ${u.status}"><span>${u.el ? `<span class="elc el-${u.el}">${EL[u.el].icon}</span> ` : ''}<b>${esc(u.name)}</b>${u.me ? ' (you)' : ''}</span>
    <span class="dim">${u.status === 'fighting' ? `${fmt(u.dmg * (1 + u.charge))} dmg/s${u.charge > 0.05 ? ` <span class="gold">⚡×${(1 + u.charge).toFixed(1)}</span>` : ''} · ${u.runes} rune${u.runes === 1 ? '' : 's'}${u.comps ? ` · ${u.comps} part${u.comps === 1 ? '' : 's'}` : ''}` : u.status === 'recalled' ? 'came home' : 'destroyed'}</span>
    ${u.status === 'fighting' ? `<div class="bar party"><div style="width:${100 * u.hp / u.maxHp}%"></div></div>` : ''}</div>`).join('')}</div>`;

  // what happened on your last dive (until you dismiss it)
  const L = Y.lastDive;
  const summary = L && localStorage.seenDive != L.at && !Y.diving ? `<div class="summary ${L.destroyed ? 'bad' : 'good'}">
      <b>${L.destroyed ? `💥 Your machine was destroyed on floor ${L.floor}` : `🏳 Your machine came home from floor ${L.floor}`}</b> (Tier ${L.tier})<br>
      Brought back ${fmt(L.essence || 0)} Essence, ${L.runes} rune${L.runes === 1 ? '' : 's'}${L.comps.length ? ` and ${L.comps.map(esc).join(', ')}` : ''}.
      ${L.destroyed ? `<br>Lost: ${L.lostItems.length ? L.lostItems.map(esc).join(', ') : 'no components'}${L.lostRunes.length ? `, ${L.lostRunes.length} socketed rune(s)` : ''}.` : ''}
      <button class="small ghost" data-act="dismiss">OK</button></div>` : '';

  if (Y.diving) {
    const e = D.enemy;
    setHTML($('rift'), `<h2>The Rift · Tier ${D.tier} · Floor ${D.floor}${D.formation > 1 ? ` <span class="formation">Formation ×${D.formation.toFixed(2)}</span>` : ''}</h2>
      ${e ? `<div class="enemy ${e.boss ? 'boss' : ''}"><div class="name">${e.boss ? '☠ ' : ''}${esc(e.name)}</div>
        <div class="bar hp"><div style="width:${100 * e.hp / e.maxHp}%"></div></div><div class="dim">${fmt(e.hp)} / ${fmt(e.maxHp)} · hits for ${e.atk}</div></div>`
        : '<div class="enemy"><div class="name" style="color:#7ee787">Descending…</div><div class="bar"><div></div></div><div>&nbsp;</div></div>'}
      ${units(D)}`);
    setArena('fight', '', D.arena);
    syncBlocks();
    bottom(`<p class="hint">Your machine fights on its own. Click targets to <b>overcharge</b> it (dead centre and long combos charge most).
      When a red <b>🛡 shield</b> appears, the enemy is about to hit you: click it to <b>block</b> (dead centre hits back). Hit <b>⚡ linked targets</b> together with a crewmate for a burst.
      It comes home by itself at ${Math.round(Y.recallPct * 100)}% HP.</p><div class="row"><button data-act="recall">🏳 Recall now</button></div>`);
    return;
  }
  // Just came home: keep the arena where it was (inert) for a moment so leftover clicks land on nothing.
  if (L && (diveEndSeen[L.at] ??= Date.now()) > Date.now() - 2500) setArena('inert', L.destroyed ? '💥 Destroyed!' : '🏳 Home safe');
  else setArena('off');
  const t = S.tiers.max;
  if (!selectedTier || selectedTier > t) selectedTier = t;
  const tier = D ? D.tier : selectedTier;
  setHTML($('rift'), `<h2>The Rift</h2>${summary}
    ${D ? `<p><b>A Tier ${D.tier} dive is underway</b> (floor ${D.floor}).</p>${units(D)}` : `<p>Send your machine into the Rift. It fights on its own, floor by floor, and keeps going while you're away.
      Every kill drops <b>Essence</b> and runes (mostly your element), and sometimes a rolled component; bosses always drop one.
      If it's destroyed, it keeps only half of what it found and each installed part has a 30% chance to be lost.
      <b>Each tier is a big step up</b>: dive together, since every extra machine gives the whole team <b>+15% damage</b> (Formation) and enemies grow slower than your crew does.</p>
      <div class="row tiers">${Array.from({ length: t }, (_, i) => `<button data-act="tier" data-tier="${i + 1}" class="small ${i + 1 === selectedTier ? 'on-tier' : 'ghost'}">Tier ${i + 1}</button>`).join('')}
        </div>
      <p class="dim small">Tiers unlock when any crew machine reaches: ${S.tiers.ladder.map((l) => `Tier ${l.tier} at <b>${fmt(l.req)}</b>`).join(' · ')}.
        Your machine: <b class="gold">${fmt(Y.machine ? Engine.stats(Y.machine).resonance : 0)}</b>. Higher tiers: tougher enemies, better runes and components.</p>`}
    <div class="row"><label class="dim">Come home at <select id="recallSel" data-value="${Y.recallPct}">${[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((v) => `<option value="${v}" ${Math.abs(v - Y.recallPct) < 0.01 ? 'selected' : ''}>${Math.round(v * 100)}% HP</option>`).join('')}</select></label></div>
    <button class="big" data-act="dive" ${!Y.machine ? 'disabled' : ''}>${D ? `Join the Tier ${D.tier} dive` : `Send your machine into Tier ${tier}`}</button>`);
  bottom('');
}

setInterval(render, 500);

'use strict';
const $ = (id) => document.getElementById(id);
const fmt = (n) => {
  n = Math.floor(n);
  if (n < 1e6) return n.toLocaleString();
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(2) + u[i];
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));

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
    morphChildren(x, y);
  });
  for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
}

// Instant feedback: a floating label where you clicked.
function pop(e, text, cls = '') {
  const d = document.createElement('div');
  d.className = 'pop ' + cls; d.textContent = text;
  d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 700);
}

let ws, S = null, selectedRune = null, selectedTier = null, hoverSocket = null;
const runEndSeen = {}; // run-end time (server) → when this browser first saw it (local), avoids clock-skew issues
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

// ---------------------------------------------------------------- input
// The clicker fires on press (not release) and updates the number immediately; the server corrects any difference.
$('polish').addEventListener('pointerdown', (e) => {
  if (!S) return;
  send({ type: 'click' });
  const gain = S.clickPower * S.harmony;
  S.dust += gain;
  $('dust').textContent = fmt(S.dust);
  pop(e, '+' + fmt(gain));
});
$('buildings').onclick = (e) => { const k = e.target.closest('button')?.dataset.buy; if (k) send({ type: 'buy', key: k }); };
$('elementPick').onclick = (e) => { const el = e.target.closest('[data-el]')?.dataset.el; if (el) send({ type: 'element', el }); };
$('pouch').onclick = (e) => {
  const id = +e.target.closest('[data-rune]')?.dataset.rune;
  if (!id) return;
  selectedRune = selectedRune === id ? null : id;
  render();
};
$('pouchActions').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.merge) { const [el, rank] = b.dataset.merge.split(':'); send({ type: 'merge', el, rank: +rank }); }
  if (b.dataset.give) { send({ type: 'give', runeId: selectedRune, to: b.dataset.give }); selectedRune = null; }
};
$('engineGrid').onclick = (e) => {
  const s = e.target.closest('[data-socket]'); if (!s) return;
  const i = +s.dataset.socket;
  if (selectedRune) { send({ type: 'place', runeId: selectedRune, socket: i }); selectedRune = null; }
  else if (S.engine.grid[i]) send({ type: 'unsocket', socket: i });
};
// Live preview: with a rune selected, hovering a socket shows exactly what Resonance you'd get.
$('engineGrid').addEventListener('pointerover', (e) => { const s = e.target.closest('[data-socket]'); hoverSocket = s ? +s.dataset.socket : null; renderPreview(); });
$('engineGrid').addEventListener('pointerleave', () => { hoverSocket = null; renderPreview(); });
$('chatform').onsubmit = (e) => { e.preventDefault(); send({ type: 'chat', text: $('chat').value }); $('chat').value = ''; };
function riftClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'dismissRun') { localStorage.dismissedRun = S.lastRun.at; return render(); }
  if (b.dataset.act === 'boon') send({ type: 'boon', key: b.dataset.key });
  else if (b.dataset.act === 'tier') { selectedTier = +b.dataset.tier; render(); }
  else if (b.dataset.act === 'startRun') send({ type: 'startRun', tier: selectedTier });
  else send({ type: b.dataset.act });
}
$('rift').onclick = riftClick;
$('riftBottom').onclick = riftClick;

// ---------------------------------------------------------------- arena (skill combat)
// Targets are spawned locally for each player; the server is told how accurate each hit was.
const arena = $('arena');
let arenaMode = 'off', arenaCfg = null, targets = [], combo = 0, spawnTimer = null;
function setArena(mode, msg, cfg) {
  if (cfg) arenaCfg = cfg;
  arena.classList.toggle('hidden', mode === 'off');
  arena.classList.toggle('inert', mode === 'inert');
  if ($('arenaMsg').innerHTML !== (msg || '')) $('arenaMsg').innerHTML = msg || '';
  if (mode === arenaMode) return;
  arenaMode = mode;
  clearTimeout(spawnTimer);
  targets.forEach((t) => { clearTimeout(t.timer); t.el.remove(); });
  targets = [];
  seenLinks.clear();
  combo = 0; showCombo();
  if (mode === 'fight') spawnTimer = setTimeout(spawnLoop, 400);
}
function spawnLoop() {
  if (arenaMode !== 'fight') return;
  if (targets.length < arenaCfg.max) spawnTarget();
  spawnTimer = setTimeout(spawnLoop, arenaCfg.spawnMs * (0.7 + Math.random() * 0.6));
}
// Linked targets: one on your screen and one on a friend's. Hit them at the same moment for a huge strike.
const seenLinks = new Set(), shownResults = new Set();
function syncLinks() {
  if (arenaMode !== 'fight' || !S.run) return;
  for (const l of S.run.links) {
    if (seenLinks.has(l.id)) continue;
    seenLinks.add(l.id);
    spawnTarget({ link: l });
  }
  for (const res of S.run.linkResults) {
    if (shownResults.has(res.id)) continue;
    shownResults.add(res.id);
    if (!seenLinks.has(res.id)) continue; // from before this screen was open
    const rect = arena.getBoundingClientRect();
    pop({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
      res.ok ? `⚡ LINKED with ${res.partner}! ×3` : `link with ${res.partner} broke`, res.ok ? 'linked' : 'miss');
  }
}
function spawnTarget(opts = {}) {
  const link = opts.link;
  const r = Math.round(arenaCfg.radius * (link ? 1.25 : 1)), w = arena.clientWidth, h = arena.clientHeight;
  if (w < 4 * r || h < 4 * r) return;
  let x, y, tries = 0;
  do { x = r + Math.random() * (w - 2 * r); y = r + Math.random() * (h - 2 * r); }
  while (tries++ < 12 && targets.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r + 6));
  const life = link ? link.ttl : arenaCfg.lifeMs;
  const el = document.createElement('div');
  el.className = 'target' + (link ? ' linked' : '');
  el.style.cssText = `left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;--life:${life}ms` + (link ? `;--hue:${link.hue}` : '');
  if (link) el.innerHTML = `<span>⚡ ${esc(link.partner)}</span>`;
  arena.appendChild(el);
  const t = { x, y, r, el, link };
  t.timer = setTimeout(() => { // too slow: the target fades (and a normal target breaks the combo)
    targets = targets.filter((o) => o !== t);
    el.classList.add('expired'); setTimeout(() => el.remove(), 250);
    if (!link && combo) { combo = 0; showCombo('lost'); }
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
  if (!best) { // clicked empty sky: a missed attack
    pop(e, 'miss', 'miss');
    if (combo) { combo = 0; showCombo('lost'); }
    return;
  }
  clearTimeout(best.timer);
  targets = targets.filter((t) => t !== best);
  best.el.classList.add('popped'); setTimeout(() => best.el.remove(), 200);
  const acc = 1 - bestD / best.r;
  if (best.link) {
    send({ type: 'linkHit', id: best.link.id, acc, combo });
    combo++; showCombo();
    pop(e, `⚡ now ${best.link.partner}!`, 'linked');
    return;
  }
  send({ type: 'hit', acc, combo });
  combo++; showCombo();
  pop(e, acc >= 0.85 ? 'BULLSEYE!' : acc >= 0.45 ? 'Hit' : 'Graze', acc >= 0.85 ? 'crit' : 'hit');
  const en = document.querySelector('#rift .enemy');
  if (en) { en.classList.remove('struck'); void en.offsetWidth; en.classList.add('struck'); }
});

// ---------------------------------------------------------------- render
const EL = Engine.ELEMENTS;
const runeChip = (r, extra = '') => `<span class="rune el-${r.el} ${extra}" data-rune="${r.id}" title="${EL[r.el].name} ${Engine.ROMAN[r.rank]}">${EL[r.el].icon}<sub>${Engine.ROMAN[r.rank]}</sub></span>`;
const runeList = (rs) => rs.length ? rs.map((r) => runeChip(r)).join('') : '<span class="dim">none yet</span>';

function render() {
  if (!S) return;
  const now = Date.now();
  $('dust').textContent = fmt(S.dust);
  $('dps').textContent = fmt(S.dps);
  $('harmony').textContent = '×' + S.harmony;
  $('tierhead').textContent = S.tiers.max;
  $('reshead').textContent = fmt(S.engine.resonance);
  $('clickval').textContent = `+${fmt(S.clickPower)} per click`;

  const item = (u) => `<div class="item"><div>${esc(u.name)} <span class="dim">(${u.count})</span><small>${esc(u.desc)}</small></div>
    <button data-buy="${u.key}" ${S.dust < u.cost ? 'disabled' : ''}>${fmt(u.cost)} ✧</button></div>`;
  setHTML($('buildings'), S.buildings.map(item).join('') + item(S.cloth) +
    (S.engine.resonance ? `<p class="hint">The Star Engine's Resonance boosts all production: ×${(1 + S.engine.resonance / 100).toFixed(2)}</p>` : ''));

  renderRift(now);
  renderEngine();
  syncLinks();

  setHTML($('players'), S.players.map((p) => `<div><span class="${p.online ? 'on' : 'off'}">●</span> ${p.el ? `<span class="elc el-${p.el}">${EL[p.el].icon}</span> ` : ''}${esc(p.name)}
    <span class="dim">· ${p.runes} rune${p.runes === 1 ? '' : 's'} · ${fmt(p.contributed)} clicked</span></div>`).join(''));

  const feed = $('feed');
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 30;
  setHTML(feed, S.feed.map((f) => `<div><span class="dim">${new Date(f.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> ${esc(f.text)}</div>`).join(''));
  if (atBottom) feed.scrollTop = feed.scrollHeight;
}

function renderEngine() {
  const E = S.engine, me = S.you;
  $('engineBox').classList.toggle('hidden', !!(S.run && S.run.inRun)); // keep the fight screen uncluttered
  setHTML($('elementPick'), me.el ? '' : `<div class="pick"><b>Choose your element.</b> Most runes you find will match it, so the crew needs each other's runes to build a great Engine.
    <div class="els">${Engine.ELEMENT_KEYS.map((k) => `<button data-el="${k}" class="el-${k}"><b>${EL[k].icon} ${EL[k].name}</b><small>${esc(EL[k].rule)}</small></button>`).join('')}</div></div>`);
  const t = S.tiers;
  const pct = Math.max(0, Math.min(100, 100 * (E.resonance - t.curReq) / (t.nextReq - t.curReq)));
  setHTML($('engineHead'), `<div class="row" style="justify-content:space-between"><span>Resonance <b class="gold">${fmt(E.resonance)}</b></span>
    <span class="dim">Tier ${t.next} unlocks at ${fmt(t.nextReq)}</span></div>
    <div class="bar"><div style="width:${pct}%;background:var(--violet)"></div></div>`);
  if (selectedRune && !me.pouch.some((r) => r.id === selectedRune)) selectedRune = null;
  $('engineGrid').style.gridTemplateColumns = `repeat(${E.size}, 64px)`;
  setHTML($('engineGrid'), E.grid.map((g, i) => `<div class="socket ${g ? 'el-' + g.el + ' full' : ''} ${selectedRune ? 'target-ok' : ''}" data-socket="${i}">${g
    ? `<span class="ri">${EL[g.el].icon}</span><span class="rr">${Engine.ROMAN[g.rank]}</span><span class="rv">${fmt(E.values[i])}</span>` : ''}</div>`).join(''));
  setHTML($('pouch'), me.pouch.length ? [...me.pouch].sort((a, b) => a.el.localeCompare(b.el) || b.rank - a.rank)
    .map((r) => runeChip(r, r.id === selectedRune ? 'sel' : '')).join('') : '<span class="dim">No runes yet. Open the Rift to find some!</span>');
  // Fuse suggestions (3 identical → next rank) and gifting the selected rune
  const groups = {};
  for (const r of me.pouch) { const k = `${r.el}:${r.rank}`; groups[k] = (groups[k] || 0) + 1; }
  const merges = Object.entries(groups).filter(([k, n]) => n >= 3 && +k.split(':')[1] < Engine.MAX_RANK)
    .map(([k]) => { const [el, rank] = k.split(':'); return `<button data-merge="${k}" class="small">Fuse 3× ${EL[el].icon} ${Engine.ROMAN[rank]} → ${Engine.ROMAN[+rank + 1]}</button>`; });
  const others = S.players.filter((p) => p.ref !== me.ref);
  const gives = selectedRune && others.length ? `<span class="dim">Give it to:</span> ${others.map((p) => `<button data-give="${p.ref}" class="small ghost">${p.el ? EL[p.el].icon + ' ' : ''}${esc(p.name)}</button>`).join('')}` : '';
  setHTML($('pouchActions'), `<div class="row">${merges.join('')}</div>${gives ? `<div class="row">${gives}</div>` : ''}
    <p class="hint">${selectedRune ? 'Now click a socket to place it (it swaps with whatever is there).' : 'Click a rune to select it, then click a socket. Click a placed rune to take it back.'}</p>`);
  setHTML($('rules'), Engine.ELEMENT_KEYS.map((k) => `<div><span class="elc el-${k}">${EL[k].icon} ${EL[k].name}</span>: ${esc(EL[k].rule)}</div>`).join(''));
  renderPreview();
}

function renderPreview() {
  const E = S && S.engine;
  let txt = '&nbsp;';
  if (E && selectedRune && hoverSocket != null) {
    const r = S.you.pouch.find((q) => q.id === selectedRune);
    if (r) {
      const grid = E.grid.map((g) => g && { el: g.el, rank: g.rank });
      grid[hoverSocket] = { el: r.el, rank: r.rank };
      const after = Engine.score(grid, E.size).total, d = after - E.resonance;
      txt = `Placing ${EL[r.el].icon} ${Engine.ROMAN[r.rank]} here: Resonance <b class="${d >= 0 ? 'gold' : 'warn'}">${fmt(after)} (${d >= 0 ? '+' : ''}${d})</b>`;
    }
  }
  if ($('preview').innerHTML !== txt) $('preview').innerHTML = txt;
}

function renderRift(now) {
  const R = S.run;
  const bottom = (html) => setHTML($('riftBottom'), html);

  if (!R && S.lastRun && localStorage.dismissedRun != S.lastRun.at && Date.now() - (runEndSeen[S.lastRun.at] ??= Date.now()) < 30 * 60 * 1000) {
    // Run summary: the arena stays where it was (inert), so leftover clicks land on nothing.
    const L = S.lastRun, mine = L.mine || { found: 0, kept: 0 };
    const armed = Date.now() - runEndSeen[L.at] > 1500;
    setHTML($('rift'), `<h2>The Rift · Tier ${L.tier}</h2>
      <div class="row"><b>Floor ${L.floor}</b> · you found ${mine.found} rune${mine.found === 1 ? '' : 's'}</div>
      <div>${L.retreated ? 'The party made it out' : 'Party HP 0'}</div><div class="bar party"><div style="width:${L.retreated ? 100 : 0}%"></div></div>
      <div class="enemy"><div class="name" style="color:${L.retreated ? '#7ee787' : 'var(--red)'}">${L.retreated ? '🏳 Retreated safely' : '💀 The party fell'}</div>
        <div class="dim">${L.retreated ? 'from' : 'on'} floor ${L.floor}</div>
        <div class="bar"><div></div></div><div>&nbsp;</div></div>`);
    setArena('inert', `You brought home <b>${mine.kept}</b> rune${mine.kept === 1 ? '' : 's'}`);
    bottom(`<p class="hint">They're in your pouch. Fuse them, give them to friends, and set them in the Star Engine.</p>
      <div class="row"><button data-act="dismissRun" ${armed ? '' : 'disabled'}>${armed ? 'Back to the observatory' : 'Catching your breath…'}</button></div>`);
    return;
  }
  if (!R) {
    setArena('off');
    bottom('');
    const t = S.tiers.max;
    if (!selectedTier || selectedTier > t) selectedTier = t;
    const cost = S.tiers.costs[selectedTier - 1];
    setHTML($('rift'), `<h2>The Rift</h2>
      <p>Spend stardust to tear open the Rift. Everyone online dives in together. <b>Hit targets dead centre</b> for big damage;
      missing or letting one fade breaks your combo. With friends, <b>⚡ linked targets</b> appear: hit yours at the same moment as your partner for a triple strike.</p>
      <p>Every runner finds their own <b>runes</b>, mostly of their element. Higher tiers drop stronger runes. <b>Retreat</b> between floors to keep them all; <b>fall</b> and you keep half.</p>
      <div class="row tiers">${Array.from({ length: t }, (_, i) => `<button data-act="tier" data-tier="${i + 1}" class="small ${i + 1 === selectedTier ? 'on-tier' : 'ghost'}">Tier ${i + 1}</button>`).join('')}
        <span class="dim">Tier ${t + 1} unlocks at Resonance ${fmt(S.tiers.nextReq)}</span></div>
      <button class="big" data-act="startRun" ${S.dust < cost ? 'disabled' : ''}>Open a Tier ${selectedTier} Rift (${fmt(cost)} ✧)</button>
      <p class="hint">If the whole party goes offline, the Rift freezes until someone returns. Best floor so far: ${S.bestFloor || '—'}.</p>`);
    return;
  }
  const members = `<div class="members"><h3>Party</h3>${R.members.map((m) => `<div><span class="${m.online ? 'on' : 'off'}">●</span> ${m.el ? `<span class="elc el-${m.el}">${EL[m.el].icon}</span> ` : ''}<b>${esc(m.name)}</b> · ${fmt(m.dmg)} dmg · ${m.runes} rune${m.runes === 1 ? '' : 's'} ${m.picking ? '<span class="dim">(choosing…)</span>' : ''}<br><span class="dim">${m.boons.map(esc).join(', ') || 'no boons yet'}</span></div>`).join('')}</div>`;
  const top = `<h2>The Rift · Tier ${R.tier}</h2><div class="row"><b>Floor ${R.floor}</b> · your runes: ${runeList(R.myLoot)}</div>
    <div>Party HP ${Math.ceil(R.partyHp)}/${R.partyMaxHp}</div><div class="bar party"><div style="width:${100 * Math.max(0, R.partyHp) / R.partyMaxHp}%"></div></div>`;
  if (!R.inRun) {
    setHTML($('rift'), top + `<p>Your crew is in the Rift.</p>`);
    setArena('off');
    bottom(`<button class="big" data-act="joinRun">Jump in!</button>${members}`);
    return;
  }
  if (R.phase === 'fight') {
    const e = R.enemy;
    setHTML($('rift'), top + `<div class="enemy ${e.boss ? 'boss' : ''}"><div class="name">${e.boss ? '☠ ' : ''}${esc(e.name)}</div>
      <div class="dim">hits the party for ${e.atk} every 3s</div>
      <div class="bar hp"><div style="width:${100 * e.hp / e.maxHp}%"></div></div><div>${fmt(e.hp)} / ${fmt(e.maxHp)}</div></div>`);
    setArena('fight', '', R.arena);
    bottom(`<p class="hint">Click targets as close to the centre as you can. Bullseyes crit; combos stack up to ×3. Harmony applies when you strike together.</p>${members}`);
    return;
  }
  // Draft: the arena goes inert in place; boons sit below it and unlock after a moment.
  const armed = now >= R.boonsArmAt;
  setHTML($('rift'), top + `<div class="enemy"><div class="name" style="color:#7ee787">Floor ${R.floor} cleared!</div>
      <div class="dim">Next floor in ${secs(R.draftEndsAt - now)}s</div>
      <div class="bar"><div></div></div><div>&nbsp;</div></div>`);
  setArena('inert', R.myOffer ? (armed ? '↓ Choose a boon below ↓' : 'Steady…') : 'Waiting for the others to choose…');
  bottom((R.myOffer ? `<div class="boons">${R.myOffer.map((b) => `<button data-act="boon" data-key="${b.key}" ${armed ? '' : 'disabled'}><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></button>`).join('')}</div>` : '') +
    `<div class="row"><button data-act="retreat" class="ghost">🏳 Retreat now, keeping every rune</button></div>${members}`);
}

setInterval(render, 500); // keep countdowns ticking between server updates

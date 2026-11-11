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

let ws, S = null;
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
$('relics').onclick = (e) => { const k = e.target.closest('button')?.dataset.relic; if (k) send({ type: 'relic', key: k }); };
$('chatform').onsubmit = (e) => { e.preventDefault(); send({ type: 'chat', text: $('chat').value }); $('chat').value = ''; };
function riftClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'dismissRun') { localStorage.dismissedRun = S.lastRun.at; return render(); }
  if (b.dataset.act === 'boon') send({ type: 'boon', key: b.dataset.key });
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
  combo = 0; showCombo();
  if (mode === 'fight') spawnTimer = setTimeout(spawnLoop, 400);
}
function spawnLoop() {
  if (arenaMode !== 'fight') return;
  if (targets.length < arenaCfg.max) spawnTarget();
  spawnTimer = setTimeout(spawnLoop, arenaCfg.spawnMs * (0.7 + Math.random() * 0.6));
}
function spawnTarget() {
  const r = arenaCfg.radius, w = arena.clientWidth, h = arena.clientHeight;
  if (w < 4 * r || h < 4 * r) return;
  let x, y, tries = 0;
  do { x = r + Math.random() * (w - 2 * r); y = r + Math.random() * (h - 2 * r); }
  while (tries++ < 12 && targets.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r + 6));
  const el = document.createElement('div');
  el.className = 'target';
  el.style.cssText = `left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;--life:${arenaCfg.lifeMs}ms`;
  arena.appendChild(el);
  const t = { x, y, r, el };
  t.timer = setTimeout(() => { // too slow: the target fades and the combo breaks
    targets = targets.filter((o) => o !== t);
    el.classList.add('expired'); setTimeout(() => el.remove(), 250);
    if (combo) { combo = 0; showCombo('lost'); }
  }, arenaCfg.lifeMs);
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
  send({ type: 'hit', acc, combo });
  combo++; showCombo();
  pop(e, acc >= 0.85 ? 'BULLSEYE!' : acc >= 0.45 ? 'Hit' : 'Graze', acc >= 0.85 ? 'crit' : 'hit');
  const en = document.querySelector('#rift .enemy');
  if (en) { en.classList.remove('struck'); void en.offsetWidth; en.classList.add('struck'); }
});

// ---------------------------------------------------------------- render
const resIcons = () => Object.fromEntries(Object.entries(S.resources).map(([k, r]) => [k, r.icon]));
const costText = (c) => Object.entries(c).map(([k, n]) => `${fmt(n)} ${resIcons()[k]}`).join(' + ');
const lootLine = (l) => Object.entries(l).filter(([, n]) => n > 0).map(([k, n]) => `${fmt(n)} ${resIcons()[k]}`).join('  ') || 'nothing yet';

function render() {
  if (!S) return;
  const now = Date.now();
  $('dust').textContent = fmt(S.dust);
  $('dps').textContent = fmt(S.dps);
  $('harmony').textContent = '×' + S.harmony;
  $('clickval').textContent = `+${fmt(S.clickPower)} per click`;
  setHTML($('reshead'), Object.entries(S.resources).map(([k, r]) => `<span title="${esc(r.name)}"><b>${fmt(S.res[k])}</b> ${r.icon}</span>`).join(' &nbsp; '));

  const item = (u) => `<div class="item"><div>${esc(u.name)} <span class="dim">(${u.count})</span><small>${esc(u.desc)}</small></div>
    <button data-buy="${u.key}" ${S.dust < u.cost ? 'disabled' : ''}>${fmt(u.cost)} ✧</button></div>`;
  setHTML($('buildings'), S.buildings.map(item).join('') + item(S.cloth));

  setHTML($('relics'), S.relics.map((r) => `<div class="item"><div>${esc(r.name)} <span class="dim">(lv ${r.level}${r.max ? '/' + r.max : ''})</span><small>${esc(r.desc)}</small></div>
    <button data-relic="${r.key}" ${r.affordable ? '' : 'disabled'}>${r.maxed ? 'Max' : costText(r.cost)}</button></div>`).join(''));

  renderRift(now);

  setHTML($('players'), S.players.map((p) => `<div><span class="${p.online ? 'on' : 'off'}">●</span> ${esc(p.name)}
    <span class="dim">· ${fmt(p.contributed)} clicked</span></div>`).join(''));

  const feed = $('feed');
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 30;
  setHTML(feed, S.feed.map((f) => `<div><span class="dim">${new Date(f.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> ${esc(f.text)}</div>`).join(''));
  if (atBottom) feed.scrollTop = feed.scrollHeight;
}

function renderRift(now) {
  const R = S.run;
  const bottom = (html) => setHTML($('riftBottom'), html);
  $('relicsBox').classList.toggle('hidden', !!(R && R.inRun)); // keep the fight screen uncluttered

  if (!R && S.lastRun && localStorage.dismissedRun != S.lastRun.at && Date.now() - (runEndSeen[S.lastRun.at] ??= Date.now()) < 30 * 60 * 1000) {
    // Run summary: the arena stays where it was (inert), so leftover clicks land on nothing.
    const L = S.lastRun;
    const armed = Date.now() - runEndSeen[L.at] > 1500;
    setHTML($('rift'), `<h2>The Rift</h2>
      <div class="row"><b>Floor ${L.floor}</b> · loot: ${lootLine(L.loot)}</div>
      <div>${L.retreated ? 'The party made it out' : 'Party HP 0'}</div><div class="bar party"><div style="width:${L.retreated ? 100 : 0}%"></div></div>
      <div class="enemy"><div class="name" style="color:${L.retreated ? '#7ee787' : 'var(--red)'}">${L.retreated ? '🏳 Retreated safely' : '💀 The party fell'}</div>
        <div class="dim">${L.retreated ? 'from' : 'on'} floor ${L.floor}</div>
        <div class="bar"><div></div></div><div>&nbsp;</div></div>`);
    setArena('inert', `Brought home: <b>${lootLine(L.kept)}</b>`);
    bottom(`<p class="hint">Best floor ever: ${S.bestFloor}. Spend your loot on Relics below.</p>
      <div class="row"><button data-act="dismissRun" ${armed ? '' : 'disabled'}>${armed ? 'Back to the observatory' : 'Catching your breath…'}</button></div>`);
    return;
  }
  if (!R) {
    setArena('off');
    bottom('');
    setHTML($('rift'), `<h2>The Rift</h2>
      <p>Spend stardust to tear open the Rift. Everyone online dives in together, and friends can jump in later.
      <b>Targets pop up in the arena: hit them dead centre</b> for big damage. Missing, or letting one fade, breaks your combo.
      Between floors, each runner picks a boon. Every 5th floor is a boss.</p>
      <p>Enemies drop loot: ◆ <b>Starshards</b> everywhere, 🪨 <b>Meteor Iron</b> from floor 3 down, 🔮 <b>Void Pearls</b> from bosses.
      <b>Retreat</b> between floors to keep it all. <b>Fall</b> and you keep half.</p>
      <p class="dim">Best floor reached: ${S.bestFloor || '—'}</p>
      <button class="big" data-act="startRun" ${S.dust < S.runCost ? 'disabled' : ''}>Open the Rift (${fmt(S.runCost)} ✧)</button>
      <p class="hint">Costs about 3 minutes of production. If the whole party goes offline, the Rift freezes until someone returns.</p>`);
    return;
  }
  const members = `<div class="members"><h3>Party</h3>${R.members.map((m) => `<div><span class="${m.online ? 'on' : 'off'}">●</span> <b>${esc(m.name)}</b> · ${fmt(m.dmg)} dmg ${m.picking ? '<span class="dim">(choosing…)</span>' : ''}<br><span class="dim">${m.boons.map(esc).join(', ') || 'no boons yet'}</span></div>`).join('')}</div>`;
  const top = `<h2>The Rift</h2><div class="row"><b>Floor ${R.floor}</b> · loot: ${lootLine(R.loot)}</div>
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
    `<div class="row"><button data-act="retreat" class="ghost">🏳 Retreat now with ${lootLine(R.loot)}</button></div>${members}`);
}

setInterval(render, 500); // keep countdowns ticking between server updates

'use strict';
const $ = (id) => document.getElementById(id);
const fmt = (n) => {
  n = Math.floor(n);
  if (n < 1e6) return n.toLocaleString();
  const u = ['M', 'B', 'T', 'Qa', 'Qi']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(2) + u[i];
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const setHTML = (el, html) => { if (el._h !== html) { el.innerHTML = html; el._h = html; } };
const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));

let ws, S = null, tab = 'sky', lastRunState = false;
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
$('polish').onclick = () => send({ type: 'click' });
$('upgrades').onclick = (e) => { const k = e.target.closest('button')?.dataset.buy; if (k) send({ type: 'buy', key: k }); };
$('perks').onclick = (e) => { const k = e.target.closest('button')?.dataset.perk; if (k) send({ type: 'perk', key: k }); };
$('lenses').onclick = (e) => { const k = e.target.closest('.lens')?.dataset.lens; if (k) send({ type: 'attune', lens: k }); };
$('submit').onclick = () => send({ type: 'submit' });
$('clear').onclick = () => { if (confirm('Wipe everyone\'s marks off the map?')) send({ type: 'clearBoard' }); };
$('board').onclick = (e) => {
  const c = e.target.closest('.cell'); if (!c || c.classList.contains('charted')) return;
  const i = +c.dataset.i; const v = (S.puzzle.board[i] + 1) % 3;
  S.puzzle.board[i] = v; render(); // optimistic
  send({ type: 'cell', i, v });
};
$('chatform').onsubmit = (e) => { e.preventDefault(); send({ type: 'chat', text: $('chat').value }); $('chat').value = ''; };
let notesTimer;
$('notes').oninput = () => { clearTimeout(notesTimer); notesTimer = setTimeout(() => send({ type: 'notes', text: $('notes').value }), 400); };
document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $('tab-sky').classList.toggle('hidden', t !== 'sky');
  $('tab-workshop').classList.toggle('hidden', t !== 'workshop');
  $('tab-rift').classList.toggle('hidden', t !== 'rift');
}
$('workshop').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'machine') send({ type: 'machine', key: b.dataset.key });
  else if (b.dataset.act === 'lens') send({ type: 'lens', use: b.dataset.use });
  else if (b.dataset.act === 'routeMax') send({ type: 'route', key: b.dataset.key, value: +b.dataset.v });
  else send({ type: b.dataset.act });
};
// Sliders: send on release; don't redraw the panel while someone is dragging.
let dragging = false;
$('workshop').addEventListener('pointerdown', (e) => { if (e.target.type === 'range') dragging = true; });
window.addEventListener('pointerup', () => { dragging = false; });
$('workshop').addEventListener('input', (e) => {
  if (e.target.type !== 'range') return;
  e.target.closest('.machine').querySelector('.routeval').textContent = `${fmt(+e.target.value)}/s`;
});
$('workshop').addEventListener('change', (e) => {
  if (e.target.type !== 'range') return;
  dragging = false;
  send({ type: 'route', key: e.target.dataset.key, value: +e.target.value });
});
$('rift').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'boon') send({ type: 'boon', key: b.dataset.key });
  else send({ type: b.dataset.act });
};

// ---------------------------------------------------------------- render
function render() {
  if (!S) return;
  const now = Date.now();
  $('dust').textContent = fmt(S.dust);
  $('dps').textContent = fmt(S.netDps);
  $('routed').textContent = S.workshop.used > 0 ? ` · ${fmt(S.workshop.used)}/s to Workshop` : '';
  $('shards').textContent = fmt(S.shards);
  $('mult').textContent = '×' + (S.mult < 100 ? S.mult.toFixed(2) : fmt(S.mult));
  $('harmony').textContent = '×' + S.harmony;
  $('clickval').textContent = `+${fmt(S.clickPower)} per click`;

  setHTML($('upgrades'), S.upgrades.map((u) => `<div class="item"><div>${esc(u.name)} <span class="dim">(${u.count})</span><small>${esc(u.desc)}</small></div>
    <button data-buy="${u.key}" ${S.dust < u.cost ? 'disabled' : ''}>${fmt(u.cost)} ✧</button></div>`).join(''));
  setHTML($('perks'), S.perks.map((u) => `<div class="item"><div>${esc(u.name)} <span class="dim">(${u.count})</span><small>${esc(u.desc)}</small></div>
    <button data-perk="${u.key}" ${S.shards < u.cost ? 'disabled' : ''}>${fmt(u.cost)} ◆</button></div>`).join(''));

  renderSky(now);
  renderRift(now);
  renderWorkshop();

  setHTML($('lenses'), S.lenses.map((l) => {
    const mine = S.you.lens === l.key;
    const taken = l.holder && !mine;
    return `<div class="lens ${mine ? 'mine' : ''} ${taken ? 'taken' : ''}" data-lens="${l.key}">
      <b>${esc(l.name)}</b> ${mine ? '(yours)' : taken ? `<span class="dim">held by ${esc(l.holder)}</span>` : '<span class="dim">free</span>'}
      <small>${esc(l.desc)}</small></div>`;
  }).join('') + (S.you.lens && S.you.attuneReadyAt > now ? `<p class="hint">You can switch lenses in ${secs(S.you.attuneReadyAt - now)}s.</p>` : ''));

  setHTML($('players'), S.players.map((p) => `<div><span class="${p.online ? 'on' : 'off'}">●</span> ${esc(p.name)}
    <span class="dim">${p.lens ? '· ' + esc(p.lens) + ' ' : ''}· ${fmt(p.contributed)} clicked</span></div>`).join(''));

  const feed = $('feed');
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 30;
  setHTML(feed, S.feed.map((f) => `<div><span class="dim">${new Date(f.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> ${esc(f.text)}</div>`).join(''));
  if (atBottom) feed.scrollTop = feed.scrollHeight;

  if (document.activeElement !== $('notes') && $('notes').value !== S.notes) $('notes').value = S.notes;
}

function renderSky(now) {
  const P = S.puzzle, n = P.size, clue = S.you.clue, lens = S.you.lens;
  $('consttitle').textContent = `Constellation ${S.level + 1}: ${S.constellation} · ${P.starCount} hidden stars`;
  const charted = new Set(P.charted);
  const voids = new Set(lens === 'voids' ? clue : []);
  const echoes = new Map(lens === 'echoes' ? clue.map((e) => [e.i, e.n]) : []);
  const showRows = lens === 'rows', showCols = lens === 'cols';
  const cols = n + (showRows ? 1 : 0);
  $('board').style.gridTemplateColumns = `repeat(${cols}, 44px)`;
  let h = '';
  if (showCols) h += clue.map((c) => `<div class="label">${c}</div>`).join('');
  for (let r = 0; r < n; r++) {
    if (showRows) h += `<div class="label">${clue[r]}</div>`;
    for (let c = 0; c < n; c++) {
      const i = r * n + c, v = P.board[i];
      const cls = ['cell', v === 1 ? 'star' : v === 2 ? 'empty' : '', charted.has(i) ? 'charted' : '', voids.has(i) ? 'void' : ''];
      if (lens === 'quads') {
        const top = r < clue.half, left = c < clue.half;
        if (top === left) cls.push('q1');
      }
      h += `<div class="${cls.join(' ')}" data-i="${i}">${echoes.has(i) ? `<span class="echo">${echoes.get(i)}</span>` : ''}${v === 1 ? '★' : v === 2 ? '·' : ''}</div>`;
    }
  }
  if (showRows && showCols) h = ''; // can't hold both — defensive
  setHTML($('board'), h);
  setHTML($('quadclue'), lens === 'quads'
    ? `<p><b>Quadrant Lens:</b> top-left ${clue.counts[0]}, top-right ${clue.counts[1]}, bottom-left ${clue.counts[2]}, bottom-right ${clue.counts[3]} <span class="dim">(the top/left half is the first ${clue.half} rows/columns)</span></p>`
    : lens ? '' : '<p class="hint">You aren\'t holding a lens. Pick one on the right to see a clue.</p>');
  const mins = Math.round(P.secsPerStar / 60);
  $('chartinfo').textContent = P.charted.length >= P.starCount
    ? 'The charting engine has fixed every star. Just try the lock!'
    : `Charting engine: ${P.charted.length}/${P.starCount} stars fixed · next in ~${Math.max(1, Math.round((1 - P.chartPct) * P.secsPerStar / 60))} min (one every ${mins} min)`;
  const locked = P.lockedUntil > now;
  $('submit').disabled = locked;
  $('lockinfo').textContent = locked ? `Lock cooling down: ${secs(P.lockedUntil - now)}s` : '';
  setHTML($('solved'), S.solved.length ? S.solved.map((s) => `★ ${esc(s.name)} <span class="dim">(${esc(s.by)})</span>`).join('<br>') : 'None yet.');
}

function renderWorkshop() {
  if (dragging || document.activeElement?.type === 'range') return;
  const W = S.workshop, r = W.rates || {};
  const rate = (v) => (v >= 10 ? fmt(v) : (+v || 0).toFixed(2));
  const machines = W.machines.map((m) => {
    let body = '';
    if (m.intake != null) {
      const max = Math.max(m.intake, 0);
      body = m.count ? `<div class="row"><input type="range" min="0" max="${max}" step="1" value="${Math.min(m.route, max)}" data-key="${m.key}">
          <span class="routeval">${fmt(Math.min(m.route, max))}/s</span>
          <button class="ghost small" data-act="routeMax" data-key="${m.key}" data-v="${max}">max</button></div>
          <small>Actually flowing: ${fmt(m.flow)} stardust/s${m.flow + 0.01 < Math.min(m.route, max) ? ' <span class="warn">(squeezed by conduits or production)</span>' : ''}</small>`
        : '<small>Build one to start routing.</small>';
    } else {
      body = m.count ? `<small>${r.lenses > 0 ? `Grinding ${rate(r.lenses * 60)} lenses/min` : 'Idle'}${r.starved ? ` <span class="warn">· starved for ${r.starved === 'starlight' ? 'Starlight' : 'Aether'}</span>` : ''}</small>` : '';
    }
    return `<div class="machine item"><div style="flex:1"><b>${esc(m.name)}</b> <span class="dim">(${m.count})</span><small>${esc(m.desc)}</small>${body}</div>
      <button data-act="machine" data-key="${m.key}" ${S.dust < m.cost ? 'disabled' : ''}>${fmt(m.cost)} ✧</button></div>`;
  }).join('');
  setHTML($('workshop'), `
    <div class="item"><div><b>Conduits</b> <span class="dim">routing ${fmt(W.used)} / ${fmt(W.cap)} stardust/s</span>
      <div class="bar"><div style="width:${100 * W.used / W.cap}%;background:var(--violet)"></div></div></div>
      <button data-act="conduit" ${S.dust < W.conduitCost ? 'disabled' : ''}>Widen (${fmt(W.conduitCost)} ✧)</button></div>
    ${machines}
    <h3>Stockpiles</h3>
    <div class="stock">
      <div>✨ <b>${fmt(W.starlight)}</b> Starlight <span class="dim">+${rate(r.starlight)}/s</span></div>
      <div>💧 <b>${fmt(W.aether)}</b> Aether <span class="dim">+${rate(r.aether)}/s</span></div>
      <div>🔷 <b>${Math.floor(W.lenses)}</b> Crafted Lenses <span class="dim">(${W.installed} installed)</span></div>
    </div>
    <h3>Use them</h3>
    <div class="item"><div>Press an Aether Cell <small>Fuel for one Rift Run. You hold ${S.cells}/${S.cellCap}.</small></div>
      <button data-act="pressCell" ${W.aether < S.cellAether || S.cells >= S.cellCap ? 'disabled' : ''}>${S.cellAether} 💧</button></div>
    <div class="item"><div>Install a lens in the telescopes <small>Permanent +${Math.round(W.installBonus * 100)}% production each (now +${Math.round(W.installed * W.installBonus * 100)}%)</small></div>
      <button data-act="lens" data-use="install" ${W.lenses < 1 ? 'disabled' : ''}>1 🔷</button></div>
    <div class="item"><div>Peer through a lens <small>Instantly chart one hidden star on the current Star Lock</small></div>
      <button data-act="lens" data-use="reveal" ${W.lenses < 1 ? 'disabled' : ''}>1 🔷</button></div>`);
}

function renderRift(now) {
  const R = S.run;
  $('riftbadge').textContent = R ? '●' : '';
  if (R && R.inRun && !lastRunState) setTab('rift');
  lastRunState = !!(R && R.inRun);
  if (!R) {
    if (!S.gateDone) {
      const next = S.gate.findIndex((g) => !g.built);
      setHTML($('rift'), `<h2>The Rift Gate</h2>
        <p>Something stirs beyond the sky, but the observatory can't reach it yet. Build the Gate, one stage at a time.
        Each stage needs stardust <i>and</i> a milestone.</p>
        ${S.gate.map((g, i) => `<div class="item"><div>${g.built ? '✅' : i === next ? '🔨' : '🔒'} <b>${esc(g.name)}</b>
          <small>${g.built ? 'Built' : `${g.met ? '✔' : '✗'} ${esc(g.need)} · ${fmt(g.cost)} stardust`}</small></div>
          ${i === next ? `<button data-act="gate" ${g.met && S.dust >= g.cost ? '' : 'disabled'}>Build</button>` : ''}</div>`).join('')}
        <p class="hint">Once the Gate stands, each Rift Run burns one Aether Cell. Cells are pressed from Aether in the Workshop.</p>`);
      return;
    }
    setHTML($('rift'), `<h2>The Rift</h2>
      <p>Everyone online dives in together, and friends can jump in later. Click to fight. Between floors, each runner drafts a boon. Every 5th floor is a boss.</p>
      <p>Shards you earn go in the party's satchel. <b>Retreat</b> between floors to keep all of them. <b>Fall</b> and you keep only half.
      Spend Starshards on permanent perks.</p>
      <p><b>Aether Cells: ${'⚗'.repeat(S.cells)}${'·'.repeat(Math.max(0, S.cellCap - S.cells))} ${S.cells}/${S.cellCap}</b>
        <span class="dim">Press more from Aether in the Workshop (${S.cellAether} each).</span></p>
      <p class="dim">Best floor reached: ${S.bestFloor || '—'} · Relighting a constellation also grants a cell.</p>
      <button class="big" data-act="startRun" ${S.dust < S.runCost || S.cells < 1 ? 'disabled' : ''}>Open the Rift (1 ⚗ + ${fmt(S.runCost)} ✧)</button>
      <p class="hint">If the whole party goes offline, the Rift freezes until someone returns.</p>`);
    return;
  }
  const members = `<div class="members"><h3>Party</h3>${R.members.map((m) => `<div><span class="${m.online ? 'on' : 'off'}">●</span> <b>${esc(m.name)}</b> · ${fmt(m.dmg)} dmg ${m.picking ? '<span class="dim">(choosing…)</span>' : ''}<br><span class="dim">${m.boons.map(esc).join(', ') || 'no boons yet'}</span></div>`).join('')}</div>`;
  const top = `<div class="row"><b>Floor ${R.floor}</b> · satchel: ${R.shards} ◆</div>
    <div>Party HP ${Math.ceil(R.partyHp)}/${R.partyMaxHp}</div><div class="bar party"><div style="width:${100 * Math.max(0, R.partyHp) / R.partyMaxHp}%"></div></div>`;
  let mid;
  if (!R.inRun) {
    mid = `<p>Your crew is in the Rift.</p><button class="big" data-act="joinRun">Jump in!</button>`;
  } else if (R.phase === 'fight') {
    const e = R.enemy;
    mid = `<div class="enemy ${e.boss ? 'boss' : ''}"><div class="name">${e.boss ? '☠ ' : ''}${esc(e.name)}</div>
      <div class="dim">hits the party for ${e.atk} every 3s</div>
      <div class="bar hp"><div style="width:${100 * e.hp / e.maxHp}%"></div></div><div>${fmt(e.hp)} / ${fmt(e.maxHp)}</div></div>
      <button class="big" data-act="hit">⚔ Strike ⚔</button>
      <p class="hint">Harmony applies here too. Strike together!</p>`;
  } else {
    // The banner sits exactly where Strike was, so leftover attack clicks land on something harmless.
    // Boons sit below it and stay disabled for a moment after the kill.
    const armed = now >= R.boonsArmAt;
    mid = `<div class="enemy"><div class="name" style="color:#7ee787">Floor ${R.floor} cleared!</div>
      <div class="dim">Next floor in ${secs(R.draftEndsAt - now)}s</div>
      <div class="bar"><div></div></div><div>&nbsp;</div></div>
      <div class="big banner">${R.myOffer ? (armed ? '↓ Choose a boon below ↓' : 'Steady…') : 'Waiting for the others to choose…'}</div>
      <p class="hint">&nbsp;</p>` +
      (R.myOffer ? `<div class="boons">${R.myOffer.map((b) => `<button data-act="boon" data-key="${b.key}" ${armed ? '' : 'disabled'}><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></button>`).join('')}</div>` : '') +
      `<div class="row"><button data-act="retreat" class="ghost">🏳 Retreat now with all ${R.shards} ◆</button></div>`;
  }
  setHTML($('rift'), `<h2>The Rift</h2>${top}${mid}${members}`);
}

setInterval(render, 500); // keep countdowns ticking between server updates

'use strict';
// Pure game logic for Starwright. No I/O here — server.js handles sockets & saving.

// ---------------------------------------------------------------- tuning
const UPGRADES = {
  telescope: { name: 'Brass Telescope', base: 15, growth: 1.15, dps: 1, desc: '+1 stardust/sec' },
  chart: { name: 'Star Chart Table', base: 120, growth: 1.15, dps: 8, desc: '+8 stardust/sec' },
  dome: { name: 'Observatory Dome', base: 1300, growth: 1.15, dps: 47, desc: '+47 stardust/sec' },
  mirrors: { name: 'Mirror Array', base: 14000, growth: 1.15, dps: 260, desc: '+260 stardust/sec' },
  cloth: { name: 'Polishing Cloth', base: 50, growth: 1.6, click: 1, desc: '+1 stardust per click' },
  ink: { name: 'Charting Ink', base: 500, growth: 1.8, chart: 0.25, desc: 'Auto-charting 25% faster' },
};

// Permanent perks bought with Starshards earned in Rift Runs.
const PERKS = {
  echo: { name: 'Rift Echo', base: 3, growth: 1.6, desc: '+10% stardust production (permanent)' },
  hull: { name: 'Hardened Hull', base: 4, growth: 1.7, desc: '+15 starting party HP in runs' },
  keen: { name: 'Keen Eye', base: 5, growth: 1.8, desc: '+1 damage per click in runs' },
  cartographer: { name: 'Cartographer', base: 6, growth: 2, desc: 'Auto-charting 20% faster' },
};

const LENSES = {
  rows: { name: 'Meridian Lens', desc: 'How many stars sit in each row.' },
  cols: { name: 'Azimuth Lens', desc: 'How many stars sit in each column.' },
  voids: { name: 'Void Lens', desc: 'Some cells that are definitely empty sky.' },
  echoes: { name: 'Echo Lens', desc: 'Some empty cells hum with the number of stars touching them (all 8 neighbours).' },
  quads: { name: 'Quadrant Lens', desc: 'How many stars are in each quarter of the sky.' },
};

const BOONS = {
  sharp: { name: 'Sharpened Lens', desc: '+2 damage per click' },
  twin: { name: 'Twin Stars', desc: '+15% chance a click hits twice' },
  bond: { name: 'Constellation Bond', desc: '+25% damage for each other runner' },
  mend: { name: 'Mending Light', desc: 'Your clicks heal the party a little' },
  bulwark: { name: 'Bulwark', desc: '+20 party max HP (and heal 20)' },
  starfall: { name: 'Starfall', desc: 'Each new enemy starts with 6% less HP' },
  resonance: { name: 'Resonance', desc: 'Your clicks count as one extra player for Harmony' },
  ember: { name: 'Ember Core', desc: 'Deal passive damage every second' },
};

const CONSTELLATIONS = ['The Lantern', 'The Heron', 'The Twin Keys', 'The Drowned Crown', 'The Wanderer',
  'The Loom', 'The Sleeping Fox', 'The Bellmaker', 'The Broken Oar', 'The Long Road'];
const ENEMIES = ['Void Moth', 'Dust Wraith', 'Hollow Comet', 'Gloam Eel', 'Shard Golem', 'Null Choir', 'Eclipse Hound'];
const BOSSES = ['The Unlit King', 'Mother of Static', 'The Ninth Silence'];

const ATTUNE_COOLDOWN_MS = 5 * 60 * 1000; // solo players can rotate lenses, slowly
const WRONG_COOLDOWN_MS = 60 * 1000;
const HARMONY_WINDOW_MS = 1500;
const BASE_CHART_SECONDS = 600; // one star auto-charted per 10 min
const MAX_OFFLINE_SEC = 7 * 24 * 3600;
const DRAFT_MS = 25 * 1000;
const ENEMY_ATTACK_MS = 3000;

// ---------------------------------------------------------------- helpers
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cost = (def, n) => Math.ceil(def.base * Math.pow(def.growth, n));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function log(room, text, now = Date.now()) {
  room.feed.push({ t: now, text });
  if (room.feed.length > 80) room.feed.splice(0, room.feed.length - 80);
}

// ---------------------------------------------------------------- puzzle
function makePuzzle(level) {
  const size = Math.min(5 + level, 8);
  const n = size * size;
  const starCount = Math.round(n * 0.3);
  const order = shuffle([...Array(n).keys()]);
  const stars = order.slice(0, starCount).sort((a, b) => a - b);
  const isStar = new Set(stars);
  const rows = Array(size).fill(0), cols = Array(size).fill(0);
  for (const i of stars) { rows[Math.floor(i / size)]++; cols[i % size]++; }
  const empties = shuffle([...Array(n).keys()].filter((i) => !isStar.has(i)));
  const voidCount = Math.ceil(empties.length * 0.35);
  const voids = empties.slice(0, voidCount).sort((a, b) => a - b);
  const echoes = empties.slice(voidCount, voidCount + size - 1).map((i) => ({ i, n: neighbourStars(i, size, isStar) }));
  const half = Math.ceil(size / 2);
  const quads = [0, 0, 0, 0];
  for (const i of stars) quads[quadOf(i, size, half)]++;
  return {
    size, stars, voids, echoes, rows, cols, quads, half,
    chartOrder: shuffle([...stars]), revealed: 0, chartProgress: 0,
    board: Array(n).fill(0), lockedUntil: 0,
  };
}

function neighbourStars(i, size, set) {
  const r = Math.floor(i / size), c = i % size;
  let k = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < size && cc >= 0 && cc < size && set.has(rr * size + cc)) k++;
  }
  return k;
}
const quadOf = (i, size, half) => (Math.floor(i / size) < half ? 0 : 2) + (i % size < half ? 0 : 1);

// Returns the list of lens keys whose clues the guess violates (empty = solved).
function checkGuess(p) {
  const guess = new Set(p.board.map((v, i) => (v === 1 ? i : -1)).filter((i) => i >= 0));
  const bad = [];
  const rows = Array(p.size).fill(0), cols = Array(p.size).fill(0), quads = [0, 0, 0, 0];
  for (const i of guess) { rows[Math.floor(i / p.size)]++; cols[i % p.size]++; quads[quadOf(i, p.size, p.half)]++; }
  if (rows.some((v, k) => v !== p.rows[k])) bad.push('rows');
  if (cols.some((v, k) => v !== p.cols[k])) bad.push('cols');
  if (p.voids.some((i) => guess.has(i))) bad.push('voids');
  if (p.echoes.some((e) => guess.has(e.i) || neighbourStars(e.i, p.size, guess) !== e.n)) bad.push('echoes');
  if (quads.some((v, k) => v !== p.quads[k])) bad.push('quads');
  return bad;
}

function lensClue(p, lens) {
  switch (lens) {
    case 'rows': return p.rows;
    case 'cols': return p.cols;
    case 'voids': return p.voids;
    case 'echoes': return p.echoes;
    case 'quads': return { half: p.half, counts: p.quads };
    default: return null;
  }
}

// ---------------------------------------------------------------- room
function newRoom(id, now = Date.now()) {
  const room = {
    id, createdAt: now, lastTick: now,
    dust: 0, totalDust: 0, shards: 0,
    upgrades: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0])),
    perks: Object.fromEntries(Object.keys(PERKS).map((k) => [k, 0])),
    level: 0, mult: 1, solved: [],
    puzzle: makePuzzle(0),
    players: {}, feed: [], notes: '',
    run: null, runsLaunched: 0, bestFloor: 0,
  };
  log(room, 'The observatory creaks open. Polish the lenses, chart the sky, and relight the first constellation.', now);
  return room;
}

const dps = (room) => Object.entries(UPGRADES).reduce((s, [k, d]) => s + (d.dps || 0) * room.upgrades[k], 0)
  * room.mult * (1 + 0.1 * room.perks.echo);
const clickPower = (room) => (1 + room.upgrades.cloth) * room.mult;
const chartRate = (room) => (1 + 0.25 * room.upgrades.ink) * (1 + 0.2 * room.perks.cartographer) / BASE_CHART_SECONDS;
const runCost = (room) => Math.max(100, Math.floor(dps(room) * 60));

function harmonyAt(room, now) {
  let h = 0;
  for (const p of Object.values(room.players)) if (now - (p.lastClick || 0) <= HARMONY_WINDOW_MS) h++;
  return Math.max(1, h);
}

function ensurePlayer(room, pid, name, now = Date.now()) {
  if (!room.players[pid]) {
    room.players[pid] = { name, lens: null, attunedAt: 0, contributed: 0, clicks: 0, lastClick: 0, lastSeen: now };
    log(room, `${name} joined the observatory crew.`, now);
  }
  const p = room.players[pid];
  p.name = name; p.lastSeen = now;
  return p;
}

// Advance time. `online` is a Set of connected pids. `quiet` suppresses the per-star feed spam on catch-up.
function tick(room, now, online = new Set()) {
  const dt = Math.min(Math.max(0, (now - room.lastTick) / 1000), MAX_OFFLINE_SEC);
  room.lastTick = now;
  const gain = dps(room) * dt;
  room.dust += gain; room.totalDust += gain;

  const p = room.puzzle;
  let charted = 0;
  if (p.revealed < p.chartOrder.length) {
    p.chartProgress += chartRate(room) * dt;
    while (p.chartProgress >= 1 && p.revealed < p.chartOrder.length) {
      p.board[p.chartOrder[p.revealed]] = 1;
      p.revealed++; p.chartProgress -= 1; charted++;
    }
    if (p.revealed >= p.chartOrder.length) p.chartProgress = 0;
  }
  if (charted && dt < 5) log(room, `✦ The charting engine fixed a star in place on the map.`, now);

  if (room.run) tickRun(room, now, dt, online);
  return { dt, gain, charted };
}

// ---------------------------------------------------------------- rift runs
function spawnEnemy(run, now) {
  const f = run.floor;
  const boss = f % 5 === 0;
  const party = Object.keys(run.members).length;
  const partyFactor = 0.6 + 0.4 * party;
  let hp = Math.round(25 * Math.pow(1.32, f - 1) * partyFactor * (boss ? 4 : 1));
  const starfall = Object.values(run.members).reduce((s, m) => s + (m.boons.starfall || 0), 0);
  const maxHp = hp;
  hp = Math.max(1, Math.round(hp * Math.max(0.3, 1 - 0.06 * starfall)));
  run.enemy = {
    name: boss ? pick(BOSSES) : pick(ENEMIES), boss, hp, maxHp,
    atk: Math.round(3 * Math.pow(1.18, f - 1) * (boss ? 1.6 : 1)),
    nextAttackAt: now + ENEMY_ATTACK_MS,
  };
}

function startRun(room, pid, online, now) {
  if (room.run) return 'A run is already underway.';
  const c = runCost(room);
  if (room.dust < c) return `Launching a Rift Run costs ${c} stardust.`;
  room.dust -= c; room.runsLaunched++;
  const run = { floor: 1, phase: 'fight', members: {}, partyMaxHp: 0, partyHp: 0, shards: 0, drafts: {}, draftEndsAt: 0, startedAt: now, lastPassive: now };
  room.run = run;
  for (const id of online) joinRun(room, id, now, true);
  if (!run.members[pid]) joinRun(room, pid, now, true);
  run.partyMaxHp = 50 + 10 * Object.keys(run.members).length + 15 * room.perks.hull;
  run.partyHp = run.partyMaxHp;
  spawnEnemy(run, now);
  log(room, `🌀 ${room.players[pid].name} tore open the Rift! ${Object.keys(run.members).length} runner(s) dive in.`, now);
  return null;
}

function joinRun(room, pid, now, silent) {
  const run = room.run;
  if (!run || run.members[pid]) return run ? null : 'No run in progress.';
  run.members[pid] = { boons: {}, dmg: 0 };
  if (!silent) {
    run.partyMaxHp += 10; run.partyHp += 10;
    log(room, `${room.players[pid].name} leapt into the Rift mid-run.`, now);
  }
  return null;
}

function memberDamage(room, run, pid, harmony) {
  const m = run.members[pid];
  const others = Object.keys(run.members).length - 1;
  let d = 1 + 2 * (m.boons.sharp || 0) + room.perks.keen + Math.log10(1 + dps(room)) ;
  d *= 1 + 0.25 * others * (m.boons.bond || 0);
  d *= harmony + (m.boons.resonance || 0);
  if (Math.random() < 0.15 * (m.boons.twin || 0)) d *= 2;
  return d;
}

function hitEnemy(room, run, dmg, now) {
  if (run.phase !== 'fight') return;
  run.enemy.hp -= dmg;
  if (run.enemy.hp <= 0) {
    const shardGain = run.enemy.boss ? 5 + run.floor : 1 + Math.floor(run.floor / 3);
    run.shards += shardGain;
    log(room, `⚔ Floor ${run.floor}: ${run.enemy.name} shattered! (+${shardGain} shards in the satchel)`, now);
    run.phase = 'draft';
    run.draftEndsAt = now + DRAFT_MS;
    run.partyHp = Math.min(run.partyMaxHp, run.partyHp + Math.round(run.partyMaxHp * 0.1));
    run.drafts = {};
    for (const id of Object.keys(run.members)) run.drafts[id] = shuffle(Object.keys(BOONS)).slice(0, 3);
  }
}

function nextFloor(room, run, now) {
  // anyone who didn't pick gets a random one of their offers
  for (const [id, offer] of Object.entries(run.drafts)) applyBoon(run, id, pick(offer));
  run.drafts = {};
  run.floor++;
  run.phase = 'fight';
  room.bestFloor = Math.max(room.bestFloor, run.floor);
  spawnEnemy(run, now);
}

function applyBoon(run, pid, key) {
  const m = run.members[pid];
  if (!m) return;
  m.boons[key] = (m.boons[key] || 0) + 1;
  if (key === 'bulwark') { run.partyMaxHp += 20; run.partyHp += 20; }
}

function endRun(room, now, retreated) {
  const run = room.run;
  const kept = retreated ? run.shards : Math.floor(run.shards / 2);
  room.shards += kept;
  log(room, retreated
    ? `🏳 The party retreated from floor ${run.floor} with all ${kept} Starshards.`
    : `💀 The party fell on floor ${run.floor}. Half the satchel survived: ${kept} Starshards.`, now);
  room.run = null;
}

function tickRun(room, now, dt, online) {
  const run = room.run;
  const anyoneHere = Object.keys(run.members).some((id) => online.has(id));
  if (!anyoneHere) { // the Rift holds its breath while the whole party is away
    if (run.enemy) run.enemy.nextAttackAt = now + ENEMY_ATTACK_MS;
    if (run.phase === 'draft') run.draftEndsAt = Math.max(run.draftEndsAt, now + 5000);
    run.lastPassive = now;
    return;
  }
  if (run.phase === 'draft') {
    if (now >= run.draftEndsAt || Object.keys(run.drafts).length === 0) nextFloor(room, run, now);
    return;
  }
  // passive ember damage
  const secs = (now - run.lastPassive) / 1000;
  if (secs >= 1) {
    const embers = Object.values(run.members).reduce((s, m) => s + (m.boons.ember || 0), 0);
    if (embers) hitEnemy(room, run, embers * 2 * run.floor * secs, now);
    run.lastPassive = now;
  }
  if (run.phase !== 'fight') return;
  while (now >= run.enemy.nextAttackAt && room.run) {
    run.partyHp -= run.enemy.atk;
    run.enemy.nextAttackAt += ENEMY_ATTACK_MS;
    if (run.partyHp <= 0) { endRun(room, now, false); return; }
  }
}

// ---------------------------------------------------------------- actions
function act(room, pid, msg, online, now = Date.now()) {
  const me = room.players[pid];
  if (!me) return 'Unknown player.';
  const p = room.puzzle;
  switch (msg.type) {
    case 'click': {
      me.lastClick = now; me.clicks++;
      const h = harmonyAt(room, now);
      const g = clickPower(room) * h;
      room.dust += g; room.totalDust += g; me.contributed += g;
      return null;
    }
    case 'buy': {
      const def = UPGRADES[msg.key];
      if (!def) return 'No such upgrade.';
      const c = cost(def, room.upgrades[msg.key]);
      if (room.dust < c) return 'Not enough stardust.';
      room.dust -= c; room.upgrades[msg.key]++;
      log(room, `${me.name} built a ${def.name} (#${room.upgrades[msg.key]}).`, now);
      return null;
    }
    case 'perk': {
      const def = PERKS[msg.key];
      if (!def) return 'No such perk.';
      const c = cost(def, room.perks[msg.key]);
      if (room.shards < c) return 'Not enough Starshards.';
      room.shards -= c; room.perks[msg.key]++;
      log(room, `${me.name} forged ${def.name} ${room.perks[msg.key]}.`, now);
      return null;
    }
    case 'cell': {
      const i = msg.i | 0, v = msg.v | 0;
      if (i < 0 || i >= p.board.length || v < 0 || v > 2) return 'Bad cell.';
      if (p.chartOrder.slice(0, p.revealed).includes(i)) return 'That star is already charted.';
      p.board[i] = v;
      return null;
    }
    case 'clearBoard': {
      const fixed = new Set(p.chartOrder.slice(0, p.revealed));
      p.board = p.board.map((v, i) => (fixed.has(i) ? 1 : 0));
      log(room, `${me.name} wiped the star map clean.`, now);
      return null;
    }
    case 'attune': {
      if (!LENSES[msg.lens]) return 'No such lens.';
      if (me.lens === msg.lens) return null;
      const holder = Object.entries(room.players).find(([id, pl]) => id !== pid && pl.lens === msg.lens && online.has(id));
      if (holder) return `${holder[1].name} is already looking through that lens.`;
      if (me.lens && now - me.attunedAt < ATTUNE_COOLDOWN_MS) return 'Your eyes are still adjusting. Wait before switching lenses.';
      me.lens = msg.lens; me.attunedAt = now;
      return null;
    }
    case 'submit': {
      if (now < p.lockedUntil) return 'The lock is still cooling down.';
      const bad = checkGuess(p);
      if (bad.length) {
        p.lockedUntil = now + WRONG_COOLDOWN_MS;
        log(room, `✗ ${me.name} tried the lock. It flickers... these lenses disagree: ${bad.map((k) => LENSES[k].name).join(', ')}.`, now);
        return null;
      }
      const name = CONSTELLATIONS[room.level % CONSTELLATIONS.length] + (room.level >= CONSTELLATIONS.length ? ` ${Math.floor(room.level / CONSTELLATIONS.length) + 1}` : '');
      const bonus = Math.max(50, dps(room) * 120);
      room.solved.push({ name, at: now, by: me.name });
      room.level++; room.mult *= 1.5;
      room.dust += bonus; room.totalDust += bonus;
      room.puzzle = makePuzzle(room.level);
      log(room, `★ ${name} blazes back to life! Everything is now ×1.5 stronger, plus ${Math.round(bonus)} stardust.`, now);
      return null;
    }
    case 'notes': room.notes = String(msg.text || '').slice(0, 5000); return null;
    case 'chat': {
      const t = String(msg.text || '').trim().slice(0, 300);
      if (t) log(room, `💬 ${me.name}: ${t}`, now);
      return null;
    }
    case 'startRun': return startRun(room, pid, online, now);
    case 'joinRun': return joinRun(room, pid, now, false);
    case 'hit': {
      const run = room.run;
      if (!run || !run.members[pid]) return 'You are not in the run.';
      if (run.phase !== 'fight') return null;
      me.lastClick = now;
      const d = memberDamage(room, run, pid, harmonyAt(room, now));
      run.members[pid].dmg += d;
      if (run.members[pid].boons.mend) run.partyHp = Math.min(run.partyMaxHp, run.partyHp + 0.3 * run.members[pid].boons.mend);
      hitEnemy(room, run, d, now);
      return null;
    }
    case 'boon': {
      const run = room.run;
      if (!run || run.phase !== 'draft' || !run.drafts[pid]) return null;
      if (!run.drafts[pid].includes(msg.key)) return 'Not an offered boon.';
      applyBoon(run, pid, msg.key);
      delete run.drafts[pid];
      if (Object.keys(run.drafts).length === 0) nextFloor(room, run, now);
      return null;
    }
    case 'retreat': {
      if (!room.run || !room.run.members[pid]) return 'You are not in the run.';
      if (room.run.phase !== 'draft') return 'You can only retreat between floors.';
      endRun(room, now, true);
      return null;
    }
    default: return 'Unknown action.';
  }
}

// ---------------------------------------------------------------- views
function view(room, pid, online, now = Date.now()) {
  const p = room.puzzle;
  const me = room.players[pid];
  const run = room.run;
  return {
    dust: room.dust, totalDust: room.totalDust, shards: room.shards,
    dps: dps(room), clickPower: clickPower(room), mult: room.mult,
    harmony: harmonyAt(room, now), level: room.level,
    constellation: CONSTELLATIONS[room.level % CONSTELLATIONS.length],
    solved: room.solved,
    upgrades: Object.entries(UPGRADES).map(([key, d]) => ({ key, name: d.name, desc: d.desc, count: room.upgrades[key], cost: cost(d, room.upgrades[key]) })),
    perks: Object.entries(PERKS).map(([key, d]) => ({ key, name: d.name, desc: d.desc, count: room.perks[key], cost: cost(d, room.perks[key]) })),
    puzzle: {
      size: p.size, board: p.board, starCount: p.stars.length,
      charted: p.chartOrder.slice(0, p.revealed),
      chartPct: p.revealed >= p.stars.length ? 1 : p.chartProgress,
      secsPerStar: 1 / chartRate(room),
      lockedUntil: p.lockedUntil,
    },
    lenses: Object.entries(LENSES).map(([key, d]) => {
      const h = Object.entries(room.players).find(([id, pl]) => pl.lens === key && online.has(id));
      return { key, name: d.name, desc: d.desc, holder: h ? h[1].name : null };
    }),
    you: {
      pid, name: me.name, lens: me.lens,
      attuneReadyAt: me.lens ? me.attunedAt + ATTUNE_COOLDOWN_MS : 0,
      clue: lensClue(p, me.lens),
    },
    players: Object.entries(room.players).map(([id, pl]) => ({ name: pl.name, online: online.has(id), lens: pl.lens && online.has(id) ? LENSES[pl.lens].name : null, contributed: pl.contributed }))
      .sort((a, b) => b.online - a.online || b.contributed - a.contributed),
    feed: room.feed.slice(-40), notes: room.notes,
    runCost: runCost(room), bestFloor: room.bestFloor,
    run: run && {
      floor: run.floor, phase: run.phase, partyHp: run.partyHp, partyMaxHp: run.partyMaxHp, shards: run.shards,
      enemy: run.enemy && { name: run.enemy.name, boss: run.enemy.boss, hp: Math.max(0, run.enemy.hp), maxHp: run.enemy.maxHp, atk: run.enemy.atk },
      draftEndsAt: run.draftEndsAt,
      inRun: !!run.members[pid],
      myOffer: run.drafts[pid] ? run.drafts[pid].map((k) => ({ key: k, ...BOONS[k] })) : null,
      members: Object.entries(run.members).map(([id, m]) => ({
        name: room.players[id]?.name || '?', online: online.has(id), dmg: Math.round(m.dmg),
        picking: !!run.drafts[id],
        boons: Object.entries(m.boons).map(([k, n]) => `${BOONS[k].name}${n > 1 ? ' ×' + n : ''}`),
      })),
    },
  };
}

module.exports = { newRoom, tick, act, view, ensurePlayer, makePuzzle, checkGuess, dps, LENSES, BOONS, UPGRADES, PERKS };

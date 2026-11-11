'use strict';
// Pure game logic for Starwright. No I/O here — server.js handles sockets & saving.

// ---------------------------------------------------------------- tuning
const UPGRADES = {
  telescope: { name: 'Brass Telescope', base: 15, growth: 1.18, dps: 1, desc: '+1 stardust/sec' },
  chart: { name: 'Star Chart Table', base: 120, growth: 1.18, dps: 8, desc: '+8 stardust/sec' },
  dome: { name: 'Observatory Dome', base: 1300, growth: 1.18, dps: 47, desc: '+47 stardust/sec' },
  mirrors: { name: 'Mirror Array', base: 14000, growth: 1.18, dps: 260, desc: '+260 stardust/sec' },
  harvester: { name: 'Comet Harvester', base: 220000, growth: 1.18, dps: 1500, desc: '+1,500 stardust/sec' },
  cloth: { name: 'Polishing Cloth', base: 50, growth: 1.6, click: 1, desc: '+1 stardust per click' },
  ink: { name: 'Charting Ink', base: 500, growth: 1.8, chart: 0.25, desc: 'Auto-charting 25% faster' },
};

// ---- Crew levels: almost everything the crew does earns XP; each level unlocks something new.
const UNLOCKS = [
  { level: 1, keys: ['telescope', 'cloth'], what: 'Brass Telescopes, Polishing Cloth and the Star Lock' },
  { level: 2, keys: ['chart'], what: 'Star Chart Tables' },
  { level: 3, keys: ['workshop', 'prism', 'condenser', 'ink'], what: 'The Workshop (Prisms & Condensers), Charting Ink' },
  { level: 4, keys: ['dome', 'gate'], what: 'Observatory Domes and Rift Gate construction' },
  { level: 5, keys: ['grinder'], what: 'Lens Grinders (Crafted Lenses)' },
  { level: 6, keys: ['mirrors'], what: 'Mirror Arrays' },
  { level: 7, keys: ['forge', 'gear'], what: 'The Starforge and Rift Gear (from Meteor Iron)' },
  { level: 8, keys: ['harvester'], what: 'Comet Harvesters' },
];
const UNLOCK_LEVEL = Object.fromEntries(UNLOCKS.flatMap((u) => u.keys.map((k) => [k, u.level])));
const xpToNext = (lvl) => Math.round(60 * Math.pow(1.6, lvl - 1));
// Hybrid levelling: XP makes the crew *ready*, then someone spends stardust to actually level up.
const levelCost = (lvl) => Math.round(LEVEL_COST_BASE * Math.pow(LEVEL_COST_GROWTH, lvl - 1));
const LEVEL_COST_BASE = 2500, LEVEL_COST_GROWTH = 7;
const XP = { building: 1, machine: 4, conduit: 8, constellation: 60, gate: 40, floor: 5, boss: 30, lens: 3, cell: 5, perk: 10, starsteel: 6, gear: 15, milestone: 25 };

// The Rift Gate is built once, in stages. Each stage needs stardust AND something stardust can't buy directly.
const GATE_STAGES = [
  { name: 'Foundation', cost: 2500, need: 'Own 10 Brass Telescopes', met: (r) => r.upgrades.telescope >= 10 },
  { name: 'Focusing Ring', cost: 25000, need: 'Relight at least 1 constellation', met: (r) => r.level >= 1 },
  { name: 'Keystone', cost: 150000, need: 'Own 5 Observatory Domes', met: (r) => r.upgrades.dome >= 5 },
];
const CELL_CAP = 3;
const CELL_AETHER = 300;

// ---- Workshop: the crew routes part of its stardust/sec into machines that make new resources.
// Prisms and Condensers eat routed stardust; Grinders eat their stockpiles.
const MACHINES = {
  prism: { name: 'Prism', base: 300, growth: 1.3, intake: 25, desc: 'Turns up to 25 stardust/s into Starlight (10 : 1)' },
  condenser: { name: 'Condenser', base: 400, growth: 1.3, intake: 25, desc: 'Turns up to 25 stardust/s into Aether (25 : 1)' },
  grinder: { name: 'Lens Grinder', base: 2500, growth: 1.35, desc: 'Every 10s: 20 Starlight + 10 Aether → 1 Crafted Lens',
    craft: { inputs: { starlight: 20, aether: 10 }, out: 'lenses', secs: 10 } },
  forge: { name: 'Starforge', base: 60000, growth: 1.5, desc: 'Every 30s: 5 Meteor Iron + 20 Aether → 1 Starsteel',
    craft: { inputs: { iron: 5, aether: 20 }, out: 'starsteel', secs: 30 } },
};
const RESOURCE_NAMES = { starlight: 'Starlight', aether: 'Aether', iron: 'Meteor Iron', lenses: 'Crafted Lenses', starsteel: 'Starsteel' };

// Rift Gear: permanent, bought with Starsteel from the Starforge.
const GEAR = {
  blade: { name: 'Starsteel Blade', base: 2, growth: 1.6, desc: '+20% damage in the Rift' },
  ward: { name: 'Starsteel Ward', base: 2, growth: 1.6, desc: '+15 party max HP' },
  sight: { name: 'Starsteel Sight', base: 3, growth: 1.8, max: 5, desc: 'Rift targets 8% bigger' },
};
const STARLIGHT_PER_DUST = 1 / 10;
const AETHER_PER_DUST = 1 / 25;
const LENS_INSTALL_BONUS = 0.03;
const conduitCap = (room) => 50 * Math.pow(2, room.workshop.conduits);
const conduitCost = (room) => Math.ceil(2000 * Math.pow(3, room.workshop.conduits));

// Permanent perks bought with Starshards earned in Rift Runs.
const PERKS = {
  echo: { name: 'Rift Echo', base: 3, growth: 1.6, desc: '+10% stardust production (permanent)' },
  hull: { name: 'Hardened Hull', base: 4, growth: 1.7, desc: '+15 starting party HP in runs' },
  keen: { name: 'Keen Eye', base: 5, growth: 1.8, desc: '+1 base damage per hit in runs' },
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
  sharp: { name: 'Sharpened Lens', desc: '+2 base damage per hit' },
  twin: { name: 'Twin Stars', desc: '+15% chance a hit lands twice' },
  steady: { name: 'Steady Hand', desc: 'Your targets are 12% bigger and last longer' },
  focus: { name: 'Focus', desc: 'Bullseyes deal +100% more' },
  flow: { name: 'Flow State', desc: 'Your combo builds twice as fast' },
  bond: { name: 'Constellation Bond', desc: '+25% damage for each other runner' },
  mend: { name: 'Mending Light', desc: 'Your hits heal the party a little' },
  bulwark: { name: 'Bulwark', desc: '+20 party max HP (and heal 20)' },
  starfall: { name: 'Starfall', desc: 'Each new enemy starts with 6% less HP' },
  resonance: { name: 'Resonance', desc: 'Your hits count as one extra player for Harmony' },
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
const RUN_COOLDOWN_MS = 3000;
const BOON_ARM_MS = 1000;
const HIT_MIN_GAP_MS = 90; // server-side cap on hits per player
const CONSTELLATION_BONUS = 0.25; // each relit constellation adds +25% (additive) // ignore boon picks right after a kill (stray Strike clicks)

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
    gate: 0, cells: 0,
    workshop: newWorkshop(),
    xp: 0, crewLevel: 1, milestone: 0,
    gear: Object.fromEntries(Object.keys(GEAR).map((k) => [k, 0])),
  };
  log(room, 'The observatory creaks open. Polish the lenses, chart the sky, and relight the first constellation.', now);
  return room;
}

function newWorkshop() {
  return { machines: Object.fromEntries(Object.keys(MACHINES).map((k) => [k, 0])), route: { prism: 0, condenser: 0 },
    conduits: 0, starlight: 0, aether: 0, iron: 0, lenses: 0, starsteel: 0, installed: 0, progress: {}, rates: null };
}

// Gross production (before anything is routed to the Workshop).
const dps = (room) => Object.entries(UPGRADES).reduce((s, [k, d]) => s + (d.dps || 0) * room.upgrades[k], 0)
  * room.mult * (1 + 0.1 * room.perks.echo) * (1 + LENS_INSTALL_BONUS * room.workshop.installed);

// How much stardust/sec each feeder actually gets: limited by its slider, its machine count,
// the conduit capacity (shared proportionally), and what the observatory actually produces.
function flows(room) {
  const w = room.workshop;
  const want = {};
  for (const k of ['prism', 'condenser']) want[k] = Math.max(0, Math.min(w.route[k] || 0, w.machines[k] * MACHINES[k].intake));
  const total = want.prism + want.condenser;
  const limit = Math.min(conduitCap(room), dps(room));
  const scale = total > limit ? limit / total : 1;
  const prism = want.prism * scale, condenser = want.condenser * scale;
  return { prism, condenser, used: prism + condenser, cap: conduitCap(room) };
}
const netDps = (room) => dps(room) - flows(room).used;
const clickPower = (room) => (1 + room.upgrades.cloth) * room.mult;
const chartRate = (room) => (1 + 0.25 * room.upgrades.ink) * (1 + 0.2 * room.perks.cartographer) / BASE_CHART_SECONDS;
const runCost = (room) => Math.max(500, Math.floor(dps(room) * 300)); // ~5 min of production, plus 1 Aether Cell
const gateDone = (room) => room.gate >= GATE_STAGES.length;
const unlocked = (room, key) => room.crewLevel >= (UNLOCK_LEVEL[key] || 1);
const lockMsg = (key) => `Unlocks at crew level ${UNLOCK_LEVEL[key]}.`;

function gainXp(room, amount, now) {
  const wasReady = room.xp >= xpToNext(room.crewLevel);
  room.xp += amount; // keeps accumulating past the threshold, so nothing is wasted while you save up
  if (!wasReady && room.xp >= xpToNext(room.crewLevel)) {
    const u = UNLOCKS.find((x) => x.level === room.crewLevel + 1);
    log(room, `✨ The crew is ready for level ${room.crewLevel + 1}! Fund it for ${levelCost(room.crewLevel).toLocaleString()} stardust${u ? ` to unlock ${u.what}` : ''}.`, now);
  }
}

function levelUp(room, me, now) {
  const need = xpToNext(room.crewLevel), c = levelCost(room.crewLevel);
  if (room.xp < need) return `The crew needs ${Math.ceil(need - room.xp)} more XP first.`;
  if (room.dust < c) return `Levelling up costs ${c.toLocaleString()} stardust.`;
  room.dust -= c; room.xp -= need; room.crewLevel++;
  const u = UNLOCKS.find((x) => x.level === room.crewLevel);
  log(room, `🎉 ${me.name} funded the expansion: the crew reached level ${room.crewLevel}!${u ? ` Unlocked: ${u.what}.` : ''}`, now);
  return null;
}

// Free automatic levelling, only used when converting worlds from before crew levels existed.
function grantLevels(room) {
  while (room.xp >= xpToNext(room.crewLevel)) { room.xp -= xpToNext(room.crewLevel); room.crewLevel++; }
}

// Fill in fields added after a world was first saved.
function normalize(room) {
  for (const k of Object.keys(UPGRADES)) if (room.upgrades[k] == null) room.upgrades[k] = 0;
  for (const k of Object.keys(PERKS)) if (room.perks[k] == null) room.perks[k] = 0;
  if (room.gate == null) room.gate = 0;
  if (room.cells == null) room.cells = 0;
  delete room.cellProgress;
  if (!room.workshop) room.workshop = newWorkshop();
  if (room.upgrades.condenser) { // condensers from the timer-based version become Workshop condensers
    room.workshop.machines.condenser += room.upgrades.condenser;
  }
  for (const k of Object.keys(room.upgrades)) if (!UPGRADES[k]) delete room.upgrades[k];
  const w = room.workshop;
  for (const k of Object.keys(MACHINES)) if (w.machines[k] == null) w.machines[k] = 0;
  for (const k of ['iron', 'starsteel']) if (w[k] == null) w[k] = 0;
  if (!w.progress) { w.progress = { grinder: w.grindProgress || 0 }; delete w.grindProgress; }
  if (!room.gear) room.gear = Object.fromEntries(Object.keys(GEAR).map((k) => [k, 0]));
  if (room.xp == null) {
    // Worlds from before crew levels: credit what they've already done, and switch constellations to the additive bonus.
    const buildings = Object.values(room.upgrades).reduce((a, b) => a + b, 0);
    const machines = Object.values(w.machines).reduce((a, b) => a + b, 0);
    room.xp = 0; room.crewLevel = 1; room.milestone = 0;
    room.xp = buildings * XP.building + machines * XP.machine + room.level * XP.constellation + room.gate * XP.gate
      + (room.bestFloor || 0) * 8 + Math.floor(w.installed) * XP.lens;
    grantLevels(room);
    room.mult = 1 + CONSTELLATION_BONUS * room.level;
    // Never lock a crew out of something it already owns.
    const owned = [...Object.keys(room.upgrades).filter((k) => room.upgrades[k] > 0),
      ...Object.keys(w.machines).filter((k) => w.machines[k] > 0), ...(room.gate > 0 ? ['gate'] : [])];
    const floor = Math.max(1, ...owned.map((k) => UNLOCK_LEVEL[k] || 1));
    if (room.crewLevel < floor) { room.crewLevel = floor; room.xp = 0; }
  }
  return room;
}

function harmonyAt(room, now) {
  let h = 0;
  for (const p of Object.values(room.players)) if (p.lastClick && now - p.lastClick <= HARMONY_WINDOW_MS) h++;
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
  const f = flows(room);
  const gain = (dps(room) - f.used) * dt;
  room.dust += gain; room.totalDust += gain;
  runWorkshop(room, f, dt, now);
  checkMilestones(room, now);

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

function checkMilestones(room, now) {
  // XP each time total stardust earned passes 1K, 10K, 100K, ...
  while (room.totalDust >= Math.pow(10, room.milestone + 3)) {
    room.milestone++;
    log(room, `📜 Milestone: the crew has gathered ${(Math.pow(10, room.milestone + 2)).toLocaleString()} stardust in total.`, now);
    gainXp(room, XP.milestone, now);
  }
}

function runWorkshop(room, f, dt, now) {
  const w = room.workshop;
  w.starlight += f.prism * STARLIGHT_PER_DUST * dt;
  w.aether += f.condenser * AETHER_PER_DUST * dt;
  // Crafters: limited by machine time and by whichever input runs short.
  const crafted = {}, starved = {};
  for (const [key, def] of Object.entries(MACHINES)) {
    if (!def.craft || !w.machines[key] || dt <= 0) continue;
    const c = def.craft;
    w.progress[key] = (w.progress[key] || 0) + w.machines[key] * dt / c.secs;
    let possible = w.progress[key], short = null;
    for (const [res, amt] of Object.entries(c.inputs)) {
      const can = w[res] / amt;
      if (can < possible) { possible = can; short = res; }
    }
    if (short) starved[key] = short;
    for (const [res, amt] of Object.entries(c.inputs)) w[res] -= possible * amt;
    const before = Math.floor(w[c.out]);
    w[c.out] += possible;
    crafted[key] = possible;
    const made = Math.floor(w[c.out]) - before;
    if (made > 0) gainXp(room, made * (c.out === 'lenses' ? XP.lens : XP.starsteel), now);
    w.progress[key] = Math.min(w.progress[key] - possible, w.machines[key]); // don't bank unlimited idle machine time
  }
  if (dt > 0 && dt < 5) {
    w.rates = { starlight: f.prism * STARLIGHT_PER_DUST, aether: f.condenser * AETHER_PER_DUST, starved, perMin: {} };
    for (const [k, v] of Object.entries(crafted)) w.rates.perMin[k] = v / dt * 60;
  }
}

function revealStar(room) {
  const p = room.puzzle;
  if (p.revealed >= p.chartOrder.length) return false;
  p.board[p.chartOrder[p.revealed]] = 1;
  p.revealed++;
  if (p.revealed >= p.chartOrder.length) p.chartProgress = 0;
  return true;
}

// ---------------------------------------------------------------- rift runs
function spawnEnemy(run, now) {
  const f = run.floor;
  const boss = f % 5 === 0;
  const party = Object.keys(run.members).length;
  const partyFactor = 0.6 + 0.4 * party;
  let hp = Math.round(120 * Math.pow(1.28, f - 1) * partyFactor * (boss ? 3 : 1));
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
  if (room.lastRun && now - room.lastRun.at < RUN_COOLDOWN_MS) return null; // stray Strike clicks right after a run ends
  if (!gateDone(room)) return 'The Rift Gate is not finished yet.';
  if (room.cells < 1) return 'The Gate needs an Aether Cell to open.';
  const c = runCost(room);
  if (room.dust < c) return `Launching a Rift Run costs ${c} stardust.`;
  room.dust -= c; room.cells--; room.runsLaunched++;
  const run = { floor: 1, phase: 'fight', members: {}, partyMaxHp: 0, partyHp: 0, shards: 0, drafts: {}, draftEndsAt: 0, startedAt: now, lastPassive: now };
  room.run = run;
  for (const id of online) joinRun(room, id, now, true);
  if (!run.members[pid]) joinRun(room, pid, now, true);
  run.partyMaxHp = 50 + 10 * Object.keys(run.members).length + 15 * room.perks.hull + 15 * room.gear.ward;
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

// Damage for one target hit. acc: 0 (edge) … 1 (dead centre). combo: consecutive hits without a miss.
function memberDamage(room, run, pid, harmony, acc, combo) {
  const m = run.members[pid];
  const others = Object.keys(run.members).length - 1;
  let d = 4 + 2 * (m.boons.sharp || 0) + room.perks.keen + 0.5 * Math.log10(1 + dps(room));
  d *= acc >= 0.85 ? 2.5 + (m.boons.focus || 0) : 0.6 + 1.2 * acc; // bullseye vs. off-centre
  d *= 1 + 0.05 * Math.min(combo * (1 + (m.boons.flow || 0)), 40); // up to ×3 at a long combo
  d *= 1 + 0.2 * room.gear.blade;
  d *= 1 + 0.25 * others * (m.boons.bond || 0);
  d *= harmony + (m.boons.resonance || 0);
  if (Math.random() < 0.15 * (m.boons.twin || 0)) d *= 2;
  return d;
}

// Per-player target settings for the arena (the client spawns the targets).
function arenaFor(room, run, pid) {
  const m = run.members[pid] || { boons: {} };
  const f = run.floor, boss = run.enemy && run.enemy.boss;
  const size = (1 + 0.08 * Math.min(room.gear.sight, GEAR.sight.max)) * (1 + 0.12 * (m.boons.steady || 0));
  return {
    radius: Math.round(Math.max(18, 40 - f * 0.9) * (boss ? 0.8 : 1) * size),
    lifeMs: Math.round(Math.max(650, 1500 - f * 35) * (1 + 0.15 * (m.boons.steady || 0))),
    spawnMs: Math.round(Math.max(300, 480 - f * 8)),
    max: boss ? 4 : 3,
  };
}

function hitEnemy(room, run, dmg, now) {
  if (run.phase !== 'fight') return;
  run.enemy.hp -= dmg;
  if (run.enemy.hp <= 0) {
    const shardGain = run.enemy.boss ? 5 + run.floor : 1 + Math.floor(run.floor / 3);
    const iron = (run.enemy.boss ? 8 : 1) + Math.floor(run.floor / 2);
    run.shards += shardGain;
    room.workshop.iron += iron;
    gainXp(room, XP.floor + run.floor + (run.enemy.boss ? XP.boss : 0), now);
    log(room, `⚔ Floor ${run.floor}: ${run.enemy.name} shattered! (+${shardGain} shards in the satchel, +${iron} Meteor Iron)`, now);
    run.phase = 'draft';
    run.draftStartedAt = now;
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
  room.bestFloor = Math.max(room.bestFloor, run.floor);
  room.lastRun = { floor: run.floor, satchel: run.shards, kept, retreated, at: now };
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
    if (embers) hitEnemy(room, run, embers * 4 * run.floor * secs, now);
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
      if (!unlocked(room, msg.key)) return lockMsg(msg.key);
      const c = cost(def, room.upgrades[msg.key]);
      if (room.dust < c) return 'Not enough stardust.';
      room.dust -= c; room.upgrades[msg.key]++;
      log(room, `${me.name} built a ${def.name} (#${room.upgrades[msg.key]}).`, now);
      gainXp(room, XP.building, now);
      return null;
    }
    case 'machine': {
      const def = MACHINES[msg.key];
      if (!def) return 'No such machine.';
      if (!unlocked(room, msg.key)) return lockMsg(msg.key);
      const c = cost(def, room.workshop.machines[msg.key]);
      if (room.dust < c) return 'Not enough stardust.';
      room.dust -= c; room.workshop.machines[msg.key]++;
      log(room, `🔧 ${me.name} built a ${def.name} (#${room.workshop.machines[msg.key]}).`, now);
      gainXp(room, XP.machine, now);
      return null;
    }
    case 'route': {
      if (!['prism', 'condenser'].includes(msg.key)) return 'Can\'t route to that.';
      if (!unlocked(room, 'workshop')) return lockMsg('workshop');
      const v = Math.max(0, Math.min(Number(msg.value) || 0, 1e15));
      room.workshop.route[msg.key] = v;
      return null;
    }
    case 'conduit': {
      const c = conduitCost(room);
      if (room.dust < c) return `Wider conduits cost ${c} stardust.`;
      if (!unlocked(room, 'workshop')) return lockMsg('workshop');
      room.dust -= c; room.workshop.conduits++;
      log(room, `🔧 ${me.name} widened the conduits to ${conduitCap(room)} stardust/s.`, now);
      gainXp(room, XP.conduit, now);
      return null;
    }
    case 'pressCell': {
      if (room.cells >= CELL_CAP) return 'Cell storage is full.';
      if (room.workshop.aether < CELL_AETHER) return `Pressing a cell takes ${CELL_AETHER} Aether.`;
      room.workshop.aether -= CELL_AETHER; room.cells++;
      log(room, `⚗ ${me.name} pressed an Aether Cell (${room.cells}/${CELL_CAP}).`, now);
      gainXp(room, XP.cell, now);
      return null;
    }
    case 'lens': {
      const w = room.workshop;
      if (w.lenses < 1) return 'No Crafted Lenses yet.';
      if (msg.use === 'install') {
        w.lenses -= 1; w.installed++;
        log(room, `🔭 ${me.name} installed a Crafted Lens: production +${Math.round(w.installed * LENS_INSTALL_BONUS * 100)}% total.`, now);
        return null;
      }
      if (msg.use === 'reveal') {
        if (!revealStar(room)) return 'Every star is already charted.';
        w.lenses -= 1;
        log(room, `🔭 ${me.name} used a Crafted Lens to chart a star.`, now);
        return null;
      }
      return 'Unknown lens use.';
    }
    case 'levelUp': return levelUp(room, me, now);
    case 'gate': {
      const st = GATE_STAGES[room.gate];
      if (!st) return 'The Gate is already complete.';
      if (!unlocked(room, 'gate')) return lockMsg('gate');
      if (!st.met(room)) return `Not yet: ${st.need}.`;
      if (room.dust < st.cost) return `The ${st.name} costs ${st.cost} stardust.`;
      room.dust -= st.cost; room.gate++;
      gainXp(room, XP.gate, now);
      if (gateDone(room)) {
        room.cells = Math.max(room.cells, 1);
        log(room, `🌀 ${me.name} set the Keystone. The Rift Gate is complete and holds its first Aether Cell!`, now);
      } else log(room, `🏗 ${me.name} built the Gate's ${st.name}.`, now);
      return null;
    }
    case 'perk': {
      const def = PERKS[msg.key];
      if (!def) return 'No such perk.';
      const c = cost(def, room.perks[msg.key]);
      if (room.shards < c) return 'Not enough Starshards.';
      room.shards -= c; room.perks[msg.key]++;
      log(room, `${me.name} forged ${def.name} ${room.perks[msg.key]}.`, now);
      gainXp(room, XP.perk, now);
      return null;
    }
    case 'gear': {
      const def = GEAR[msg.key];
      if (!def) return 'No such gear.';
      if (!unlocked(room, 'gear')) return lockMsg('gear');
      if (def.max && room.gear[msg.key] >= def.max) return 'That can\'t be improved any further.';
      const c = cost(def, room.gear[msg.key]);
      if (room.workshop.starsteel < c) return 'Not enough Starsteel.';
      room.workshop.starsteel -= c; room.gear[msg.key]++;
      log(room, `🗡 ${me.name} forged a ${def.name} (level ${room.gear[msg.key]}).`, now);
      gainXp(room, XP.gear, now);
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
      const bonus = Math.max(50, dps(room) * 60);
      room.solved.push({ name, at: now, by: me.name });
      room.level++; room.mult = 1 + CONSTELLATION_BONUS * room.level;
      if (room.cells < CELL_CAP) room.cells++; // relighting a constellation also condenses a cell
      room.dust += bonus; room.totalDust += bonus;
      room.puzzle = makePuzzle(room.level);
      log(room, `★ ${name} blazes back to life! Production +${Math.round(CONSTELLATION_BONUS * 100)}% (now ×${room.mult.toFixed(2)}), plus ${Math.round(bonus).toLocaleString()} stardust.`, now);
      gainXp(room, XP.constellation, now);
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
      if (now - (me.lastHit || 0) < HIT_MIN_GAP_MS) return null;
      me.lastHit = now; me.lastClick = now;
      const acc = Math.max(0, Math.min(1, Number(msg.acc) || 0));
      const combo = Math.max(0, Math.min(100, msg.combo | 0));
      const d = memberDamage(room, run, pid, harmonyAt(room, now), acc, combo);
      run.members[pid].dmg += d;
      if (run.members[pid].boons.mend) run.partyHp = Math.min(run.partyMaxHp, run.partyHp + 0.3 * run.members[pid].boons.mend);
      hitEnemy(room, run, d, now);
      return null;
    }
    case 'boon': {
      const run = room.run;
      if (!run || run.phase !== 'draft' || !run.drafts[pid]) return null;
      if (now - (run.draftStartedAt || 0) < BOON_ARM_MS) return null; // stray click from the fight
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
    upgrades: Object.entries(UPGRADES).map(([key, d]) => ({ key, name: d.name, desc: d.desc, count: room.upgrades[key], cost: cost(d, room.upgrades[key]),
      locked: unlocked(room, key) ? null : UNLOCK_LEVEL[key] })),
    crew: {
      level: room.crewLevel, xp: room.xp, next: xpToNext(room.crewLevel), cost: levelCost(room.crewLevel),
      ready: room.xp >= xpToNext(room.crewLevel),
      unlocks: UNLOCKS.map((u) => ({ level: u.level, what: u.what, done: room.crewLevel >= u.level })),
    },
    locks: { workshop: unlocked(room, 'workshop') ? null : UNLOCK_LEVEL.workshop, gate: unlocked(room, 'gate') ? null : UNLOCK_LEVEL.gate, gear: unlocked(room, 'gear') ? null : UNLOCK_LEVEL.gear },
    gear: Object.entries(GEAR).map(([key, d]) => ({ key, name: d.name, desc: d.desc, level: room.gear[key], max: d.max || null, cost: cost(d, room.gear[key]) })),
    gate: GATE_STAGES.map((st, i) => ({ name: st.name, cost: st.cost, need: st.need, met: st.met(room), built: i < room.gate })),
    gateDone: gateDone(room),
    cells: room.cells, cellCap: CELL_CAP, cellAether: CELL_AETHER, netDps: netDps(room),
    workshop: (() => {
      const w = room.workshop, f = flows(room);
      return {
        machines: Object.entries(MACHINES).map(([key, d]) => ({ key, name: d.name, desc: d.desc, count: w.machines[key], cost: cost(d, w.machines[key]),
          intake: d.intake ? d.intake * w.machines[key] : null, route: w.route[key] ?? null, flow: f[key] ?? null,
          crafts: d.craft ? RESOURCE_NAMES[d.craft.out] : null, locked: unlocked(room, key) ? null : UNLOCK_LEVEL[key] })),
        used: f.used, cap: f.cap, conduitCost: conduitCost(room),
        starlight: w.starlight, aether: w.aether, iron: w.iron, starsteel: w.starsteel, lenses: w.lenses, installed: w.installed,
        installBonus: LENS_INSTALL_BONUS, rates: w.rates,
      };
    })(),
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
    runCost: runCost(room), bestFloor: room.bestFloor, lastRun: room.lastRun || null,
    run: run && {
      floor: run.floor, phase: run.phase, partyHp: run.partyHp, partyMaxHp: run.partyMaxHp, shards: run.shards,
      enemy: run.enemy && { name: run.enemy.name, boss: run.enemy.boss, hp: Math.max(0, run.enemy.hp), maxHp: run.enemy.maxHp, atk: run.enemy.atk },
      draftEndsAt: run.draftEndsAt, boonsArmAt: (run.draftStartedAt || 0) + BOON_ARM_MS,
      inRun: !!run.members[pid],
      arena: run.members[pid] ? arenaFor(room, run, pid) : null,
      myOffer: run.drafts[pid] ? run.drafts[pid].map((k) => ({ key: k, ...BOONS[k] })) : null,
      members: Object.entries(run.members).map(([id, m]) => ({
        name: room.players[id]?.name || '?', online: online.has(id), dmg: Math.round(m.dmg),
        picking: !!run.drafts[id],
        boons: Object.entries(m.boons).map(([k, n]) => `${BOONS[k].name}${n > 1 ? ' ×' + n : ''}`),
      })),
    },
  };
}

module.exports = { normalize, GATE_STAGES, newRoom, tick, act, view, ensurePlayer, makePuzzle, checkGuess, dps, LENSES, BOONS, UPGRADES, PERKS };

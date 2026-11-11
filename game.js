'use strict';
// Pure game logic for Starwright. No I/O here — server.js handles sockets & saving.
//
// Two mechanics:
//   1. Idle: buildings make stardust (also while everyone is away); clicking adds more, multiplied by Harmony.
//   2. The Rift: spend stardust to open it, click targets to fight down through floors, and bring back
//      resources that buy permanent Relics (which boost both the idle side and the Rift).

// ---------------------------------------------------------------- tuning
const BUILDINGS = {
  telescope: { name: 'Brass Telescope', base: 15, growth: 1.18, dps: 1 },
  chart: { name: 'Star Chart Table', base: 120, growth: 1.18, dps: 8 },
  dome: { name: 'Observatory Dome', base: 1300, growth: 1.18, dps: 47 },
  mirrors: { name: 'Mirror Array', base: 14000, growth: 1.18, dps: 260 },
  harvester: { name: 'Comet Harvester', base: 200000, growth: 1.18, dps: 1500 },
  forge: { name: 'Nebula Forge', base: 3000000, growth: 1.18, dps: 9000 },
};
const CLOTH = { name: 'Polishing Cloth', base: 50, growth: 1.6 }; // +1 stardust per click

const RESOURCES = {
  shards: { name: 'Starshards', icon: '◆' },
  iron: { name: 'Meteor Iron', icon: '🪨' },
  pearls: { name: 'Void Pearls', icon: '🔮' },
};

// Relics: permanent upgrades bought with what the Rift drops.
const RELICS = {
  echo: { name: 'Echo Engine', desc: '+10% stardust production', cost: { shards: 4 }, growth: 1.5 },
  lure: { name: 'Comet Lure', desc: '+50% stardust per click', cost: { shards: 3, iron: 2 }, growth: 1.5 },
  blade: { name: 'Starsteel Blade', desc: '+20% damage in the Rift', cost: { iron: 4 }, growth: 1.5 },
  ward: { name: 'Starsteel Ward', desc: '+15 party HP in the Rift', cost: { shards: 2, iron: 3 }, growth: 1.5 },
  sight: { name: 'Pearl Sight', desc: 'Rift targets 8% bigger', cost: { iron: 3, pearls: 1 }, growth: 1.7, max: 5 },
  satchel: { name: 'Deep Satchel', desc: '+20% loot from every enemy', cost: { shards: 5, pearls: 2 }, growth: 1.7 },
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
  scavenger: { name: 'Scavenger', desc: '+30% loot for the rest of this run' },
};

const ENEMIES = ['Void Moth', 'Dust Wraith', 'Hollow Comet', 'Gloam Eel', 'Shard Golem', 'Null Choir', 'Eclipse Hound'];
const BOSSES = ['The Unlit King', 'Mother of Static', 'The Ninth Silence'];

const HARMONY_WINDOW_MS = 1500;
const MAX_OFFLINE_SEC = 7 * 24 * 3600;
const RUN_COST_SECONDS = 180; // opening the Rift costs ~3 minutes of production
const DRAFT_MS = 25 * 1000;
const ENEMY_ATTACK_MS = 3000;
const RUN_COOLDOWN_MS = 3000; // ignore "open the Rift" right after a run ends (stray clicks)
const BOON_ARM_MS = 1000; // ignore boon picks right after a kill (stray clicks)
const HIT_MIN_GAP_MS = 90; // server-side cap on hits per player
const VERSION = 2;

// ---------------------------------------------------------------- helpers
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cost = (def, n) => Math.ceil(def.base * Math.pow(def.growth, n));
const relicCost = (def, n) => Object.fromEntries(Object.entries(def.cost).map(([r, a]) => [r, Math.ceil(a * Math.pow(def.growth, n))]));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const emptyLoot = () => ({ shards: 0, iron: 0, pearls: 0 });
const lootText = (l) => Object.entries(l).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${RESOURCES[k].name}`).join(', ') || 'nothing';

function log(room, text, now = Date.now()) {
  room.feed.push({ t: now, text });
  if (room.feed.length > 80) room.feed.splice(0, room.feed.length - 80);
}

// ---------------------------------------------------------------- room
function newRoom(id, now = Date.now()) {
  const room = {
    version: VERSION, id, createdAt: now, lastTick: now,
    dust: 0, totalDust: 0,
    buildings: Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, 0])),
    cloth: 0,
    res: emptyLoot(),
    relics: Object.fromEntries(Object.keys(RELICS).map((k) => [k, 0])),
    players: {}, feed: [],
    run: null, runsLaunched: 0, bestFloor: 0, lastRun: null,
  };
  log(room, 'The observatory creaks open. Polish the lenses, build telescopes, and when you\'re ready, open the Rift.', now);
  return room;
}

// Convert worlds saved by older versions of the game: keep stardust, buildings and Rift resources.
function normalize(room) {
  if (room.version === VERSION) return room;
  const fresh = newRoom(room.id, room.lastTick || Date.now());
  const old = room.upgrades || {};
  for (const k of Object.keys(BUILDINGS)) fresh.buildings[k] = old[k] || 0;
  fresh.cloth = old.cloth || 0;
  Object.assign(fresh, {
    createdAt: room.createdAt || fresh.createdAt, lastTick: room.lastTick || fresh.lastTick,
    dust: room.dust || 0, totalDust: room.totalDust || 0,
    players: room.players || {}, feed: room.feed || [], runsLaunched: room.runsLaunched || 0, bestFloor: room.bestFloor || 0,
  });
  fresh.res.shards = Math.floor(room.shards || 0);
  fresh.res.iron = Math.floor(room.workshop?.iron || 0);
  // Old perks and Rift Gear that have a Relic equivalent carry over.
  fresh.relics.echo = room.perks?.echo || 0;
  fresh.relics.blade = room.gear?.blade || 0;
  fresh.relics.ward = (room.gear?.ward || 0) + (room.perks?.hull || 0);
  fresh.relics.sight = Math.min(RELICS.sight.max, room.gear?.sight || 0);
  for (const p of Object.values(fresh.players)) { delete p.lens; delete p.attunedAt; }
  log(fresh, '🔧 The observatory was simplified: it\'s just stardust and the Rift now. Your stardust, buildings, shards and iron came along.', fresh.lastTick);
  return fresh;
}

const relicLvl = (room, k) => room.relics[k] || 0;
const dps = (room) => Object.entries(BUILDINGS).reduce((s, [k, d]) => s + d.dps * room.buildings[k], 0) * (1 + 0.1 * relicLvl(room, 'echo'));
const clickPower = (room) => (1 + room.cloth) * (1 + 0.5 * relicLvl(room, 'lure'));
const runCost = (room) => Math.max(200, Math.floor(dps(room) * RUN_COST_SECONDS));

function harmonyAt(room, now) {
  let h = 0;
  for (const p of Object.values(room.players)) if (p.lastClick && now - p.lastClick <= HARMONY_WINDOW_MS) h++;
  return Math.max(1, h);
}

function ensurePlayer(room, pid, name, now = Date.now()) {
  if (!room.players[pid]) {
    room.players[pid] = { name, contributed: 0, clicks: 0, lastClick: 0, lastSeen: now };
    log(room, `${name} joined the observatory crew.`, now);
  }
  const p = room.players[pid];
  p.name = name; p.lastSeen = now;
  return p;
}

// Advance time. `online` is a Set of connected pids.
function tick(room, now, online = new Set()) {
  const dt = Math.min(Math.max(0, (now - room.lastTick) / 1000), MAX_OFFLINE_SEC);
  room.lastTick = now;
  const gain = dps(room) * dt;
  room.dust += gain; room.totalDust += gain;
  if (room.run) tickRun(room, now, dt, online);
  return { dt, gain };
}

// ---------------------------------------------------------------- the rift
function spawnEnemy(run, now) {
  const f = run.floor;
  const boss = f % 5 === 0;
  const party = Object.keys(run.members).length;
  const partyFactor = 0.6 + 0.4 * party;
  const maxHp = Math.round(120 * Math.pow(1.28, f - 1) * partyFactor * (boss ? 3 : 1));
  const starfall = Object.values(run.members).reduce((s, m) => s + (m.boons.starfall || 0), 0);
  run.enemy = {
    name: boss ? pick(BOSSES) : pick(ENEMIES), boss, maxHp,
    hp: Math.max(1, Math.round(maxHp * Math.max(0.3, 1 - 0.06 * starfall))),
    atk: Math.round(3 * Math.pow(1.18, f - 1) * (boss ? 1.6 : 1)),
    nextAttackAt: now + ENEMY_ATTACK_MS,
  };
}

// What an enemy on this floor drops. Iron starts at floor 3; pearls only come from bosses.
function lootFor(room, run, floor, boss) {
  const scav = Object.values(run.members).reduce((s, m) => s + (m.boons.scavenger || 0), 0);
  const mult = (1 + 0.2 * relicLvl(room, 'satchel')) * (1 + 0.3 * scav);
  const base = {
    shards: 1 + Math.floor(floor / 3) + (boss ? 5 + floor : 0),
    iron: floor >= 3 ? 1 + Math.floor((floor - 3) / 3) + (boss ? 4 : 0) : 0,
    pearls: boss ? 1 + Math.floor(floor / 10) : 0,
  };
  return Object.fromEntries(Object.entries(base).map(([k, n]) => [k, Math.round(n * mult)]));
}

function startRun(room, pid, online, now) {
  if (room.run) return 'A run is already underway.';
  if (room.lastRun && now - room.lastRun.at < RUN_COOLDOWN_MS) return null;
  const c = runCost(room);
  if (room.dust < c) return `Opening the Rift costs ${Math.ceil(c).toLocaleString()} stardust.`;
  room.dust -= c; room.runsLaunched++;
  const run = { floor: 1, phase: 'fight', members: {}, partyMaxHp: 0, partyHp: 0, loot: emptyLoot(), drafts: {}, draftEndsAt: 0, startedAt: now, lastPassive: now };
  room.run = run;
  for (const id of online) joinRun(room, id, now, true);
  if (!run.members[pid]) joinRun(room, pid, now, true);
  run.partyMaxHp = 50 + 10 * Object.keys(run.members).length + 15 * relicLvl(room, 'ward');
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
  let d = 4 + 2 * (m.boons.sharp || 0) + 0.5 * Math.log10(1 + dps(room));
  d *= acc >= 0.85 ? 2.5 + (m.boons.focus || 0) : 0.6 + 1.2 * acc; // bullseye vs. off-centre
  d *= 1 + 0.05 * Math.min(combo * (1 + (m.boons.flow || 0)), 40); // up to ×3 at a long combo
  d *= 1 + 0.2 * relicLvl(room, 'blade');
  d *= 1 + 0.25 * others * (m.boons.bond || 0);
  d *= harmony + (m.boons.resonance || 0);
  if (Math.random() < 0.15 * (m.boons.twin || 0)) d *= 2;
  return d;
}

// Per-player target settings for the arena (the client spawns the targets).
function arenaFor(room, run, pid) {
  const m = run.members[pid] || { boons: {} };
  const f = run.floor, boss = run.enemy && run.enemy.boss;
  const size = (1 + 0.08 * Math.min(relicLvl(room, 'sight'), RELICS.sight.max)) * (1 + 0.12 * (m.boons.steady || 0));
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
  if (run.enemy.hp > 0) return;
  const drop = lootFor(room, run, run.floor, run.enemy.boss);
  for (const k of Object.keys(drop)) run.loot[k] += drop[k];
  log(room, `⚔ Floor ${run.floor}: ${run.enemy.name} shattered! Dropped ${lootText(drop)}.`, now);
  run.phase = 'draft';
  run.draftStartedAt = now;
  run.draftEndsAt = now + DRAFT_MS;
  run.partyHp = Math.min(run.partyMaxHp, run.partyHp + Math.round(run.partyMaxHp * 0.1));
  run.drafts = {};
  for (const id of Object.keys(run.members)) run.drafts[id] = shuffle(Object.keys(BOONS)).slice(0, 3);
}

function nextFloor(room, run, now) {
  for (const [id, offer] of Object.entries(run.drafts)) applyBoon(run, id, pick(offer)); // undecided runners get a random pick
  run.drafts = {};
  run.floor++;
  run.phase = 'fight';
  spawnEnemy(run, now);
}

function applyBoon(run, pid, key) {
  const m = run.members[pid];
  if (!m) return;
  m.boons[key] = (m.boons[key] || 0) + 1;
  if (key === 'bulwark') { run.partyMaxHp += 20; run.partyHp += 20; }
}

// Retreat (between floors) keeps all the loot; falling keeps half.
function endRun(room, now, retreated) {
  const run = room.run;
  const kept = Object.fromEntries(Object.entries(run.loot).map(([k, n]) => [k, retreated ? n : Math.floor(n / 2)]));
  for (const k of Object.keys(kept)) room.res[k] += kept[k];
  log(room, retreated
    ? `🏳 The party retreated from floor ${run.floor} with ${lootText(kept)}.`
    : `💀 The party fell on floor ${run.floor}. Half the loot survived: ${lootText(kept)}.`, now);
  room.bestFloor = Math.max(room.bestFloor, run.floor);
  room.lastRun = { floor: run.floor, loot: run.loot, kept, retreated, at: now };
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
  switch (msg.type) {
    case 'click': {
      me.lastClick = now; me.clicks++;
      const g = clickPower(room) * harmonyAt(room, now);
      room.dust += g; room.totalDust += g; me.contributed += g;
      return null;
    }
    case 'buy': {
      if (msg.key === 'cloth') {
        const c = cost(CLOTH, room.cloth);
        if (room.dust < c) return 'Not enough stardust.';
        room.dust -= c; room.cloth++;
        return null;
      }
      const def = BUILDINGS[msg.key];
      if (!def) return 'No such building.';
      const c = cost(def, room.buildings[msg.key]);
      if (room.dust < c) return 'Not enough stardust.';
      room.dust -= c; room.buildings[msg.key]++;
      log(room, `${me.name} built a ${def.name} (#${room.buildings[msg.key]}).`, now);
      return null;
    }
    case 'relic': {
      const def = RELICS[msg.key];
      if (!def) return 'No such relic.';
      const lvl = relicLvl(room, msg.key);
      if (def.max && lvl >= def.max) return 'That relic is already at its peak.';
      const c = relicCost(def, lvl);
      if (Object.entries(c).some(([r, n]) => room.res[r] < n)) return `Not enough loot. It costs ${lootText(c)}.`;
      for (const [r, n] of Object.entries(c)) room.res[r] -= n;
      room.relics[msg.key] = lvl + 1;
      log(room, `✦ ${me.name} empowered the ${def.name} (level ${lvl + 1}).`, now);
      return null;
    }
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
      if (now - (run.draftStartedAt || 0) < BOON_ARM_MS) return null;
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
  const run = room.run;
  // Buildings appear one at a time: everything you own, plus the next one.
  const keys = Object.keys(BUILDINGS);
  const lastOwned = keys.reduce((m, k, i) => (room.buildings[k] > 0 ? i : m), -1);
  return {
    dust: room.dust, dps: dps(room), clickPower: clickPower(room), harmony: harmonyAt(room, now),
    res: room.res, resources: RESOURCES,
    buildings: keys.slice(0, lastOwned + 2).map((key) => {
      const d = BUILDINGS[key];
      return { key, name: d.name, desc: `+${d.dps.toLocaleString()} stardust/sec`, count: room.buildings[key], cost: cost(d, room.buildings[key]) };
    }),
    cloth: { key: 'cloth', name: CLOTH.name, desc: '+1 stardust per click', count: room.cloth, cost: cost(CLOTH, room.cloth) },
    relics: Object.entries(RELICS).map(([key, d]) => {
      const lvl = relicLvl(room, key), maxed = !!(d.max && lvl >= d.max);
      return { key, name: d.name, desc: d.desc, level: lvl, max: d.max || null, maxed, cost: relicCost(d, lvl),
        affordable: !maxed && Object.entries(relicCost(d, lvl)).every(([r, n]) => room.res[r] >= n) };
    }),
    you: { pid, name: room.players[pid].name },
    players: Object.entries(room.players).map(([id, pl]) => ({ name: pl.name, online: online.has(id), contributed: pl.contributed }))
      .sort((a, b) => b.online - a.online || b.contributed - a.contributed),
    feed: room.feed.slice(-40),
    runCost: runCost(room), bestFloor: room.bestFloor, lastRun: room.lastRun,
    run: run && {
      floor: run.floor, phase: run.phase, partyHp: run.partyHp, partyMaxHp: run.partyMaxHp, loot: run.loot,
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

module.exports = { normalize, newRoom, tick, act, view, ensurePlayer, dps, lootFor, BUILDINGS, RELICS, BOONS, RESOURCES };

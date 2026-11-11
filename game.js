'use strict';
// Pure game logic for Starwright. No I/O here — server.js handles sockets & saving.
//
// The loop:
//   Idle buildings make stardust → spend it to open the Rift → click targets (and linked targets with friends)
//   to fight down through floors → bring back runes → merge them and arrange them in the shared Star Engine →
//   the Engine's Resonance boosts production and Rift damage, and unlocks harder Rift Tiers with better runes.
const crypto = require('crypto');
const Engine = require('./public/engine');
const { ELEMENTS, ELEMENT_KEYS, ROMAN, MAX_RANK } = Engine;

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
  scavenger: { name: 'Scavenger', desc: '+35% chance of a bonus rune from each kill' },
};

const ENEMIES = ['Void Moth', 'Dust Wraith', 'Hollow Comet', 'Gloam Eel', 'Shard Golem', 'Null Choir', 'Eclipse Hound'];
const BOSSES = ['The Unlit King', 'Mother of Static', 'The Ninth Silence'];

const HARMONY_WINDOW_MS = 1500;
const MAX_OFFLINE_SEC = 7 * 24 * 3600;
const DRAFT_MS = 25 * 1000;
const ENEMY_ATTACK_MS = 3000;
const RUN_COOLDOWN_MS = 3000; // ignore "open the Rift" right after a run ends (stray clicks)
const BOON_ARM_MS = 1000; // ignore boon picks right after a kill (stray clicks)
const HIT_MIN_GAP_MS = 90; // server-side cap on hits per player
const LINK_TTL_MS = 2600; // how long a linked target stays up
const LINK_WINDOW_MS = 600; // both players must hit within this window
const LINK_MULT = 3;
const OWN_ELEMENT_CHANCE = 0.7; // share of your drops that match your element
const VERSION = 3;

// Resonance needed to unlock each Rift Tier (tier 1 is open from the start).
const tierReq = (t) => (t <= 1 ? 0 : Math.round(80 * Math.pow(1.65, t - 2)));
const engineSize = (maxTier) => (maxTier >= 6 ? 5 : maxTier >= 3 ? 4 : 3);

// ---------------------------------------------------------------- helpers
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cost = (def, n) => Math.ceil(def.base * Math.pow(def.growth, n));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const runeName = (r) => `${ELEMENTS[r.el].name} ${ROMAN[r.rank]}`;
const refOf = (pid) => crypto.createHash('sha1').update(String(pid)).digest('hex').slice(0, 8); // public handle; pids stay private
const cellName = (i, size) => `${'ABCDE'[Math.floor(i / size)]}${(i % size) + 1}`;

function log(room, text, now = Date.now()) {
  room.feed.push({ t: now, text });
  if (room.feed.length > 80) room.feed.splice(0, room.feed.length - 80);
}

function newRune(room, el, rank) {
  room.nextRuneId = (room.nextRuneId || 1) + 1;
  return { id: room.nextRuneId, el, rank };
}

// ---------------------------------------------------------------- room
function newRoom(id, now = Date.now()) {
  const room = {
    version: VERSION, id, createdAt: now, lastTick: now,
    dust: 0, totalDust: 0,
    buildings: Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, 0])),
    cloth: 0,
    engine: { size: 3, grid: Array(9).fill(null) },
    maxTier: 1, nextRuneId: 1,
    players: {}, feed: [],
    run: null, runsLaunched: 0, bestFloor: 0, lastRun: null,
  };
  log(room, 'The observatory creaks open. Choose your element, build telescopes, and open the Rift to find runes for the Star Engine.', now);
  return room;
}

// Convert worlds saved by older versions: keep stardust, buildings, players and the log.
function normalize(room) {
  if (room.version === VERSION) return room;
  const fresh = newRoom(room.id, room.lastTick || Date.now());
  const oldBuildings = room.buildings || room.upgrades || {};
  for (const k of Object.keys(BUILDINGS)) fresh.buildings[k] = oldBuildings[k] || 0;
  fresh.cloth = room.cloth ?? room.upgrades?.cloth ?? 0;
  Object.assign(fresh, {
    createdAt: room.createdAt || fresh.createdAt, lastTick: room.lastTick || fresh.lastTick,
    dust: room.dust || 0, totalDust: room.totalDust || 0,
    feed: room.feed || [], runsLaunched: room.runsLaunched || 0, bestFloor: room.bestFloor || 0,
  });
  for (const [pid, p] of Object.entries(room.players || {})) {
    fresh.players[pid] = { name: p.name, el: null, pouch: [], contributed: p.contributed || 0, clicks: p.clicks || 0, lastClick: 0, lastSeen: p.lastSeen || 0 };
  }
  log(fresh, '🔧 The Rift now holds runes, and the Star Engine has awakened. Everyone: choose your element! Your stardust and buildings came along.', fresh.lastTick);
  return fresh;
}

const resonance = (room) => Engine.score(room.engine.grid, room.engine.size).total;
const baseDps = (room) => Object.entries(BUILDINGS).reduce((s, [k, d]) => s + d.dps * room.buildings[k], 0);
const dps = (room) => baseDps(room) * (1 + resonance(room) / 100);
const clickPower = (room) => 1 + room.cloth;
const runCost = (room, tier) => Math.max(150 * tier * tier, Math.floor(dps(room) * 120 * (1 + 0.5 * (tier - 1))));

function harmonyAt(room, now) {
  let h = 0;
  for (const p of Object.values(room.players)) if (p.lastClick && now - p.lastClick <= HARMONY_WINDOW_MS) h++;
  return Math.max(1, h);
}

function ensurePlayer(room, pid, name, now = Date.now()) {
  if (!room.players[pid]) {
    room.players[pid] = { name, el: null, pouch: [], contributed: 0, clicks: 0, lastClick: 0, lastSeen: now };
    log(room, `${name} joined the observatory crew.`, now);
  }
  const p = room.players[pid];
  p.name = name; p.lastSeen = now;
  return p;
}

// Tiers unlock permanently the first time the Engine's Resonance reaches them.
function checkTiers(room, now) {
  const res = resonance(room);
  while (res >= tierReq(room.maxTier + 1)) {
    room.maxTier++;
    log(room, `🌀 Resonance ${res}! Rift Tier ${room.maxTier} is open: tougher foes, better runes.`, now);
    resizeEngine(room, now);
  }
}

function resizeEngine(room, now) {
  const size = engineSize(room.maxTier), e = room.engine;
  if (size === e.size) return;
  const grid = Array(size * size).fill(null);
  e.grid.forEach((g, i) => { if (g) grid[Math.floor(i / e.size) * size + (i % e.size)] = g; });
  room.engine = { size, grid };
  log(room, `✨ The Star Engine grew to ${size}×${size} sockets.`, now);
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
function spawnEnemy(room, run, now) {
  const f = run.floor, t = run.tier;
  const boss = f % 5 === 0;
  const party = Object.keys(run.members).length;
  const partyFactor = 0.6 + 0.4 * party;
  const maxHp = Math.round(120 * Math.pow(1.28, f - 1) * Math.pow(1.45, t - 1) * partyFactor * (boss ? 3 : 1));
  const starfall = Object.values(run.members).reduce((s, m) => s + (m.boons.starfall || 0), 0);
  run.enemy = {
    name: boss ? pick(BOSSES) : pick(ENEMIES), boss, maxHp,
    hp: Math.max(1, Math.round(maxHp * Math.max(0.3, 1 - 0.06 * starfall))),
    atk: Math.round(3 * Math.pow(1.18, f - 1) * Math.pow(1.3, t - 1) * (boss ? 1.6 : 1)),
    nextAttackAt: now + ENEMY_ATTACK_MS,
  };
  run.links = [];
  run.nextLinkAt = now + 2500 + Math.random() * 2000;
}

// One rune for a player: usually their own element; higher tiers drop higher ranks; bosses sometimes one better.
function dropRune(room, pid, tier, boss) {
  const p = room.players[pid];
  const el = p?.el && Math.random() < OWN_ELEMENT_CHANCE ? p.el : pick(ELEMENT_KEYS);
  const rank = Math.min(MAX_RANK, 1 + Math.floor((tier - 1) / 2) + (boss && Math.random() < 0.5 ? 1 : 0));
  return newRune(room, el, rank);
}

function startRun(room, pid, online, now, tier) {
  if (room.run) return 'A run is already underway.';
  if (room.lastRun && now - room.lastRun.at < RUN_COOLDOWN_MS) return null;
  tier = Math.max(1, Math.min(room.maxTier, tier | 0 || room.maxTier));
  const c = runCost(room, tier);
  if (room.dust < c) return `Opening a Tier ${tier} Rift costs ${Math.ceil(c).toLocaleString()} stardust.`;
  room.dust -= c; room.runsLaunched++;
  const run = { tier, floor: 1, phase: 'fight', members: {}, partyMaxHp: 0, partyHp: 0, drafts: {}, draftEndsAt: 0,
    startedAt: now, lastPassive: now, links: [], linkResults: [], nextLinkAt: 0 };
  room.run = run;
  for (const id of online) joinRun(room, id, now, true);
  if (!run.members[pid]) joinRun(room, pid, now, true);
  run.partyMaxHp = 50 + 10 * Object.keys(run.members).length + Math.round(resonance(room) / 10);
  run.partyHp = run.partyMaxHp;
  spawnEnemy(room, run, now);
  log(room, `🌀 ${room.players[pid].name} tore open a Tier ${tier} Rift! ${Object.keys(run.members).length} runner(s) dive in.`, now);
  return null;
}

function joinRun(room, pid, now, silent) {
  const run = room.run;
  if (!run || run.members[pid]) return run ? null : 'No run in progress.';
  run.members[pid] = { boons: {}, dmg: 0, loot: [] };
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
  let d = 4 + 2 * (m.boons.sharp || 0) + 0.5 * Math.log10(1 + baseDps(room));
  d *= 1 + resonance(room) / 200; // the Engine charges your strikes
  d *= acc >= 0.85 ? 2.5 + (m.boons.focus || 0) : 0.6 + 1.2 * acc; // bullseye vs. off-centre
  d *= 1 + 0.05 * Math.min(combo * (1 + (m.boons.flow || 0)), 40); // up to ×3 at a long combo
  d *= 1 + 0.25 * others * (m.boons.bond || 0);
  d *= harmony + (m.boons.resonance || 0);
  if (Math.random() < 0.15 * (m.boons.twin || 0)) d *= 2;
  return d;
}

// Per-player target settings for the arena (the client spawns the targets).
function arenaFor(room, run, pid) {
  const m = run.members[pid] || { boons: {} };
  const f = run.floor, t = run.tier, boss = run.enemy && run.enemy.boss;
  const size = 1 + 0.12 * (m.boons.steady || 0);
  return {
    radius: Math.round(Math.max(16, (40 - f * 0.9) * Math.pow(0.95, t - 1)) * (boss ? 0.8 : 1) * size),
    lifeMs: Math.round(Math.max(600, (1500 - f * 35) * Math.pow(0.96, t - 1)) * (1 + 0.15 * (m.boons.steady || 0))),
    spawnMs: Math.round(Math.max(280, 480 - f * 8)),
    max: boss ? 4 : 3,
  };
}

function hitEnemy(room, run, dmg, now) {
  if (run.phase !== 'fight') return;
  run.enemy.hp -= dmg;
  if (run.enemy.hp > 0) return;
  // Every runner gets their own drop.
  const boss = run.enemy.boss;
  const found = [];
  for (const [pid, m] of Object.entries(run.members)) {
    const n = (boss ? 2 : 1) + (Math.random() < 0.35 * (m.boons.scavenger || 0) ? 1 : 0);
    for (let i = 0; i < n; i++) { const r = dropRune(room, pid, run.tier, boss); m.loot.push(r); found.push(r); }
  }
  log(room, `⚔ Floor ${run.floor}: ${run.enemy.name} shattered! Runes found: ${found.map(runeName).join(', ')}.`, now);
  run.phase = 'draft';
  run.links = [];
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
  spawnEnemy(room, run, now);
}

function applyBoon(run, pid, key) {
  const m = run.members[pid];
  if (!m) return;
  m.boons[key] = (m.boons[key] || 0) + 1;
  if (key === 'bulwark') { run.partyMaxHp += 20; run.partyHp += 20; }
}

// Retreat (between floors) keeps every rune; falling keeps half of each runner's finds.
function endRun(room, now, retreated) {
  const run = room.run;
  const perPlayer = {};
  let total = 0;
  for (const [pid, m] of Object.entries(run.members)) {
    const kept = retreated ? m.loot : m.loot.slice(0, Math.floor(m.loot.length / 2));
    if (room.players[pid]) room.players[pid].pouch.push(...kept);
    perPlayer[pid] = { found: m.loot.length, kept: kept.length };
    total += kept.length;
  }
  log(room, retreated
    ? `🏳 The party retreated from Tier ${run.tier}, floor ${run.floor}, carrying ${total} rune(s).`
    : `💀 The party fell on Tier ${run.tier}, floor ${run.floor}. Half the runes survived: ${total}.`, now);
  room.bestFloor = Math.max(room.bestFloor, run.floor);
  room.lastRun = { tier: run.tier, floor: run.floor, retreated, at: now, perPlayer };
  room.run = null;
}

// Linked targets: a pair of targets on two runners' screens. Both must hit within LINK_WINDOW_MS.
function spawnLink(run, online, now) {
  const here = Object.keys(run.members).filter((id) => online.has(id));
  if (here.length < 2) return;
  const [a, b] = shuffle(here).slice(0, 2);
  run.nextLinkId = (run.nextLinkId || 0) + 1;
  run.links.push({ id: run.nextLinkId, a, b, hue: Math.floor(Math.random() * 360), expiresAt: now + LINK_TTL_MS, hits: {} });
}

function resolveLink(room, run, link, ok, now) {
  run.links = run.links.filter((l) => l !== link);
  const names = [link.a, link.b].map((id) => room.players[id]?.name || '?');
  run.linkResults.push({ id: link.id, ok, a: link.a, b: link.b, at: now });
  if (run.linkResults.length > 10) run.linkResults.shift();
  if (!ok) return;
  const harmony = harmonyAt(room, now);
  const dmg = LINK_MULT * [link.a, link.b].reduce((s, id) => s + memberDamage(room, run, id, harmony, link.hits[id].acc, link.hits[id].combo), 0);
  run.members[link.a].dmg += dmg / 2; run.members[link.b].dmg += dmg / 2;
  log(room, `⚡ Linked strike! ${names[0]} & ${names[1]} hit together for ${Math.round(dmg).toLocaleString()}.`, now);
  hitEnemy(room, run, dmg, now);
}

function tickRun(room, now, dt, online) {
  const run = room.run;
  const anyoneHere = Object.keys(run.members).some((id) => online.has(id));
  if (!anyoneHere) { // the Rift holds its breath while the whole party is away
    if (run.enemy) run.enemy.nextAttackAt = now + ENEMY_ATTACK_MS;
    if (run.phase === 'draft') run.draftEndsAt = Math.max(run.draftEndsAt, now + 5000);
    run.lastPassive = now;
    run.links = [];
    return;
  }
  if (run.phase === 'draft') {
    if (now >= run.draftEndsAt || Object.keys(run.drafts).length === 0) nextFloor(room, run, now);
    return;
  }
  for (const l of [...run.links]) if (now > l.expiresAt + LINK_WINDOW_MS) resolveLink(room, run, l, false, now);
  if (now >= run.nextLinkAt) {
    spawnLink(run, online, now);
    run.nextLinkAt = now + (run.enemy.boss ? 2500 : 4500) + Math.random() * 2000;
  }
  const secs = (now - run.lastPassive) / 1000;
  if (secs >= 1) {
    const embers = Object.values(run.members).reduce((s, m) => s + (m.boons.ember || 0), 0);
    if (embers) hitEnemy(room, run, embers * 4 * run.floor * Math.pow(1.45, run.tier - 1) * secs, now);
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
  const takeRune = (id) => { const i = me.pouch.findIndex((r) => r.id === id); return i < 0 ? null : me.pouch.splice(i, 1)[0]; };
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
    case 'element': {
      if (!ELEMENTS[msg.el]) return 'No such element.';
      if (me.el === msg.el) return null;
      const first = !me.el;
      me.el = msg.el;
      if (first) for (let i = 0; i < 3; i++) me.pouch.push(newRune(room, msg.el, 1)); // a starter set
      log(room, `${ELEMENTS[msg.el].icon} ${me.name} is now attuned to ${ELEMENTS[msg.el].name}${first ? ' (and found 3 starter runes)' : ''}.`, now);
      return null;
    }
    case 'place': {
      const e = room.engine, i = msg.socket | 0;
      if (i < 0 || i >= e.grid.length) return 'No such socket.';
      const before = resonance(room);
      const rune = takeRune(msg.runeId);
      if (!rune) return 'That rune isn\'t in your pouch.';
      if (e.grid[i]) me.pouch.push(e.grid[i]); // swap: the old rune comes back to you
      e.grid[i] = rune;
      log(room, `${me.name} set ${runeName(rune)} in ${cellName(i, e.size)}: Resonance ${before} → ${resonance(room)}.`, now);
      checkTiers(room, now);
      return null;
    }
    case 'unsocket': {
      const e = room.engine, i = msg.socket | 0;
      if (!e.grid[i]) return null;
      const before = resonance(room);
      const rune = e.grid[i];
      e.grid[i] = null; me.pouch.push(rune);
      log(room, `${me.name} took ${runeName(rune)} out of ${cellName(i, e.size)}: Resonance ${before} → ${resonance(room)}.`, now);
      return null;
    }
    case 'merge': {
      const rank = msg.rank | 0;
      if (!ELEMENTS[msg.el] || rank < 1 || rank >= MAX_RANK) return 'Can\'t merge that.';
      const same = me.pouch.filter((r) => r.el === msg.el && r.rank === rank);
      if (same.length < 3) return 'Merging takes 3 identical runes.';
      for (const r of same.slice(0, 3)) me.pouch.splice(me.pouch.indexOf(r), 1);
      const made = newRune(room, msg.el, rank + 1);
      me.pouch.push(made);
      log(room, `🔮 ${me.name} fused three runes into ${runeName(made)}.`, now);
      return null;
    }
    case 'give': {
      const to = Object.entries(room.players).find(([id]) => refOf(id) === msg.to);
      if (!to || to[0] === pid) return 'Pick someone else in the crew.';
      const rune = takeRune(msg.runeId);
      if (!rune) return 'That rune isn\'t in your pouch.';
      to[1].pouch.push(rune);
      log(room, `🎁 ${me.name} gave ${to[1].name} a ${runeName(rune)} rune.`, now);
      return null;
    }
    case 'chat': {
      const t = String(msg.text || '').trim().slice(0, 300);
      if (t) log(room, `💬 ${me.name}: ${t}`, now);
      return null;
    }
    case 'startRun': return startRun(room, pid, online, now, msg.tier);
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
    case 'linkHit': {
      const run = room.run;
      if (!run || run.phase !== 'fight') return null;
      const link = run.links.find((l) => l.id === msg.id && (l.a === pid || l.b === pid));
      if (!link || link.hits[pid]) return null;
      me.lastClick = now;
      link.hits[pid] = { t: now, acc: Math.max(0, Math.min(1, Number(msg.acc) || 0)), combo: Math.max(0, Math.min(100, msg.combo | 0)) };
      const other = link.hits[link.a === pid ? link.b : link.a];
      if (other) resolveLink(room, run, link, now - other.t <= LINK_WINDOW_MS, now);
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
  const run = room.run, me = room.players[pid];
  const keys = Object.keys(BUILDINGS);
  const lastOwned = keys.reduce((m, k, i) => (room.buildings[k] > 0 ? i : m), -1);
  const sc = Engine.score(room.engine.grid, room.engine.size);
  const nameOf = (id) => room.players[id]?.name || '?';
  return {
    dust: room.dust, dps: dps(room), baseDps: baseDps(room), clickPower: clickPower(room), harmony: harmonyAt(room, now),
    // Buildings appear one at a time: everything you own, plus the next one.
    buildings: keys.slice(0, lastOwned + 2).map((key) => {
      const d = BUILDINGS[key];
      return { key, name: d.name, desc: `+${d.dps.toLocaleString()} stardust/sec`, count: room.buildings[key], cost: cost(d, room.buildings[key]) };
    }),
    cloth: { key: 'cloth', name: CLOTH.name, desc: '+1 stardust per click', count: room.cloth, cost: cost(CLOTH, room.cloth) },
    engine: { size: room.engine.size, grid: room.engine.grid, values: sc.values, resonance: sc.total },
    tiers: { max: room.maxTier, next: room.maxTier + 1, nextReq: tierReq(room.maxTier + 1), curReq: tierReq(room.maxTier),
      costs: Array.from({ length: room.maxTier }, (_, i) => runCost(room, i + 1)) },
    you: { pid, ref: refOf(pid), name: me.name, el: me.el, pouch: me.pouch },
    players: Object.entries(room.players).map(([id, pl]) => ({ ref: refOf(id), name: pl.name, el: pl.el, online: online.has(id), runes: pl.pouch.length, contributed: pl.contributed }))
      .sort((a, b) => b.online - a.online || b.contributed - a.contributed),
    feed: room.feed.slice(-40),
    bestFloor: room.bestFloor,
    lastRun: room.lastRun && { ...room.lastRun, mine: room.lastRun.perPlayer[pid] || null, perPlayer: undefined },
    run: run && {
      tier: run.tier, floor: run.floor, phase: run.phase, partyHp: run.partyHp, partyMaxHp: run.partyMaxHp,
      enemy: run.enemy && { name: run.enemy.name, boss: run.enemy.boss, hp: Math.max(0, run.enemy.hp), maxHp: run.enemy.maxHp, atk: run.enemy.atk },
      draftEndsAt: run.draftEndsAt, boonsArmAt: (run.draftStartedAt || 0) + BOON_ARM_MS,
      inRun: !!run.members[pid],
      arena: run.members[pid] ? arenaFor(room, run, pid) : null,
      myLoot: run.members[pid] ? run.members[pid].loot : [],
      // linked targets on *my* screen, with a time-to-live so clock differences don't matter
      links: run.links.filter((l) => (l.a === pid || l.b === pid) && !l.hits[pid])
        .map((l) => ({ id: l.id, partner: nameOf(l.a === pid ? l.b : l.a), hue: l.hue, ttl: Math.max(0, l.expiresAt - now) })),
      linkResults: run.linkResults.filter((r) => r.a === pid || r.b === pid).map((r) => ({ id: r.id, ok: r.ok, partner: nameOf(r.a === pid ? r.b : r.a) })),
      myOffer: run.drafts[pid] ? run.drafts[pid].map((k) => ({ key: k, ...BOONS[k] })) : null,
      members: Object.entries(run.members).map(([id, m]) => ({
        name: nameOf(id), el: room.players[id]?.el, online: online.has(id), dmg: Math.round(m.dmg), runes: m.loot.length,
        picking: !!run.drafts[id],
        boons: Object.entries(m.boons).map(([k, n]) => `${BOONS[k].name}${n > 1 ? ' ×' + n : ''}`),
      })),
    },
  };
}

module.exports = { normalize, newRoom, tick, act, view, ensurePlayer, dps, resonance, tierReq, refOf, BUILDINGS, BOONS };

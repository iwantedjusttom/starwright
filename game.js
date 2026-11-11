'use strict';
// Pure game logic for Starwright. No I/O here — server.js handles sockets & saving.
//
// The loop:
//   Idle buildings make stardust → each player builds a machine: shaped components packed into a grid, powered by
//   runes in their sockets, boosting the components they touch → send machines into the Rift, where they fight on
//   their own (online players can click overcharge targets, and hit linked targets together) → bring back runes and
//   components, or lose some of what was installed if the machine is destroyed → stronger machines (Resonance)
//   unlock harder Rift Tiers with better loot.
const crypto = require('crypto');
const Engine = require('./public/engine');
const { ELEMENTS, ELEMENT_KEYS, ROMAN, MAX_RANK, MAX_LEVEL, COMPONENTS, COMPONENT_KEYS } = Engine;

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

const ENEMIES = ['Void Moth', 'Dust Wraith', 'Hollow Comet', 'Gloam Eel', 'Shard Golem', 'Null Choir', 'Eclipse Hound'];
const BOSSES = ['The Unlit King', 'Mother of Static', 'The Ninth Silence'];

const HARMONY_WINDOW_MS = 1500;
const MAX_OFFLINE_SEC = 7 * 24 * 3600;
const ENEMY_ATTACK_MS = 6000;
const FLOOR_PAUSE_MS = 1500;
const MAX_DIVE_MS = 2 * 3600 * 1000; // machines head home on their own after 2 hours
const HIT_MIN_GAP_MS = 90; // server-side cap on overcharge clicks per player
const LINK_TTL_MS = 2600;
const LINK_WINDOW_MS = 600;
const LOSE_ITEM_CHANCE = 0.3; // when a machine is destroyed, each installed component (and each rune) may be lost
const OWN_ELEMENT_CHANCE = 0.7;
const MAX_W = 7, MAX_H = 6;
const VERSION = 4;

const tierReq = (t) => (t <= 1 ? 0 : Math.round(80 * Math.pow(1.65, t - 2)));

// ---------------------------------------------------------------- helpers
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cost = (def, n) => Math.ceil(def.base * Math.pow(def.growth, n));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const runeName = (r) => `${ELEMENTS[r.el].name} ${ROMAN[r.rank]}`;
const compName = (it) => `${COMPONENTS[it.type].name}${it.lvl > 1 ? ' +' + (it.lvl - 1) : ''}`;
const refOf = (pid) => crypto.createHash('sha1').update(String(pid)).digest('hex').slice(0, 8); // public handle; pids stay private
const expandCost = (m) => Math.ceil(400 * Math.pow(3, m.w + m.h - 7));

function log(room, text, now = Date.now()) {
  room.feed.push({ t: now, text });
  if (room.feed.length > 80) room.feed.splice(0, room.feed.length - 80);
}
const nextId = (room) => (room.nextId = (room.nextId || 1) + 1);
const newRune = (room, el, rank) => ({ id: nextId(room), el, rank });
const newItem = (room, type, lvl = 1) => ({ id: nextId(room), type, lvl, x: 0, y: 0, rot: 0, runes: COMPONENTS[type].sockets.map(() => null) });

// A working starter machine (runes not yet socketed — that's the first thing to do).
function starterMachine(room) {
  const place = (type, x, y, rot = 0) => Object.assign(newItem(room, type), { x, y, rot });
  return { w: 4, h: 3, items: [place('lance', 0, 0), place('coil', 3, 0), place('shield', 0, 1), place('pump', 2, 1)] };
}
const newPlayer = (name, now) => ({ name, el: null, pouch: [], storage: [], machine: null, recallPct: 0.3,
  contributed: 0, clicks: 0, lastClick: 0, lastSeen: now, lastDive: null });

// ---------------------------------------------------------------- room
function newRoom(id, now = Date.now()) {
  const room = {
    version: VERSION, id, createdAt: now, lastTick: now,
    dust: 0, totalDust: 0,
    buildings: Object.fromEntries(Object.keys(BUILDINGS).map((k) => [k, 0])),
    cloth: 0, maxTier: 1, nextId: 1,
    players: {}, feed: [],
    dive: null, divesLaunched: 0, bestFloor: 0,
  };
  log(room, 'The observatory creaks open. Choose your element, build your machine, and send it into the Rift.', now);
  return room;
}

// Convert worlds saved by older versions: keep stardust, buildings, players, their elements and runes.
function normalize(room) {
  if (room.version === VERSION) return room;
  const fresh = newRoom(room.id, room.lastTick || Date.now());
  const oldBuildings = room.buildings || room.upgrades || {};
  for (const k of Object.keys(BUILDINGS)) fresh.buildings[k] = oldBuildings[k] || 0;
  Object.assign(fresh, {
    cloth: room.cloth ?? room.upgrades?.cloth ?? 0,
    createdAt: room.createdAt || fresh.createdAt, lastTick: room.lastTick || fresh.lastTick,
    dust: room.dust || 0, totalDust: room.totalDust || 0, feed: room.feed || [],
    bestFloor: room.bestFloor || 0, maxTier: room.maxTier || 1, nextId: Math.max(room.nextRuneId || 1, room.nextId || 1),
  });
  const pids = Object.keys(room.players || {});
  for (const pid of pids) {
    const p = room.players[pid];
    const np = Object.assign(newPlayer(p.name, p.lastSeen || 0), { el: p.el || null, pouch: p.pouch || [], contributed: p.contributed || 0, clicks: p.clicks || 0 });
    if (np.el) np.machine = starterMachine(fresh);
    fresh.players[pid] = np;
  }
  // Runes that were in the old shared Star Engine are handed back out.
  (room.engine?.grid || []).filter(Boolean).forEach((r, i) => { if (pids.length) fresh.players[pids[i % pids.length]].pouch.push(r); });
  log(fresh, '🔧 Machines have arrived! Everyone gets a starter machine: socket your runes into it and send it into the Rift. The Star Engine\'s runes were handed back out.', fresh.lastTick);
  return fresh;
}

const machineStats = (p) => (p.machine ? Engine.stats(p.machine) : { dmg: 0, hp: 0, armor: 0, regen: 0, loot: 0, resonance: 0, power: {} });
const totalResonance = (room) => Object.values(room.players).reduce((s, p) => s + machineStats(p).resonance, 0);
const baseDps = (room) => Object.entries(BUILDINGS).reduce((s, [k, d]) => s + d.dps * room.buildings[k], 0);
const dps = (room) => baseDps(room) * (1 + totalResonance(room) / 200); // stronger machines also boost the observatory
const clickPower = (room) => 1 + room.cloth;
const diveCost = (room, tier) => Math.max(100 * tier * tier, Math.floor(baseDps(room) * 60 * (1 + 0.5 * (tier - 1))));

function harmonyAt(room, now) {
  let h = 0;
  for (const p of Object.values(room.players)) if (p.lastClick && now - p.lastClick <= HARMONY_WINDOW_MS) h++;
  return Math.max(1, h);
}

function ensurePlayer(room, pid, name, now = Date.now()) {
  if (!room.players[pid]) {
    room.players[pid] = newPlayer(name, now);
    log(room, `${name} joined the observatory crew.`, now);
  }
  const p = room.players[pid];
  p.name = name; p.lastSeen = now;
  return p;
}

// Tiers unlock permanently the first time any crew machine's Resonance reaches them.
function checkTiers(room, now) {
  const best = Math.max(0, ...Object.values(room.players).map((p) => machineStats(p).resonance));
  while (best >= tierReq(room.maxTier + 1)) {
    room.maxTier++;
    log(room, `🌀 A machine hit Resonance ${best}! Rift Tier ${room.maxTier} is open: tougher foes, better loot.`, now);
  }
}

function tick(room, now, online = new Set()) {
  const dt = Math.min(Math.max(0, (now - room.lastTick) / 1000), MAX_OFFLINE_SEC);
  room.lastTick = now;
  const gain = dps(room) * dt;
  room.dust += gain; room.totalDust += gain;
  if (room.dive) simulateDive(room, now, online);
  return { dt, gain };
}

// ---------------------------------------------------------------- the rift (machines fight on their own)
const fighting = (dive) => Object.entries(dive.units).filter(([, u]) => u.status === 'fighting');

function spawnEnemy(dive, t) {
  const f = dive.floor, tier = dive.tier, boss = f % 5 === 0;
  const n = fighting(dive).length;
  const maxHp = Math.round(180 * Math.pow(1.25, f - 1) * Math.pow(1.6, tier - 1) * (0.6 + 0.4 * n) * (boss ? 3 : 1));
  dive.enemy = {
    name: boss ? pick(BOSSES) : pick(ENEMIES), boss, hp: maxHp, maxHp,
    atk: Math.round(5 * Math.pow(1.15, f - 1) * Math.pow(1.35, tier - 1) * (boss ? 1.5 : 1)),
    nextAttackAt: t + ENEMY_ATTACK_MS,
  };
  dive.links = [];
}

function dropRune(room, pid, tier, boss) {
  const p = room.players[pid];
  const el = p?.el && Math.random() < OWN_ELEMENT_CHANCE ? p.el : pick(ELEMENT_KEYS);
  const rank = Math.min(MAX_RANK, 1 + Math.floor((tier - 1) / 2) + (boss && Math.random() < 0.5 ? 1 : 0));
  return newRune(room, el, rank);
}

function killEnemy(room, dive, t) {
  const boss = dive.enemy.boss;
  const found = [];
  for (const [pid, u] of fighting(dive)) {
    const runes = 1 + (boss ? 1 : 0) + (Math.random() < u.stats.loot ? 1 : 0);
    for (let i = 0; i < runes; i++) { const r = dropRune(room, pid, dive.tier, boss); u.loot.runes.push(r); found.push(runeName(r)); }
    if (boss || Math.random() < 0.15) {
      const it = newItem(room, pick(COMPONENT_KEYS), Math.min(MAX_LEVEL, 1 + Math.floor((dive.tier - 1) / 3)));
      u.loot.comps.push(it); found.push(compName(it));
    }
  }
  log(room, `⚔ Floor ${dive.floor}: ${dive.enemy.name} shattered! Found: ${found.join(', ')}.`, t);
  room.bestFloor = Math.max(room.bestFloor, dive.floor);
  dive.floor++;
  dive.enemy = null;
  dive.pauseUntil = t + FLOOR_PAUSE_MS;
}

// A machine leaves the Rift. Recalled: keeps everything. Destroyed: keeps half its finds and may lose installed parts.
function leaveDive(room, dive, pid, destroyed, t) {
  const u = dive.units[pid], p = room.players[pid];
  u.status = destroyed ? 'destroyed' : 'recalled';
  const keep = (arr) => (destroyed ? arr.slice(0, Math.floor(arr.length / 2)) : arr);
  const runes = keep(u.loot.runes), comps = keep(u.loot.comps);
  const lostItems = [], lostRunes = [];
  if (destroyed && p.machine) {
    p.machine.items = p.machine.items.filter((it) => {
      if (Math.random() < LOSE_ITEM_CHANCE) { lostItems.push(compName(it)); return false; }
      it.runes = it.runes.map((r) => { if (r && Math.random() < LOSE_ITEM_CHANCE) { lostRunes.push(runeName(r)); return null; } return r; });
      return true;
    });
  }
  p.pouch.push(...runes); p.storage.push(...comps);
  p.lastDive = { tier: dive.tier, floor: dive.floor, destroyed, at: t, runes: runes.length, comps: comps.map(compName), lostItems, lostRunes };
  log(room, destroyed
    ? `💥 ${p.name}'s machine was destroyed on floor ${dive.floor}. Saved ${runes.length} rune(s)${comps.length ? ` and ${comps.length} component(s)` : ''}; lost ${lostItems.length ? lostItems.join(', ') : 'no components'}${lostRunes.length ? ` and ${lostRunes.length} socketed rune(s)` : ''}.`
    : `🏳 ${p.name}'s machine came home from floor ${dive.floor} with ${runes.length} rune(s)${comps.length ? ` and ${comps.map(compName).join(', ')}` : ''}.`, t);
  if (!fighting(dive).length) { room.dive = null; log(room, `The Rift closes behind the last machine.`, t); }
}

// Run the dive forward to `now` in small steps (it keeps going while everyone is offline).
function simulateDive(room, now, online) {
  const dive = room.dive;
  while (room.dive && dive.simAt < now) {
    const step = Math.min(now - dive.simAt, online.size ? 250 : 1000);
    const t = dive.simAt + step, sec = step / 1000;
    dive.simAt = t;
    if (t - dive.startedAt > MAX_DIVE_MS) { for (const [pid] of fighting(dive)) leaveDive(room, dive, pid, false, t); return; }
    for (const [, u] of fighting(dive)) {
      u.hp = Math.min(u.stats.hp, u.hp + u.stats.regen * sec);
      u.charge *= Math.pow(0.8, sec); // overcharge fades
    }
    for (const l of [...dive.links]) if (t > l.expiresAt + LINK_WINDOW_MS) resolveLink(room, dive, l, false, t);
    if (dive.pauseUntil > t) continue;
    if (!dive.enemy) { spawnEnemy(dive, t); dive.nextLinkAt = t + 2000 + Math.random() * 2000; }
    const e = dive.enemy;
    for (const [, u] of fighting(dive)) e.hp -= u.stats.dmg * (1 + u.charge) * sec;
    if (e.hp <= 0) { killEnemy(room, dive, t); continue; }
    if (t >= dive.nextLinkAt) {
      spawnLink(dive, online, t);
      dive.nextLinkAt = t + (e.boss ? 2500 : 4500) + Math.random() * 2000;
    }
    while (t >= e.nextAttackAt && room.dive) {
      e.nextAttackAt += ENEMY_ATTACK_MS;
      const targets = fighting(dive);
      if (!targets.length) break;
      const [pid, u] = pick(targets);
      u.hp -= Math.max(1, e.atk - u.stats.armor);
      if (u.hp <= 0) leaveDive(room, dive, pid, true, t);
      else if (u.hp / u.stats.hp <= room.players[pid].recallPct) leaveDive(room, dive, pid, false, t);
    }
  }
}

// Linked targets: a pair on two players' screens (both machines in the fight). Hit both within the window for a burst.
function spawnLink(dive, online, t) {
  const here = fighting(dive).map(([pid]) => pid).filter((id) => online.has(id));
  if (here.length < 2) return;
  const [a, b] = shuffle(here).slice(0, 2);
  dive.nextLinkId = (dive.nextLinkId || 0) + 1;
  dive.links.push({ id: dive.nextLinkId, a, b, hue: Math.floor(Math.random() * 360), expiresAt: t + LINK_TTL_MS, hits: {} });
}

function resolveLink(room, dive, link, ok, t) {
  dive.links = dive.links.filter((l) => l !== link);
  dive.linkResults.push({ id: link.id, ok, a: link.a, b: link.b });
  if (dive.linkResults.length > 10) dive.linkResults.shift();
  if (!ok || !dive.enemy) return;
  const ua = dive.units[link.a], ub = dive.units[link.b];
  const acc = (link.hits[link.a].acc + link.hits[link.b].acc) / 2;
  const burst = 3 * 3 * ((ua?.stats.dmg || 0) + (ub?.stats.dmg || 0)) * (0.6 + 0.4 * acc); // ×3 of three seconds of both machines
  dive.enemy.hp -= burst;
  log(room, `⚡ Linked strike! ${room.players[link.a].name} & ${room.players[link.b].name} hit together for ${Math.round(burst).toLocaleString()}.`, t);
  if (dive.enemy.hp <= 0) killEnemy(room, dive, t);
}

function startDive(room, pid, now, tier) {
  const p = room.players[pid];
  if (!p.machine) return 'Choose your element first to get your machine.';
  if (room.dive && room.dive.units[pid]?.status === 'fighting') return 'Your machine is already in the Rift.';
  if (p.lastDive && now - p.lastDive.at < 3000) return null; // stray overcharge clicks right after coming home
  const s = machineStats(p);
  if (s.dmg <= 0) return 'Your machine has no working weapon. Socket a rune into a weapon first.';
  tier = room.dive ? room.dive.tier : Math.max(1, Math.min(room.maxTier, tier | 0 || room.maxTier));
  const c = diveCost(room, tier);
  if (room.dust < c) return `Sending a machine into Tier ${tier} costs ${Math.ceil(c).toLocaleString()} stardust.`;
  room.dust -= c; room.divesLaunched++;
  if (!room.dive) {
    room.dive = { tier, floor: 1, startedAt: now, simAt: now, units: {}, enemy: null, pauseUntil: now + 1000, links: [], linkResults: [], nextLinkAt: now + 4000 };
    log(room, `🌀 ${p.name} opened a Tier ${tier} Rift and sent their machine in.`, now);
  } else log(room, `🌀 ${p.name}'s machine joined the dive on floor ${room.dive.floor}.`, now);
  room.dive.units[pid] = { status: 'fighting', stats: { ...s, power: undefined }, hp: s.hp, charge: 0, loot: { runes: [], comps: [] } };
  return null;
}

// ---------------------------------------------------------------- actions
function act(room, pid, msg, online, now = Date.now()) {
  const me = room.players[pid];
  if (!me) return 'Unknown player.';
  const diving = room.dive?.units[pid]?.status === 'fighting';
  const m = me.machine;
  const findItem = (id) => m?.items.find((it) => it.id === id) || me.storage.find((it) => it.id === id) || null;
  const takeRune = (id) => { const i = me.pouch.findIndex((r) => r.id === id); return i < 0 ? null : me.pouch.splice(i, 1)[0]; };
  const editing = ['place', 'store', 'socket', 'unsocket', 'expand'].includes(msg.type);
  if (editing && diving) return 'Your machine is in the Rift. Recall it to make changes.';
  if (editing && !m) return 'Choose your element first to get your machine.';
  const before = m ? Engine.stats(m).resonance : 0;
  const changed = (what) => { const after = Engine.stats(m).resonance; log(room, `🔧 ${me.name} ${what}: Resonance ${before} → ${after}.`, now); checkTiers(room, now); };

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
      const first = !me.machine;
      me.el = msg.el;
      if (first) {
        me.machine = starterMachine(room);
        for (let i = 0; i < 4; i++) me.pouch.push(newRune(room, msg.el, 1));
        for (let i = 0; i < 2; i++) me.pouch.push(newRune(room, pick(ELEMENT_KEYS), 1));
      }
      log(room, `${ELEMENTS[msg.el].icon} ${me.name} is now attuned to ${ELEMENTS[msg.el].name}${first ? ' and built a starter machine' : ''}.`, now);
      return null;
    }
    case 'place': { // from storage onto the grid, or move/rotate something already installed
      const it = findItem(msg.itemId);
      if (!it) return 'You don\'t have that component.';
      const installed = m.items.includes(it);
      const trial = { ...m, items: [...m.items.filter((o) => o !== it), { ...it, x: msg.x | 0, y: msg.y | 0, rot: ((msg.rot | 0) % 4 + 4) % 4 }] };
      if (!Engine.fits(trial)) return 'It doesn\'t fit there.';
      Object.assign(it, { x: msg.x | 0, y: msg.y | 0, rot: ((msg.rot | 0) % 4 + 4) % 4 });
      if (!installed) { me.storage.splice(me.storage.indexOf(it), 1); m.items.push(it); }
      changed(`${installed ? 'moved' : 'installed'} ${compName(it)}`);
      return null;
    }
    case 'store': {
      const it = m.items.find((o) => o.id === msg.itemId);
      if (!it) return null;
      m.items.splice(m.items.indexOf(it), 1); me.storage.push(it);
      changed(`took out ${compName(it)}`);
      return null;
    }
    case 'socket': {
      const it = findItem(msg.itemId), s = msg.s | 0;
      if (!it || s < 0 || s >= it.runes.length) return 'No such socket.';
      const rune = takeRune(msg.runeId);
      if (!rune) return 'That rune isn\'t in your pouch.';
      if (it.runes[s]) me.pouch.push(it.runes[s]);
      it.runes[s] = rune;
      changed(`socketed ${runeName(rune)} into ${compName(it)}`);
      return null;
    }
    case 'unsocket': {
      const it = findItem(msg.itemId), s = msg.s | 0;
      if (!it || !it.runes[s]) return null;
      me.pouch.push(it.runes[s]); it.runes[s] = null;
      changed(`pulled a rune out of ${compName(it)}`);
      return null;
    }
    case 'fuseRunes': {
      const rank = msg.rank | 0;
      if (!ELEMENTS[msg.el] || rank < 1 || rank >= MAX_RANK) return 'Can\'t fuse that.';
      const same = me.pouch.filter((r) => r.el === msg.el && r.rank === rank);
      if (same.length < 3) return 'Fusing takes 3 identical runes.';
      for (const r of same.slice(0, 3)) me.pouch.splice(me.pouch.indexOf(r), 1);
      const made = newRune(room, msg.el, rank + 1);
      me.pouch.push(made);
      log(room, `🔮 ${me.name} fused three runes into ${runeName(made)}.`, now);
      return null;
    }
    case 'fuseComps': { // three identical components in storage → one of the next level (their runes go back to the pouch)
      const lvl = msg.lvl | 0;
      if (!COMPONENTS[msg.compType] || lvl < 1 || lvl >= MAX_LEVEL) return 'Can\'t upgrade that.';
      const same = me.storage.filter((it) => it.type === msg.compType && it.lvl === lvl);
      if (same.length < 3) return 'Upgrading takes 3 identical components in storage.';
      for (const it of same.slice(0, 3)) { me.pouch.push(...it.runes.filter(Boolean)); me.storage.splice(me.storage.indexOf(it), 1); }
      const made = newItem(room, msg.compType, lvl + 1);
      me.storage.push(made);
      log(room, `⚙ ${me.name} forged three components into ${compName(made)}.`, now);
      return null;
    }
    case 'expand': {
      const dir = msg.dir === 'h' ? 'h' : 'w';
      if ((dir === 'w' && m.w >= MAX_W) || (dir === 'h' && m.h >= MAX_H)) return 'The machine can\'t grow any further that way.';
      const c = expandCost(m);
      if (room.dust < c) return `Expanding costs ${c.toLocaleString()} stardust.`;
      room.dust -= c; m[dir]++;
      log(room, `📦 ${me.name} expanded their machine to ${m.w}×${m.h}.`, now);
      return null;
    }
    case 'give': {
      const to = Object.entries(room.players).find(([id]) => refOf(id) === msg.to);
      if (!to || to[0] === pid) return 'Pick someone else in the crew.';
      if (msg.runeId) {
        const rune = takeRune(msg.runeId);
        if (!rune) return 'That rune isn\'t in your pouch.';
        to[1].pouch.push(rune);
        log(room, `🎁 ${me.name} gave ${to[1].name} a ${runeName(rune)} rune.`, now);
        return null;
      }
      const it = me.storage.find((o) => o.id === msg.itemId);
      if (!it) return 'Only components in storage can be given.';
      me.storage.splice(me.storage.indexOf(it), 1); to[1].storage.push(it);
      log(room, `🎁 ${me.name} gave ${to[1].name} a ${compName(it)}.`, now);
      return null;
    }
    case 'recallPct': me.recallPct = Math.max(0.1, Math.min(0.9, Math.round((Number(msg.v) || 0.3) * 10) / 10)); return null;
    case 'dive': return startDive(room, pid, now, msg.tier);
    case 'recall': {
      if (!diving) return null;
      leaveDive(room, room.dive, pid, false, now);
      return null;
    }
    case 'hit': { // overcharge: clicking targets while your machine fights makes it hit harder for a few seconds
      if (!diving) return null;
      if (now - (me.lastHit || 0) < HIT_MIN_GAP_MS) return null;
      me.lastHit = now; me.lastClick = now;
      const acc = Math.max(0, Math.min(1, Number(msg.acc) || 0)), combo = Math.max(0, Math.min(100, msg.combo | 0));
      const u = room.dive.units[pid];
      u.charge = Math.min(3, u.charge + (acc >= 0.85 ? 0.15 : 0.05 + 0.08 * acc) * (1 + 0.03 * Math.min(combo, 30)));
      return null;
    }
    case 'linkHit': {
      const dive = room.dive;
      if (!dive || !diving) return null;
      const link = dive.links.find((l) => l.id === msg.id && (l.a === pid || l.b === pid));
      if (!link || link.hits[pid]) return null;
      me.lastClick = now;
      link.hits[pid] = { t: now, acc: Math.max(0, Math.min(1, Number(msg.acc) || 0)) };
      const other = link.hits[link.a === pid ? link.b : link.a];
      if (other) resolveLink(room, dive, link, now - other.t <= LINK_WINDOW_MS, now);
      return null;
    }
    case 'chat': {
      const t = String(msg.text || '').trim().slice(0, 300);
      if (t) log(room, `💬 ${me.name}: ${t}`, now);
      return null;
    }
    default: return 'Unknown action.';
  }
}

// ---------------------------------------------------------------- views
function view(room, pid, online, now = Date.now()) {
  const me = room.players[pid], dive = room.dive;
  const keys = Object.keys(BUILDINGS);
  const lastOwned = keys.reduce((mx, k, i) => (room.buildings[k] > 0 ? i : mx), -1);
  const nameOf = (id) => room.players[id]?.name || '?';
  const myUnit = dive?.units[pid];
  return {
    dust: room.dust, dps: dps(room), clickPower: clickPower(room), harmony: harmonyAt(room, now),
    buildings: keys.slice(0, lastOwned + 2).map((key) => {
      const d = BUILDINGS[key];
      return { key, name: d.name, desc: `+${d.dps.toLocaleString()} stardust/sec`, count: room.buildings[key], cost: cost(d, room.buildings[key]) };
    }),
    cloth: { key: 'cloth', name: CLOTH.name, desc: '+1 stardust per click', count: room.cloth, cost: cost(CLOTH, room.cloth) },
    totalResonance: totalResonance(room),
    tiers: { max: room.maxTier, nextReq: tierReq(room.maxTier + 1), costs: Array.from({ length: room.maxTier }, (_, i) => diveCost(room, i + 1)) },
    you: {
      pid, ref: refOf(pid), name: me.name, el: me.el, pouch: me.pouch, storage: me.storage, machine: me.machine,
      recallPct: me.recallPct, expandCost: me.machine ? expandCost(me.machine) : 0, maxW: MAX_W, maxH: MAX_H,
      lastDive: me.lastDive, diving: myUnit?.status === 'fighting',
    },
    players: Object.entries(room.players).map(([id, pl]) => ({ ref: refOf(id), name: pl.name, el: pl.el, online: online.has(id),
      resonance: machineStats(pl).resonance, status: dive?.units[id]?.status === 'fighting' ? 'in the Rift' : null }))
      .sort((a, b) => b.online - a.online || b.resonance - a.resonance),
    feed: room.feed.slice(-40),
    bestFloor: room.bestFloor,
    dive: dive && {
      tier: dive.tier, floor: dive.floor, paused: !dive.enemy,
      enemy: dive.enemy && { name: dive.enemy.name, boss: dive.enemy.boss, hp: Math.max(0, dive.enemy.hp), maxHp: dive.enemy.maxHp, atk: dive.enemy.atk },
      units: Object.entries(dive.units).map(([id, u]) => ({ name: nameOf(id), el: room.players[id]?.el, me: id === pid, status: u.status,
        hp: Math.max(0, u.hp), maxHp: u.stats.hp, dmg: u.stats.dmg, charge: u.charge, runes: u.loot.runes.length, comps: u.loot.comps.length })),
      arena: myUnit?.status === 'fighting' ? { radius: Math.round(Math.max(18, 34 - dive.tier)), lifeMs: 1300, spawnMs: 650, max: 2 } : null,
      links: dive.links.filter((l) => (l.a === pid || l.b === pid) && !l.hits[pid])
        .map((l) => ({ id: l.id, partner: nameOf(l.a === pid ? l.b : l.a), hue: l.hue, ttl: Math.max(0, l.expiresAt - now) })),
      linkResults: dive.linkResults.filter((r) => r.a === pid || r.b === pid).map((r) => ({ id: r.id, ok: r.ok, partner: nameOf(r.a === pid ? r.b : r.a) })),
    },
  };
}

module.exports = { normalize, newRoom, tick, act, view, ensurePlayer, dps, tierReq, refOf, machineStats, BUILDINGS };

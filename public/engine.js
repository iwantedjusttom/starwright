// Machine rules: elements, runes, components, shapes and how a machine's stats are worked out.
// Shared by the server (game.js) and the browser (for live build previews), so what you see is what you get.
(function (root) {
  const ELEMENTS = {
    sun: { name: 'Sun', icon: '☀', color: '#f2c14e' },
    moon: { name: 'Moon', icon: '☾', color: '#b9c6ff' },
    tide: { name: 'Tide', icon: '≈', color: '#4fc3f7' },
    ember: { name: 'Ember', icon: '♨', color: '#ff7a45' },
    void: { name: 'Void', icon: '◉', color: '#b07cff' },
  };
  const ELEMENT_KEYS = Object.keys(ELEMENTS);
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const MAX_RANK = 8, MAX_LEVEL = 5;
  const runePower = (rank) => Math.pow(2, rank - 1);
  const MISMATCH = 0.4; // a rune of the wrong element still works, at 40%

  // cells: [x, y] squares of the shape. sockets: which cell (index into cells) wants which element.
  const COMPONENTS = {
    lance: { name: 'Prism Lance', kind: 'weapon', color: '#f2c14e', cells: [[0, 0], [1, 0], [2, 0]],
      sockets: [{ c: 0, el: 'sun' }, { c: 1, el: 'ember' }, { c: 2, el: 'sun' }], dmg: 6, desc: 'Weapon. Fires piercing light.' },
    coil: { name: 'Ember Coil', kind: 'weapon', color: '#ff7a45', cells: [[0, 0]],
      sockets: [{ c: 0, el: 'ember' }], dmg: 3, desc: 'Weapon. +50% for each Ember Coil it touches.' },
    lash: { name: 'Void Lash', kind: 'weapon', color: '#b07cff', cells: [[0, 0], [0, 1], [1, 1]],
      sockets: [{ c: 0, el: 'void' }, { c: 2, el: 'void' }], dmg: 5, desc: 'Weapon. +25% for each empty space it touches.' },
    shield: { name: 'Moon Shield', kind: 'defense', color: '#b9c6ff', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
      sockets: [{ c: 0, el: 'moon' }, { c: 3, el: 'moon' }], hp: 60, armor: 1, desc: 'Defense. Adds HP and armor.' },
    plate: { name: 'Sunplate', kind: 'defense', color: '#e8d27a', cells: [[0, 0], [1, 0]],
      sockets: [{ c: 0, el: 'sun' }], hp: 35, desc: 'Defense. Adds HP.' },
    pump: { name: 'Tide Pump', kind: 'support', color: '#4fc3f7', cells: [[0, 0], [0, 1]],
      sockets: [{ c: 0, el: 'tide' }, { c: 1, el: 'tide' }], regen: 1.5, desc: 'Repairs the machine over time.' },
    capacitor: { name: 'Sun Capacitor', kind: 'support', color: '#ffd76b', cells: [[0, 0], [1, 0]],
      sockets: [{ c: 0, el: 'sun' }], weaponAura: 0.4, desc: 'Weapons it touches deal +40%.' },
    core: { name: 'Void Core', kind: 'support', color: '#8a5cff', cells: [[0, 0], [1, 0], [0, 1]],
      sockets: [{ c: 0, el: 'void' }], aura: 0.35, hpPenalty: 0.15, desc: 'Everything it touches is 35% stronger, but the machine loses 15% HP.' },
    harvester: { name: 'Star Harvester', kind: 'support', color: '#9ad0c2', cells: [[0, 0], [1, 0], [2, 0], [1, 1]],
      sockets: [{ c: 1, el: 'moon' }, { c: 3, el: 'tide' }], loot: 0.4, desc: '+40% chance of an extra rune from each kill.' },
  };
  const COMPONENT_KEYS = Object.keys(COMPONENTS);

  // ---- Loot: every dropped component rolls a rarity, random socket elements and random modifiers.
  const RARITIES = {
    common: { name: 'Common', color: '#c9c9c9', mods: 0, scale: 1, essence: 2 },
    uncommon: { name: 'Uncommon', color: '#7ee787', mods: 1, scale: 1, essence: 5 },
    rare: { name: 'Rare', color: '#58a6ff', mods: 2, scale: 1.15, essence: 12 },
    epic: { name: 'Epic', color: '#bc8cff', mods: 3, scale: 1.3, essence: 30 },
    legendary: { name: 'Legendary', color: '#ffa94d', mods: 4, scale: 1.5, essence: 80 },
  };
  const RARITY_KEYS = Object.keys(RARITIES);
  // kind: 'prefix' or 'suffix' (for the name). weapon: only rolls on weapons. min/max: the roll range (× rarity scale).
  const MODS = {
    overcharged: { kind: 'prefix', name: 'Overcharged', min: 10, max: 30, text: (v) => `+${v}% power` },
    volatile: { kind: 'prefix', name: 'Volatile', weapon: true, min: 25, max: 60, text: (v) => `+${v}% damage, but −5% machine HP` },
    reinforced: { kind: 'prefix', name: 'Reinforced', min: 15, max: 50, text: (v) => `+${v} HP` },
    hardened: { kind: 'prefix', name: 'Hardened', min: 1, max: 3, text: (v) => `+${v} armor` },
    lucky: { kind: 'prefix', name: 'Lucky', min: 10, max: 30, text: (v) => `+${v}% chance of an extra rune` },
    mending: { kind: 'prefix', name: 'Mending', min: 0.5, max: 2, step: 0.1, text: (v) => `+${v} repair/s` },
    resonance: { kind: 'suffix', name: 'of Resonance', min: 10, max: 25, text: (v) => `components it touches get +${v}% power` },
    pack: { kind: 'suffix', name: 'of the Pack', min: 15, max: 35, text: (v) => `+${v}% power for each touching component of the same kind` },
    titan: { kind: 'suffix', name: 'of the Titan', weapon: true, min: 30, max: 80, text: (v) => `+${v}% damage against bosses` },
    harmony: { kind: 'suffix', name: 'of Harmony', min: 80, max: 80, text: () => 'wrong-element runes work at 80% instead of 40%' },
  };
  const MOD_KEYS = Object.keys(MODS);
  const modVal = (it, k) => (it.mods || []).filter((m) => m.k === k).reduce((s, m) => s + m.v, 0);

  // The sockets of a specific item (its socket elements may have been rolled differently from the base design).
  const socketsOf = (it) => COMPONENTS[it.type].sockets.map((s, i) => ({ c: s.c, el: it.sockEls?.[i] || s.el }));

  function itemName(it) {
    const pre = (it.mods || []).map((m) => MODS[m.k]).find((d) => d.kind === 'prefix');
    const suf = (it.mods || []).map((m) => MODS[m.k]).find((d) => d.kind === 'suffix');
    return [pre?.name, COMPONENTS[it.type].name, suf?.name].filter(Boolean).join(' ');
  }

  // Roll a new component. rng: () => [0,1). tierBoost shifts the odds toward rarer items.
  function rollItem(type, rng, tierBoost = 0) {
    const weights = [60, 25, 10, 4, 1].map((w, i) => w * Math.pow(1 + 0.35 * tierBoost, i));
    let x = rng() * weights.reduce((a, b) => a + b, 0), ri = 0;
    while (x > weights[ri]) { x -= weights[ri]; ri++; }
    const rarity = RARITY_KEYS[Math.min(ri, RARITY_KEYS.length - 1)], R = RARITIES[rarity];
    const def = COMPONENTS[type];
    const sockEls = def.sockets.map((s) => (rng() < 0.5 ? s.el : ELEMENT_KEYS[Math.floor(rng() * ELEMENT_KEYS.length)]));
    const pool = MOD_KEYS.filter((k) => !MODS[k].weapon || def.kind === 'weapon');
    const mods = [];
    for (let i = 0; i < R.mods && pool.length; i++) {
      const k = pool.splice(Math.floor(rng() * pool.length), 1)[0], d = MODS[k], step = d.step || 1;
      mods.push({ k, v: Math.round((d.min + rng() * (d.max - d.min)) * (k === 'harmony' ? 1 : R.scale) / step) * step });
    }
    return { type, lvl: 1, rarity, sockEls, mods };
  }

  // Shape cells after rotating `rot` quarter-turns clockwise, shifted back to start at 0,0. Order is kept,
  // so socket indexes still point at the same squares.
  function cellsFor(type, rot) {
    let cells = COMPONENTS[type].cells.map(([x, y]) => [x, y]);
    for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cells = cells.map(([x, y]) => [-y, x]);
    const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
    return cells.map(([x, y]) => [x - mx, y - my]);
  }
  const levelFactor = (lvl) => 1 + 0.5 * (lvl - 1);

  // Which item covers each square (null = empty). Returns null if items overlap or leave the grid.
  function occupancy(m) {
    const occ = Array(m.w * m.h).fill(null);
    for (const it of m.items) {
      for (const [cx, cy] of cellsFor(it.type, it.rot)) {
        const x = it.x + cx, y = it.y + cy;
        if (x < 0 || y < 0 || x >= m.w || y >= m.h || occ[y * m.w + x] !== null) return null;
        occ[y * m.w + x] = it.id;
      }
    }
    return occ;
  }
  const fits = (m) => occupancy(m) !== null;

  // How well an item's sockets are filled: 1.0 = every socket holds a matching rank I rune.
  function charge(it) {
    const socks = socketsOf(it);
    const miss = modVal(it, 'harmony') ? 0.8 : MISMATCH;
    const sum = socks.reduce((s, sk, i) => {
      const r = it.runes[i];
      return s + (r ? runePower(r.rank) * (r.el === sk.el ? 1 : miss) : 0);
    }, 0);
    return sum / socks.length;
  }

  // Full stats for a machine: { dmg, hp, armor, regen, loot, resonance, power: { itemId: number } }
  function stats(m) {
    const occ = occupancy(m) || Array(m.w * m.h).fill(null);
    const byId = Object.fromEntries(m.items.map((it) => [it.id, it]));
    const touching = {}, emptyAround = {};
    for (const it of m.items) { touching[it.id] = new Set(); emptyAround[it.id] = 0; }
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const id = occ[y * m.w + x];
      if (id === null) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const nid = occ[ny * m.w + nx];
        if (nid === null) emptyAround[id]++;
        else if (nid !== id) touching[id].add(nid);
      }
    }
    const base = {}, mult = {};
    for (const it of m.items) { base[it.id] = charge(it) * levelFactor(it.lvl) * (1 + modVal(it, 'overcharged') / 100); mult[it.id] = 1; }
    for (const it of m.items) {
      const def = COMPONENTS[it.type], strength = base[it.id];
      const on = strength > 0;
      for (const nid of touching[it.id]) {
        const n = byId[nid], nd = COMPONENTS[n.type];
        if (def.aura) mult[nid] *= 1 + def.aura * strength;
        if (def.weaponAura && nd.kind === 'weapon') mult[nid] *= 1 + def.weaponAura * strength;
        if (it.type === 'coil' && n.type === 'coil') mult[nid] *= 1.5;
        if (on && modVal(it, 'resonance')) mult[nid] *= 1 + modVal(it, 'resonance') / 100;
        if (modVal(it, 'pack') && nd.kind === def.kind) mult[it.id] *= 1 + modVal(it, 'pack') / 100;
      }
      if (it.type === 'lash') mult[it.id] *= 1 + 0.25 * emptyAround[it.id];
    }
    const s = { dmg: 0, hp: 100, armor: 0, regen: 0, loot: 0, bossDmg: 0, power: {} };
    let hpPenalty = 0, total = 0;
    for (const it of m.items) {
      const def = COMPONENTS[it.type], p = base[it.id] * mult[it.id], on = p > 0;
      s.power[it.id] = p; total += p;
      const dmg = (def.dmg || 0) * p * (1 + modVal(it, 'volatile') / 100);
      s.dmg += dmg;
      s.bossDmg += dmg * modVal(it, 'titan') / 100;
      s.hp += (def.hp || 0) * p + (on ? modVal(it, 'reinforced') * levelFactor(it.lvl) : 0);
      s.armor += (def.armor || 0) * p + (on ? modVal(it, 'hardened') : 0);
      s.regen += (def.regen || 0) * p + (on ? modVal(it, 'mending') * levelFactor(it.lvl) : 0);
      s.loot += (def.loot || 0) * p + (on ? modVal(it, 'lucky') / 100 : 0);
      if (def.hpPenalty && base[it.id] > 0) hpPenalty += def.hpPenalty;
      if (modVal(it, 'volatile') && on) hpPenalty += 0.05;
    }
    s.hp = Math.round(s.hp * Math.max(0.4, 1 - hpPenalty));
    s.resonance = Math.round(10 * total);
    return s;
  }

  // Essence to raise a component one level (bigger shapes and higher levels cost more): ×3.5 per level.
  const upgradeCost = (it) => ({ essence: Math.ceil(8 * COMPONENTS[it.type].cells.length * Math.pow(3.5, it.lvl - 1)) });
  // Essence from salvaging: a rune is worth the three runes it would take to fuse it; components by rarity and level.
  const runeEssence = (r) => Math.pow(3, r.rank - 1);
  const itemEssence = (it) => (RARITIES[it.rarity || 'common'].essence) * it.lvl;

  const api = { upgradeCost, runeEssence, itemEssence, RARITIES, RARITY_KEYS, MODS, socketsOf, itemName, rollItem, modVal, ELEMENTS, ELEMENT_KEYS, ROMAN, MAX_RANK, MAX_LEVEL, MISMATCH, runePower, COMPONENTS, COMPONENT_KEYS,
    cellsFor, occupancy, fits, charge, stats, levelFactor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(this);

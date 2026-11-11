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

  // Component archetypes: what the component *does*. The classic shape and sockets below are what starter parts use;
  // parts that drop in the Rift roll their own shape, sockets and modifiers.
  const COMPONENTS = {
    lance: { name: 'Prism Lance', kind: 'weapon', color: '#f2c14e', home: 'sun', cells: [[0, 0], [1, 0], [2, 0]],
      sockets: [{ c: 0, el: 'sun' }, { c: 1, el: 'ember' }, { c: 2, el: 'sun' }], dmg: 6, desc: 'Weapon. Fires piercing light.' },
    coil: { name: 'Ember Coil', kind: 'weapon', color: '#ff7a45', home: 'ember', cells: [[0, 0]],
      sockets: [{ c: 0, el: 'ember' }], dmg: 3, desc: 'Weapon. +50% for each Ember Coil it touches.' },
    lash: { name: 'Void Lash', kind: 'weapon', color: '#b07cff', home: 'void', cells: [[0, 0], [0, 1], [1, 1]],
      sockets: [{ c: 0, el: 'void' }, { c: 2, el: 'void' }], dmg: 5, desc: 'Weapon. +25% for each empty space it touches.' },
    shield: { name: 'Moon Shield', kind: 'defense', color: '#b9c6ff', home: 'moon', cells: [[0, 0], [1, 0], [0, 1], [1, 1]],
      sockets: [{ c: 0, el: 'moon' }, { c: 3, el: 'moon' }], hp: 60, armor: 1, desc: 'Defense. Adds HP and armor.' },
    plate: { name: 'Sunplate', kind: 'defense', color: '#e8d27a', home: 'sun', cells: [[0, 0], [1, 0]],
      sockets: [{ c: 0, el: 'sun' }], hp: 35, desc: 'Defense. Adds HP.' },
    pump: { name: 'Tide Pump', kind: 'support', color: '#4fc3f7', home: 'tide', cells: [[0, 0], [0, 1]],
      sockets: [{ c: 0, el: 'tide' }, { c: 1, el: 'tide' }], regen: 1.5, desc: 'Repairs the machine over time.' },
    capacitor: { name: 'Sun Capacitor', kind: 'support', color: '#ffd76b', home: 'sun', cells: [[0, 0], [1, 0]],
      sockets: [{ c: 0, el: 'sun' }], weaponAura: 0.4, desc: 'Weapons it touches deal +40%.' },
    core: { name: 'Void Core', kind: 'support', color: '#8a5cff', home: 'void', cells: [[0, 0], [1, 0], [0, 1]],
      sockets: [{ c: 0, el: 'void' }], aura: 0.35, hpPenalty: 0.15, desc: 'Everything it touches is 35% stronger, but the machine loses 15% HP.' },
    harvester: { name: 'Star Harvester', kind: 'support', color: '#9ad0c2', home: 'moon', cells: [[0, 0], [1, 0], [2, 0], [1, 1]],
      sockets: [{ c: 1, el: 'moon' }, { c: 3, el: 'tide' }], loot: 0.4, desc: '+40% chance of an extra rune from each kill.' },
  };
  const COMPONENT_KEYS = Object.keys(COMPONENTS);

  const RARITIES = {
    common: { name: 'Common', color: '#c9c9c9', mods: 0, scale: 1, curse: 0.1, essence: 2 },
    uncommon: { name: 'Uncommon', color: '#7ee787', mods: 1, scale: 1, curse: 0.2, essence: 5 },
    rare: { name: 'Rare', color: '#58a6ff', mods: 2, scale: 1.15, curse: 0.35, essence: 12 },
    epic: { name: 'Epic', color: '#bc8cff', mods: 3, scale: 1.3, curse: 0.5, essence: 30 },
    legendary: { name: 'Legendary', color: '#ffa94d', mods: 4, scale: 1.5, curse: 0.6, essence: 80 },
  };
  const RARITY_KEYS = Object.keys(RARITIES);

  // Modifiers. Buffs are good; curses (bad: true) are the price of power — rarer items roll bigger buffs and curses more often.
  // kind: where the word goes in the name. weapon: only rolls on weapons. min/max: the roll range (× rarity scale).
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
    harmony: { kind: 'suffix', name: 'of Harmony', min: 80, max: 80, fixed: true, text: () => 'wrong-element runes work at 80% instead of 40%' },
    // curses
    brittle: { kind: 'curse', name: 'Brittle', bad: true, min: 5, max: 15, text: (v) => `−${v}% machine HP` },
    unstable: { kind: 'curse', name: 'Unstable', bad: true, min: 10, max: 25, text: (v) => `−${v}% power` },
    leaky: { kind: 'curse', name: 'Leaky', bad: true, min: 0.5, max: 1.5, step: 0.1, text: (v) => `−${v} repair/s` },
    draining: { kind: 'curse', name: 'Draining', bad: true, min: 10, max: 20, text: (v) => `components it touches get −${v}% power` },
    greedy: { kind: 'curse', name: 'Greedy', bad: true, min: 10, max: 25, text: (v) => `−${v}% chance of an extra rune` },
    fragile: { kind: 'curse', name: 'Fragile', bad: true, min: 2, max: 2, fixed: true, text: () => 'twice as likely to be lost if the machine is destroyed' },
  };
  const MOD_KEYS = Object.keys(MODS);
  const BUFF_KEYS = MOD_KEYS.filter((k) => !MODS[k].bad), CURSE_KEYS = MOD_KEYS.filter((k) => MODS[k].bad);
  const modVal = (it, k) => (it.mods || []).filter((m) => m.k === k).reduce((s, m) => s + m.v, 0);

  // Element combos: the mix of runes socketed into one component (both elements present) creates an effect.
  const COMBOS = {
    flare: { name: 'Solar Flare', els: ['sun', 'ember'], text: '+40% damage' },
    twilight: { name: 'Twilight', els: ['sun', 'moon'], text: 'components it touches get +20% power' },
    steam: { name: 'Steam', els: ['tide', 'ember'], text: '+2 repair/s, but −20% damage' },
    eclipse: { name: 'Eclipse', els: ['moon', 'void'], text: '+50% damage against bosses' },
    abyss: { name: 'Abyssal Tide', els: ['tide', 'void'], text: '+35% power, but −8% machine HP' },
    pure: { name: 'Pure', els: null, text: '+30% power (every socket filled with the same element, 2+ sockets)' },
  };
  // Which combos are active given the runes actually in the component.
  function combosOf(it) {
    const runes = (it.runes || []).filter(Boolean);
    const els = new Set(runes.map((r) => r.el));
    const out = Object.keys(COMBOS).filter((k) => COMBOS[k].els && COMBOS[k].els.every((e) => els.has(e)));
    if (runes.length >= 2 && runes.length === it.runes.length && els.size === 1) out.push('pure');
    return out;
  }
  // Combos this component *could* make if its sockets were filled with the elements they ask for.
  function possibleCombos(it) {
    const socks = socketsOf(it);
    return combosOf({ runes: socks.map((s) => ({ el: s.el })) });
  }

  // ---- shapes and sockets of a specific item (dropped items carry their own; classic ones come from the archetype)
  const shapeOf = (it) => it.shape || COMPONENTS[it.type].cells;
  const socketsOf = (it) => it.sockets || COMPONENTS[it.type].sockets.map((s, i) => ({ c: s.c, el: it.sockEls?.[i] || s.el }));

  function itemName(it) {
    const defs = (it.mods || []).map((m) => MODS[m.k]);
    const curse = defs.find((d) => d.kind === 'curse'), pre = defs.find((d) => d.kind === 'prefix'), suf = defs.find((d) => d.kind === 'suffix');
    return [curse?.name, pre?.name, COMPONENTS[it.type].name, suf?.name].filter(Boolean).join(' ');
  }

  // A random connected shape of n squares (a polyomino), normalised to start at 0,0.
  function randomShape(n, rng) {
    const cells = [[0, 0]], key = (x, y) => `${x},${y}`, have = new Set([key(0, 0)]);
    while (cells.length < n) {
      const [bx, by] = cells[Math.floor(rng() * cells.length)];
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
      if (have.has(key(bx + dx, by + dy))) continue;
      have.add(key(bx + dx, by + dy)); cells.push([bx + dx, by + dy]);
    }
    const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
    return cells.map(([x, y]) => [x - mx, y - my]);
  }

  // Roll a new component. rng: () => [0,1). tierBoost shifts the odds toward rarer items.
  function rollItem(type, rng, tierBoost = 0) {
    const weights = [60, 25, 10, 4, 1].map((w, i) => w * Math.pow(1 + 0.35 * tierBoost, i));
    let x = rng() * weights.reduce((a, b) => a + b, 0), ri = 0;
    while (x > weights[ri]) { x -= weights[ri]; ri++; }
    const rarity = RARITY_KEYS[Math.min(ri, RARITY_KEYS.length - 1)], R = RARITIES[rarity];
    const def = COMPONENTS[type];
    // shape: 1–6 squares, centred on the archetype's usual size
    const size = Math.max(1, Math.min(6, def.cells.length + Math.floor(rng() * 5) - 2));
    const shape = randomShape(size, rng);
    // sockets: 1–3 (never more than squares), on random squares, each wanting the archetype's home element or a random one
    const nSock = Math.min(size, 1 + Math.floor(rng() * 3));
    const spots = shape.map((_, i) => i).sort(() => rng() - 0.5).slice(0, nSock).sort((a, b) => a - b);
    const sockets = spots.map((c) => ({ c, el: rng() < 0.45 ? def.home : ELEMENT_KEYS[Math.floor(rng() * ELEMENT_KEYS.length)] }));
    const roll = (k, scale) => { const d = MODS[k], step = d.step || 1; return { k, v: d.fixed ? d.max : +(Math.round((d.min + rng() * (d.max - d.min)) * scale / step) * step).toFixed(2) }; };
    const pool = BUFF_KEYS.filter((k) => !MODS[k].weapon || def.kind === 'weapon');
    const mods = [];
    for (let i = 0; i < R.mods && pool.length; i++) mods.push(roll(pool.splice(Math.floor(rng() * pool.length), 1)[0], R.scale));
    if (rng() < R.curse) mods.push(roll(CURSE_KEYS[Math.floor(rng() * CURSE_KEYS.length)], R.scale));
    return { type, lvl: 1, rarity, shape, sockets, mods };
  }

  // Shape cells after rotating `rot` quarter-turns clockwise, shifted back to start at 0,0. Order is kept,
  // so socket indexes still point at the same squares. Accepts an item, or an archetype name for its classic shape.
  function cellsFor(itOrType, rot) {
    let cells = (typeof itOrType === 'string' ? COMPONENTS[itOrType].cells : shapeOf(itOrType)).map(([x, y]) => [x, y]);
    for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cells = cells.map(([x, y]) => [-y, x]);
    const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
    return cells.map(([x, y]) => [x - mx, y - my]);
  }
  const levelFactor = (lvl) => 1 + 0.5 * (lvl - 1);
  // Bigger shapes are stronger (but take more room); more sockets than the classic design hold more power.
  const sizeFactor = (it) => Math.pow(shapeOf(it).length / COMPONENTS[it.type].cells.length, 0.85);
  const socketFactor = (it) => 1 + 0.2 * (socketsOf(it).length - COMPONENTS[it.type].sockets.length);

  // Which item covers each square (null = empty). Returns null if items overlap or leave the grid.
  function occupancy(m) {
    const occ = Array(m.w * m.h).fill(null);
    for (const it of m.items) {
      for (const [cx, cy] of cellsFor(it, it.rot)) {
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

  // Full stats for a machine: { dmg, hp, armor, regen, loot, bossDmg, resonance, power: { itemId }, combos: { itemId: [..] } }
  function stats(m) {
    const occ = occupancy(m) || Array(m.w * m.h).fill(null);
    const byId = Object.fromEntries(m.items.map((it) => [it.id, it]));
    const touching = {}, emptyAround = {}, combos = {};
    for (const it of m.items) { touching[it.id] = new Set(); emptyAround[it.id] = 0; combos[it.id] = combosOf(it); }
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
    const has = (it, k) => combos[it.id].includes(k);
    const base = {}, mult = {};
    for (const it of m.items) {
      base[it.id] = charge(it) * levelFactor(it.lvl) * sizeFactor(it) * socketFactor(it)
        * (1 + modVal(it, 'overcharged') / 100) * (1 - modVal(it, 'unstable') / 100)
        * (has(it, 'pure') ? 1.3 : 1) * (has(it, 'abyss') ? 1.35 : 1);
      mult[it.id] = 1;
    }
    // links: who boosts whom (for explaining the build). in = effects received, out = components it affects.
    const links = {};
    for (const it of m.items) links[it.id] = { in: [], out: [], touching: [...touching[it.id]], emptyAround: emptyAround[it.id] };
    const apply = (target, f, from, why) => {
      if (Math.abs(f - 1) < 1e-9) return;
      mult[target] *= f;
      links[target].in.push({ from, why, f });
      if (from !== null && from !== target && !links[from].out.includes(target)) links[from].out.push(target);
    };
    for (const it of m.items) {
      const def = COMPONENTS[it.type], strength = base[it.id];
      const on = strength > 0;
      for (const nid of touching[it.id]) {
        const n = byId[nid], nd = COMPONENTS[n.type];
        if (def.aura) apply(nid, 1 + def.aura * strength, it.id, 'aura');
        if (def.weaponAura && nd.kind === 'weapon') apply(nid, 1 + def.weaponAura * strength, it.id, 'weapons');
        if (it.type === 'coil' && n.type === 'coil') apply(nid, 1.5, it.id, 'coil chain');
        if (on && modVal(it, 'resonance')) apply(nid, 1 + modVal(it, 'resonance') / 100, it.id, 'of Resonance');
        if (on && has(it, 'twilight')) apply(nid, 1.2, it.id, 'Twilight');
        if (modVal(it, 'draining')) apply(nid, 1 - modVal(it, 'draining') / 100, it.id, 'Draining');
        if (modVal(it, 'pack') && nd.kind === def.kind) apply(it.id, 1 + modVal(it, 'pack') / 100, nid, 'of the Pack');
      }
      if (it.type === 'lash') apply(it.id, 1 + 0.25 * emptyAround[it.id], null, `${emptyAround[it.id]} empty square${emptyAround[it.id] === 1 ? '' : 's'} next to it`);
      // A booster with nothing in its sockets boosts nothing: flag it so the player can see why.
      links[it.id].booster = !!(def.aura || def.weaponAura || modVal(it, 'resonance') || (it.type === 'coil'));
      links[it.id].dead = !on;
    }
    const s = { dmg: 0, hp: 100, armor: 0, regen: 0, loot: 0, bossDmg: 0, power: {}, combos, links, base };
    let hpPenalty = 0, total = 0;
    for (const it of m.items) {
      const def = COMPONENTS[it.type], p = base[it.id] * mult[it.id], on = p > 0, lf = levelFactor(it.lvl);
      s.power[it.id] = p; total += p;
      const dmg = (def.dmg || 0) * p * (1 + modVal(it, 'volatile') / 100) * (has(it, 'flare') ? 1.4 : 1) * (has(it, 'steam') ? 0.8 : 1);
      s.dmg += dmg;
      s.bossDmg += dmg * (modVal(it, 'titan') / 100 + (has(it, 'eclipse') ? 0.5 : 0));
      s.hp += (def.hp || 0) * p + (on ? modVal(it, 'reinforced') * lf : 0);
      s.armor += (def.armor || 0) * p + (on ? modVal(it, 'hardened') : 0);
      s.regen += (def.regen || 0) * p + (on ? (modVal(it, 'mending') - modVal(it, 'leaky')) * lf + (has(it, 'steam') ? 2 * lf : 0) : 0);
      s.loot += (def.loot || 0) * p + (on ? (modVal(it, 'lucky') - modVal(it, 'greedy')) / 100 : 0);
      if (def.hpPenalty && on) hpPenalty += def.hpPenalty;
      if (on && modVal(it, 'volatile')) hpPenalty += 0.05;
      if (on && has(it, 'abyss')) hpPenalty += 0.08;
      hpPenalty += modVal(it, 'brittle') / 100;
    }
    s.hp = Math.round(s.hp * Math.max(0.3, 1 - hpPenalty));
    s.regen = Math.max(0, s.regen);
    s.loot = Math.max(0, s.loot);
    s.resonance = Math.round(10 * total);
    return s;
  }

  // Essence to raise a component one level (bigger shapes and higher levels cost more): ×3.5 per level.
  const upgradeCost = (it) => ({ essence: Math.ceil(8 * shapeOf(it).length * Math.pow(3.5, it.lvl - 1)) });
  // Essence from salvaging: a rune is worth the three runes it would take to fuse it; components by rarity and level.
  const runeEssence = (r) => Math.pow(3, r.rank - 1);
  const itemEssence = (it) => (RARITIES[it.rarity || 'common'].essence) * it.lvl;

  const api = { upgradeCost, runeEssence, itemEssence, RARITIES, RARITY_KEYS, MODS, COMBOS, combosOf, possibleCombos, socketsOf, shapeOf,
    itemName, rollItem, randomShape, modVal, ELEMENTS, ELEMENT_KEYS, ROMAN, MAX_RANK, MAX_LEVEL, MISMATCH, runePower, COMPONENTS, COMPONENT_KEYS,
    cellsFor, occupancy, fits, charge, stats, levelFactor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(this);

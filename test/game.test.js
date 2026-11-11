'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../game');
const Engine = require('../public/engine');

const setup = () => { const r = g.newRoom('t', 0); g.ensurePlayer(r, 'a', 'Ann', 0); g.ensurePlayer(r, 'b', 'Bo', 0); return r; };
const solo = new Set(['a']), both = new Set(['a', 'b']);
const item = (id, type, x, y, rot = 0, runes = null, lvl = 1) => ({ id, type, lvl, x, y, rot, runes: runes || Engine.COMPONENTS[type].sockets.map(() => null) });
const rune = (el, rank = 1) => ({ id: Math.random(), el, rank });
// Give a player a machine whose weapons are fully powered.
function armed(r, pid) {
  g.act(r, pid, { type: 'element', el: 'sun' }, solo, 0);
  const m = r.players[pid].machine;
  m.items.find((it) => it.type === 'lance').runes = [rune('sun'), rune('ember'), rune('sun')];
  m.items.find((it) => it.type === 'coil').runes = [rune('ember')];
  m.items.find((it) => it.type === 'shield').runes = [rune('moon'), rune('moon')];
  return m;
}

test('shapes rotate, and pieces cannot overlap or leave the grid', () => {
  assert.deepStrictEqual(Engine.cellsFor('lance', 1), [[0, 0], [0, 1], [0, 2]]);
  const m = { w: 3, h: 3, items: [item(1, 'lance', 0, 0)] };
  assert.ok(Engine.fits(m));
  assert.ok(!Engine.fits({ ...m, items: [...m.items, item(2, 'coil', 1, 0)] })); // overlap
  assert.ok(!Engine.fits({ ...m, items: [item(1, 'lance', 1, 0)] })); // sticks out
  assert.ok(Engine.fits({ ...m, items: [item(1, 'lance', 2, 0, 1)] })); // rotated upright fits
});

test('sockets: matching runes give full power, wrong elements 40%, higher ranks more', () => {
  const s = (runes) => Engine.stats({ w: 3, h: 1, items: [item(1, 'lance', 0, 0, 0, runes)] }).dmg;
  assert.strictEqual(s([rune('sun'), rune('ember'), rune('sun')]), 6);
  assert.ok(Math.abs(s([rune('moon'), rune('moon'), rune('moon')]) - 6 * 0.4) < 1e-9);
  assert.strictEqual(s([rune('sun', 2), rune('ember', 2), rune('sun', 2)]), 12);
  assert.strictEqual(s([null, null, null]), 0);
});

test('components boost what they touch: capacitor → weapons, coils chain, void core → everything (but costs HP)', () => {
  const lance = item(1, 'lance', 0, 0, 0, [rune('sun'), rune('ember'), rune('sun')]);
  const cap = item(2, 'capacitor', 0, 1, 0, [rune('sun')]);
  assert.ok(Math.abs(Engine.stats({ w: 3, h: 2, items: [lance, cap] }).dmg - 6 * 1.4) < 1e-9);
  const c1 = item(3, 'coil', 0, 0, 0, [rune('ember')]), c2 = item(4, 'coil', 1, 0, 0, [rune('ember')]);
  assert.ok(Math.abs(Engine.stats({ w: 2, h: 1, items: [c1, c2] }).dmg - 9) < 1e-9);
  const core = item(5, 'core', 0, 1, 0, [rune('void')]);
  const s = Engine.stats({ w: 3, h: 3, items: [lance, core] });
  assert.ok(Math.abs(s.dmg - 6 * 1.35) < 1e-9);
  assert.strictEqual(s.hp, 85);
  assert.ok(s.resonance > 0);
});

test('choosing an element builds a starter machine; socketing, storing and placing', () => {
  const r = setup();
  assert.match(g.act(r, 'a', { type: 'dive' }, solo, 0), /element/);
  g.act(r, 'a', { type: 'element', el: 'ember' }, solo, 0);
  const p = r.players.a, m = p.machine;
  assert.strictEqual(m.items.length, 4); assert.strictEqual(p.pouch.length, 6);
  assert.ok(Engine.fits(m));
  assert.match(g.act(r, 'a', { type: 'dive' }, solo, 0), /no working weapon/);
  const coil = m.items.find((it) => it.type === 'coil');
  const ember = p.pouch.find((q) => q.el === 'ember');
  g.act(r, 'a', { type: 'socket', itemId: coil.id, s: 0, runeId: ember.id }, solo, 0);
  assert.strictEqual(g.machineStats(p).dmg, 3);
  g.act(r, 'a', { type: 'store', itemId: coil.id }, solo, 0);
  assert.strictEqual(p.storage.length, 1);
  assert.match(g.act(r, 'a', { type: 'place', itemId: coil.id, x: 0, y: 0, rot: 0 }, solo, 0), /fit/);
  assert.strictEqual(g.act(r, 'a', { type: 'place', itemId: coil.id, x: 3, y: 1, rot: 0 }, solo, 0), null);
  assert.strictEqual(coil.runes[0].id, ember.id, 'runes stay in a component when it moves');
});

test('fusing runes, expanding the machine, giving to a friend', () => {
  const r = setup();
  g.act(r, 'a', { type: 'element', el: 'tide' }, solo, 0);
  const p = r.players.a;
  p.pouch = [rune('tide'), rune('tide'), rune('tide')];
  g.act(r, 'a', { type: 'fuseRunes', el: 'tide', rank: 1 }, solo, 0);
  assert.deepStrictEqual(p.pouch.map((q) => q.rank), [2]);
  p.storage = [item(10, 'pump', 0, 0, 0, [rune('tide'), null], 2)];
  p.essence = 100;
  g.act(r, 'a', { type: 'expand', dir: 'w' }, solo, 0);
  assert.strictEqual(p.machine.w, 5);
  g.act(r, 'a', { type: 'give', itemId: p.storage[0].id, to: g.refOf('b') }, both, 0);
  assert.strictEqual(r.players.b.storage[0].lvl, 2);
});

test('a dive fights on its own (even offline) and the machine comes home at its recall threshold', () => {
  const r = setup(); r.dust = 1e6;
  armed(r, 'a');
  assert.strictEqual(g.act(r, 'a', { type: 'dive' }, solo, 0), null);
  assert.match(g.act(r, 'a', { type: 'place', itemId: r.players.a.machine.items[0].id, x: 0, y: 0, rot: 0 }, solo, 0), /Recall/);
  g.tick(r, 30 * 60 * 1000, new Set()); // nobody online for half an hour
  assert.strictEqual(r.dive, null);
  const ld = r.players.a.lastDive;
  assert.strictEqual(ld.destroyed, false);
  assert.ok(ld.floor >= 3, String(ld.floor));
  assert.ok(r.players.a.pouch.length >= ld.runes && ld.runes >= 2);
});

test('a destroyed machine keeps half its finds and can lose installed parts', () => {
  const r = setup(); r.dust = 1e6;
  armed(r, 'a');
  r.players.a.recallPct = 0.1;
  g.act(r, 'a', { type: 'dive' }, solo, 0);
  const u = r.dive.units.a;
  u.loot.runes = Array.from({ length: 10 }, () => rune('sun'));
  u.stats.regen = 0; u.hp = 1;
  r.players.a.pouch = [];
  g.tick(r, 12000, solo);
  assert.strictEqual(r.dive, null);
  assert.strictEqual(r.players.a.lastDive.destroyed, true);
  assert.ok(r.players.a.pouch.length >= 5);
  // over many destructions, roughly 30% of installed components are lost
  let lost = 0, total = 0;
  for (let i = 0; i < 200; i++) {
    const q = setup(); q.dust = 1e6; armed(q, 'a'); q.players.a.recallPct = 0.1;
    g.act(q, 'a', { type: 'dive' }, solo, 0); q.dive.units.a.hp = 1; q.dive.units.a.stats.regen = 0;
    g.tick(q, 12000, solo);
    lost += 4 - q.players.a.machine.items.length; total += 4;
  }
  assert.ok(lost / total > 0.2 && lost / total < 0.4, String(lost / total));
});

test('overcharge clicks make your machine hit harder; linked targets need both players together', () => {
  const r = setup(); r.dust = 1e6;
  armed(r, 'a'); armed(r, 'b');
  g.act(r, 'a', { type: 'dive' }, both, 0);
  g.act(r, 'b', { type: 'dive' }, both, 0);
  assert.strictEqual(Object.keys(r.dive.units).length, 2);
  for (let i = 0; i < 10; i++) g.act(r, 'a', { type: 'hit', acc: 1, combo: i }, both, 100 + i * 100);
  assert.ok(r.dive.units.a.charge > 1, String(r.dive.units.a.charge));
  g.tick(r, 1500, both); // enemy spawns
  r.dive.enemy.hp = r.dive.enemy.maxHp = 1e9;
  r.dive.units.a.stats.hp = r.dive.units.b.stats.hp = r.dive.units.a.hp = r.dive.units.b.hp = 1e9;
  r.dive.nextLinkAt = 0; g.tick(r, 1750, both);
  const link = r.dive.links[0];
  assert.ok(link, 'a link spawned');
  assert.strictEqual(g.view(r, link.a, both, 1750).dive.links.length, 1);
  const hp = r.dive.enemy.hp;
  g.act(r, link.a, { type: 'linkHit', id: link.id, acc: 1 }, both, 1800);
  g.act(r, link.b, { type: 'linkHit', id: link.id, acc: 1 }, both, 2000);
  assert.ok(hp - r.dive.enemy.hp > 100, String(hp - r.dive.enemy.hp));
  assert.match(r.feed.at(-1).text, /Linked strike/);
});

test('stronger machines unlock higher tiers; higher tiers are tougher', () => {
  const r = setup();
  const m = armed(r, 'a');
  m.items.find((it) => it.type === 'lance').runes = [rune('sun', 5), rune('ember', 5), rune('sun', 5)]; // 160 Resonance
  g.act(r, 'a', { type: 'unsocket', itemId: m.items[1].id, s: 0 }, solo, 0); // any edit re-checks tiers
  assert.ok(r.maxTier >= 3, String(r.maxTier));
  r.dust = 1e9;
  g.act(r, 'a', { type: 'dive', tier: 3 }, solo, 0);
  g.tick(r, 1500, solo);
  assert.ok(r.dive.enemy.maxHp > 60 * 2.5);
});

test('worlds from older versions keep players, elements and runes (stardust and buildings are gone)', () => {
  const old = { version: 3, id: 'old', lastTick: 0, dust: 5000, buildings: { telescope: 4 }, cloth: 1, maxTier: 2, nextRuneId: 50,
    engine: { size: 3, grid: [{ id: 7, el: 'sun', rank: 2 }, null] },
    players: { a: { name: 'Ann', el: 'moon', pouch: [{ id: 8, el: 'moon', rank: 1 }] }, b: { name: 'Bo', el: null, pouch: [] } }, feed: [], bestFloor: 6 };
  const r = g.normalize(old);
  assert.strictEqual(r.version, 7);
  assert.strictEqual(r.dust, undefined); assert.strictEqual(r.buildings, undefined);
  assert.strictEqual(r.maxTier, 1, 'tiers are re-measured from actual machines (starters have no runes socketed)');
  assert.strictEqual(r.players.a.el, 'moon');
  assert.ok(r.players.a.machine && r.players.a.machine.items.length === 4);
  assert.strictEqual(r.players.b.machine, null);
  assert.strictEqual(r.players.a.pouch.length + r.players.b.pouch.length, 2);
  assert.strictEqual(g.normalize(r), r);
});

test('tier curve: 30, 66, 145, 319, … (×2.2); worlds from the Star Engine era get their tier re-measured', () => {
  assert.deepStrictEqual([2, 3, 4, 5, 8].map(g.tierReq), [30, 66, 145, 319, 3401]);
  assert.strictEqual(g.tierFor(105), 3);
  const r = setup(); const m = armed(r, 'a');
  r.version = 4; r.maxTier = 7; // a v4 save carried over an old-scale tier
  const res = g.machineStats(r.players.a).resonance;
  g.normalize(r);
  assert.strictEqual(r.version, 7);
  assert.strictEqual(r.maxTier, g.tierFor(res));
  assert.strictEqual(r.players.a.essence, 60 + 60, 'starter Essence from choosing an element, plus the observatory refund');
  assert.strictEqual(r.players.a.machine.items[0].rarity, 'common');
  assert.ok(r.feed.some((f) => /re-measured/.test(f.text)));
});

test('salvaging runes and components into Essence; upgrades and grid space cost Essence', () => {
  const r = setup(); const m = armed(r, 'a'); const p = r.players.a;
  p.essence = 0;
  p.pouch = [rune('tide', 1), rune('tide', 3)];
  g.act(r, 'a', { type: 'salvage', runeIds: p.pouch.map((q) => q.id) }, solo, 0);
  assert.strictEqual(p.essence, 1 + 9);
  p.storage = [{ ...item(20, 'coil', 0, 0, 0, [rune('ember')], 2), rarity: 'epic', mods: [] }];
  g.act(r, 'a', { type: 'salvage', itemId: 20 }, solo, 0);
  assert.strictEqual(p.essence, 10 + 60, 'epic (30) × level 2');
  assert.strictEqual(p.pouch.length, 1, 'its rune came back');
  const lance = m.items.find((it) => it.type === 'lance');
  p.essence = 5;
  assert.match(g.act(r, 'a', { type: 'upgrade', itemId: lance.id }, solo, 0), /24 Essence/);
  p.essence = 100;
  g.act(r, 'a', { type: 'upgrade', itemId: lance.id }, solo, 0);
  assert.strictEqual(lance.lvl, 2); assert.strictEqual(p.essence, 76);
  p.essence = 1000;
  g.act(r, 'a', { type: 'expand', dir: 'w' }, solo, 0);
  g.act(r, 'a', { type: 'expand', dir: 'h' }, solo, 0);
  assert.strictEqual(p.essence, 1000 - 60 - 180);
  assert.strictEqual(g.view(r, 'a', solo, 0).you.expandCost, 540);
  assert.match(g.act(r, 'a', { type: 'buy', key: 'telescope' }, solo, 0), /Unknown/);
});

test('every kill drops Essence; diving is free; destroyed machines keep half', () => {
  const r = setup(); armed(r, 'a'); const p = r.players.a;
  const before = p.essence;
  assert.strictEqual(g.act(r, 'a', { type: 'dive' }, solo, 0), null);
  r.dive.units.a.stats.hp = r.dive.units.a.hp = 1e9;
  g.tick(r, 1500, solo); r.dive.enemy.hp = 1; g.tick(r, 1750, solo); // floor 1
  assert.strictEqual(r.dive.units.a.loot.essence, g.essenceFor(1, 1, false));
  g.act(r, 'a', { type: 'recall' }, solo, 2000);
  assert.strictEqual(p.essence, before + g.essenceFor(1, 1, false));
  assert.ok(g.essenceFor(3, 10, true) > 20 * g.essenceFor(1, 1, false), 'deep floors, high tiers and bosses pay much more');
});

test('rolled components: rarities, random sockets and modifiers that change stats', () => {
  let s = 7; const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const counts = {};
  for (let i = 0; i < 3000; i++) { const it = Engine.rollItem('lance', rng, 0); counts[it.rarity] = (counts[it.rarity] || 0) + 1; assert.strictEqual(it.mods.length, Engine.RARITIES[it.rarity].mods); }
  assert.ok(counts.common > counts.uncommon && counts.uncommon > counts.rare && counts.rare > counts.epic);
  const deep = {}; for (let i = 0; i < 3000; i++) { const it = Engine.rollItem('lance', rng, 8); deep[it.rarity] = (deep[it.rarity] || 0) + 1; }
  assert.ok((deep.legendary || 0) > (counts.legendary || 0) * 5, 'deeper tiers roll rarer loot');
  // modifiers
  const base = (mods, runes, sockEls) => Engine.stats({ w: 3, h: 1, items: [{ ...item(1, 'lance', 0, 0, 0, runes), mods, sockEls }] });
  const full = [rune('sun'), rune('ember'), rune('sun')];
  assert.ok(Math.abs(base([{ k: 'overcharged', v: 20 }], full).dmg - 7.2) < 1e-9);
  assert.ok(Math.abs(base([{ k: 'titan', v: 50 }], full).bossDmg - 3) < 1e-9);
  const wrong = [rune('moon'), rune('moon'), rune('moon')];
  assert.ok(Math.abs(base([{ k: 'harmony', v: 80 }], wrong).dmg - 6 * 0.8) < 1e-9);
  assert.strictEqual(base([], wrong, ['moon', 'moon', 'moon']).dmg, 6, 'an item whose sockets rolled Moon wants Moon');
  assert.strictEqual(Engine.itemName({ type: 'lance', mods: [{ k: 'volatile', v: 30 }, { k: 'titan', v: 50 }] }), 'Volatile Prism Lance of the Titan');
});

test('boss kills drop rolled components', () => {
  const r = setup(); r.dust = 1e9; armed(r, 'a');
  g.act(r, 'a', { type: 'dive' }, solo, 0);
  r.dive.floor = 5; r.dive.units.a.stats.hp = r.dive.units.a.hp = 1e9;
  g.tick(r, 1500, solo);
  assert.ok(r.dive.enemy.boss);
  r.dive.enemy.hp = 1;
  g.tick(r, 1750, solo);
  const c = r.dive.units.a.loot.comps[0];
  assert.ok(c && Engine.RARITIES[c.rarity] && Array.isArray(c.mods) && c.runes.length === Engine.COMPONENTS[c.type].sockets.length);
});

test('formation: machines diving together hit harder than the same machines alone', () => {
  const dmgIn = (n) => {
    const r = g.newRoom('f', 0); const on = new Set();
    for (let i = 0; i < n; i++) { g.ensurePlayer(r, 'p' + i, 'P' + i, 0); on.add('p' + i); armed(r, 'p' + i); }
    r.dust = 1e9;
    for (const id of on) g.act(r, id, { type: 'dive' }, on, 0);
    g.tick(r, 1500, on); // enemy spawns
    r.dive.enemy.hp = r.dive.enemy.maxHp = 1e9;
    const before = r.dive.enemy.hp;
    g.tick(r, 2500, on);
    return { perMachine: (before - r.dive.enemy.hp) / n, view: g.view(r, 'p0', on, 2500).dive.formation };
  };
  const one = dmgIn(1), three = dmgIn(3);
  assert.ok(Math.abs(three.perMachine / one.perMachine - 1.3) < 1e-6);
  assert.strictEqual(three.view, 1.3);
});

test('blocking: the targeted player can stop an incoming attack; a perfect block hits back', () => {
  const r = setup(); r.dust = 1e9;
  armed(r, 'a');
  g.act(r, 'a', { type: 'dive' }, solo, 0);
  g.tick(r, 1500, solo); // enemy spawns and aims at Ann
  const e = r.dive.enemy;
  e.hp = e.maxHp = 1e6;
  const inc = g.view(r, 'a', solo, 1500).dive.incoming;
  assert.ok(inc && inc.id === e.attackId);
  assert.strictEqual(g.act(r, 'a', { type: 'block', id: inc.id, acc: 0.95 }, solo, e.nextAttackAt - 1000), null);
  assert.ok(e.hp < 1e6, 'a perfect block hits back');
  const hp = r.dive.units.a.hp;
  g.tick(r, e.nextAttackAt + 10, solo);
  assert.strictEqual(r.dive.units.a.hp >= hp, true, 'the blocked attack did no damage');
  // the next attack lands if nobody blocks it
  const hp2 = r.dive.units.a.hp;
  g.tick(r, r.dive.enemy.nextAttackAt + 10, solo);
  assert.ok(r.dive.units.a.hp < hp2 + r.dive.units.a.stats.regen * 7);
  // too early doesn't count
  const inc2 = g.view(r, 'a', solo, 0).dive.incoming;
  g.act(r, 'a', { type: 'block', id: inc2.id, acc: 1 }, solo, r.dive.enemy.nextAttackAt - 5000);
  assert.strictEqual(r.dive.enemy.blocked, null);
});

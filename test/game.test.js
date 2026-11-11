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

test('idle: buildings produce stardust while everyone is away', () => {
  const r = setup(); r.buildings.telescope = 10;
  g.tick(r, 3600 * 1000);
  assert.strictEqual(Math.round(r.dust), 36000);
});

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

test('fusing runes and components, expanding the machine, giving to a friend', () => {
  const r = setup(); r.dust = 1e6;
  g.act(r, 'a', { type: 'element', el: 'tide' }, solo, 0);
  const p = r.players.a;
  p.pouch = [rune('tide'), rune('tide'), rune('tide')];
  g.act(r, 'a', { type: 'fuseRunes', el: 'tide', rank: 1 }, solo, 0);
  assert.deepStrictEqual(p.pouch.map((q) => q.rank), [2]);
  p.storage = [item(10, 'pump', 0, 0, 0, [rune('tide'), null]), item(11, 'pump', 0, 0), item(12, 'pump', 0, 0)];
  g.act(r, 'a', { type: 'fuseComps', compType: 'pump', lvl: 1 }, solo, 0);
  assert.strictEqual(p.storage.length, 1); assert.strictEqual(p.storage[0].lvl, 2);
  assert.strictEqual(p.pouch.length, 2, 'runes inside fused components come back');
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

test('worlds from older versions keep stardust, buildings, players, elements and runes', () => {
  const old = { version: 3, id: 'old', lastTick: 0, dust: 5000, buildings: { telescope: 4 }, cloth: 1, maxTier: 2, nextRuneId: 50,
    engine: { size: 3, grid: [{ id: 7, el: 'sun', rank: 2 }, null] },
    players: { a: { name: 'Ann', el: 'moon', pouch: [{ id: 8, el: 'moon', rank: 1 }] }, b: { name: 'Bo', el: null, pouch: [] } }, feed: [], bestFloor: 6 };
  const r = g.normalize(old);
  assert.strictEqual(r.version, 5);
  assert.strictEqual(r.dust, 5000);
  assert.strictEqual(r.maxTier, 1, 'tiers are re-measured from actual machines (starters have no runes socketed)');
  assert.strictEqual(r.players.a.el, 'moon');
  assert.ok(r.players.a.machine && r.players.a.machine.items.length === 4);
  assert.strictEqual(r.players.b.machine, null);
  assert.strictEqual(r.players.a.pouch.length + r.players.b.pouch.length, 2);
  assert.strictEqual(g.normalize(r), r);
});

test('tier curve: 30, 75, 135, 210, …; worlds from the Star Engine era get their tier re-measured', () => {
  assert.deepStrictEqual([2, 3, 4, 5, 8].map(g.tierReq), [30, 75, 135, 210, 525]);
  assert.strictEqual(g.tierFor(105), 3);
  const r = setup(); const m = armed(r, 'a');
  r.version = 4; r.maxTier = 7; // a v4 save carried over an old-scale tier
  const res = g.machineStats(r.players.a).resonance;
  g.normalize(r);
  assert.strictEqual(r.version, 5);
  assert.strictEqual(r.maxTier, g.tierFor(res));
  assert.match(r.feed.at(-1).text, /re-measured/);
});

test('stardust upgrades components and buys component crates', () => {
  const r = setup(); const m = armed(r, 'a');
  const lance = m.items.find((it) => it.type === 'lance');
  const dmg = g.machineStats(r.players.a).dmg;
  assert.match(g.act(r, 'a', { type: 'upgrade', itemId: lance.id }, solo, 0), /3,000 stardust/);
  r.dust = 1e7;
  g.act(r, 'a', { type: 'upgrade', itemId: lance.id }, solo, 0);
  assert.strictEqual(lance.lvl, 2);
  assert.strictEqual(r.dust, 1e7 - 3000);
  assert.ok(Math.abs(g.machineStats(r.players.a).dmg - (dmg + 3)) < 1e-9); // the Lance goes from 6 to 9 damage/s
  g.act(r, 'a', { type: 'crate' }, solo, 0);
  g.act(r, 'a', { type: 'crate' }, solo, 0);
  assert.strictEqual(r.players.a.storage.length, 2);
  assert.strictEqual(r.dust, 1e7 - 3000 - 5000 - 8000);
});

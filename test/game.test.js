'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../game');
const Engine = require('../public/engine');

const setup = () => { const r = g.newRoom('t', 0); g.ensurePlayer(r, 'a', 'Ann', 0); g.ensurePlayer(r, 'b', 'Bo', 0); return r; };
const solo = new Set(['a']), both = new Set(['a', 'b']);
const R = (el, rank = 1) => ({ el, rank });
const killEnemy = (r, t, on = solo) => { while (r.run && r.run.phase === 'fight') { t += 100; g.act(r, 'a', { type: 'hit', acc: 1, combo: 10 }, on, t); } return t; };

test('idle: buildings produce stardust while everyone is away', () => {
  const r = setup(); r.buildings.telescope = 10;
  g.tick(r, 3600 * 1000);
  assert.strictEqual(Math.round(r.dust), 36000);
});

test('harmony multiplies clicks from different players', () => {
  const r = setup();
  g.act(r, 'a', { type: 'click' }, both, 1000);
  const before = r.dust;
  g.act(r, 'b', { type: 'click' }, both, 1500);
  assert.strictEqual(r.dust - before, 2);
});

test('engine rules: sun boosts neighbours, moon loves sun, tide chains, ember fizzles, void boosts its row', () => {
  const s = (grid) => Engine.score(grid, 3).total;
  assert.strictEqual(s([R('sun'), R('ember'), null, null, null, null, null, null, null]), 10 + 30); // ember ×2 ×1.5
  assert.strictEqual(s([R('sun'), R('moon'), null, null, null, null, null, null, null]), 10 + 30); // moon ×2 ×1.5
  assert.strictEqual(s([R('tide'), R('tide'), R('tide'), null, null, null, null, null, null]), 14 + 18 + 14);
  assert.strictEqual(s([R('tide'), R('ember'), null, null, null, null, null, null, null]), 10 + 0);
  assert.strictEqual(s([R('void'), null, R('tide'), null, null, null, null, null, null]), 10 + 15); // row boost, not touching
  assert.strictEqual(s([R('void'), R('tide'), null, null, null, null, null, null, null]), 10 + 8); // ×1.5 ×0.5 → 7.5
  assert.strictEqual(Engine.score([R('sun', 3), null, null, null, null, null, null, null, null], 3).total, 40); // rank III = 4×
});

test('choosing an element gives starter runes; placing, swapping and unsocketing', () => {
  const r = setup();
  g.act(r, 'a', { type: 'element', el: 'sun' }, solo, 0);
  assert.strictEqual(r.players.a.pouch.length, 3);
  g.act(r, 'a', { type: 'element', el: 'moon' }, solo, 0); // changing later: no extra runes
  assert.strictEqual(r.players.a.pouch.length, 3);
  const [x, y] = r.players.a.pouch;
  g.act(r, 'a', { type: 'place', runeId: x.id, socket: 4 }, solo, 0);
  assert.strictEqual(g.resonance(r), 10);
  g.act(r, 'a', { type: 'place', runeId: y.id, socket: 4 }, solo, 0); // swap
  assert.strictEqual(r.engine.grid[4].id, y.id);
  assert.ok(r.players.a.pouch.some((q) => q.id === x.id));
  g.act(r, 'a', { type: 'unsocket', socket: 4 }, solo, 0);
  assert.strictEqual(r.engine.grid[4], null);
  assert.strictEqual(r.players.a.pouch.length, 3);
  assert.match(r.feed.at(-1).text, /Resonance 10 → 0/);
});

test('resonance boosts production; reaching thresholds unlocks tiers and grows the engine', () => {
  const r = setup(); r.buildings.telescope = 10;
  assert.strictEqual(g.dps(r), 10);
  r.players.a.pouch = [{ id: 900, el: 'sun', rank: 4 }, { id: 901, el: 'moon', rank: 4 }, { id: 902, el: 'moon', rank: 4 }];
  g.act(r, 'a', { type: 'place', runeId: 900, socket: 4 }, solo, 0);
  g.act(r, 'a', { type: 'place', runeId: 901, socket: 1 }, solo, 0);
  assert.strictEqual(r.engine.size, 4, 'two runes already unlocked enough tiers to grow the engine');
  g.act(r, 'a', { type: 'place', runeId: 902, socket: 1 * 4 + 0 }, solo, 0); // row B, column 1 in the 4×4 grid
  assert.strictEqual(g.resonance(r), 80 + 240 + 240);
  assert.ok(Math.abs(g.dps(r) - 10 * (1 + 5.6)) < 1e-9);
  assert.ok(r.maxTier >= 5, String(r.maxTier));
  // runes keep their row/column when the engine grows
  assert.strictEqual(r.engine.grid[1 * 4 + 1].id, 900);
  assert.strictEqual(g.resonance(r), 560);
});

test('merging three identical runes makes one of the next rank; giving runes to a friend', () => {
  const r = setup();
  r.players.a.pouch = [{ id: 1, el: 'tide', rank: 2 }, { id: 2, el: 'tide', rank: 2 }, { id: 3, el: 'tide', rank: 2 }, { id: 4, el: 'sun', rank: 1 }];
  g.act(r, 'a', { type: 'merge', el: 'tide', rank: 2 }, solo, 0);
  assert.deepStrictEqual(r.players.a.pouch.map((q) => `${q.el}${q.rank}`).sort(), ['sun1', 'tide3']);
  assert.match(g.act(r, 'a', { type: 'merge', el: 'sun', rank: 1 }, solo, 0), /3 identical/);
  g.act(r, 'a', { type: 'give', runeId: 4, to: g.refOf('b') }, both, 0);
  assert.strictEqual(r.players.b.pouch[0].el, 'sun');
  assert.strictEqual(r.players.a.pouch.length, 1);
});

test('every runner gets their own runes, mostly of their element; retreat keeps them, falling keeps half', () => {
  const r = setup(); r.dust = 1e6;
  r.players.a.el = 'ember'; r.players.b.el = 'tide';
  g.act(r, 'a', { type: 'startRun' }, both, 0);
  let t = 0;
  for (let floor = 0; floor < 3; floor++) {
    t = killEnemy(r, t, both);
    t += 1500;
    g.act(r, 'a', { type: 'boon', key: r.run.drafts.a[0] }, both, t);
    if (floor < 2) g.act(r, 'b', { type: 'boon', key: r.run.drafts.b[0] }, both, t);
  }
  assert.strictEqual(r.run.members.a.loot.length >= 3, true);
  g.act(r, 'b', { type: 'retreat' }, both, t);
  assert.strictEqual(r.run, null);
  assert.ok(r.players.a.pouch.length >= 3 && r.players.b.pouch.length >= 3);
  // element bias over many drops
  const r2 = setup(); r2.players.a.el = 'void'; r2.dust = 1e6;
  g.act(r2, 'a', { type: 'startRun' }, solo, 0);
  r2.run.members.a.loot = Array.from({ length: 400 }, () => ({ el: Math.random() < 0.5 ? 'void' : 'sun', rank: 1 }));
  r2.run.members.a.loot = [];
  let own = 0;
  for (let i = 0; i < 400; i++) { r2.run.enemy.hp = 1; r2.run.phase = 'fight'; g.act(r2, 'a', { type: 'hit', acc: 1, combo: 0 }, solo, 1000 + i * 100); }
  own = r2.run.members.a.loot.filter((q) => q.el === 'void').length / r2.run.members.a.loot.length;
  assert.ok(own > 0.65 && own < 0.85, String(own));
  // falling keeps half
  r2.run.phase = 'fight'; r2.run.members.a.loot = r2.run.members.a.loot.slice(0, 10);
  r2.run.enemy.hp = 1e12; r2.run.enemy.nextAttackAt = 0;
  g.tick(r2, 10 * 60 * 1000, solo);
  assert.strictEqual(r2.run, null);
  assert.strictEqual(r2.players.a.pouch.length, 5);
});

test('higher tiers: tougher enemies and higher-rank runes', () => {
  const r = setup(); r.dust = 1e9; r.maxTier = 5;
  assert.match(g.act(r, 'a', { type: 'startRun', tier: 9 }, solo, 0) || '', /^$/); // clamps to the max unlocked tier
  assert.strictEqual(r.run.tier, 5);
  assert.ok(r.run.enemy.maxHp > 120 * 4);
  killEnemy(r, 0);
  assert.ok(r.run.members.a.loot.every((q) => q.rank >= 3));
});

test('linked targets: both runners hitting together deals a big hit; too far apart fails', () => {
  const r = setup(); r.dust = 1e6;
  g.act(r, 'a', { type: 'startRun' }, both, 0);
  r.run.enemy.hp = r.run.enemy.maxHp = 1e9;
  g.tick(r, 5000, both); // a link spawns within a few seconds when 2+ runners are online
  let link = r.run.links[0];
  assert.ok(link, 'a link spawned');
  const va = g.view(r, link.a, both, 5000).run.links, vb = g.view(r, link.b, both, 5000).run.links;
  assert.strictEqual(va.length, 1); assert.strictEqual(vb.length, 1);
  const hp = r.run.enemy.hp;
  g.act(r, link.a, { type: 'linkHit', id: link.id, acc: 1, combo: 0 }, both, 5100);
  assert.strictEqual(r.run.enemy.hp, hp, 'nothing happens until the partner hits');
  g.act(r, link.b, { type: 'linkHit', id: link.id, acc: 1, combo: 0 }, both, 5400);
  const linkedDmg = hp - r.run.enemy.hp;
  assert.ok(linkedDmg > 50, String(linkedDmg));
  assert.match(r.feed.at(-1).text, /Linked strike/);
  // a late partner breaks it
  r.run.nextLinkAt = 0; g.tick(r, 6000, both);
  link = r.run.links[0];
  g.act(r, link.a, { type: 'linkHit', id: link.id, acc: 1, combo: 0 }, both, 6100);
  const hp2 = r.run.enemy.hp;
  g.act(r, link.b, { type: 'linkHit', id: link.id, acc: 1, combo: 0 }, both, 7000);
  assert.strictEqual(r.run.enemy.hp, hp2);
  assert.strictEqual(r.run.linkResults.at(-1).ok, false);
  // solo runs never get links
  const s = setup(); s.dust = 1e6;
  g.act(s, 'a', { type: 'startRun' }, solo, 0);
  s.run.enemy.hp = 1e9;
  g.tick(s, 20000, solo);
  assert.strictEqual(s.run.links.length, 0);
});

test('worlds from older versions keep stardust, buildings, players and best floor', () => {
  const old = { version: 2, id: 'old', lastTick: 0, dust: 5000, totalDust: 9000, buildings: { telescope: 4, dome: 2 }, cloth: 1,
    res: { shards: 7 }, relics: { echo: 2 }, players: { a: { name: 'Ann', contributed: 5 } }, feed: [], bestFloor: 6 };
  const r = g.normalize(old);
  assert.strictEqual(r.version, 3);
  assert.strictEqual(r.dust, 5000);
  assert.strictEqual(r.buildings.dome, 2);
  assert.strictEqual(r.cloth, 1);
  assert.deepStrictEqual(r.players.a.pouch, []);
  assert.strictEqual(r.players.a.el, null);
  assert.strictEqual(r.bestFloor, 6);
  assert.strictEqual(g.normalize(r), r);
});

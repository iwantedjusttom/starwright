'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../game');

const setup = () => { const r = g.newRoom('t', 0); g.ensurePlayer(r, 'a', 'Ann', 0); g.ensurePlayer(r, 'b', 'Bo', 0); return r; };
const on = new Set(['a']);
// Fight the current enemy to death with perfect hits; returns the time afterwards.
const killEnemy = (r, t) => { while (r.run && r.run.phase === 'fight') { t += 100; g.act(r, 'a', { type: 'hit', acc: 1, combo: 10 }, on, t); } return t; };

test('idle: buildings produce stardust, including while everyone is away', () => {
  const r = setup(); r.buildings.telescope = 10;
  g.tick(r, 3600 * 1000);
  assert.strictEqual(Math.round(r.dust), 36000);
});

test('harmony multiplies clicks from different players', () => {
  const r = setup(); const both = new Set(['a', 'b']);
  g.act(r, 'a', { type: 'click' }, both, 1000);
  const before = r.dust;
  g.act(r, 'b', { type: 'click' }, both, 1500);
  assert.strictEqual(r.dust - before, 2);
});

test('buildings are revealed one at a time', () => {
  const r = setup(); r.dust = 1e6;
  assert.deepStrictEqual(g.view(r, 'a', on, 0).buildings.map((b) => b.key), ['telescope']);
  g.act(r, 'a', { type: 'buy', key: 'telescope' }, on, 0);
  assert.deepStrictEqual(g.view(r, 'a', on, 0).buildings.map((b) => b.key), ['telescope', 'chart']);
});

test('opening the Rift costs stardust', () => {
  const r = setup(); r.buildings.telescope = 10; // 10/s → 1,800 to open
  r.dust = 1000;
  assert.match(g.act(r, 'a', { type: 'startRun' }, on, 0), /1,800/);
  r.dust = 2000;
  assert.strictEqual(g.act(r, 'a', { type: 'startRun' }, on, 0), null);
  assert.strictEqual(r.dust, 200);
});

test('loot: shards everywhere, iron from floor 3, pearls from bosses', () => {
  const r = setup(); r.dust = 1e6;
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  const run = r.run;
  assert.deepStrictEqual(g.lootFor(r, run, 1, false), { shards: 1, iron: 0, pearls: 0 });
  assert.deepStrictEqual(g.lootFor(r, run, 3, false), { shards: 2, iron: 1, pearls: 0 });
  assert.deepStrictEqual(g.lootFor(r, run, 5, true), { shards: 12, iron: 5, pearls: 1 });
});

test('a run: fight, draft a boon, retreat keeps all the loot', () => {
  const r = setup(); r.dust = 1e6;
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  let t = killEnemy(r, 0);
  assert.strictEqual(r.run.phase, 'draft');
  assert.strictEqual(r.run.loot.shards, 1);
  g.act(r, 'a', { type: 'boon', key: r.run.drafts.a[0] }, on, t + 200); // too soon after the kill: ignored
  assert.ok(r.run.drafts.a);
  g.act(r, 'a', { type: 'boon', key: r.run.drafts.a[0] }, on, t + 1500);
  assert.strictEqual(r.run.floor, 2);
  t = killEnemy(r, t + 1500);
  g.act(r, 'a', { type: 'retreat' }, on, t);
  assert.strictEqual(r.run, null);
  assert.strictEqual(r.res.shards, 2);
  assert.strictEqual(r.lastRun.retreated, true);
});

test('falling keeps half; the Rift freezes while the whole party is away', () => {
  const r = setup(); r.dust = 1e6;
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  r.run.loot = { shards: 9, iron: 5, pearls: 1 };
  g.tick(r, 10 * 60 * 1000, new Set()); // everyone away: frozen
  assert.ok(r.run);
  g.tick(r, 20 * 60 * 1000, on); // back, and nobody fights
  assert.strictEqual(r.run, null);
  assert.deepStrictEqual(r.res, { shards: 4, iron: 2, pearls: 0 });
  assert.strictEqual(r.bestFloor, 1);
  // stray clicks right after a run ends can't open a new one
  assert.strictEqual(g.act(r, 'a', { type: 'startRun' }, on, 20 * 60 * 1000 + 500), null);
  assert.strictEqual(r.run, null);
});

test('rift hits: accuracy and combo matter; hits are rate-limited', () => {
  const r = setup(); r.dust = 1e6;
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  r.run.enemy.hp = r.run.enemy.maxHp = 1e9;
  const dmg = (acc, combo, t) => { const b = r.run.enemy.hp; g.act(r, 'a', { type: 'hit', acc, combo }, on, t); return b - r.run.enemy.hp; };
  const graze = dmg(0, 0, 1000), bull = dmg(1, 0, 2000), comboBull = dmg(1, 20, 3000);
  assert.ok(bull > graze * 3);
  assert.ok(Math.abs(comboBull / bull - 2) < 1e-9);
  assert.strictEqual(dmg(1, 0, 3010), 0);
});

test('relics cost Rift loot and boost idle and Rift', () => {
  const r = setup(); r.buildings.telescope = 10;
  assert.match(g.act(r, 'a', { type: 'relic', key: 'echo' }, on, 0), /Not enough loot/);
  r.res = { shards: 100, iron: 100, pearls: 100 };
  g.act(r, 'a', { type: 'relic', key: 'echo' }, on, 0);
  assert.strictEqual(g.dps(r), 11);
  assert.strictEqual(r.res.shards, 96);
  for (let i = 0; i < 7; i++) g.act(r, 'a', { type: 'relic', key: 'sight' }, on, 0);
  assert.strictEqual(r.relics.sight, 5);
  r.dust = 1e6;
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  const base = g.view(r, 'a', on, 0).run.arena.radius;
  assert.ok(base > 39, String(base));
});

test('worlds from older versions keep stardust, buildings, shards and iron', () => {
  const old = { id: 'old', lastTick: 0, createdAt: 0, dust: 5000, totalDust: 9000, shards: 7, upgrades: { telescope: 4, dome: 2, cloth: 1, ink: 3 },
    workshop: { iron: 3, aether: 99 }, perks: { echo: 2, hull: 1, keen: 3 }, gear: { blade: 1, ward: 1 }, players: { a: { name: 'Ann', lens: 'rows', contributed: 5 } }, feed: [], puzzle: {}, crewLevel: 5, bestFloor: 6 };
  const r = g.normalize(old);
  assert.strictEqual(r.dust, 5000);
  assert.strictEqual(r.buildings.telescope, 4);
  assert.strictEqual(r.buildings.dome, 2);
  assert.strictEqual(r.cloth, 1);
  assert.deepStrictEqual(r.res, { shards: 7, iron: 3, pearls: 0 });
  assert.strictEqual(r.bestFloor, 6);
  assert.deepStrictEqual([r.relics.echo, r.relics.blade, r.relics.ward], [2, 1, 2]);
  assert.strictEqual(r.players.a.lens, undefined);
  assert.strictEqual(r.puzzle, undefined);
  assert.strictEqual(g.normalize(r), r); // already current
});

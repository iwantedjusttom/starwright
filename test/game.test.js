'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../game');

const gateReady = (r) => { r.gate = 3; r.cells = 3; r.dust = 1e5; };
const setup = () => { const r = g.newRoom('t', 0); g.ensurePlayer(r, 'a', 'Ann', 0); g.ensurePlayer(r, 'b', 'Bo', 0); return r; };

test('the true solution passes every lens', () => {
  for (let lvl = 0; lvl < 5; lvl++) {
    const p = g.makePuzzle(lvl);
    p.stars.forEach((i) => (p.board[i] = 1));
    assert.deepStrictEqual(g.checkGuess(p), []);
  }
});

test('a wrong guess names disagreeing lenses and locks', () => {
  const r = setup();
  assert.strictEqual(g.act(r, 'a', { type: 'submit' }, new Set(['a']), 1000), null);
  assert.ok(r.puzzle.lockedUntil > 1000);
  assert.match(r.feed.at(-1).text, /disagree/);
});

test('solving relights a constellation and multiplies', () => {
  const r = setup();
  r.puzzle.stars.forEach((i) => (r.puzzle.board[i] = 1));
  g.act(r, 'a', { type: 'submit' }, new Set(['a']), 1000);
  assert.strictEqual(r.level, 1);
  assert.strictEqual(r.mult, 1.25);
  assert.strictEqual(r.puzzle.size, 6);
});

test('only one online player per lens; solo switching has a cooldown', () => {
  const r = setup(); const on = new Set(['a', 'b']);
  assert.strictEqual(g.act(r, 'a', { type: 'attune', lens: 'rows' }, on, 0), null);
  assert.match(g.act(r, 'b', { type: 'attune', lens: 'rows' }, on, 0), /already/);
  assert.match(g.act(r, 'a', { type: 'attune', lens: 'cols' }, on, 1000), /adjusting/);
  assert.strictEqual(g.act(r, 'a', { type: 'attune', lens: 'cols' }, on, 6 * 60 * 1000), null);
});

test('offline idle: production and charting continue, eventually charting the whole sky', () => {
  const r = setup(); r.upgrades.telescope = 10;
  g.tick(r, 3 * 24 * 3600 * 1000);
  assert.ok(r.dust > 2e6);
  assert.strictEqual(r.puzzle.revealed, r.puzzle.stars.length);
  assert.deepStrictEqual(g.checkGuess(r.puzzle), []);
});

test('harmony multiplies clicks from different players', () => {
  const r = setup(); const on = new Set(['a', 'b']);
  g.act(r, 'a', { type: 'click' }, on, 1000);
  const before = r.dust;
  g.act(r, 'b', { type: 'click' }, on, 1500);
  assert.strictEqual(r.dust - before, 2);
});

test('rift run: launch, fight, draft, retreat banks shards', () => {
  const r = setup(); const on = new Set(['a', 'b']);
  gateReady(r);
  assert.strictEqual(g.act(r, 'a', { type: 'startRun' }, on, 0), null);
  assert.strictEqual(Object.keys(r.run.members).length, 2);
  let t = 0;
  while (r.run.phase === 'fight') { t += 50; g.act(r, t % 100 ? 'a' : 'b', { type: 'hit' }, on, t); }
  assert.strictEqual(r.run.phase, 'draft');
  const sat = r.run.shards;
  assert.ok(sat > 0);
  g.act(r, 'a', { type: 'boon', key: r.run.drafts.a[0] }, on, t);
  g.act(r, 'b', { type: 'retreat' }, on, t);
  assert.strictEqual(r.run, null);
  assert.strictEqual(r.shards, sat);
  r.shards = 100;
  assert.strictEqual(g.act(r, 'a', { type: 'perk', key: 'echo' }, on, t), null);
});

test('rift run: party wipes if nobody fights, keeps half; freezes when all offline', () => {
  const r = setup(); const on = new Set(['a']);
  gateReady(r);
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  r.run.shards = 9;
  g.tick(r, 10 * 60 * 1000, new Set()); // everyone away: frozen
  assert.ok(r.run);
  g.tick(r, 20 * 60 * 1000, on);
  assert.strictEqual(r.run, null);
  assert.strictEqual(r.shards, 4);
});

test('boon picks are ignored for a moment after a kill (stray Strike clicks)', () => {
  const r = setup(); const on = new Set(['a']);
  gateReady(r);
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  let t = 0;
  while (r.run.phase === 'fight') { t += 10; g.act(r, 'a', { type: 'hit' }, on, t); }
  const offer = r.run.drafts.a;
  g.act(r, 'a', { type: 'boon', key: offer[0] }, on, t + 200);
  assert.ok(r.run.drafts.a, 'early pick ignored');
  g.act(r, 'a', { type: 'boon', key: offer[0] }, on, t + 1200);
  assert.strictEqual(r.run.floor, 2);
});

test('the Rift needs a finished Gate, and each stage needs its milestone', () => {
  const r = setup(); const on = new Set(['a']);
  r.dust = 1e6;
  assert.match(g.act(r, 'a', { type: 'gate' }, on, 0), /crew level 4/);
  r.crewLevel = 4;
  r.dust = 1e6;
  assert.match(g.act(r, 'a', { type: 'startRun' }, on, 0), /Gate/);
  assert.match(g.act(r, 'a', { type: 'gate' }, on, 0), /Telescopes/);
  r.upgrades.telescope = 10;
  assert.strictEqual(g.act(r, 'a', { type: 'gate' }, on, 0), null);
  assert.match(g.act(r, 'a', { type: 'gate' }, on, 0), /constellation/);
  r.level = 1; g.act(r, 'a', { type: 'gate' }, on, 0);
  r.upgrades.dome = 5; g.act(r, 'a', { type: 'gate' }, on, 0);
  assert.strictEqual(r.gate, 3);
  assert.strictEqual(r.cells, 1);
  assert.strictEqual(g.act(r, 'a', { type: 'startRun' }, on, 0), null);
  assert.strictEqual(r.cells, 0);
});

test('workshop: routing feeds machines, limited by machines, conduits and production', () => {
  const r = setup(); const on = new Set(['a']);
  r.upgrades.telescope = 200; // 200 dust/s
  r.dust = 1e6;
  assert.match(g.act(r, 'a', { type: 'machine', key: 'prism' }, on, 0), /crew level 3/);
  r.crewLevel = 3; r.lastTick = 0;
  g.act(r, 'a', { type: 'machine', key: 'prism' }, on, 0);
  g.act(r, 'a', { type: 'route', key: 'prism', value: 1000 }, on, 0);
  r.lastTick = 0;
  g.tick(r, 10 * 1000);
  // 1 prism takes at most 25/s → 2.5 starlight/s; bank gets the other 175/s (plus the milestone/XP side effects don't touch dust)
  assert.ok(Math.abs(r.workshop.starlight - 25) < 1e-6);
  assert.ok(Math.abs(r.dust - (1e6 - 300 + 1750)) < 1e-6);
  // conduits (50/s) are shared proportionally
  for (let i = 0; i < 3; i++) { g.act(r, 'a', { type: 'machine', key: 'prism' }, on, 10000); g.act(r, 'a', { type: 'machine', key: 'condenser' }, on, 10000); }
  g.act(r, 'a', { type: 'route', key: 'condenser', value: 100 }, on, 10000);
  const v = g.view(r, 'a', on, 10000).workshop;
  assert.strictEqual(v.used, 50);
});

test('workshop: grinders turn starlight + aether into lenses, and report the bottleneck', () => {
  const r = setup(); const on = new Set(['a']);
  Object.assign(r.workshop, { starlight: 1000, aether: 25 });
  r.workshop.machines.grinder = 1;
  r.lastTick = 0;
  g.tick(r, 1000); g.tick(r, 2000); // short ticks so rates are recorded
  for (let t = 3000; t <= 40000; t += 1000) g.tick(r, t);
  assert.ok(Math.abs(r.workshop.lenses - 2.5) < 1e-6, String(r.workshop.lenses)); // aether ran out
  assert.strictEqual(r.workshop.rates.starved.grinder, 'aether');
  r.workshop.lenses = 2;
  g.act(r, 'a', { type: 'lens', use: 'install' }, on, 40000);
  const before = r.puzzle.revealed;
  g.act(r, 'a', { type: 'lens', use: 'reveal' }, on, 40000);
  assert.strictEqual(r.workshop.installed, 1);
  assert.strictEqual(r.puzzle.revealed, before + 1);
});

test('cells are pressed from aether, capped', () => {
  const r = setup(); const on = new Set(['a']);
  gateReady(r); r.cells = 0;
  assert.match(g.act(r, 'a', { type: 'startRun' }, on, 0), /Aether Cell/);
  assert.match(g.act(r, 'a', { type: 'pressCell' }, on, 0), /300 Aether/);
  r.workshop.aether = 2000;
  for (let i = 0; i < 5; i++) g.act(r, 'a', { type: 'pressCell' }, on, 0);
  assert.strictEqual(r.cells, 3);
  assert.strictEqual(r.workshop.aether, 1100);
});

test('timer-era condensers carry over into the Workshop', () => {
  const r = setup(); delete r.workshop; r.upgrades.condenser = 2;
  g.normalize(r);
  assert.strictEqual(r.workshop.machines.condenser, 2);
  assert.strictEqual(r.upgrades.condenser, undefined);
});

test('old saves without gate fields load cleanly', () => {
  const r = setup(); delete r.gate; delete r.cells; delete r.workshop;
  g.normalize(r);
  assert.strictEqual(r.gate, 0); assert.strictEqual(r.workshop.conduits, 0);
  g.tick(r, 1000);
  assert.ok(g.view(r, 'a', new Set(['a']), 1000).gate.length === 3);
});

test('a new run cannot start in the first moments after one ends (stray Strike clicks)', () => {
  const r = setup(); const on = new Set(['a']);
  gateReady(r);
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  r.run.shards = 4;
  g.tick(r, 10 * 60 * 1000, on); // party wipes
  assert.strictEqual(r.run, null);
  assert.deepStrictEqual({ ...r.lastRun, at: 0 }, { floor: 1, satchel: 4, kept: 2, retreated: false, at: 0 });
  const t = r.lastRun.at;
  assert.strictEqual(g.act(r, 'a', { type: 'startRun' }, on, t + 500), null);
  assert.strictEqual(r.run, null);
  assert.strictEqual(r.cells, 2);
  assert.strictEqual(r.bestFloor, 1);
  g.act(r, 'a', { type: 'startRun' }, on, t + 4000);
  assert.ok(r.run);
});

test('crew XP levels the crew up and unlocks things in order', () => {
  const r = setup(); const on = new Set(['a']);
  r.dust = 1e9;
  assert.match(g.act(r, 'a', { type: 'buy', key: 'chart' }, on, 0), /crew level 2/);
  for (let i = 0; i < 60; i++) g.act(r, 'a', { type: 'buy', key: 'telescope' }, on, 0); // 60 × 1 XP
  assert.strictEqual(r.crewLevel, 1, 'XP alone only makes the crew ready');
  assert.ok(g.view(r, 'a', on, 0).crew.ready);
  assert.match(r.feed.at(-2).text + r.feed.at(-1).text, /ready for level 2/);
  const keep = r.dust; r.dust = 100;
  assert.match(g.act(r, 'a', { type: 'levelUp' }, on, 0), /stardust/);
  r.dust = keep;
  assert.strictEqual(g.act(r, 'a', { type: 'levelUp' }, on, 0), null);
  assert.strictEqual(r.crewLevel, 2);
  assert.strictEqual(r.xp, 0);
  assert.strictEqual(g.act(r, 'a', { type: 'buy', key: 'chart' }, on, 0), null);
  assert.match(r.feed.find((f) => f.text.includes('level 2')).text, /Star Chart/);
  const v = g.view(r, 'a', on, 0);
  assert.strictEqual(v.upgrades.find((u) => u.key === 'dome').locked, 4);
  assert.strictEqual(v.crew.next, 96);
});

test('rift hits: accuracy and combo matter; hits are rate-limited', () => {
  const r = setup(); const on = new Set(['a']);
  gateReady(r);
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  r.run.enemy.hp = r.run.enemy.maxHp = 1e9;
  const dmg = (acc, combo, t) => { const b = r.run.enemy.hp; g.act(r, 'a', { type: 'hit', acc, combo }, on, t); return b - r.run.enemy.hp; };
  const graze = dmg(0, 0, 1000), bull = dmg(1, 0, 2000), comboBull = dmg(1, 20, 3000);
  assert.ok(bull > graze * 3, `${bull} vs ${graze}`);
  assert.ok(Math.abs(comboBull / bull - 2) < 1e-9);
  assert.strictEqual(dmg(1, 0, 3010), 0); // too fast after the last hit
  const a = g.view(r, 'a', on, 3000).run.arena;
  assert.ok(a.radius > 20 && a.lifeMs > 0);
});

test('rift kills drop Meteor Iron; the Starforge turns it into Starsteel for gear', () => {
  const r = setup(); const on = new Set(['a']);
  gateReady(r); r.crewLevel = 7;
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  let t = 0;
  while (r.run.phase === 'fight') { t += 100; g.act(r, 'a', { type: 'hit', acc: 1, combo: 5 }, on, t); }
  assert.ok(r.workshop.iron >= 1);
  Object.assign(r.workshop, { iron: 50, aether: 200 });
  r.workshop.machines.forge = 1;
  r.lastTick = t;
  for (let k = 1; k <= 61; k++) g.tick(r, t + k * 1000, on);
  assert.ok(Math.abs(r.workshop.starsteel - 2) < 0.05, String(r.workshop.starsteel));
  r.workshop.starsteel = 2;
  assert.strictEqual(g.act(r, 'a', { type: 'gear', key: 'blade' }, on, t), null);
  assert.strictEqual(r.gear.blade, 1);
});

test('old worlds get crew XP for past progress and the additive constellation bonus', () => {
  const r = setup();
  delete r.xp; delete r.crewLevel; delete r.gear;
  r.level = 1; r.mult = 1.5; r.upgrades.telescope = 5; r.upgrades.mirrors = 1; r.gate = 3;
  g.normalize(r);
  assert.strictEqual(r.mult, 1.25);
  assert.strictEqual(r.crewLevel, 6); // owns a Mirror Array, which unlocks at 6
});

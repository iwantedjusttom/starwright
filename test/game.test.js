'use strict';
const test = require('node:test');
const assert = require('node:assert');
const g = require('../game');

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
  assert.strictEqual(r.mult, 1.5);
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
  r.dust = 1000;
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
  r.dust = 1000;
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
  r.dust = 1000;
  g.act(r, 'a', { type: 'startRun' }, on, 0);
  let t = 0;
  while (r.run.phase === 'fight') { t += 10; g.act(r, 'a', { type: 'hit' }, on, t); }
  const offer = r.run.drafts.a;
  g.act(r, 'a', { type: 'boon', key: offer[0] }, on, t + 200);
  assert.ok(r.run.drafts.a, 'early pick ignored');
  g.act(r, 'a', { type: 'boon', key: offer[0] }, on, t + 1200);
  assert.strictEqual(r.run.floor, 2);
});

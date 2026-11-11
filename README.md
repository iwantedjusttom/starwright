# ✦ Starwright

A cooperative multiplayer idle game for a small group of friends (1–5 players).

**The goal: climb the Rift Tiers** by building stronger machines, together.

1. **Your machine:** a grid of shaped components powered by runes in their sockets. Matching elements power a
   component fully, wrong ones at 40%, and higher-rank runes are worth more. Many components boost what they touch.
   Every component from the Rift is rolled, Borderlands-style: a **random shape** (1–6 squares), **random sockets**
   (1–3, on random squares, each wanting a random element), a rarity, **buffs**, and sometimes **curses** (rarer items
   roll bigger buffs and curses more often). The runes you socket together create **element combos**: Sun+Ember =
   Solar Flare, Sun+Moon = Twilight, Tide+Ember = Steam, Moon+Void = Eclipse, Tide+Void = Abyssal Tide, all one element = Pure. Your machine's total power is its
   **Resonance**, which unlocks harder **Rift Tiers**.
2. **The Rift:** send your machine in (friends can join the same dive). It fights on its own and comes home at the HP
   you choose. While it fights you can click targets to **overcharge** it, click red shields to **block** incoming
   hits, and hit **⚡ linked targets** together with a friend. Every extra machine adds **Formation** (+15% damage for all).
3. **Loot and Essence:** every kill drops Essence and runes (mostly your element); components drop sometimes and from
   every boss. Salvage spares into Essence; spend Essence to upgrade components and expand your grid.
   A destroyed machine keeps half of what it found and may lose installed parts.

## Run it

```bash
npm install
npm start          # http://localhost:3000
npm test
```

Open the page, pick a name and a **crew code**. Anyone who enters the same code joins your world.
The URL becomes `?crew=yourcode`, so you can just send it to friends.

World state is saved to `data/<crew>.json` (set `DATA_DIR` to change it).

## Deploying to Render (free)

Render's free web services sleep after ~15 min without visitors and **wipe their disk** when they do,
so saves go to a Supabase table instead (the free Supabase tier is plenty).

1. **Supabase:** run `supabase.sql` in your project's SQL editor. Copy the project URL and the
   **service_role** key (Project Settings → API). Keep that key secret: it only goes into Render.
2. **Render:** Dashboard → **New → Blueprint** → pick this repo. Render reads `render.yaml` and asks for
   `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. Paste them in and deploy.
3. Open `https://<your-service>.onrender.com/?crew=yourcode` and send that link to your friends.

When the server has been asleep, the first visit takes ~30–60s to wake it. After that, offline progress
is caught up from the saved timestamp, so nothing is lost while it sleeps.

Without the Supabase variables, the server saves to local files in `data/` (fine on your own machine).

## Code map

- `game.js`: all game rules (pure functions, unit-tested)
- `public/engine.js`: machine rules (components, shapes, sockets, adjacency, stats), shared by the server and the browser
- `server.js`: HTTP + WebSocket server, rooms, offline catch-up
- `storage.js`: saves worlds to Supabase (if configured) or local JSON files
- `public/`: the browser client (vanilla JS, no build step)
- `test/`: `node --test` suite
- `render.yaml` / `supabase.sql`: deploy config

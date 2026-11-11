# ✦ Starwright

A cooperative multiplayer idle game for a small group of friends (1–5 players).

**The goal: climb the Rift Tiers** by building stronger machines.

**The loop**
1. **Idle:** buildings make stardust all the time, even while everyone is away. Clicking adds more;
   **Harmony** multiplies clicks when several people click within 1.5s of each other. Your crew's machines also boost production.
2. **Your machine:** each player has a grid (starts 4×3, expandable with stardust). Components are shaped pieces
   (Prism Lance, Ember Coil, Void Lash, Moon Shield, Sunplate, Tide Pump, Sun Capacitor, Void Core, Star Harvester)
   with **rune sockets** that want certain elements: a matching rune powers them fully, a different element at 40%,
   higher-rank runes are worth more. Many components **boost the components they touch** (capacitors power up
   adjacent weapons, coils chain, a Void Core strengthens everything around it but costs HP…), so packing and placement matter.
   **Every component from the Rift is rolled** (Borderlands-style): a rarity (Common → Legendary), its own socket
   elements, and random modifiers (Overcharged, Volatile, Reinforced, Lucky, … of Resonance, of the Pack, of the Titan,
   of Harmony). Rarer drops come from deeper tiers and bosses. Salvage spare runes and components into **Essence**, and
   spend Essence + stardust to upgrade the components you keep. Three identical runes fuse into the next rank.
   Your machine's total power is its **Resonance**, and reaching thresholds unlocks harder **Rift Tiers**.
3. **The Rift:** send your machine in (friends can join the same dive). It fights floor by floor on its own and keeps going
   while you're away, coming home by itself at the HP threshold you choose. While it fights, you can click targets to
   **overcharge** it, and with two or more players, **⚡ linked targets** appear on two screens at once: hit them together for a burst.
   Kills drop runes (mostly your element) and sometimes components; bosses always drop a component.
   **If your machine is destroyed**, it keeps only half of what it found, and each installed component and socketed rune has a 30% chance to be lost.

Most of your runes match your own element, so the best machines are built by trading with the crew.

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

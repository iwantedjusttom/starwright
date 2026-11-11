# ✦ Starwright

A cooperative multiplayer idle game for a small group of friends (1–5 players).

**The goal: climb the Rift Tiers.** Every tier has tougher enemies, smaller and faster targets, and stronger runes.

**The loop**
1. **Idle:** buildings make stardust all the time, even while everyone is away. Clicking adds more;
   **Harmony** multiplies clicks when several people click within 1.5s of each other.
2. **The Rift:** spend stardust to open a Rift of any unlocked tier. Hit targets near the centre (bullseyes crit),
   chain combos, draft a boon between floors, and fight a boss every 5th floor. With two or more runners,
   **⚡ linked targets** appear on two players' screens at once: hit them together (within 0.6s) for a triple strike.
3. **Runes:** every runner gets their own rune drops, mostly in **their element** (Sun, Moon, Tide, Ember or Void,
   chosen when you join). Retreat between floors to keep them all; fall and keep half. Three identical runes fuse
   into one of the next rank. You can give runes to crewmates.
4. **The Star Engine:** a shared grid where anyone can place runes. Runes affect the runes they touch (Sun boosts
   neighbours, Moon loves Sun, Tide chains, Ember fizzles next to Tide, Void boosts its row but drains its neighbours).
   The total is **Resonance**: it multiplies stardust production and Rift damage, and **reaching thresholds unlocks
   the next Rift Tier**. The Engine grows from 3×3 to 4×4 (Tier 3) and 5×5 (Tier 6). Hovering a socket with a rune
   selected previews the exact Resonance you'd get.

Because most of your runes match your own element, a great Engine needs everyone's runes.

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
- `public/engine.js`: the Star Engine's scoring rules, shared by the server and the browser
- `server.js`: HTTP + WebSocket server, rooms, offline catch-up
- `storage.js`: saves worlds to Supabase (if configured) or local JSON files
- `public/`: the browser client (vanilla JS, no build step)
- `test/`: `node --test` suite
- `render.yaml` / `supabase.sql`: deploy config

# ✦ Starwright

A cooperative multiplayer idle game for a small group of friends (1–5 players). Two mechanics, nothing else:

**1. The idle observatory.** Buildings make stardust all the time, including while everyone is away
(up to 7 days of catch-up). Clicking *Polish the lens* adds more, and **Harmony** multiplies every click
when several people click within 1.5s of each other. New buildings appear as you buy the previous one.

**2. The Rift.** Spend about 3 minutes of production to open it. Everyone online dives in together.
Targets pop up in an arena: hit them near the centre for more damage (bullseyes crit), chain hits into a combo,
and don't miss or let them fade. Between floors each runner drafts a boon; every 5th floor is a boss.
Enemies drop loot: **Starshards** everywhere, **Meteor Iron** from floor 3 down, **Void Pearls** from bosses.
Retreat between floors to keep it all; fall and you keep half.

Loot buys **Relics**: permanent upgrades that boost stardust production, clicks, or your strength in the Rift.

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
- `server.js`: HTTP + WebSocket server, rooms, offline catch-up
- `storage.js`: saves worlds to Supabase (if configured) or local JSON files
- `public/`: the browser client (vanilla JS, no build step)
- `test/`: `node --test` suite
- `render.yaml` / `supabase.sql`: deploy config

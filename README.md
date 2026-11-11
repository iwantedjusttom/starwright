# ✦ Starwright

A cooperative multiplayer idle game for a small group of friends (1–5 players).
You share an old observatory that keeps making stardust while everyone is away.
When people log on, you solve star puzzles together and dive into roguelike Rift Runs.

## The three loops

| Loop | Solo / 1–2 people | 3–5 people |
|---|---|---|
| **Idle observatory**: build telescopes, domes, mirrors. Production keeps running offline (up to 7 days of catch-up). | Click, buy, plan | **Harmony**: clicks within 1.5s of each other multiply each other |
| **Star Lock puzzles**: find the hidden stars on a grid to relight a constellation (permanent ×1.5 to everything). | Rotate through lenses (5 min cooldown per switch), use the shared notebook. The charting engine also fixes one real star every ~10 min, so the sky eventually solves itself. | Each of the 5 lenses (rows, columns, voids, echoes, quadrants) can only be held by one person at a time. Everyone has a piece and has to talk it through. |
| **Rift Runs** (roguelike): spend ~1 min of production to open the Rift. Fight floors by clicking, draft 1 of 3 boons between floors, boss every 5th floor. | Enemy HP scales with party size, so solo runs are viable | Party-synergy boons (Constellation Bond, Resonance, Mending Light) |

**Workshop (crew-wide automation):** route part of your stardust/sec through shared sliders into machines.
Prisms make **Starlight**, Condensers make **Aether**, Lens Grinders turn 20 Starlight + 10 Aether into a **Crafted Lens**.
Conduits cap the total you can route, and the Grinder's ratio means you have to balance the chain.
Aether is pressed into **Aether Cells** (Rift fuel). Lenses are installed (+3% production each) or spent to chart a star instantly.

**The Rift Gate:** the Rift must be built first, in 3 stages: 10 telescopes, a relit constellation, 5 domes, plus stardust.

**Crew levels:** building, crafting, relighting constellations, clearing Rift floors and stardust milestones earn crew XP.
Each level unlocks something (buildings, the Workshop, the Rift Gate, Lens Grinders, the Starforge, …). See the roadmap in-game.

**Rift combat is skill-based:** targets pop up in an arena; hit them near the centre for more damage (bullseyes crit),
chain hits for a combo, and don't miss or let them fade. Enemies drop **Meteor Iron**, which the **Starforge** turns
(with Aether) into **Starsteel** for permanent Rift Gear.

**How the loops feed each other:** stardust pays for Rift Runs → runs earn **Starshards** →
shards buy permanent perks (more production, faster charting, stronger runs) → constellations multiply everything.

**Push your luck:** retreat between floors and you keep every shard. Fall in battle and you keep half.
If the whole party goes offline mid-run, the Rift freezes until someone comes back.

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
- `render.yaml` / `supabase.sql`: deploy config
- `public/`: the browser client (vanilla JS, no build step)
- `test/`: `node --test` suite

## Ideas backlog

- Rift events between floors: shrines, shops, cursed choices voted on by the party
- Role-locked enemies: weak points only a specific player can hit
- Puzzle variety beyond star maps: wiring, ciphers, timed sync-presses
- Season resets (prestige) with a shared "ascension" vote
- Discord webhook: "the charting engine finished the sky, come solve it"

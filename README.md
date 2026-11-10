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

## Playing with friends over the internet

The server is one small Node process that needs a persistent disk and WebSockets. Good options:
- **Render / Railway / Fly.io**: deploy as a Node web service with a persistent volume mounted at `DATA_DIR`.
- **Your own machine + a tunnel** (e.g. Cloudflare Tunnel or ngrok) for a quick test night.

(Vercel-style serverless hosting won't work as-is because the game uses a long-lived WebSocket server.)

## Code map

- `game.js`: all game rules (pure functions, unit-tested)
- `server.js`: HTTP + WebSocket server, rooms, saving, offline catch-up
- `public/`: the browser client (vanilla JS, no build step)
- `test/`: `node --test` suite

## Ideas backlog

- Rift events between floors: shrines, shops, cursed choices voted on by the party
- Role-locked enemies: weak points only a specific player can hit
- Puzzle variety beyond star maps: wiring, ciphers, timed sync-presses
- Season resets (prestige) with a shared "ascension" vote
- Discord webhook: "the charting engine finished the sky, come solve it"

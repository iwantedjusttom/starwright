# Starwright: Art Brief

A complete guide for generating art for Starwright: the game, the mood, every screen and interface piece, the exact
sizes things are shown at, how each asset will be used, and how to hand finished files back so they drop straight in.

---

## 1. The game in a paragraph

Starwright is a cooperative browser game for 1–5 friends. Each player builds a **machine** by packing oddly shaped
**components** into a grid, like a backpack puzzle, and powering them with glowing **runes** set into their sockets.
Components boost the components they touch, so placement matters. Players send their machines into **the Rift**, a
dark, otherworldly dungeon where the machines fight enemies floor by floor on their own. Players help in real time
by clicking targets that pop up in a battle arena: they overcharge their machine, block incoming attacks, and hit
linked targets in sync with a friend. Machines come back with Essence (the currency), runes, and randomly rolled
components (Borderlands-style rarities, modifiers and curses). Stronger machines unlock harder **Rift Tiers**.

### Mood and art direction

- **Arcane machinery meets deep space:** brass, copper and silver; cut crystal and gemstones; starlight and runic circuitry glowing against near-black violet.
- **A workshop for the machine side:** riveted metal frames, engraved plates, glass gauges. Warm metals, cool glow.
- **The Rift side is otherworldly:** swirling violet-navy voids, star dust, cracks of light. Menacing, not gory.
- **Painterly or stylised, not photoreal, not cartoony.** Clean silhouettes that read at small sizes.
- **Light from the top-left** on everything, for consistency.
- **No text, numbers or letters baked into images** (except the logo). The game draws all text itself.

---

## 2. Palette (art should sit comfortably on these)

| Role | Color |
|---|---|
| Page background | `#0b0e1a` near-black navy |
| Panels | `#141a2e` |
| Insets (fields, log, stat box) | `#0f1426` |
| Lines / borders | `#2a3150` |
| Main text | `#e7e3d4` warm off-white |
| Muted text | `#8a8fa8` |
| Gold accent (highlights, numbers, "gets" labels) | `#f2c14e` |
| Violet accent (Rift, main buttons, selection) | `#9b7bff` |
| Good / heal / "gives" labels | `#7ee787` green |
| Danger / enemy / curses | `#ff6b6b` red |

### Elements (the heart of the visual language)

| Element | Current symbol | Color | Feeling |
|---|---|---|---|
| **Sun** | ☀ | `#f2c14e` gold | radiant, warm, a solar disc |
| **Moon** | ☾ | `#b9c6ff` pale blue-silver | calm, cool, a crescent |
| **Tide** | ≈ | `#4fc3f7` aqua | flowing water, waves |
| **Ember** | ♨ | `#ff7a45` orange | fire, heat, sparks |
| **Void** | ◉ | `#b07cff` purple | dark matter, a hole in space |

### Rarities

Common `#c9c9c9` · Uncommon `#7ee787` · Rare `#58a6ff` · Epic `#bc8cff` · Legendary `#ffa94d`

---

## 3. How assets will be used (read this before making anything)

Three kinds of image, made three different ways:

**A. Icons and objects** (runes, emblems, enemies, targets, action icons). Fixed-shape pictures on a
**transparent** square canvas, subject centered with a little breathing room. The game scales them down.
Make them at **2× or more** of display size.

**B. Stretchy frames** (panels, buttons, cards, fields, bars). These appear at many widths and heights, so they're
used as **9-slice images**: the four corners stay fixed, the edges stretch in one direction, and the middle stretches
both ways. For each frame:
- Make a **square image** at the size given (usually 96 × 96 or 128 × 128).
- Keep all the decoration (rivets, corner ornaments, bevels) **inside the corner zone** given for that frame
  (for example "corners 32 px"). Anything outside the corners gets stretched.
- Keep the **edges between corners plain and even**, and the **center plain or very subtle**, since that's where
  text sits.
- Transparent outside the frame's rounded corners.

**C. Backgrounds and textures** (page backdrop, arena, panel fill). Large images that should either **tile
seamlessly** (repeat without visible seams) or simply be big. Keep them **dark and low-contrast** so text stays readable.

> **Tip for image generators:** ask for "game UI asset, 9-slice frame, transparent background, orthographic,
> no text" for frames, and "seamless tileable texture" for tiles.

---

## 4. The screens

### 4.1 Join screen (first thing players see)
A narrow centered column (~380 px wide) on the dark page:
- the **Starwright logo** (currently gold letters "✦ Starwright ✦"),
- a sentence of description,
- two **text fields** ("Your name", "Crew code"),
- one **button** ("Enter the workshop").

*Wanted:* logo, page background, text field frame, primary button (see §5).

### 4.2 Main screen
A **header bar** across the top, then **three columns** (panels with rounded corners):

```
┌──────────────────────────────── HEADER ────────────────────────────────────┐
│ ✦ Essence 240   Rift Tier 3   Crew Resonance 412            Crew: friends  │
├──────────────────┬──────────────────────────────────┬──────────────────────┤
│  THE RIFT        │  YOUR MACHINE                     │  CREW               │
│  tier buttons    │  [grid of components]  [stats]    │  ● Ann ☀ Res 120    │
│  recall setting  │  [+ column] [+ row]               │  ● Bo  ☾ in the Rift│
│  [ BIG DIVE BTN ]│  [inspect panel: big shape,      │  LOG                 │
│                  │   sentences, buttons]             │  (scrolling text)    │
│  during a dive:  │  STORAGE  [item cards…]           │  [chat field]        │
│  enemy + HP bar  │  RUNES    [rune chips…]           │                      │
│  machines' HP    │  ▸ How machines work              │                      │
│  [ ARENA ]       │                                   │                      │
│  [Recall now]    │                                   │                      │
└──────────────────┴──────────────────────────────────┴──────────────────────┘
```

On phones the three columns stack vertically.

---

## 5. Every interface piece

### Header bar
- Full-width strip, ~48 px tall, panel color with a line beneath.
- Shows **Essence**, **Rift Tier**, **Crew Resonance**, crew name. Numbers in gold.
- *Wanted:* `ui/header.png`, a **horizontally tileable** strip, 64 px tall × 512 px wide (metal rail or carved
  trim; dark). Plus the icons `icons/essence.png`, `icons/tier.png`, `icons/resonance.png` (§6).

### Panels (the three columns, and boxes inside them)
- Rounded rectangles, 12 px corners, dark fill, thin border. Headings in gold ("The Rift", "Your Machine", "Crew").
- *Wanted:* `frames/panel.png`: **9-slice, 128 × 128, corners 32 px.** A riveted dark-metal or engraved frame,
  center very dark (`#141a2e`-ish), subtle.
- *Optional:* `frames/panel-rift.png`: same, but with violet, otherworldly trim for the Rift column.
- *Optional:* `ui/heading-flourish.png`: a small ornament (~256 × 32) placed under headings.

### Buttons
Used everywhere, in four sizes and several states.

| Kind | Where | Size today |
|---|---|---|
| **Big** | "Send your machine into Tier 3", "Join the dive" | full column width × ~60 px, violet gradient |
| **Normal** | element choices, "Recall now", upgrade | ~32 px tall, variable width |
| **Small** | Rotate, Move, Put in storage, Salvage, Fuse, Give… | ~24 px tall, variable width |
| **Ghost** | secondary choices ("Put it down", tier buttons not chosen) | transparent fill, outline only |

States: **normal**, **hover** (lighter), **pressed** (slightly darker/sunk), **disabled** (faded, ~45% opacity),
**selected** (tier button that's chosen: violet fill).

- *Wanted (9-slice, corners 24 px, 96 × 96 each):*
  - `buttons/big.png`, `buttons/big-hover.png`, `buttons/big-pressed.png`: grand violet/brass plate.
  - `buttons/normal.png`, `buttons/normal-hover.png`, `buttons/normal-pressed.png`: dark steel-blue plate.
  - `buttons/ghost.png`: outline only, transparent center.
  - `buttons/selected.png`: violet-lit version for the chosen tier.
  - (Disabled is done by fading, so no image is needed.)

### Text fields (name, crew code, chat)
- Dark inset box, 8 px corners, ~36 px tall.
- *Wanted:* `frames/field.png`: **9-slice, 96 × 96, corners 16 px**, a recessed/inset look, center dark and plain.

### Bars
Three kinds, all ~14 px tall with rounded ends:
- **Enemy HP**: red fill.
- **Machine HP**: green fill.
- **Resonance / progress**: violet fill.

- *Wanted:* `bars/frame.png`: **9-slice, 128 × 32, corners 12 px** (glass tube or metal channel), and
  **horizontally tileable** fills `bars/fill-red.png`, `bars/fill-green.png`, `bars/fill-violet.png`, 64 × 32
  (glowing liquid or energy).

### The machine grid (center of the game)
- A grid of square slots, **52 × 52 px each**, from **4 × 3 up to 7 × 6** slots, inside a thin frame.
- **Empty slot:** dark, faint dashed outline.
- **Component squares:** tinted with the component's color; a thicker colored outline traces the outside of each piece.
- **Sockets** sit on some squares: a circle showing the element it wants (dimmed, dashed when empty, solid with the
  rune inside when filled). The element's name is printed tiny underneath.
- Overlays drawn by the game (no art needed): green/red placement outlines, a gold power number in the corner,
  labels like "gives +40%".

- *Wanted:*
  - `grid/slot.png`: **one empty slot, 128 × 128, seamless** (a recessed socket plate in the machine's chassis).
  - `grid/frame.png`: **9-slice, 128 × 128, corners 32 px**, the machine's outer chassis (heavy brass/iron).
  - `tiles/<component>.png`: one **seamless square tile per component type**, 128 × 128 (§6). Components are
    random shapes of 1–6 squares, so pieces are built from tiles; don't draw whole components.
  - `sockets/<element>.png`: empty socket ring per element, 128 × 128 (§6).

### Stats box (beside the grid)
- A small inset panel (~190 × 200 px) listing Damage/s, HP, Armor, Repair/s, Extra runes, Resonance, with green
  "+3" / red "−2" changes while previewing a move.
- *Wanted:* `frames/inset.png`: **9-slice, 96 × 96, corners 20 px**, a gauge-panel or glass-readout look. (Also used
  for the log and the stats box.) Optional small stat icons (§6).

### Inspect panel (when you click a component)
- A framed box under the grid, outlined in the component's **rarity color**. It contains:
  a big drawing of the component's shape (46 px squares), its name in rarity color, "Takes ☀ Sun · ♨ Ember"
  element pills, a sentence about its power, a sentence about its neighbours, buffs (green ▲) and curses (red ▼),
  combos, and a row of small buttons.
- *Wanted:* `frames/inspect.png`: **9-slice, 128 × 128, corners 32 px**, a more ornate frame, like a
  jeweller's inspection card. Neutral color, since the game tints the border by rarity. Make it **light grey or
  white** so tinting works.

### Storage cards (components you're not using)
- One card per component: a small shape preview (16 px squares), name, rarity, description, "Takes" pills,
  modifiers, and two small buttons (upgrade, salvage). Card border in rarity color.
- *Wanted:* `frames/card.png`: **9-slice, 96 × 96, corners 20 px**, a parchment-plate or engraved metal card.
  **Light/neutral** so the game can tint it per rarity.
- *Optional:* `frames/card-legendary.png`: a glowing, ornate version just for Legendary items.

### Rune chips (your pouch of loose runes)
- Small rounded chips (~36 × 30 px): rune symbol plus rank numeral, outlined in the element color. Selected chip glows.
- *Wanted:* the rune images (§6) replace the symbol, plus `frames/chip.png`: **9-slice, 64 × 64, corners 16 px**
  (a small velvet or metal tray). Neutral so it can be tinted.

### Element pills and tags
- Rounded labels like "☀ Sun" in the element color, and the small "gives +40%" / "gets +40%" labels on the grid.
- These stay as drawn shapes (color and text), so no art is needed. They'll use the element icons (§6).

### Element picker (first time you play)
- Five large choice cards, one per element, in a row: icon, name, color.
- *Wanted:* `elements/<element>-card.png`: **256 × 320**, a tall emblem card for each element
  (an illustrated sigil/banner). This is a great place for rich art.

### Rift column: before a dive
- Description text, a row of **tier buttons** (Tier 1 · Tier 2 · Tier 3…), a dropdown ("Come home at 30% HP"),
  and the **big dive button**.
- A **summary banner** after you return: green if your machine came home, red if it was destroyed.
- *Wanted:* `frames/banner-good.png` and `frames/banner-bad.png`: **9-slice, 128 × 64, corners 24 px**
  (a scroll or plaque, green-gold and red-black).

### Rift column: during a dive
- **Enemy name** (red, or gold for bosses) with an **HP bar**, and the **enemy portrait** above it.
- **Each machine in the dive:** element symbol, name, damage, overcharge multiplier (⚡×2.1), loot count, green HP bar.
- A "Formation ×1.30" badge when several machines dive together.
- The **arena**: a ~560 × 280 px rounded box where targets appear; a combo counter top-right; "Recall now" button.
- *Wanted:* see §6 (arena, targets, enemies, effects), plus `icons/formation.png`.

### Crew column
- **Player list:** an online dot (green/grey), element symbol, name, Resonance, "in the Rift" status.
- **Log:** a scrolling inset box of small text lines with emoji (⚔ kills, 🏳 came home, 💥 destroyed,
  ⚡ linked strike, 🎉 tier unlocked, 🔧 machine changes, 💬 chat).
- **Chat field.**
- *Wanted:* `icons/online.png` / `icons/offline.png` (small gems, 32 × 32) and log icons (§6). The log uses
  `frames/inset.png`.

### Pop-up messages
- **Toasts:** a small red-bordered box at the bottom of the screen ("It doesn't fit there."). Wanted:
  `frames/toast.png`, 9-slice 96 × 64, corners 20 px.
- **Floating combat text** ("OVERCHARGE!", "BLOCKED!", "miss", "⚡ LINKED"): drawn with text, no art needed.

### Page background
- *Wanted:* `ui/background.png`, **1920 × 1080**, very dark star-field or workshop-in-space backdrop with a soft
  vignette. Or `ui/background-tile.png`, a **512 × 512 seamless** dark texture.

---

## 6. Objects and icons (transparent PNGs)

### Runes (5): highest priority
`runes/sun.png`, `moon.png`, `tide.png`, `ember.png`, `void.png`. **128 × 128.**
A glowing gemstone carved with its element's symbol, in its color, with a soft inner glow. Must read clearly at
28 px. One per element: the game adds the rank (I–VIII) and makes higher ranks glow brighter.
*(Optional: `runes/rank-1.png` … `rank-8.png`, ring overlays that grow more ornate with rank.)*

> Example prompt: *"Fantasy game icon of a glowing golden sun rune carved into a faceted gemstone, radiant solar
> symbol, soft inner light, transparent background, centered, clean silhouette, painterly, 128x128, no text"*

### Empty sockets (5)
`sockets/sun.png` … `void.png`. **128 × 128**, a carved ring filling ~80% of the canvas, faint element symbol
inside, looking empty and waiting (dimmer than the runes).

### Element icons (5)
`elements/sun.png` … `void.png`. **64 × 64**, simple flat symbols for pills, player list and labels. Simpler than
the runes; just the sigil.

### Component tiles (9): seamless 128 × 128 squares
Machinery panels that still look right when 1 to 6 of them sit side by side. Plain edges; no big features cut off
at the borders.

| File | Component | Role | Color | Material ideas |
|---|---|---|---|---|
| `tiles/lance.png` | Prism Lance | weapon, piercing light | `#f2c14e` | brass housing, prism crystal |
| `tiles/coil.png` | Ember Coil | weapon, better in clusters | `#ff7a45` | glowing copper coils |
| `tiles/lash.png` | Void Lash | weapon, likes open space | `#b07cff` | dark tendrils, purple energy |
| `tiles/shield.png` | Moon Shield | defense: HP and armor | `#b9c6ff` | silver plating, crescents |
| `tiles/plate.png` | Sunplate | defense: HP | `#e8d27a` | hammered gold plate |
| `tiles/pump.png` | Tide Pump | repairs the machine | `#4fc3f7` | glass pipes, flowing water |
| `tiles/capacitor.png` | Sun Capacitor | boosts touching weapons | `#ffd76b` | crackling brass cells |
| `tiles/core.png` | Void Core | boosts all neighbours, costs HP | `#8a5cff` | caged dark orb, unstable |
| `tiles/harvester.png` | Star Harvester | extra rune drops | `#9ad0c2` | mint gears gathering stardust |

### Component emblems (9)
`emblems/lance.png` etc. **128 × 128**, a small icon per component type, for card corners and the inspect panel.

### Action icons (for buttons): 64 × 64, simple and readable at 16 px
`icons/rotate.png`, `move.png`, `store.png` (put in storage), `upgrade.png` (up arrow / anvil), `salvage.png`
(recycle / breaking crystal), `fuse.png` (three merging into one), `give.png` (gift / open hand),
`remove-rune.png`, `expand.png` (grid growing), `recall.png` (white flag / returning arrow), `dive.png` (portal).

### Stat icons: 64 × 64
`icons/damage.png`, `hp.png`, `armor.png`, `repair.png`, `extra-runes.png`, plus the header icons
`icons/essence.png` (a crystallised spark), `icons/resonance.png` (concentric waves / tuning fork),
`icons/tier.png` (a rift crack / portal), `icons/formation.png` (three linked machines).

### Log icons: 32 × 32
`log/kill.png` (crossed blades), `log/home.png` (flag), `log/destroyed.png` (burst), `log/linked.png` (lightning),
`log/tier.png` (portal flare), `log/machine.png` (wrench), `log/chat.png` (speech), `log/loot.png` (gem).

### The Rift
- `rift/arena.png`, **1200 × 600**: a swirling dark rift (deep violet and navy, faint stars), with nothing busy
  in the middle, since targets appear all over it.
- Targets, **256 × 256**, circular, readable at 36 px:
  - `rift/target.png`: overcharge target. Gold and violet bullseye with a bright center (center hits matter).
  - `rift/target-linked.png`: linked target, brighter and electric. **White/greyscale**, because the game tints it.
  - `rift/target-block.png`: block target. A red shield, urgent.
  - `rift/ring.png`: a thin glowing ring that shrinks toward a target as its timer.
- Effects, **256 × 256** (single frames are fine; a 4–8 frame horizontal strip is even better):
  `fx/hit.png` (spark), `fx/bullseye.png` (golden burst), `fx/block.png` (shield flash), `fx/linked.png`
  (lightning arc), `fx/miss.png` (puff of dust), `fx/hurt.png` (red screen-edge flash, 1200 × 600).
- Enemy portraits, **512 × 512**, facing the viewer:
  - Regular: `enemies/void-moth.png`, `dust-wraith.png`, `hollow-comet.png`, `gloam-eel.png`,
    `shard-golem.png`, `null-choir.png`, `eclipse-hound.png`.
  - Bosses (grander, bigger presence): `enemies/the-unlit-king.png`, `mother-of-static.png`, `the-ninth-silence.png`.

### Logo
`ui/logo.png`, about **1200 × 300**, transparent: "STARWRIGHT" in a celestial/engraved style. The one place
lettering is welcome.

---

## 7. Priority order

If you make things in batches, this order gives the biggest visual jump first:

1. **Runes (5) and empty sockets (5)**: on screen constantly.
2. **Component tiles (9), grid slot, grid frame**: the machine screen.
3. **Panel frame, buttons (big + normal + ghost + selected), field, inset frame**: the whole interface changes feel.
4. **Arena background, targets (4), bars**: the Rift.
5. **Enemy portraits (10)**.
6. **Logo, page background, header strip**.
7. **Inspect frame, card frame, banners, toast, chip**.
8. **Element cards, emblems, action / stat / log icons, effects**.

---

## 8. Handing the art back

- **Use the folder and file names above** (e.g. `runes/sun.png`, `buttons/big-hover.png`, `frames/panel.png`).
  They go straight into `public/assets/` with no renaming.
- PNG with transparency, at the listed size or bigger. Seamless tiles must actually tile; 9-slice frames must keep
  decoration inside the stated corner size.
- Send in batches. Upload to the repository or attach in a chat, and each batch gets wired in, with the current
  drawn look kept as a fallback for anything not made yet.
- Not happy with one piece later? Replace the file with the same name and it updates everywhere.

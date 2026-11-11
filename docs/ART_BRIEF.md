# Starwright: Art Brief

A guide for generating art for Starwright. It describes the game, every visual element it uses today, the exact sizes
they're shown at, and how to hand finished files back so they can be dropped straight into the game.

---

## 1. The game in a paragraph

Starwright is a cooperative browser game for 1–5 friends. Each player builds a **machine** by packing oddly shaped
**components** into a grid, like a backpack puzzle, and powering them with glowing **runes** set into their sockets.
Components boost the components they touch, so placement matters. Players send their machines into **the Rift**, a
dark, otherworldly dungeon where the machines fight enemies floor by floor on their own. Players help in real time
by clicking targets that pop up in a battle arena: they overcharge their machine, block incoming attacks, and hit
linked targets in sync with a friend. Machines come back with Essence, runes and randomly rolled components
(Borderlands-style rarities, modifiers and curses). Stronger machines unlock harder **Rift Tiers**.

**Mood:** arcane machinery meets deep space. Brass, crystal and starlight against near-black violet. Think
celestial clockwork, glowing gemstones and runic circuitry, not cartoony and not grimdark.

---

## 2. What the game looks like today

There are **no image files yet**. Everything is drawn with colored boxes, borders, gradients and text symbols
(☀ ☾ ≈ ♨ ◉ ✦ ⚡ 🛡). The page is dark with three columns: **the Rift** (left), **your machine** (middle) and
**crew, log and chat** (right).

### Palette (use these so art matches the interface)

| Role | Color |
|---|---|
| Page background | `#0b0e1a` (near-black navy) |
| Panels | `#141a2e` |
| Lines / borders | `#2a3150` |
| Main text | `#e7e3d4` (warm off-white) |
| Muted text | `#8a8fa8` |
| Gold accent (highlights, power numbers) | `#f2c14e` |
| Violet accent (Rift, buttons) | `#9b7bff` |
| Danger / enemy | `#ff6b6b` |

### The five elements (the heart of the visual language)

Every rune and every socket belongs to one element. Each needs a clear, distinct look that reads at small sizes.

| Element | Current symbol | Color | Feeling |
|---|---|---|---|
| **Sun** | ☀ | `#f2c14e` gold | radiant, warm, solar disc |
| **Moon** | ☾ | `#b9c6ff` pale blue-silver | calm, cool, crescent |
| **Tide** | ≈ | `#4fc3f7` aqua | flowing water, waves |
| **Ember** | ♨ | `#ff7a45` orange | fire, heat, sparks |
| **Void** | ◉ | `#b07cff` purple | dark matter, a hole in space |

### Rarities (component name color and card border)

| Rarity | Color |
|---|---|
| Common | `#c9c9c9` grey |
| Uncommon | `#7ee787` green |
| Rare | `#58a6ff` blue |
| Epic | `#bc8cff` purple |
| Legendary | `#ffa94d` orange |

---

## 3. Sizes the game draws things at

Make every image at **2× (or more) of its display size** so it stays sharp on high-resolution screens.
The game scales it down.

| Thing | Shown at | Make it at |
|---|---|---|
| One square of the machine grid | 52 × 52 px | **128 × 128** |
| A socket (circle inside a square) | 34 px | **128 × 128** (circle filling ~80%) |
| A rune in your pouch | ~28 px | **128 × 128** |
| Squares in the big shape view (inspect panel) | 46 × 46 px | uses the 128 grid tiles |
| Squares in the small shape preview (storage cards) | 16 × 16 px | uses the 128 grid tiles |
| Rift arena (battle area) | ~560 × 280 px | **1200 × 600** |
| Normal target | 36–68 px across (shrinks at deeper tiers) | **256 × 256** |
| Linked target (hit together with a friend) | 1.25× a normal target | **256 × 256** |
| Block target (incoming enemy attack) | 1.4× a normal target | **256 × 256** |
| Enemy portrait (shown above the arena) | ~120–160 px | **512 × 512** |
| Small UI icons (Essence, tier, resonance) | 16–24 px | **128 × 128** |

### Machine grid and shapes

- The machine is a grid of square slots: **4 × 3 at the start, up to 7 × 6** when fully expanded.
- **Components are random shapes** made of 1 to 6 connected squares, in any arrangement
  (a line, an L, a T, a zigzag, a 2×2 block…), and players can rotate them.
- Because shapes are random, **don't draw whole components.** Draw **one square tile per component type** that
  looks good repeated side by side. The game assembles each shape from tiles and draws its outer outline itself.
- **Sockets** sit on some of a component's squares (1 to 3 per component). A socket shows which element it wants;
  when filled, the rune sits inside it.

---

## 4. Assets to make (priority order)

Transparent **PNG**, square canvas, subject centered, **no text or numbers baked in** (the game draws ranks,
names and numbers itself), light coming from the top-left for consistency.

### Priority 1: Runes (5 images)
A glowing gem or stone for each element, carved with its symbol. The most important art in the game: players
look at runes constantly.
- `runes/sun.png`, `runes/moon.png`, `runes/tide.png`, `runes/ember.png`, `runes/void.png`. 128 × 128.
- Must read clearly at 28 px. Strong silhouette, the element's color, a soft inner glow.
- Runes have **ranks I–VIII**. The game will add the rank numeral and make higher ranks glow brighter, so one
  image per element is enough. (Optional extra: 8 ornate frames, `runes/rank-1.png` … `rank-8.png`, that get
  fancier as rank rises.)

> Example prompt: *"Fantasy game icon of a glowing golden sun rune carved into a faceted gemstone, radiant solar
> symbol, soft inner light, dark transparent background, centered, clean silhouette, painterly style, 128x128"*

### Priority 2: Empty sockets (5 images)
The empty slot a rune goes into: a carved ring or setting, faintly showing its element's symbol, tinted its color.
- `sockets/sun.png` … `sockets/void.png`. 128 × 128, transparent, the ring filling about 80% of the canvas.
- Should look *empty and waiting*: dimmer and hollow compared with the runes.

### Priority 3: Component tiles (9 images)
One **seamless square tile** per component type. Panels of machinery that still look right when 1 to 6 of them sit
side by side. Keep edges plain enough to repeat; avoid big features cut off at the borders.
- 128 × 128, opaque or transparent.

| File | Component | What it does | Base color | Material ideas |
|---|---|---|---|---|
| `tiles/lance.png` | Prism Lance | Weapon, fires piercing light | `#f2c14e` | brass housing, prism crystal |
| `tiles/coil.png` | Ember Coil | Weapon, better in clusters | `#ff7a45` | glowing copper coils, heat |
| `tiles/lash.png` | Void Lash | Weapon, likes empty space | `#b07cff` | dark tendrils, purple energy |
| `tiles/shield.png` | Moon Shield | Defense, HP and armor | `#b9c6ff` | silver plating, crescent motifs |
| `tiles/plate.png` | Sunplate | Defense, HP | `#e8d27a` | hammered gold armor plate |
| `tiles/pump.png` | Tide Pump | Repairs the machine | `#4fc3f7` | glass pipes with flowing water |
| `tiles/capacitor.png` | Sun Capacitor | Boosts touching weapons | `#ffd76b` | crackling brass capacitor cells |
| `tiles/core.png` | Void Core | Boosts everything touching, costs HP | `#8a5cff` | a dark orb in a cage, unstable |
| `tiles/harvester.png` | Star Harvester | Extra rune drops | `#9ad0c2` | mint-green gears, collecting stardust |

### Priority 4: Component emblems (9 images)
A small icon for each component type, for item cards and names. `emblems/lance.png` etc. 128 × 128, transparent.

### Priority 5: The Rift
- **Arena background:** `rift/arena.png`, 1200 × 600. A swirling dark rift: deep violet and navy, faint stars,
  nothing busy in the middle (targets appear everywhere on top of it).
- **Targets** (256 × 256, transparent, circular, readable at 36 px):
  - `rift/target.png`: overcharge target. A gold and violet bullseye with a bright center, since hitting dead
    center matters.
  - `rift/target-linked.png`: linked target. A brighter, more electric version. The game tints it a different
    color each time, so make it in **white/greyscale**.
  - `rift/target-block.png`: block target. A red shield, urgent and alarming.
  - `rift/ring.png`: a thin glowing ring that shrinks toward the target as a timer.
- **Enemy portraits** (512 × 512, transparent, facing the viewer, menacing but not gory):
  - Regular: `enemies/void-moth.png`, `dust-wraith.png`, `hollow-comet.png`, `gloam-eel.png`, `shard-golem.png`,
    `null-choir.png`, `eclipse-hound.png`.
  - Bosses, bigger and grander: `enemies/the-unlit-king.png`, `mother-of-static.png`, `the-ninth-silence.png`.

### Priority 6: Interface touches
- `ui/essence.png`: the currency (currently ✦). A small crystallised spark.
- `ui/resonance.png`: machine power. Concentric waves or a tuning-fork glow.
- `ui/tier.png`: Rift Tier. A portal or rift crack.
- `ui/logo.png`: the "Starwright" title, about 1200 × 300, transparent. (The one place lettering is welcome.)
- `ui/background.png`: optional subtle page backdrop, 1920 × 1080, very dark so text stays readable.

---

## 5. Handing the art back

- **Use the folder and file names above** (e.g. `runes/sun.png`, `tiles/core.png`) and the art can go straight
  into `public/assets/` with no renaming.
- PNG with transparency, at the sizes listed (bigger is fine; smaller will look blurry).
- Send them in batches by priority. **Runes and sockets alone** would make the biggest visual difference, since
  they're on screen constantly.
- Upload them to the repository, or attach them in a chat, and they'll be wired in, with the current drawn
  version as a fallback for anything not made yet.

---

## 6. Quick reference: what's on screen

| Area | Elements |
|---|---|
| Header | Essence, Rift Tier, crew Resonance |
| Rift (left) | Tier buttons, recall setting, dive button; during a dive: enemy name and HP bar, each machine's HP bar, the battle arena with targets |
| Your Machine (middle) | the grid with components and sockets, stats panel, inspect panel (big shape drawing, labels like "gives +40%"), storage cards, rune pouch |
| Crew (right) | players with element symbols, the log, chat |

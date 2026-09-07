# Crimson Requiem

A vampire-themed action roguelike for the browser. Pure HTML5 canvas + JavaScript, no build step, no external assets or libraries — just `index.html` and `game.js`.

## Play locally

Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari). That's it — no server or install required, though some browsers are happier serving it over `http://` than `file://` (see below).

## Deploy to GitHub Pages

1. Create a new GitHub repository (or use an existing one) and add these two files (`index.html`, `game.js`) to its root — or to a `/docs` folder if you prefer.
2. Push to GitHub.
3. In the repo, go to **Settings → Pages**, set the source branch/folder (e.g. `main` / `/root` or `/docs`), and save.
4. GitHub will give you a URL like `https://yourname.github.io/your-repo/` — open it and play.

If you'd rather test locally with a real server (recommended over double-clicking the file, since some browsers restrict `file://` pages), run one of:

```
python3 -m http.server 8000
# or
npx serve .
```

then visit `http://localhost:8000`.

## Controls

- **WASD** — move
- **Mouse** — aim
- **Left Click** — light attack
- **Right Click** — heavy attack
- **Space** — dodge (has a brief invulnerability window at the start of the dodge)
- **Tab** — view gathered relics/items
- **Escape** — pause

## How a run works

- Choose one of 4 characters, each with different Vigor (health), Strength (physical damage), Magic (spell damage) and Speed (move speed / dodge distance) stats, and a different starting weapon.
- Fight through 10 randomized rooms — cobblestone plazas, alleys, graveyards, markets, courtyards littered with broken carriages, crates, and statuary. Most rooms are combat encounters; a few are shrine/event rooms.
- Clearing a room opens two glowing gates, each previewing the reward waiting beyond it (a stat vial, a boon/ability modifier, a new weapon with a different combo tree, or a full heal). Walk into the one you want.
- Chain light and heavy attacks into combos — different sequences (e.g. light-light-light vs. light-heavy) trigger different named finishers with their own damage, knockback, and special effects (bleed, lifesteal, AoE, dashes, launches).
- After the 10th room, a final gate leads to the boss chamber — Nosferatu Prime, a three-phase fight that gets nastier (and summons help) as its health drops.
- Lose all your Vigor and the run ends; beat the boss and the night is yours.

## Notes on the implementation

- Rendering uses a lightweight "pseudo-isometric" projection (vertical compression + Y-sorted draw order) rather than a true isometric tile engine, which keeps WASD movement intuitive while still giving the angled, zoomed-out look the design called for.
- All art is procedurally drawn on `<canvas>` at runtime (blocky pixel-snapped primitives) — there are no image files to manage or replace.
- Everything is a single JS file for simplicity; it's organized top-to-bottom by system (constants → input → rendering primitives → particles → weapons/characters/items/enemies data → entity logic → room/run generation → UI/state machine → main loop) if you want to extend it.

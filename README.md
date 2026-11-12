# ✦ Moonlit Cauldron

A monochrome 2D fairy-witch crafting and exploration adventure built from scratch with **TypeScript** and **HTML5 Canvas**—featuring zero external game engines, sprite sheets, or audio files.

Play as a cute **Girl** or **Boy** witch alongside a **Black Cat** familiar and an 8-legged **Spider Buddy** to weave silver-silk bridges, forage enchanted herbs, brew potions at the cauldron, and soar across moonlit walls into the Starlit Sanctuary.

---

## Software Engineering & DSA Architecture

Every core gameplay system is structured around modular software design patterns and classic Data Structures & Algorithms:

| Module | Design Pattern / DSA | Implementation Details |
| :--- | :--- | :--- |
| `src/core/pathfinding.ts` | **A\* Search + Binary Min-Heap** | Custom `MinHeap<T>` priority queue ($O(\log V)$ push/pop) driving 8-directional grid A\* navigation with diagonal corner-cutting prevention and nearest-walkable goal fallback for companion AI. |
| `src/core/eventBus.ts` | **Observer Pattern (Typed EventBus)** | Strongly typed `GameEventMap` pub/sub bus decoupling gameplay triggers (`ITEM_EQUIPPED`, `POTION_BREWED`, `ESCAPED_OUTSIDE`) from UI status banners and audio cues. |
| `src/systems/cauldron.ts` | **Hash Map & Canonical Key Lookup** | `Map<HerbType, number>` pouch for $O(1)$ herb stack updates paired with sorted canonical recipe keys (`[...herbs].sort().join('+')`) for order-independent potion matching. |
| `src/core/audio.ts` | **Procedural Web Audio Synthesizer** | Zero-asset `AudioContext` oscillator engine synthesizing harmonic fairy chimes, cauldron bubbles, flight whooshes, and victory fanfares in real time. |
| `src/main.ts` | **60 FPS Game Loop & Procedural Canvas** | `requestAnimationFrame` delta-time loop rendering dynamic radial moonlight shaders, particle fireflies, and custom vector-drawn characters. |

---

## Gameplay & Grimoire Recipes

Explore two progressive stages—**Stage 1: The Moonlit Courtyard** and **Stage 2: The Starlit Forest**—equipping your **Witch Hat** (`+50%` potion duration) and **Magic Broom** along the way.

| Potion | Ingredients | Magical Effect |
| :--- | :--- | :--- |
| **Astral Portal Elixir** | `Moonpetal` + `Silver Fern` + `Starlight Dew` | Unseals the Stage 2 Starlit Sanctuary Portal |
| **Gale-Broom Draught** | `Silver Fern` + `Starlight Dew` | Enchants your Magic Broom for flight (`[SPACE]`) |
| **Fairy-Light Tonic** | `Moonpetal` + `Starlight Dew` | Expands silver moonlight illumination radius |
| **Star-Step Elixir** | `Moonpetal` + `Silver Fern` | Increases movement speed by 45% |

---

## Controls

| Key | Action |
| :--- | :--- |
| `W A S D` / `Arrow Keys` | Move witch |
| `Tab` | Switch between Girl and Boy witch |
| `B` | Command Spider Buddy to weave a Silver-Silk Bridge |
| `F` | Send Spider Buddy to fetch the nearest herb |
| `E` | Brew available potion at the Cauldron |
| `Space` | Toggle Magic Broom flight (requires `Gale-Broom Draught`) |
| `G` | Toggle live A\* pathfinding debug overlay |
| `M` | Mute / unmute procedural Web Audio |
| `N` / `R` | Advance to Stage 2 / Restart from Stage 1 |

---

## Project Structure

```text
moonlit-cauldron/
├── index.html
├── package.json
├── tsconfig.json
└── src/
    ├── core/
    │   ├── audio.ts           # Procedural Web Audio API synthesizer
    │   ├── eventBus.ts        # Typed Observer pattern EventBus
    │   └── pathfinding.ts     # Binary Min-Heap & A* grid pathfinder
    ├── systems/
    │   └── cauldron.ts        # O(1) pouch & canonical recipe matcher
    └── main.ts                # Game loop, level state, & Canvas renderer
```

---

## Running Locally

```bash
npm install
npm run dev -- --host
```

Open the local server URL (`http://localhost:5173`) in any modern browser to play.

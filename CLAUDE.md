# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Claudo is a 2D top-down pixel art murder mystery game (Godot 4.6 + GDScript). Six AI-powered NPC suspects roam a 9-room mansion. The player interrogates them via free-form text chat. A Games Master (Claude Opus 4.7) monitors progress and dynamically adjusts difficulty. NPCs run on Google Gemini Flash; the backend is Node.js/TypeScript (Phase 1, not yet built).

Full spec: `docs/superpowers/specs/2026-04-18-claudo-game-design.md`  
Phase 0 plan: `docs/superpowers/plans/2026-04-18-phase-0-graphical-draft.md`

## Running the game

Open the project in Godot 4.6 and press **F5**. No build step. No CLI run command.

There is no Node.js server yet — Phase 1 will add it. When built, Godot will launch it automatically via `OS.create_process()`.

## Godot conventions

- **Tile size:** 16×16px throughout
- **Tileset atlas** (`assets/tilesets/mansion_tileset.tres`): col 0=wall (collision), col 1=door (no collision), col 2=generic floor, cols 3–11=room-specific floors (Kitchen→DiningRoom)
- **Mansion layout:** 9 rooms in a 3×3 grid. Each room block is 20×17 tiles with a 1-tile gap between blocks. Corridors punch 3-tile-wide door openings through shared walls. The entire tilemap is generated at runtime by `mansion_generator.gd` (`@tool`, extends `TileMapLayer`) — do not hand-paint tiles
- **Room detection:** Each room has an `Area2D` child in `mansion.tscn`; `mansion.gd` emits `room_changed(room_name: String)` when the player (group `"player"`) enters
- **Camera:** `Camera2D` is a child of `Player` in `main.tscn` (zoom = 4×). Do not reparent at runtime
- **NPC instances:** Defined in `main.tscn` under the `Mansion` node with `@export var npc_name` and `@export var npc_texture` overrides
- **Notebook toggle:** `ui_notebook` input action (physical key N). Uses `_input` (not `_unhandled_input`) so it works even when a `TextEdit` has focus — but releases focus and closes when N pressed outside a TextEdit

## Asset pipeline

All sprites are placeholder pixel art generated via Node.js scripts (no npm packages — raw zlib PNG encoding). To regenerate or add sprites: write a self-contained Node.js script to `/tmp/`, run it, verify outputs, delete script. Never commit the generator scripts.

Sprite locations:
- `assets/sprites/player/` — player character
- `assets/sprites/npcs/` — npc_1.png through npc_6.png (colour-coded by archetype)
- `assets/sprites/furniture/` — room props (16×16 or 32×16)
- `assets/sprites/ui/` — speech bubble
- `assets/tilesets/` — tileset PNG + `.tres` resource

## Scene graph summary

```
Main (Node2D) — main.gd
├── Mansion (mansion.tscn) — mansion.gd
│   ├── MansionTiles (TileMapLayer) — mansion_generator.gd [@tool]
│   ├── RoomKitchen … RoomDiningRoom (Area2D × 9)
│   ├── NPCScarlett … NPCPlum (npc.tscn × 6)
│   └── Furn* (Sprite2D × 21, furniture props)
├── Player (player.tscn) — player.gd
│   └── Camera (Camera2D, zoom=4)
├── HUD (hud.tscn) — hud.gd
└── Notebook (notebook.tscn) — notebook.gd
```

## Planned architecture (Phase 1+)

```
Godot 4.6  ←WebSocket→  Node.js/TypeScript server
                          ├── NpcAgent × 6  → Gemini Flash
                          ├── GamesMaster   → Claude Opus 4.7
                          └── MemoryStore   → JSON per NPC
```

The server will be in a `server/` directory (not yet created). Godot spawns it on game start and communicates via WebSocket events defined in the spec.

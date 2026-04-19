# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Claudo is a 2D top-down pixel art murder mystery game (Godot 4.6 + GDScript). Six AI-powered NPC suspects roam a 9-room mansion. The player interrogates them via free-form text chat. A Games Master (Claude Opus 4.7) monitors progress and dynamically adjusts difficulty. NPCs run on Google Gemini Flash; the backend is Node.js/TypeScript.

Full spec: `docs/superpowers/specs/2026-04-18-claudo-game-design.md`  
Phase 1 plan: `docs/superpowers/plans/2026-04-18-phase-1-core-infrastructure.md`

## Running the game

Open the project in Godot 4.6 and press **F5**. Godot auto-spawns the Node.js server via `server/start.sh`. The server requires `server/.env` with `ANTHROPIC_API_KEY` and `GOOGLE_API_KEY`.

The loading screen stays up while the GM (Claude Opus 4.7) generates the murder scenario — this takes 20–60s on first launch. `server/server.log` captures all server output for debugging.

## Server commands

All commands run from `server/`:

```bash
npm test          # run all tests (vitest)
npm run build     # compile TypeScript → dist/
npm run test:watch  # watch mode
```

Run a single test file:
```bash
npx vitest run tests/gm-agent.test.ts
```

After modifying any `server/src/` file, rebuild before launching Godot:
```bash
cd server && npm run build
```

The compiled `server/dist/` is committed — players only need Node.js ≥ 18 installed, no npm install.

## Server architecture

```
server/src/
├── index.ts        entry point — env check, start WS server, run GameSetup, send game_ready
├── types.ts        shared types: NpcId, ChatMessage, WsEnvelope, TruthFile, NPC_NAMES, WEAPONS, ROOMS, ARCHETYPES
├── game-state.ts   in-memory state: chat histories per NPC, active NPC, player room, toSnapshot()
├── ws-server.ts    WebSocket server on port 9876 — parseMessage, buildMessage, WsServer class
├── gm-agent.ts     Claude Opus 4.7 — buildGameSetupPrompt, parseGameSetupResponse, runGameSetup
└── npc-agent.ts    Gemini Flash per NPC — NpcAgent class, chat(), fromAgentMd() factory
```

**Startup order in `index.ts`:** WS server opens first (so Godot can connect during the 1.5s wait), then `runGameSetup()` runs, then `game_ready` is sent. This ordering is intentional — do not move `runGameSetup` before `new WsServer`.

**Data paths:** At runtime `__dirname` = `server/dist/`. All data paths use `path.join(__dirname, "../data")` — one level up from `dist/`.

**GameSetup:** GM picks murderer (always gets `The Liar` archetype), weapon, room. Writes six `server/data/agents/<npc_id>.md` files (chmod 444) and `server/data/truth.json`. On each server start, old agent files are chmod 644 then deleted before new ones are written. `server/data/` is gitignored.

**@google/genai API:** `systemInstruction` must be inside the `config` object, not top-level:
```typescript
await ai.models.generateContent({ model: "gemini-2.0-flash", config: { systemInstruction: ... }, contents })
```

## Godot architecture

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
├── Notebook (notebook.tscn) — notebook.gd
├── LoadingScreen (loading_screen.tscn) — loading_screen.gd
└── ChatWindow (chat_window.tscn) — chat_window.gd  [group: "chat_window"]
```

**Autoload:** `ServerBridge` (`autoloads/server_bridge.gd`) — singleton WebSocket client. Call `ServerBridge.send_player_chat(npc_id, message)` etc. from anywhere. Signals: `game_ready()`, `npc_reply(npc_id, text)`.

**WebSocket protocol** — Godot → Server: `player_chat {npc_id, message}`, `player_moved {room_name}`, `notebook_updated {text}`, `reconnect {}`. Server → Godot: `game_ready {npc_names}`, `npc_reply {npc_id, text}`, `state_snapshot {npc_chat_histories, active_npc_id}`.

**NPC click flow:** Player left-clicks NPC → `npc.gd` finds node in group `"chat_window"` → calls `chat_window.open(npc_id, npc_name)`.

**Notebook toggle:** `ui_notebook` input action (physical key N). Uses `_input` (not `_unhandled_input`) so it works even when a `TextEdit` has focus — but releases focus and closes when N pressed outside a TextEdit.

**Server spawn / shutdown:** `main.gd` calls `OS.create_process("/bin/bash", [script_path])` and stores the PID. `get_tree().auto_accept_quit = false` is required so `NOTIFICATION_WM_CLOSE_REQUEST` fires and `OS.kill(pid)` runs on window close.

## Godot conventions

- **Tile size:** 16×16px throughout
- **Tileset atlas** (`assets/tilesets/mansion_tileset.tres`): col 0=wall (collision), col 1=door (no collision), col 2=generic floor, cols 3–11=room-specific floors (Kitchen→DiningRoom)
- **Mansion layout:** 9 rooms in a 3×3 grid. Each room block is 20×17 tiles with a 1-tile gap between blocks. The tilemap is generated at runtime by `mansion_generator.gd` (`@tool`) — do not hand-paint tiles
- **NPC exports:** Each NPC instance in `main.tscn` has `@export var npc_name`, `@export var npc_id` (e.g. `"npc_scarlett"`), and `@export var npc_texture`
- **Camera:** `Camera2D` is a child of `Player` (zoom=4×). Do not reparent at runtime
- **UI scenes** (`loading_screen.gd`, `chat_window.gd`) build their node trees programmatically in `_ready()` rather than in `.tscn` files, to keep scene files minimal

## Asset pipeline

All sprites are placeholder pixel art generated via Node.js scripts (no npm packages — raw zlib PNG encoding). To regenerate or add sprites: write a self-contained Node.js script to `/tmp/`, run it, verify outputs, delete script. Never commit generator scripts.

## Implementation phases

- **Phase 0** ✅ Graphical draft — navigable mansion, 6 NPCs, HUD, notebook
- **Phase 1** ✅ Core infrastructure — Node.js server, WebSocket bridge, NPC chat, GM setup
- **Phase 2** NPC intelligence — memory graphs, autonomy loop, NPC↔NPC conversations
- **Phase 3** Games Master — evaluation loop, spy system, heat score
- **Phase 4** Game loop — accusation flow, win/lose endings

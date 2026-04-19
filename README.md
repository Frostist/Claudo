# Claudo

Claudo is a 2D top-down murder mystery game built with Godot 4.6.

Someone was murdered in the mansion. Your job is to find out who did it, with what weapon, and in which room.

## Current state

The project is in active phased development:

- Phase 0: graphical draft (done)
- Phase 1: core infrastructure (done)
- Phase 2+: NPC intelligence, GM pressure systems, and accusation flow (in progress)

## How it works

- On each run, a Games Master service generates a fresh murder scenario.
- Six suspect NPCs are instantiated with generated archetypes and backstories.
- Godot runs the game client while a local Node.js/TypeScript server handles AI and game-state logic over WebSocket.

## Controls

- Move: `WASD` or arrow keys
- Start chat with nearest NPC: `C`
- Close chat window: `Esc`
- Toggle notebook: `N`

## Tech stack

- `Godot 4.6` (GDScript)
- `Node.js >= 18` + TypeScript
- `@anthropic-ai/sdk` (GM setup generation)
- `@google/genai` (NPC chat responses)
- `ws` (Godot ↔ server transport)

## Requirements

- Godot 4.6 installed
- Node.js 18+ installed
- API keys in `server/.env`:
  - `ANTHROPIC_API_KEY`
  - `GOOGLE_API_KEY`

You can copy `server/.env.example` to `server/.env` and fill in your keys.

## Running

1. Open the project in Godot 4.6.
2. Press `F5`.

`scenes/main/main.gd` automatically spawns `server/start.sh`, which launches `server/dist/index.js` and logs to `server/server.log`.

```text
 ██████╗██╗      █████╗ ██╗   ██╗██████╗  ██████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔═══██╗
██║     ██║     ███████║██║   ██║██║  ██║██║   ██║
██║     ██║     ██╔══██║██║   ██║██║  ██║██║   ██║
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝╚██████╔╝
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝
```

# Claudo

Claudo is a 2D top-down murder mystery game built with Godot 4.6.

Someone was murdered in the mansion. Your job is to figure out **who did it**, **with what weapon**, and **in which room**.

## How to Play

1. Walk around the mansion and meet the suspects.
2. Talk to nearby NPCs and compare their stories.
3. Track clues and contradictions in your notebook.
4. Build your theory about the killer, weapon, and room.

Each run generates a fresh mystery, so no two games are exactly the same.

## Controls

- Move: Arrow keys
- Talk to nearest NPC: `C`
- Close chat window: `Esc`
- Toggle notebook: `N`

## How It Works

- A local Game Master service generates a new murder scenario at startup.
- Six suspect NPCs are created with generated archetypes and backstories.
- Godot runs the game client while a local Node.js/TypeScript server handles AI + state over WebSocket.

## Project Status

The project is in active phased development:

- Phase 0: graphical draft (done)
- Phase 1: core infrastructure (done)
- Phase 2+: NPC intelligence, GM pressure systems, and accusation flow (in progress)

## Tech Stack

- `Godot 4.6` (GDScript)
- `Node.js >= 18` + TypeScript
- `@google/genai` (NPC chat responses)
- `ws` (Godot <-> server transport)

## Requirements

- Godot 4.6 installed
- Node.js 18+ installed
- `GOOGLE_API_KEY` in `server/.env`

Copy `server/.env.example` to `server/.env`, then add your key.

## Running the Game

1. Open the project in Godot 4.6.
2. Press `F5`.

`scenes/main/main.gd` automatically starts `server/start.sh`, which launches `server/dist/index.js` and writes logs to `server/server.log`.

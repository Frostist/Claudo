# Claudo — Game Design Spec
**Date:** 2026-04-18  
**Status:** Approved

---

## Overview

Claudo is a 2D top-down pixel art murder mystery game built in Godot 4.6. The player takes the role of a detective investigating a murder inside a mansion. All suspects (NPCs) are autonomous AI agents powered by Google Gemini. An overarching Games Master (Claude Opus 4.7) monitors player progress and dynamically adjusts game difficulty to keep the experience fun and tense.

The game is a spiritual successor to Cluedo: one mansion, six suspects, nine rooms, one murder. Unlike Cluedo, the world is alive — NPCs walk between rooms, gossip with each other, form relationships, and maintain their own evolving memory graphs.

---

## System Architecture

### Two-Process Design

**Godot 4.6** — rendering, input, game world, UI. Knows nothing about AI. Communicates exclusively via WebSocket.

**Node.js/TypeScript Agent Server** — all AI logic. Launched automatically by Godot on startup via `OS.create_process()`. Killed when Godot closes. Player never sees a terminal.

```
Godot 4.6 (render + input)
  ↕ WebSocket
Node.js/TypeScript Agent Server
  ├── NpcAgent × 6       → Google Gemini Flash / Pro
  ├── GamesMaster        → Claude Opus 4.7
  ├── MemoryStore        → JSON files per NPC
  └── MCP Tool Interface → read/write game state
```

### WebSocket Event Protocol

**Godot → Server:**
- `player_chat` — player message to an NPC
- `player_moved` — player entered a room
- `npc_collision` — player walked near an NPC
- `notebook_updated` — player wrote a new note

**Server → Godot:**
- `npc_reply` — NPC response text
- `npc_moved` — NPC changed room
- `npc_chat_npc` — two NPCs had a conversation (for ambient display)
- `npc_died` — NPC eliminated, trigger body sprite
- `gm_event` — Games Master action notification

### WebSocket Resilience

If the WebSocket connection drops mid-game, Godot displays a "Connection lost — reconnecting…" overlay and attempts to reconnect every 3 seconds. The Node.js server holds all game state in memory for up to 5 minutes after a disconnect. If reconnection succeeds within that window, the game resumes seamlessly. If the server process dies (not just the socket), the game cannot resume — the player returns to the main menu and must start a new game.

### Startup Flow

1. Player clicks "New Game" in Godot
2. Godot spawns Node.js server via `OS.create_process()`
3. Server connects WebSocket, GM runs `GameSetup`
4. GM picks murderer NPC, weapon, and room
5. GM generates all six `agent.md` identity files and seeds each NPC's memory graph
6. `agent.md` files are locked — read-only for the rest of the game
7. Server sends `game_ready` event, Godot dismisses loading bar

---

## NPC Agent & Memory System

### Identity (`agent.md`)

Each NPC has an `agent.md` file generated fresh by the GM at game start. The GM works from a hard-coded schema that constrains valid NPC types (personality archetypes, relationship templates, role within the mystery). Within those rails the GM freely invents names, personalities, and backstories each game.

`agent.md` files are **locked once the game begins** and treated as read-only system prompts for the duration.

### Memory Graph

Each NPC has a JSON memory graph stored on disk:

```json
{
  "npc_id": "colonel_mustard",
  "lying": false,
  "facts": [
    {
      "content": "I was in the library at 9pm",
      "source": "self",
      "secret": false
    },
    {
      "content": "Mrs Peacock was arguing with someone near the study",
      "source": "npc_scarlett",
      "told_by": "npc_scarlett",
      "secret": true
    }
  ],
  "relationships": {
    "npc_peacock": { "trust": 0.3, "knows_secret": true },
    "npc_scarlett": { "trust": 0.8, "knows_secret": false }
  }
}
```

- `secret: true` — NPC knows this is sensitive and resists sharing it
- `trust` — affects how freely the NPC shares with others (0 = hostile, 1 = fully open)
- The murderer NPC has `lying: true` on all incriminating facts; their Gemini prompt instructs them to deny or deflect when those facts surface

### NPC Autonomy Loop

Every 30–60 seconds (randomised per NPC), each NPC has a **40% chance** of moving to an adjacent room. On arrival, if another NPC is present and neither is currently in a conversation (with the player or another NPC), they initiate a dialogue exchange. A busy NPC (mid-conversation) is skipped — the arriving NPC simply idles in the room. When two NPCs converse:

1. Both memory graphs are read
2. Gemini generates a natural dialogue exchange
3. Facts are extracted asymmetrically — each NPC appends only what *they* learned from the other; NPC A's new entries cite `source: npc_b` and NPC B's new entries cite `source: npc_a`. They do not append identical mirrored facts
4. The full transcript is logged for the GM to read

NPCs cannot be forced to reveal secrets — their `trust` score and `secret` flags gate what they share.

---

## Games Master System

### Role

Claude Opus 4.7 running as a persistent background agent. Prime directive: **make the game fun**. The GM is not a pure antagonist — it aims to maintain tension and pacing, not to block the player from winning.

### MCP Tool Interface

The GM has read/write access to game state via a set of TypeScript functions exposed as tools:

| Tool | Description |
|------|-------------|
| `read_chat_logs(npc_id?)` | All player↔NPC and NPC↔NPC transcripts |
| `read_memory_graph(npc_id)` | Full memory graph for one NPC |
| `read_notebook()` | Player's current notebook contents |
| `get_heat_score()` | Server-calculated score (0–100) based on how many of the three ground-truth answers (murderer, weapon, room) appear verbatim or semantically in the player's notebook notes. Each correct answer contributes ~33 points; fuzzy string matching is used so partial notes count. |
| `get_player_location()` | Current room the player is in — required for spy off-screen constraint |
| `dispatch_spy(npc_id)` | Eliminate a target NPC (subject to constraints) |

### Spy Constraints

- Maximum **2 eliminations** per game
- The **murderer NPC is permanently protected**
- Spy only acts **off-screen** — if the target is in the player's current room, elimination is queued. The queue is processed immediately when the player exits that room (no additional delay). Only one spy action can be queued at a time; if a second is dispatched while one is pending, it is rejected and the GM is notified
- Dead NPC is replaced with a body sprite; player can examine it once for a final clue fragment

### GM Evaluation Loop

The GM runs every **2 minutes**. It reads the heat score and recent transcripts, then decides whether to act. The GM prompt explicitly instructs it to prefer inaction — only intervene when the heat score rises sharply. The GM cannot modify NPC `agent.md` files mid-game.

---

## Player UI

### Chat Window

- Triggered by clicking the speech bubble above an NPC
- Slides up from the bottom of the screen
- Shows full conversation history with that specific NPC
- Text input field at the bottom; NPC responses stream in from Gemini
- Each NPC maintains a separate conversation history
- Closing the window returns movement control to the player

### Detective Notebook

- Toggled with `N` key
- Three manual pages: **Suspects**, **Weapons**, **Rooms**
- Player writes freeform notes — nothing is auto-filled
- Notebook state is sent to the server on every update so the GM can read it
- Intentionally analogue — the detective feeling depends on the player doing the deduction

### Accusation Room

- A special room on the mansion map, accessible from the start
- Contains a desk the player interacts with
- Opens a form with three dropdowns: Suspect / Weapon / Room
- The player may submit **one accusation only** — this is a final, irreversible action
- On submit, the server checks against the true answer: Correct → victory sequence; Incorrect → "case unsolved" ending
- Both endings conclude the game session; the player must start a new game to try again

### HUD

Minimal: room name in corner, notebook toggle hint. No timer, no health bar, no score.

---

## Game Scale

| Element | Count |
|---------|-------|
| Rooms | 9 |
| NPC suspects | 6 |
| Weapons | 6 (classic Cluedo set) |
| Max spy eliminations per game | 2 |
| GM evaluation interval | 2 minutes |
| NPC autonomy loop interval | 30–60s (randomised) |

---

## Visual Style

- **Pixel art sprites** — all characters, objects, and room furniture
- Proof-of-concept uses placeholder sprites (e.g. existing `chest.png` asset)
- Top-down perspective, tile-based rooms connected by doorways
- Visual style TBD (dark gothic, cozy illustrated, or pixel noir) — to be decided during art pass

---

## Out of Scope (v1)

- Voice input/output for player or NPCs
- Multiplayer
- Mobile support
- NPC identity persistence across multiple games
- Player character customisation

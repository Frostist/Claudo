# Phase 1 — Core Infrastructure Design Spec
**Date:** 2026-04-18  
**Status:** Approved

---

## Overview

Phase 1 wires the Godot frontend to a Node.js/TypeScript backend server. By the end of this phase: the player can walk up to an NPC, type a message, and receive a real AI-generated response from Google Gemini Flash. A Claude Opus 4.7 Games Master generates the murder scenario on startup and writes locked NPC identity files. All AI logic lives exclusively in the server; Godot knows nothing about AI.

---

## Server Structure

The `server/` directory is a TypeScript project. The compiled output (`server/dist/`) is committed so players only need Node.js installed — no npm install at runtime.

```
server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          entry point — starts WS server, runs GameSetup
│   ├── ws-server.ts      WebSocket server, message routing
│   ├── game-state.ts     in-memory state (NPC positions, active chats)
│   ├── npc-agent.ts      Gemini Flash calls, one instance per NPC
│   └── gm-agent.ts       Claude Opus 4.7 — GameSetup only in Phase 1
└── dist/                 compiled JS (committed)
```

**Dependencies:** `ws`, `@anthropic-ai/sdk`, `@google/genai`, `typescript`, `tsx` (dev)

**Runtime prerequisite:** Node.js installed on the player's machine.

**API keys:** Read from environment variables `ANTHROPIC_API_KEY` and `GOOGLE_API_KEY`. The server exits with a clear error message if either is missing.

---

## Startup Flow

1. Player presses F5 / launches the Godot game
2. `main.gd` spawns the server:
   ```gdscript
   OS.create_process("node", [ProjectSettings.globalize_path("res://server/dist/index.js")])
   ```
3. `main.gd` waits 1.5 seconds then connects WebSocket to `ws://localhost:9876`
4. Server starts, GM runs `GameSetup` (see GM Skeleton section)
5. Server sends `game_ready` event → Godot dismisses loading overlay, enables player input
6. On Godot exit, the server process is killed via the stored PID

---

## Godot WebSocket Bridge

A new `ServerBridge` autoload singleton manages the WebSocket connection lifecycle.

**File:** `autoloads/server_bridge.gd`

```gdscript
# Signals
signal npc_reply(npc_id: String, text: String)
signal game_ready()

# Public methods
func send_player_chat(npc_id: String, message: String) -> void
func send_player_moved(room_name: String) -> void
func send_notebook_updated(text: String) -> void
```

All outbound messages are JSON: `{ "event": "<type>", "data": { ... } }`.  
All inbound messages follow the same envelope.

**Reconnection:** If the WebSocket drops mid-game (transient network drop — not a server process crash), `ServerBridge` displays a "Connection lost — reconnecting…" overlay with a 5-minute countdown (reconnect attempt every 3 seconds). On success, it sends a `reconnect` event and the server responds with a `state_snapshot`. On timeout, Godot returns to the main menu. Server process crashes are not recoverable in Phase 1 — the player must restart the game.

**Registered as autoload** in Project Settings so all scenes can call `ServerBridge.send_player_chat(...)` directly.

---

## WebSocket Event Protocol

### Godot → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `player_chat` | `{ npc_id, message }` | Player message to an NPC |
| `player_moved` | `{ room_name }` | Player entered a room |
| `notebook_updated` | `{ text }` | Player wrote a note |
| `reconnect` | `{}` | Client reconnected after drop |

### Server → Godot

| Event | Payload | Description |
|-------|---------|-------------|
| `game_ready` | `{ npc_names: string[] }` | GM setup complete |
| `npc_reply` | `{ npc_id, text }` | NPC response to player |
| `state_snapshot` | `{ npc_chat_histories: { [npc_id: string]: { role: "user" \| "model", text: string }[] }, active_npc_id: string \| null }` | Full state on reconnect (transient WebSocket drop only — not server process restart) |

---

## NPC Chat

### Godot side

A new `ChatWindow` scene handles player↔NPC conversation UI.

**Files:**
```
scenes/ui/chat/
├── chat_window.tscn    CanvasLayer — scrollable history + text input
└── chat_window.gd
```

Flow:
1. Player clicks NPC speech bubble → `ChatWindow` opens, stores `active_npc_id`
2. Player types message + hits Enter → `ServerBridge.send_player_chat(npc_id, message)`
3. Input is cleared and disabled while waiting for response
4. On `npc_reply` signal → append response to scroll container, re-enable input
5. Each NPC maintains a separate client-side conversation history array
6. Pressing Escape or clicking outside closes the window

### Server side

`npc-agent.ts` maintains one `NpcAgent` instance per NPC (six total). Each instance holds:
- NPC id, name, and archetype (from `agent.md`)
- Conversation history array (for Gemini multi-turn context)

On `player_chat` event:
1. Route to the correct `NpcAgent` by `npc_id`
2. Append player message to conversation history
3. Call Gemini Flash with: system prompt (NPC persona from `agent.md`) + full conversation history
4. Append response to history
5. Send `npc_reply` back to Godot

**Phase 1 NPC persona:** Name, archetype, and a two-sentence personality description from `agent.md`. Memory graphs are Phase 2.

---

## GM Skeleton

`gm-agent.ts` runs one task in Phase 1: `GameSetup`.

### NPC names and archetypes

NPC names are fixed — they match the canonical Cluedo set used throughout the codebase. The GM assigns archetypes, backstories, and relationships within these fixed names.

| NPC ID | Name | Archetype |
|--------|------|-----------|
| `npc_scarlett` | Miss Scarlett | assigned by GM |
| `npc_mustard` | Col. Mustard | assigned by GM |
| `npc_white` | Mrs. White | assigned by GM |
| `npc_green` | Rev. Green | assigned by GM |
| `npc_peacock` | Mrs. Peacock | assigned by GM |
| `npc_plum` | Prof. Plum | assigned by GM |

The six archetypes the GM must assign one-per-NPC:

| Archetype | Behaviour |
|-----------|-----------|
| **The Liar** | Assigned exclusively to the murderer. Knows the truth; actively deflects. |
| **The Gossip** | Shares freely but often inaccurate or embellished. |
| **The Recluse** | Rarely speaks; information they share is highly reliable. |
| **The Witness** | Saw something relevant; doesn't know its significance. |
| **The Protector** | Loyal to another NPC; will cover for them. |
| **The Red Herring** | Behaves suspiciously but is innocent. |

**Critical constraint:** The murderer NPC must be assigned `The Liar` archetype. The GM prompt must enforce this explicitly.

### GameSetup sequence

1. Server starts → `gm-agent.ts` initialises Claude Opus 4.7 client
2. On startup, `server/data/agents/` is cleared: any existing `agent.md` files are made writable (`chmod 644`) then deleted before new ones are written
3. GM call: given the fixed NPC names and archetype list, randomly assign:
   - Murderer (one of the six NPCs) — must receive `The Liar` archetype
   - Weapon (one of: Candlestick, Knife, Lead Pipe, Revolver, Rope, Wrench)
   - Room (one of the nine rooms)
4. GM generates six `agent.md` files — one per NPC — each containing:
   - Name, archetype, one-paragraph backstory, relationship seeds with other NPCs
   - Murderer NPC gets additional context about the crime (never revealed to player directly)
5. Files written to `server/data/agents/` then marked read-only (`chmod 444`)
6. Ground truth written to `server/data/truth.json` (never sent to Godot)
7. Server sends `game_ready` to Godot

### agent.md format

```markdown
# [NPC Name]
**Archetype:** [archetype]
**Backstory:** [one paragraph]
**Relationships:** [brief notes on each other NPC]
**Notes:** [murderer only: crime details, never share]
```

### Locked files

After writing, the server's in-memory registry marks each `agent.md` as locked. Any future write attempt returns `{ error: "agent_md_locked", npc_id }`. The GM prompt explicitly acknowledges this constraint.

---

## Data Layout

```
server/data/
├── agents/
│   ├── npc_scarlett.md   (chmod 444)
│   ├── npc_mustard.md    (chmod 444)
│   ├── npc_white.md      (chmod 444)
│   ├── npc_green.md      (chmod 444)
│   ├── npc_peacock.md    (chmod 444)
│   └── npc_plum.md       (chmod 444)
└── truth.json            { murderer, weapon, room }
```

`server/data/` is gitignored — generated fresh on each server start. On startup, the server clears `server/data/agents/` before GameSetup runs (chmod 644 then delete any existing files), so stale read-only files from a previous run never block a new game.

---

## Loading Screen

A minimal loading overlay in Godot is displayed from server spawn until `game_ready` arrives:

- Full-screen dark panel with "Starting game…" label
- Dismissed automatically on `game_ready`
- If server fails to connect within 10 seconds, shows "Failed to start server. Is Node.js installed?" with a Quit button

---

## Out of Scope (Phase 1)

- NPC memory graphs (Phase 2)
- NPC autonomy / movement (Phase 2)
- NPC↔NPC conversations (Phase 2)
- GM evaluation loop / spy system (Phase 3)
- Heat score (Phase 3)
- Accusation flow / win-lose endings (Phase 4)

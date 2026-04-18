# Claudo — Game Design Spec
**Date:** 2026-04-18  
**Status:** Approved

---

## Overview

Claudo is a 2D top-down pixel art murder mystery game built in Godot 4.6. The player takes the role of a detective investigating a murder inside a mansion. All suspects (NPCs) are autonomous AI agents powered by Google Gemini Flash. An overarching Games Master (Claude Opus 4.7) monitors player progress and dynamically adjusts game difficulty to keep the experience fun and tense.

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
  ├── NpcAgent × 6       → Google Gemini Flash
  ├── GamesMaster        → Claude Opus 4.7
  ├── MemoryStore        → JSON files per NPC (disk-persisted)
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

If the WebSocket connection drops mid-game, Godot displays a "Connection lost — reconnecting…" overlay and attempts to reconnect every 3 seconds for up to **5 minutes**. A countdown timer is shown ("Reconnecting… 4:47 remaining"). The Node.js server flushes all game state to disk on every meaningful change (NPC memory graph updates, chat log appends, notebook updates, spy queue changes) so it can be restored after a crash. If reconnection succeeds within 5 minutes, Godot sends a `reconnect` event and the server responds with the full current game state snapshot. If a spy elimination was queued at the time of disconnect, it remains queued in the restored state — it does **not** execute automatically on reconnect; it waits for the next `player_moved` event from the recovered session as normal. If 5 minutes elapse with no reconnection, Godot dismisses the overlay, shows "Connection lost — your session could not be recovered", and returns to the main menu.

### Startup Flow

1. Player clicks "New Game" in Godot
2. Godot spawns Node.js server via `OS.create_process()`
3. Server connects WebSocket, GM runs `GameSetup`
4. GM picks murderer NPC, weapon, and room
5. GM generates all six `agent.md` identity files and seeds each NPC's memory graph
6. `agent.md` files are written to disk with OS read-only permissions (`chmod 444`) and flagged in the server's in-memory registry. Any GM tool call that attempts to write an `agent.md` returns an error response: `{ error: "agent_md_locked", npc_id }`. The GM prompt acknowledges this constraint explicitly
7. Server sends `game_ready` event, Godot dismisses loading bar

---

## NPC Agent & Memory System

### Identity (`agent.md`)

Each NPC has an `agent.md` file generated fresh by the GM at game start using a hard-coded NPC schema. The schema defines six archetypes the GM must assign one per NPC:

| Archetype | Behaviour |
|-----------|-----------|
| **The Liar** | Assigned to the murderer. Knows all truth; actively deflects and misdirects. |
| **The Gossip** | High trust with everyone; shares freely but often inaccurate or embellished. |
| **The Recluse** | Low trust; rarely speaks, but information they share is highly reliable. |
| **The Witness** | Saw something relevant; doesn't know its significance; shares readily. |
| **The Protector** | Loyal to another NPC; will cover for them or redirect suspicion. |
| **The Red Herring** | Behaves suspiciously but is innocent; creates noise for the player. |

The GM assigns names, backstories, and relationship seeds within these archetypes. `agent.md` files are **locked once the game begins** — the server's in-memory registry marks them read-only and rejects any modification attempt.

### Memory Graph

Each NPC has a JSON memory graph written to disk and kept in sync with the server's in-memory state:

```json
{
  "npc_id": "colonel_mustard",
  "archetype": "recluse",
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
- `trust` — affects how freely the NPC shares (0 = hostile, 1 = fully open)
- The murderer NPC has `lying: true` on all incriminating facts; their Gemini prompt instructs them to deny or deflect when those facts surface

### NPC Autonomy Loop

Each NPC runs an independent timer set to a random value between 30–60 seconds on game start (re-randomised after each tick). On each tick, the NPC has a **40% chance** of attempting to move to a randomly selected adjacent room. The other 60% of the time the NPC idles in place. If an NPC is mid-conversation when its autonomy timer fires, the tick is skipped entirely — the timer resets and the NPC stays put until the conversation finishes.

On arrival in a new room, the server checks: is another NPC present and is neither NPC currently in an active conversation (with the player or another NPC)? If yes, they initiate a dialogue exchange. If either NPC is busy, or if the player is actively chatting with any NPC in that room (which counts as that NPC being occupied), the arriving NPC idles. If two NPCs arrive in the same room simultaneously (within the same server tick), the one with the lower alphabetical `npc_id` initiates — the other idles.

When two NPCs converse:

1. Both memory graphs are read
2. The server calls Gemini Flash with both NPCs' `agent.md` + memory as context and generates a short dialogue exchange (3–6 turns)
3. Facts are extracted asymmetrically — the server runs a second Gemini call asking: *"What new information did NPC A learn from this conversation?"* and separately *"What new information did NPC B learn?"* Each NPC only appends what they personally learned, citing the other as source. This prevents mirrored duplicates
4. New facts are appended to each NPC's memory graph on disk
5. The full transcript is appended to the shared chat log for the GM to read

NPCs will not share facts marked `secret: true` unless their `trust` score for the other NPC is above **0.7**. If a new fact from a conversation contradicts an existing fact in an NPC's memory graph, both are retained — the newer fact is appended with a `contradicts: [fact_index]` field pointing to the older entry. The NPC's Gemini prompt is given both and instructed to treat the newer fact as more reliable unless it came from a low-trust source.

### Weapons

The six weapons in every game (classic Cluedo set):
- Candlestick
- Knife
- Lead Pipe
- Revolver
- Rope
- Wrench

---

## Games Master System

### Role

Claude Opus 4.7 running as a persistent background agent. Prime directive: **make the game fun**. The GM is not a pure antagonist — it aims to maintain tension and pacing, not to block the player from winning.

### MCP Tool Interface

The GM has access to game state via TypeScript functions exposed as tools:

| Tool | Description |
|------|-------------|
| `read_chat_logs(npc_id?)` | All player↔NPC and NPC↔NPC transcripts |
| `read_memory_graph(npc_id)` | Full memory graph for one NPC |
| `read_notebook()` | Player's current notebook contents |
| `get_heat_score()` | Server-calculated score (0–99). The server scans the entire notebook text (all three pages combined) for each of the three ground-truth answers independently. A match is detected by checking each lowercased word in the notebook against each lowercased word in the ground-truth answer independently using Levenshtein distance ≤ 2. A ground-truth answer is considered matched if **any single word** from it is matched — so "mustard" in any note matches "Colonel Mustard" and counts as 33 points. Each matched answer contributes exactly 33 points regardless of how many times it appears. Score is recalculated fresh on each GM evaluation — not incrementally. |
| `read_notebook()` | Full raw notebook text across all three pages — GM can read this alongside the heat score for qualitative assessment |
| `get_player_location()` | Current room the player is in — required for spy off-screen constraint |
| `dispatch_spy(npc_id)` | Eliminate a target NPC. Returns `{ queued: true }` if target is in player's room, `{ eliminated: true }` on immediate execution, or an error if constraints are violated |

### Spy Constraints

- Maximum **2 eliminations** per game
- The **murderer NPC is permanently protected** — `dispatch_spy` returns an error if called on them
- Spy only acts **off-screen**: if the target NPC is in the player's current room, the elimination is queued. The queue holds exactly one pending action; a second `dispatch_spy` call while one is queued returns `{ error: "spy_queue_full", retry_after: "queue_empty" }` — the GM should wait for its next evaluation cycle before retrying. The queued action is never cancelled by the GM; it remains pending until the player exits. The queued elimination executes at the moment Godot sends a `player_moved` event for the target's room — no further delay
- If the player re-enters the room before the queue processes, the elimination stays queued and waits for the next exit event
- Dead NPC sprite is replaced with a body sprite. When the player interacts with the body, the server generates one clue fragment by reading the dead NPC's memory graph and surfacing the single most relevant non-secret fact they held (selected by a Gemini call). The body is removed after the player reads this clue

### GM Evaluation Loop

The GM runs on fixed **2-minute discrete intervals** (not rolling). At each interval the server snapshots: current heat score, heat score from the previous interval, and all chat log entries appended since the last interval (bounded by timestamp). The GM reads this snapshot — it does not re-read the full session log each time. The GM system prompt instructs it to prefer inaction — only dispatch a spy when the heat score delta since the last interval is ≥ 33 (i.e. the player correctly identified at least one new answer since the last check). The GM cannot modify NPC `agent.md` files mid-game.

---

## Player UI

### Chat Window

- Triggered by clicking the speech bubble above an NPC
- Slides up from the bottom of the screen
- Shows full conversation history with that specific NPC
- Text input field at the bottom; NPC responses stream in from Gemini Flash
- Each NPC maintains a separate conversation history
- Closing the window returns movement control to the player
- If an NPC is eliminated while the player has their chat window open, the window closes immediately and displays: *"[NPC Name] is no longer available."* — no further messages can be sent to that NPC

### Detective Notebook

- Toggled with `N` key
- Three manual pages: **Suspects**, **Weapons**, **Rooms**
- Player writes freeform notes — nothing is auto-filled
- Notebook state is sent to the server on every keystroke so the GM heat score stays current
- Intentionally analogue — the detective feeling depends on the player doing the deduction

### Accusation Room

- A special room on the mansion map, accessible from the start
- Contains a desk the player interacts with
- Opens a form with three dropdowns: Suspect / Weapon / Room
- The accusation desk is disabled after submission: the desk sprite changes to a "closed" variant, the interaction prompt no longer appears, and the server rejects any further `accusation_submit` events with `{ error: "already_accused" }` — enforced both in Godot UI and server-side
- On submit, the server checks against the true answer: Correct → victory sequence; Incorrect → "case unsolved" ending
- Both endings conclude the game session; the player must start a new game to try again

### HUD

Minimal: room name in corner, notebook toggle hint. No timer, no health bar, no score.

---

## Game Scale

| Element | Detail |
|---------|--------|
| Rooms | 9 |
| NPC suspects | 6 (one per archetype) |
| Weapons | 6 (Candlestick, Knife, Lead Pipe, Revolver, Rope, Wrench) |
| Max spy eliminations per game | 2 (murderer protected) |
| GM evaluation interval | 2 minutes |
| NPC autonomy tick interval | 30–60s per NPC (randomised independently) |
| NPC move probability per tick | 40% |
| Secret sharing trust threshold | 0.7 |
| Heat score range | 0–99 |

---

## Visual Style

- **Pixel art sprites** — all characters, objects, and room furniture
- Proof-of-concept uses placeholder sprites (e.g. existing `chest.png` asset)
- Top-down perspective, tile-based rooms connected by doorways
- Visual style TBD (dark gothic, cozy illustrated, or pixel noir) — to be decided during art pass

---

## Implementation Phases

### Phase 0 — Graphical Draft (Priority)
Before any game logic or AI is wired up, build a static visual prototype in Godot. Goal: the game *looks* right. All effort goes into art, layout, and feel.

Deliverables:
- Mansion tilemap: 9 rooms connected by doorways, navigable by the player
- Player sprite: top-down character, 4-directional movement, basic animation
- NPC sprites: 6 distinct characters standing in rooms, speech bubble indicator above each
- Room name display in HUD corner
- Notebook UI panel (toggle with `N`) — static, no save/load yet
- Accusation room with desk sprite
- No WebSocket, no Node.js, no AI — pure Godot scene

This phase is complete when the player can walk through all 9 rooms, see all 6 NPCs, and the game looks like a game.

### Phase 1 — Core Infrastructure
Node.js server, WebSocket bridge, NPC chat, GM skeleton.

### Phase 2 — NPC Intelligence
Memory graphs, NPC autonomy loop, NPC↔NPC conversations.

### Phase 3 — Games Master
GM evaluation loop, spy system, heat score.

### Phase 4 — Game Loop
Game setup flow, notebook→accusation flow, win/lose endings.

---

## Out of Scope (v1)

- Voice input/output for player or NPCs
- Multiplayer
- Mobile support
- NPC identity persistence across multiple games
- Player character customisation

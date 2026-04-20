# Phase 2 — NPC Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give NPCs persistent memory, autonomous room-to-room movement, and the ability to converse with each other — making the world feel alive and letting information flow organically between characters.

**Architecture:** Three new server modules (`MemoryStore`, `AutonomyLoop`, `NpcConversation`) integrate with the existing WsServer + NpcAgent pipeline. Memory graphs are JSON files on disk; the autonomy loop runs per-NPC random timers in-process; NPC↔NPC conversations trigger when two idle NPCs land in the same room. Godot receives `npc_moved` events and tweens NPCs to their new room positions.

**Tech Stack:** Node.js/TypeScript (existing), Gemini Flash (existing), GDScript Tween for NPC movement

---

## Room Adjacency Reference

The mansion is a 3×3 grid. Only horizontal/vertical adjacency (no diagonals).

```
Kitchen       | Ballroom     | Conservatory
Billiard Room | Hall         | Library
Study         | Lounge       | Dining Room
```

Adjacent rooms per room:
- **Kitchen**: Ballroom, Billiard Room
- **Ballroom**: Kitchen, Conservatory, Hall
- **Conservatory**: Ballroom, Library
- **Billiard Room**: Kitchen, Hall, Study
- **Hall**: Ballroom, Billiard Room, Library, Lounge
- **Library**: Conservatory, Hall, Dining Room
- **Study**: Billiard Room, Lounge
- **Lounge**: Hall, Study, Dining Room
- **Dining Room**: Library, Lounge

## Initial NPC Room Assignment

Derived from spawn positions in `main.tscn`:
- `npc_scarlett` → Kitchen
- `npc_mustard` → Ballroom
- `npc_white` → Conservatory
- `npc_green` → Billiard Room
- `npc_peacock` → Hall
- `npc_plum` → Library

## Room Center Positions (Godot world-space)

Derived from actual NPC spawn positions in `main.tscn`. Use these as the tween targets.
Row 3 positions (Study/Lounge/Dining Room) are estimated — verify visually and adjust if needed.

```
Kitchen       Vector2(144, 112)   Ballroom     Vector2(354, 112)   Conservatory Vector2(576, 112)
Billiard Room Vector2(144, 306)   Hall         Vector2(354, 306)   Library      Vector2(576, 306)
Study         Vector2(144, 500)   Lounge       Vector2(354, 500)   Dining Room  Vector2(576, 500)
```

---

## File Map

### Server (new files)
| File | Responsibility |
|------|---------------|
| `server/src/memory-store.ts` | Read/write NPC memory graphs to disk; append facts; trust threshold check |
| `server/src/autonomy-loop.ts` | Per-NPC random timers; 40% move probability; adjacency-based room selection |
| `server/src/npc-conversation.ts` | NPC↔NPC dialogue generation; asymmetric fact extraction; memory updates |
| `server/tests/memory-store.test.ts` | Unit tests for MemoryStore |
| `server/tests/autonomy-loop.test.ts` | Unit tests for adjacency and move logic |
| `server/tests/npc-conversation.test.ts` | Unit tests for fact extraction parsing |

### Server (modified files)
| File | Change |
|------|--------|
| `server/src/types.ts` | Add `Fact`, `MemoryGraph`, `NpcRelationship`, `ROOM_ADJACENCY`, `NPC_STARTING_ROOMS` |
| `server/src/game-state.ts` | Add NPC room tracking (`getNpcRoom`, `setNpcRoom`, `getNpcsInRoom`) |
| `server/src/gm-agent.ts` | Update `AgentConfig` and GM prompt to produce initial facts + numeric trust scores; seed memory graphs |
| `server/src/npc-agent.ts` | Add `isBusy` flag; add `setMemoryContext()` to inject memory into system prompt |
| `server/src/index.ts` | Start `AutonomyLoop`; wire co-location conversation trigger; update `player_chat` to track `activeNpcId` |

### Godot (modified files)
| File | Change |
|------|--------|
| `autoloads/server_bridge.gd` | Handle `npc_moved` server event; emit `npc_moved(npc_id, room_name)` signal |
| `scenes/npc/npc.gd` | Add room position lookup const; tween to room center on `npc_moved` signal |

---

## Task 1: Expand Types

**Files:**
- Modify: `server/src/types.ts`

- [ ] **Step 1: Append new types to `server/src/types.ts`**

```typescript
export interface Fact {
  content: string;
  source: "self" | NpcId;
  told_by?: NpcId;       // only present when source is another NPC
  secret: boolean;
  contradicts?: number[]; // indices into facts[] of contradicted entries
}

export interface NpcRelationship {
  trust: number;          // 0–1. ≥ 0.7 = will share secrets
  knows_secret: boolean;
}

export interface MemoryGraph {
  npc_id: NpcId;
  archetype: string;
  lying: boolean;         // true only for the murderer NPC
  facts: Fact[];
  relationships: Partial<Record<NpcId, NpcRelationship>>;
}

export const ROOM_ADJACENCY: Record<string, string[]> = {
  "Kitchen":       ["Ballroom", "Billiard Room"],
  "Ballroom":      ["Kitchen", "Conservatory", "Hall"],
  "Conservatory":  ["Ballroom", "Library"],
  "Billiard Room": ["Kitchen", "Hall", "Study"],
  "Hall":          ["Ballroom", "Billiard Room", "Library", "Lounge"],
  "Library":       ["Conservatory", "Hall", "Dining Room"],
  "Study":         ["Billiard Room", "Lounge"],
  "Lounge":        ["Hall", "Study", "Dining Room"],
  "Dining Room":   ["Library", "Lounge"],
};

export const NPC_STARTING_ROOMS: Record<NpcId, string> = {
  npc_scarlett: "Kitchen",
  npc_mustard:  "Ballroom",
  npc_white:    "Conservatory",
  npc_green:    "Billiard Room",
  npc_peacock:  "Hall",
  npc_plum:     "Library",
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(types): add MemoryGraph, Fact, room adjacency, starting rooms"
```

---

## Task 2: MemoryStore

**Files:**
- Create: `server/src/memory-store.ts`
- Create: `server/tests/memory-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/memory-store.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { MemoryStore } from "../src/memory-store";
import { MemoryGraph, Fact } from "../src/types";

vi.mock("fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const baseGraph = (): MemoryGraph => ({
  npc_id: "npc_scarlett",
  archetype: "The Liar",
  lying: true,
  facts: [
    { content: "I was in the Library at 9pm", source: "self", secret: false },
    { content: "I committed the murder", source: "self", secret: true },
  ],
  relationships: {
    npc_mustard: { trust: 0.3, knows_secret: false },
    npc_green:   { trust: 0.8, knows_secret: false },
  },
});

describe("MemoryStore.appendFact", () => {
  it("appends a new fact to the graph", () => {
    const graph = baseGraph();
    const fact: Fact = {
      content: "Mustard was seen near the study",
      source: "npc_mustard",
      told_by: "npc_mustard",
      secret: false,
    };
    MemoryStore.appendFact(graph, fact);
    expect(graph.facts).toHaveLength(3);
    expect(graph.facts[2].content).toBe("Mustard was seen near the study");
  });

  it("preserves the contradicts field when present", () => {
    const graph = baseGraph();
    const fact: Fact = {
      content: "I was NOT in the Library",
      source: "npc_mustard",
      told_by: "npc_mustard",
      secret: false,
      contradicts: [0],
    };
    MemoryStore.appendFact(graph, fact);
    expect(graph.facts[2].contradicts).toEqual([0]);
  });
});

describe("MemoryStore.canShareSecret", () => {
  it("returns true when trust >= 0.7", () => {
    expect(MemoryStore.canShareSecret(baseGraph(), "npc_green")).toBe(true);
  });

  it("returns false when trust < 0.7", () => {
    expect(MemoryStore.canShareSecret(baseGraph(), "npc_mustard")).toBe(false);
  });

  it("returns false when NPC has no relationship entry", () => {
    expect(MemoryStore.canShareSecret(baseGraph(), "npc_white")).toBe(false);
  });
});

describe("MemoryStore.getShareableFacts", () => {
  it("always includes non-secret facts", () => {
    const shareable = MemoryStore.getShareableFacts(baseGraph(), "npc_mustard");
    expect(shareable.some(f => f.content === "I was in the Library at 9pm")).toBe(true);
  });

  it("excludes secret facts when trust < 0.7", () => {
    const shareable = MemoryStore.getShareableFacts(baseGraph(), "npc_mustard");
    expect(shareable.some(f => f.secret)).toBe(false);
  });

  it("includes secret facts when trust >= 0.7", () => {
    const shareable = MemoryStore.getShareableFacts(baseGraph(), "npc_green");
    expect(shareable.some(f => f.secret)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/memory-store.test.ts
```

Expected: FAIL — `MemoryStore` not found.

- [ ] **Step 3: Implement `server/src/memory-store.ts`**

```typescript
import * as fs from "fs";
import * as path from "path";
import { NpcId, MemoryGraph, Fact } from "./types";

const MEMORY_DIR = path.join(__dirname, "../data/memory");

export class MemoryStore {
  static read(npcId: NpcId): MemoryGraph {
    const raw = fs.readFileSync(path.join(MEMORY_DIR, `${npcId}.json`), "utf8");
    return JSON.parse(raw) as MemoryGraph;
  }

  static write(graph: MemoryGraph): void {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
    fs.writeFileSync(
      path.join(MEMORY_DIR, `${graph.npc_id}.json`),
      JSON.stringify(graph, null, 2),
      "utf8"
    );
  }

  static appendFact(graph: MemoryGraph, fact: Fact): void {
    graph.facts.push(fact);
  }

  static canShareSecret(graph: MemoryGraph, withNpc: NpcId): boolean {
    const rel = graph.relationships[withNpc];
    return rel !== undefined && rel.trust >= 0.7;
  }

  static getShareableFacts(graph: MemoryGraph, withNpc: NpcId): Fact[] {
    const canShare = MemoryStore.canShareSecret(graph, withNpc);
    return graph.facts.filter(f => !f.secret || canShare);
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/memory-store.test.ts
```

Expected: All 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/memory-store.ts server/tests/memory-store.test.ts
git commit -m "feat: add MemoryStore with fact append, trust threshold, disk I/O"
```

---

## Task 3: Seed Memory Graphs in GameSetup

**Files:**
- Modify: `server/src/gm-agent.ts`
- Modify: `server/tests/gm-agent.test.ts`

Update the GM prompt to request numeric trust scores and initial facts per NPC, then seed memory graph files after writing agent.md files.

- [ ] **Step 1: Update `AgentConfig` interface in `server/src/gm-agent.ts`**

Change `AgentConfig` to exported and update the `relationships` and add `initial_facts`:

```typescript
export interface AgentConfig {
  archetype: string;
  backstory: string;
  relationships: Record<string, { trust: number; description: string }>;
  initial_facts: Array<{ content: string; secret: boolean }>;
  notes: string;
}
```

- [ ] **Step 2: Update `buildAgentMd` to use the new relationship shape**

The `relLines` line currently does `.map(([otherId, desc]) => ...)` where `desc` was a string. Update it:

```typescript
function buildAgentMd(npcId: NpcId, config: AgentConfig): string {
  const name = NPC_NAMES[npcId];
  const relLines = Object.entries(config.relationships)
    .map(([otherId, rel]) => `- ${NPC_NAMES[otherId as NpcId] ?? otherId}: ${rel.description}`)
    .join("\n");
  // rest of the function unchanged
```

- [ ] **Step 3: Update GM prompt to request new response shape**

In `buildGameSetupPrompt`, keep everything in the template literal from the opening backtick through the line `6. For the murderer only, add a "notes" field...` unchanged. Replace everything from the line `Respond with ONLY valid JSON in this exact shape:` through the closing backtick `` ` `` of the return statement with:

```
Respond with ONLY valid JSON in this exact shape:
{
  "murderer": "<npc_id>",
  "weapon": "<weapon>",
  "room": "<room>",
  "agents": {
    "<npc_id>": {
      "archetype": "<archetype>",
      "backstory": "<one paragraph>",
      "relationships": {
        "<other_npc_id>": { "trust": <0.0–1.0>, "description": "<brief clause>" },
        ...one entry per other NPC...
      },
      "initial_facts": [
        { "content": "<fact this NPC knows at game start>", "secret": <true|false> },
        ...2–4 facts per NPC...
      ],
      "notes": "<crime details for murderer only, empty string for others>"
    },
    ...all six NPCs...
  }
}

Trust score guidance:
- 0.0–0.3 hostile or distrustful
- 0.4–0.6 neutral, polite but guarded
- 0.7–1.0 friendly or allied (will share secrets)

Initial facts guidance:
- 2–4 facts per NPC; make them relevant to their archetype and the murder scenario
- Murderer: include one secret=true fact about the crime (weapon + room)
- The Witness: include one non-secret fact about something they saw
- Mark secret=true only for facts the NPC would resist sharing`;
```

The final result should be a single template literal whose last line is `- Mark secret=true only for facts...` followed by the closing backtick.

- [ ] **Step 4: Add memory graph seeding to `runGameSetup`**

Add imports at top of `gm-agent.ts`:

```typescript
import { MemoryStore } from "./memory-store";
import { MemoryGraph, Fact, NpcRelationship } from "./types";
```

Add helper function before `runGameSetup`:

```typescript
function buildMemoryGraph(npcId: NpcId, config: AgentConfig, murderer: NpcId): MemoryGraph {
  const facts: Fact[] = config.initial_facts.map(f => ({
    content: f.content,
    source: "self" as const,
    secret: f.secret,
  }));

  const relationships: Partial<Record<NpcId, NpcRelationship>> = {};
  for (const [otherId, rel] of Object.entries(config.relationships)) {
    relationships[otherId as NpcId] = { trust: rel.trust, knows_secret: false };
  }

  return {
    npc_id: npcId,
    archetype: config.archetype,
    lying: npcId === murderer,
    facts,
    relationships,
  };
}
```

In `runGameSetup`, after `clearAgentsDir()` (which already handles agent.md cleanup), add a parallel memory dir cleanup. Add this helper function alongside `clearAgentsDir`:

```typescript
async function clearMemoryDir(): Promise<void> {
  if (!fs.existsSync(MEMORY_DIR)) return;
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith(".json"));
  for (const file of files) fs.unlinkSync(path.join(MEMORY_DIR, file));
}
```

Do **not** redefine `MEMORY_DIR` in `gm-agent.ts`. Instead, import it from `memory-store.ts`. Export it from `memory-store.ts` first:

In `server/src/memory-store.ts`, change the `const MEMORY_DIR` declaration to:
```typescript
export const MEMORY_DIR = path.join(__dirname, "../data/memory");
```

Then in `gm-agent.ts` add to the imports:
```typescript
import { MemoryStore, MEMORY_DIR } from "./memory-store";
```

Then in `runGameSetup`, call `clearMemoryDir()` before seeding new graphs:

```typescript
await clearAgentsDir();
await clearMemoryDir();

// Seed memory graphs
for (const [npcId, config] of Object.entries(result.agents) as [NpcId, AgentConfig][]) {
  MemoryStore.write(buildMemoryGraph(npcId, config, result.truth.murderer));
}
```

- [ ] **Step 5: Update test fixtures to match new response shape**

In `server/tests/gm-agent.test.ts`, update `sampleResponse` to include `initial_facts` and numeric `relationships`:

```typescript
const sampleResponse = JSON.stringify({
  murderer: "npc_scarlett",
  weapon: "Knife",
  room: "Library",
  agents: {
    npc_scarlett: {
      archetype: "The Liar",
      backstory: "A cunning socialite...",
      relationships: { npc_mustard: { trust: 0.2, description: "distrusts" } },
      initial_facts: [{ content: "I killed Lord Blackwood in the Library", secret: true }],
      notes: "Committed the murder with the Knife in the Library."
    },
    npc_mustard:  { archetype: "The Gossip",      backstory: "...", relationships: {}, initial_facts: [], notes: "" },
    npc_white:    { archetype: "The Recluse",     backstory: "...", relationships: {}, initial_facts: [], notes: "" },
    npc_green:    { archetype: "The Witness",     backstory: "...", relationships: {}, initial_facts: [], notes: "" },
    npc_peacock:  { archetype: "The Protector",   backstory: "...", relationships: {}, initial_facts: [], notes: "" },
    npc_plum:     { archetype: "The Red Herring", backstory: "...", relationships: {}, initial_facts: [], notes: "" },
  }
});
```

Also update the bad-response fixture for the Liar test — add `initial_facts: []` and numeric `relationships: {}` to all agents there.

- [ ] **Step 6: Run all tests — expect PASS**

```bash
cd server && npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/gm-agent.ts server/tests/gm-agent.test.ts
git commit -m "feat: seed NPC memory graphs from GM GameSetup; add initial facts and trust scores"
```

---

## Task 4: NPC Room Tracking in GameState

**Files:**
- Modify: `server/src/game-state.ts`
- Modify: `server/tests/game-state.test.ts`

- [ ] **Step 1: Add failing tests**

Append inside the `describe("GameState", ...)` block in `server/tests/game-state.test.ts`:

```typescript
  it("initialises NPC rooms from NPC_STARTING_ROOMS", () => {
    expect(state.getNpcRoom("npc_scarlett")).toBe("Kitchen");
    expect(state.getNpcRoom("npc_plum")).toBe("Library");
  });

  it("updates NPC room on setNpcRoom", () => {
    state.setNpcRoom("npc_mustard", "Hall");
    expect(state.getNpcRoom("npc_mustard")).toBe("Hall");
  });

  it("getNpcsInRoom returns only NPCs in that room", () => {
    state.setNpcRoom("npc_scarlett", "Hall");
    state.setNpcRoom("npc_mustard", "Hall");
    const inHall = state.getNpcsInRoom("Hall");
    expect(inHall).toContain("npc_scarlett");
    expect(inHall).toContain("npc_mustard");
    expect(inHall).not.toContain("npc_white");
  });

  it("records NPC↔NPC conversation transcript", () => {
    state.recordNpcConversation("npc_scarlett", "npc_mustard", "Hall", "Scarlett: Hello.\nMustard: Indeed.");
    expect(state.getNpcConversations()).toHaveLength(1);
    expect(state.getNpcConversations()[0].transcript).toContain("Scarlett");
  });
```

- [ ] **Step 2: Run new tests — expect FAIL**

```bash
cd server && npx vitest run tests/game-state.test.ts
```

Expected: FAIL — `getNpcRoom` not found.

- [ ] **Step 3: Update `server/src/game-state.ts`**

Update the import to include `NPC_STARTING_ROOMS`:

```typescript
import { NpcId, ChatMessage, NPC_STARTING_ROOMS } from "./types";
```

Add to the `GameState` class:

```typescript
private npcRooms: Map<NpcId, string> = new Map(
  Object.entries(NPC_STARTING_ROOMS) as [NpcId, string][]
);

getNpcRoom(npcId: NpcId): string {
  return this.npcRooms.get(npcId) ?? "Hall";
}

setNpcRoom(npcId: NpcId, room: string): void {
  this.npcRooms.set(npcId, room);
}

getNpcsInRoom(room: string): NpcId[] {
  return (Array.from(this.npcRooms.entries()) as [NpcId, string][])
    .filter(([, r]) => r === room)
    .map(([id]) => id);
}

// NPC↔NPC conversation log — read by Phase 3 GM via read_chat_logs
private npcConversations: Array<{ npc_a: NpcId; npc_b: NpcId; room: string; transcript: string }> = [];

recordNpcConversation(npcA: NpcId, npcB: NpcId, room: string, transcript: string): void {
  this.npcConversations.push({ npc_a: npcA, npc_b: npcB, room, transcript });
}

getNpcConversations() {
  return [...this.npcConversations];
}
```

Update `toSnapshot()` to include NPC rooms:

```typescript
toSnapshot() {
  const npc_chat_histories: Record<string, ChatMessage[]> = {};
  for (const [id, history] of this.histories) {
    npc_chat_histories[id] = [...history];
  }
  const npc_rooms: Record<string, string> = {};
  for (const [id, room] of this.npcRooms) {
    npc_rooms[id] = room;
  }
  return { npc_chat_histories, active_npc_id: this.activeNpcId, npc_rooms };
}
```

- [ ] **Step 4: Run all tests — expect PASS**

```bash
cd server && npm test
```

- [ ] **Step 5: Commit**

```bash
git add server/src/game-state.ts server/tests/game-state.test.ts
git commit -m "feat: add NPC room tracking to GameState"
```

---

## Task 5: AutonomyLoop

**Files:**
- Create: `server/src/autonomy-loop.ts`
- Create: `server/tests/autonomy-loop.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/autonomy-loop.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getAdjacentRooms, pickMoveTarget, AutonomyLoop } from "../src/autonomy-loop";
import type { NpcId } from "../src/types";

describe("getAdjacentRooms", () => {
  it("returns correct adjacent rooms for Hall (centre)", () => {
    const adj = getAdjacentRooms("Hall");
    expect(adj).toContain("Ballroom");
    expect(adj).toContain("Billiard Room");
    expect(adj).toContain("Library");
    expect(adj).toContain("Lounge");
    expect(adj).not.toContain("Hall");
    expect(adj).not.toContain("Kitchen");
  });

  it("returns correct adjacent rooms for Kitchen (corner — only 2)", () => {
    const adj = getAdjacentRooms("Kitchen");
    expect(adj).toEqual(expect.arrayContaining(["Ballroom", "Billiard Room"]));
    expect(adj).toHaveLength(2);
  });

  it("returns empty array for an unknown room", () => {
    expect(getAdjacentRooms("Dungeon")).toEqual([]);
  });
});

describe("pickMoveTarget", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns an adjacent room when Math.random < 0.4", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.39)  // move check passes
      .mockReturnValueOnce(0.0);  // pick first adjacent room
    const target = pickMoveTarget("Kitchen");
    expect(["Ballroom", "Billiard Room"]).toContain(target);
  });

  it("returns null when Math.random >= 0.4 (NPC idles)", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.5);
    expect(pickMoveTarget("Kitchen")).toBeNull();
  });
});

describe("AutonomyLoop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("calls onNpcMoved when a tick fires and NPC is not busy", async () => {
    const rooms = new Map<NpcId, string>([["npc_scarlett", "Kitchen"]]);
    const moved = vi.fn().mockResolvedValue(undefined);

    // Force move probability to always move, pick first adjacent room
    vi.spyOn(Math, "random")
      .mockReturnValue(0.0);  // 0 < 0.4 → move; 0 * 2 → index 0

    const loop = new AutonomyLoop(
      (id) => rooms.get(id) ?? "Hall",
      (id, room) => rooms.set(id, room),
      moved,
      () => false
    );
    loop.start(["npc_scarlett"]);

    // Advance past the minimum tick interval (30s)
    await vi.advanceTimersByTimeAsync(31_000);

    expect(moved).toHaveBeenCalledOnce();
    expect(moved.mock.calls[0][0]).toBe("npc_scarlett");
  });

  it("skips movement and reschedules when NPC is busy", async () => {
    const moved = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(Math, "random").mockReturnValue(0.0);

    const loop = new AutonomyLoop(
      () => "Kitchen",
      () => {},
      moved,
      () => true  // always busy
    );
    loop.start(["npc_scarlett"]);
    await vi.advanceTimersByTimeAsync(31_000);

    expect(moved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/autonomy-loop.test.ts
```

Expected: FAIL — `getAdjacentRooms` not found.

- [ ] **Step 3: Implement `server/src/autonomy-loop.ts`**

```typescript
import { NpcId, ROOM_ADJACENCY } from "./types";

const MIN_TICK_MS = 30_000;
const MAX_TICK_MS = 60_000;
const MOVE_PROBABILITY = 0.4;

export type OnNpcMoved = (npcId: NpcId, newRoom: string) => Promise<void>;

export function getAdjacentRooms(room: string): string[] {
  return ROOM_ADJACENCY[room] ?? [];
}

export function pickMoveTarget(currentRoom: string): string | null {
  if (Math.random() >= MOVE_PROBABILITY) return null;
  const adjacent = getAdjacentRooms(currentRoom);
  if (adjacent.length === 0) return null;
  return adjacent[Math.floor(Math.random() * adjacent.length)];
}

export class AutonomyLoop {
  private timers = new Map<NpcId, ReturnType<typeof setTimeout>>();

  constructor(
    private getNpcRoom: (npcId: NpcId) => string,
    private setNpcRoom: (npcId: NpcId, room: string) => void,
    private onNpcMoved: OnNpcMoved,
    private isNpcBusy: (npcId: NpcId) => boolean
  ) {}

  start(npcIds: NpcId[]): void {
    for (const npcId of npcIds) {
      this.scheduleTick(npcId);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private scheduleTick(npcId: NpcId): void {
    const delay = MIN_TICK_MS + Math.random() * (MAX_TICK_MS - MIN_TICK_MS);
    this.timers.set(npcId, setTimeout(() => this.tick(npcId), delay));
  }

  private async tick(npcId: NpcId): Promise<void> {
    if (!this.isNpcBusy(npcId)) {
      const target = pickMoveTarget(this.getNpcRoom(npcId));
      if (target) {
        this.setNpcRoom(npcId, target);
        await this.onNpcMoved(npcId, target);
      }
    }
    this.scheduleTick(npcId);
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/autonomy-loop.test.ts
```

Expected: All 9 tests pass (3 adjacency + 2 pickMoveTarget + 2 AutonomyLoop class).

- [ ] **Step 5: Commit**

```bash
git add server/src/autonomy-loop.ts server/tests/autonomy-loop.test.ts
git commit -m "feat: add AutonomyLoop with per-NPC timers and adjacency-based movement"
```

---

## Task 6: Godot NPC Movement

**Files:**
- Modify: `autoloads/server_bridge.gd`
- Modify: `scenes/npc/npc.gd`

- [ ] **Step 1: Add `npc_moved` signal to `server_bridge.gd`**

Add the signal declaration after the existing signal declarations:

```gdscript
signal npc_moved(npc_id: String, room_name: String)
```

Add a new match case inside `_handle_message`:

```gdscript
"npc_moved":
    var d: Dictionary = msg.get("data", {})
    npc_moved.emit(d.get("npc_id", ""), d.get("room_name", ""))
```

- [ ] **Step 2: Add room positions and movement to `scenes/npc/npc.gd`**

Do **not** replace the full file — that would erase the existing `_unhandled_input` chat handler. Make three targeted edits to `scenes/npc/npc.gd`:

**a)** After the `@onready var sprite` line, add the room positions constant:

```gdscript
# World-space room centres. Row 3 positions are estimated — verify visually and adjust if needed.
const ROOM_POSITIONS: Dictionary = {
  "Kitchen":       Vector2(144, 112),
  "Ballroom":      Vector2(354, 112),
  "Conservatory":  Vector2(576, 112),
  "Billiard Room": Vector2(144, 306),
  "Hall":          Vector2(354, 306),
  "Library":       Vector2(576, 306),
  "Study":         Vector2(144, 500),
  "Lounge":        Vector2(354, 500),
  "Dining Room":   Vector2(576, 500),
}
```

**b)** Inside `_ready()`, append after `add_to_group("npc")`:

```gdscript
  ServerBridge.npc_moved.connect(_on_npc_moved)
```

**c)** Append a new function at the end of the file:

```gdscript
func _on_npc_moved(moved_npc_id: String, room_name: String) -> void:
  if moved_npc_id != npc_id:
    return
  var target := ROOM_POSITIONS.get(room_name, global_position) as Vector2
  var tween := create_tween()
  tween.tween_property(self, "global_position", target, 1.0).set_trans(Tween.TRANS_LINEAR)
```

- [ ] **Step 3: Commit**

```bash
git add autoloads/server_bridge.gd scenes/npc/npc.gd
git commit -m "feat: NPC movement — npc_moved signal and tween to room centre on server event"
```

---

## Task 7: NPC↔NPC Conversation

**Files:**
- Create: `server/src/npc-conversation.ts`
- Create: `server/tests/npc-conversation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/npc-conversation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseLearned } from "../src/npc-conversation";

describe("parseLearned", () => {
  it("parses a valid JSON array of learned facts", () => {
    const raw = JSON.stringify([
      { content: "Mrs Peacock was in the Hall at 9pm", secret: false },
      { content: "Col. Mustard has been acting strangely", secret: false },
    ]);
    const facts = parseLearned(raw);
    expect(facts).toHaveLength(2);
    expect(facts[0].content).toBe("Mrs Peacock was in the Hall at 9pm");
  });

  it("strips markdown code fences before parsing", () => {
    const raw = "```json\n[{\"content\":\"a fact\",\"secret\":false}]\n```";
    expect(parseLearned(raw)).toHaveLength(1);
  });

  it("returns empty array on malformed JSON", () => {
    expect(parseLearned("not json")).toEqual([]);
  });

  it("returns empty array when JSON is not an array", () => {
    expect(parseLearned(JSON.stringify({ content: "a fact" }))).toEqual([]);
  });

  it("filters out entries missing required fields", () => {
    const raw = JSON.stringify([
      { content: "valid", secret: false },
      { text: "missing content field" },
    ]);
    expect(parseLearned(raw)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/npc-conversation.test.ts
```

Expected: FAIL — `parseLearned` not found.

- [ ] **Step 3: Implement `server/src/npc-conversation.ts`**

```typescript
import { GoogleGenAI } from "@google/genai";
import { NpcId, NPC_NAMES, Fact, MemoryGraph } from "./types";
import { MemoryStore } from "./memory-store";

export interface ConversationTurn {
  speaker: NpcId;
  text: string;
}

export interface ConversationResult {
  transcript: ConversationTurn[];
  learnedA: Fact[];
  learnedB: Fact[];
}

export function parseLearned(raw: string): Fact[] {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is Fact =>
        typeof f.content === "string" && typeof f.secret === "boolean"
    );
  } catch {
    return [];
  }
}

function buildDialoguePrompt(
  npcAId: NpcId, graphA: MemoryGraph,
  npcBId: NpcId, graphB: MemoryGraph
): string {
  const nameA = NPC_NAMES[npcAId];
  const nameB = NPC_NAMES[npcBId];

  const factsA = MemoryStore.getShareableFacts(graphA, npcBId)
    .map(f => `- ${f.content}`).join("\n") || "(nothing to share)";
  const factsB = MemoryStore.getShareableFacts(graphB, npcAId)
    .map(f => `- ${f.content}`).join("\n") || "(nothing to share)";

  return `Two guests at a murder mystery are meeting in a room.

${nameA} (${graphA.archetype}) — facts they may share:
${factsA}

${nameB} (${graphB.archetype}) — facts they may share:
${factsB}

Write a natural 3–6 turn conversation. Stay in character with their archetypes.
They may reveal, hint at, or withhold facts.

Respond ONLY with valid JSON array of turns:
[
  { "speaker": "${npcAId}", "text": "..." },
  { "speaker": "${npcBId}", "text": "..." }
]`;
}

function buildExtractionPrompt(
  learnerName: string,
  otherName: string,
  existingFacts: Fact[],
  transcript: ConversationTurn[]
): string {
  const lines = transcript
    .map(t => `${NPC_NAMES[t.speaker] ?? t.speaker}: ${t.text}`)
    .join("\n");
  const existing = existingFacts.map(f => `- ${f.content}`).join("\n") || "(none)";
  return `After this conversation:\n\n${lines}\n\nFacts ${learnerName} already knew before the conversation:\n${existing}\n\nWhat NEW factual information did ${learnerName} learn from ${otherName}? Exclude anything already in the known-facts list above. Exclude opinions. Exclude things ${learnerName} said themselves.\n\nFor each new fact, also note whether it CONTRADICTS any of the existing facts by including a "contradicts_existing" field with the exact text of the contradicted fact, or omit the field if there is no contradiction.\n\nRespond ONLY with valid JSON array (empty array if nothing new was learned):\n[{ "content": "...", "secret": true|false, "contradicts_existing": "<exact text of contradicted fact or omit>" }]`;
}

export async function runNpcConversation(
  npcAId: NpcId,
  npcBId: NpcId,
  graphA: MemoryGraph,
  graphB: MemoryGraph,
  apiKey: string
): Promise<ConversationResult> {
  const ai = new GoogleGenAI({ apiKey });

  // Step 1: Generate dialogue
  const dialogueResp = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: buildDialoguePrompt(npcAId, graphA, npcBId, graphB) }] }],
  });
  const rawDialogue = (dialogueResp as { text: string }).text ?? "[]";

  let transcript: ConversationTurn[] = [];
  try {
    const cleaned = rawDialogue.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      console.warn("[NpcConversation] Dialogue response was not an array — skipping");
      return { transcript: [], learnedA: [], learnedB: [] };
    }
    transcript = parsed;
  } catch {
    console.warn("[NpcConversation] Failed to parse dialogue JSON — skipping fact extraction");
    return { transcript: [], learnedA: [], learnedB: [] };
  }

  // Step 2: Asymmetric fact extraction — two parallel Gemini calls, passing existing facts for contradiction detection
  const [respA, respB] = await Promise.all([
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: buildExtractionPrompt(NPC_NAMES[npcAId], NPC_NAMES[npcBId], graphA.facts, transcript) }] }],
    }),
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: buildExtractionPrompt(NPC_NAMES[npcBId], NPC_NAMES[npcAId], graphB.facts, transcript) }] }],
    }),
  ]);

  // Resolve "contradicts_existing" text references to fact indices
  function resolveContradictions(rawFacts: Fact[], existingFacts: Fact[], toldBy: NpcId): Fact[] {
    return rawFacts.map((f: Fact & { contradicts_existing?: string }) => {
      const result: Fact = { ...f, source: toldBy, told_by: toldBy };
      if (f.contradicts_existing) {
        const idx = existingFacts.findIndex(e => e.content === f.contradicts_existing);
        if (idx >= 0) result.contradicts = [idx];
        delete (result as Fact & { contradicts_existing?: string }).contradicts_existing;
      }
      return result;
    });
  }

  const learnedA = resolveContradictions(
    parseLearned((respA as { text: string }).text ?? "[]") as (Fact & { contradicts_existing?: string })[],
    graphA.facts, npcBId
  );
  const learnedB = resolveContradictions(
    parseLearned((respB as { text: string }).text ?? "[]") as (Fact & { contradicts_existing?: string })[],
    graphB.facts, npcAId
  );

  // Step 3: Update memory graphs
  for (const fact of learnedA) MemoryStore.appendFact(graphA, fact);
  for (const fact of learnedB) MemoryStore.appendFact(graphB, fact);
  MemoryStore.write(graphA);
  MemoryStore.write(graphB);

  console.log(`[NpcConversation] ${npcAId} learned ${learnedA.length} facts, ${npcBId} learned ${learnedB.length} facts`);
  return { transcript, learnedA, learnedB };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/npc-conversation.test.ts
```

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/npc-conversation.ts server/tests/npc-conversation.test.ts
git commit -m "feat: add NPC↔NPC conversation with asymmetric fact extraction"
```

---

## Task 8: Wire Autonomy + Conversation in index.ts

**Files:**
- Modify: `server/src/npc-agent.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add `isBusy` flag to `NpcAgent`**

In `server/src/npc-agent.ts`, add a public field:

```typescript
isBusy: boolean = false;
```

Wrap the `chat()` body in a try/finally to ensure `isBusy` is cleared even on error:

```typescript
async chat(playerMessage: string): Promise<string> {
  this.isBusy = true;
  try {
    this.history.push({ role: "user", text: playerMessage });
    // ... rest of existing chat logic unchanged ...
    return replyText;
  } finally {
    this.isBusy = false;
  }
}
```

- [ ] **Step 2: Verify `buildSystemPrompt` and `this.systemPrompt` exist in `NpcAgent`**

Open `server/src/npc-agent.ts`. Confirm that:
- `private buildSystemPrompt(): string` already exists as a method (it does — built during Phase 1)
- The constructor sets `this.systemPrompt = this.buildSystemPrompt()`
- `chat()` passes `this.systemPrompt` as `systemInstruction` in the Gemini call

If any of these are missing, add them before proceeding. The Phase 1 implementation already has all three; this step is a guard.

- [ ] **Step 3: Add `setMemoryContext` to `NpcAgent`**

Add import for `MemoryGraph` and `NPC_NAMES` if not already present, then add the method:

```typescript
setMemoryContext(graph: MemoryGraph): void {
  const facts = graph.facts
    .map(f => `- ${f.content}${f.secret ? " [you consider this sensitive]" : ""}`)
    .join("\n") || "(no known facts)";

  const rels = (Object.entries(graph.relationships) as [NpcId, NpcRelationship][])
    .map(([id, rel]) => `- ${NPC_NAMES[id] ?? id}: trust ${Math.round(rel.trust * 100)}%`)
    .join("\n") || "(no established relationships)";

  this.systemPrompt = this.buildSystemPrompt()
    + `\n\nYour current knowledge:\n${facts}\n\nYour relationships:\n${rels}`;
}
```

Add `NpcRelationship` to the import from `./types`.

- [ ] **Step 3: Update `server/src/index.ts`**

Add imports at top:

```typescript
import { AutonomyLoop } from "./autonomy-loop";
import { MemoryStore } from "./memory-store";
import { runNpcConversation } from "./npc-conversation";
```

In the `player_chat` case, set and clear `activeNpcId` around the chat call:

```typescript
case "player_chat": {
  const npcId = data.npc_id as NpcId;
  const message = data.message as string;
  const agent = agents.get(npcId);
  if (!agent) break;

  if (agent.isBusy) {
    ws.send("npc_reply", { npc_id: npcId, text: "[They are currently occupied — try again in a moment.]" });
    break;
  }

  state.activeNpcId = npcId;  // mark player as chatting
  state.appendMessage(npcId, { role: "user", text: message });

  try {
    const graph = MemoryStore.read(npcId);
    agent.setMemoryContext(graph);
  } catch { /* memory not yet written — shouldn't happen post-setup */ }

  const reply = await agent.chat(message);
  state.appendMessage(npcId, { role: "model", text: reply });
  state.activeNpcId = null;   // clear after reply
  ws.send("npc_reply", { npc_id: npcId, text: reply });
  break;
}
```

After `agents` is fully populated (after the `for...of NPC_NAMES` loop), add:

```typescript
// Co-location conversation helper
const conversationsInProgress = new Set<string>();

function conversationKey(a: NpcId, b: NpcId): string {
  return [a, b].sort().join("+");
}

async function maybeStartConversation(arrivedNpc: NpcId, room: string): Promise<void> {
  const others = state.getNpcsInRoom(room).filter(id => id !== arrivedNpc);
  if (others.length === 0) return;

  // Pick a partner. conversationsInProgress guards against double-triggering when two
  // NPCs arrive simultaneously — both ticks hit the has(key) check before any await.
  const partner = others.sort()[0];
  const agentA = agents.get(arrivedNpc);
  const agentB = agents.get(partner);
  if (!agentA || !agentB) return;
  if (agentA.isBusy || agentB.isBusy) return;
  // Spec: if the player is chatting with ANY NPC in this room, the arriving NPC idles
  const activeId = state.activeNpcId;
  if (activeId && state.getNpcRoom(activeId) === room) return;

  const key = conversationKey(arrivedNpc, partner);
  if (conversationsInProgress.has(key)) return;
  conversationsInProgress.add(key);

  agentA.isBusy = true;
  agentB.isBusy = true;
  try {
    console.log(`[Conversation] ${arrivedNpc} ↔ ${partner} in ${room}`);
    const graphA = MemoryStore.read(arrivedNpc);
    const graphB = MemoryStore.read(partner);
    const result = await runNpcConversation(arrivedNpc, partner, graphA, graphB, process.env.GOOGLE_API_KEY!);
    const lines = result.transcript.map(t => `${NPC_NAMES[t.speaker]}: ${t.text}`).join("\n");
    state.recordNpcConversation(arrivedNpc, partner, room, lines);  // in-memory log; Phase 3 GM reads via state
    ws.send("npc_chat_npc", { npc_a: arrivedNpc, npc_b: partner, room, transcript: lines });
  } catch (err) {
    console.error("[Conversation] Error:", err);
  } finally {
    agentA.isBusy = false;
    agentB.isBusy = false;
    conversationsInProgress.delete(key);
  }
}

// Start autonomy loop
const loop = new AutonomyLoop(
  (npcId) => state.getNpcRoom(npcId),
  (npcId, room) => state.setNpcRoom(npcId, room),
  async (npcId, room) => {
    ws.send("npc_moved", { npc_id: npcId, room_name: room });
    await maybeStartConversation(npcId, room);
  },
  (npcId) => agents.get(npcId)?.isBusy ?? false
);

loop.start(Object.keys(NPC_NAMES) as NpcId[]);
console.log("[Server] Autonomy loop started");
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run all tests**

```bash
cd server && npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/npc-agent.ts server/src/index.ts
git commit -m "feat: wire autonomy loop, NPC↔NPC conversation trigger, memory context in player chat"
```

---

## Task 9: Build and Integration Test

- [ ] **Step 1: Run full test suite**

```bash
cd server && npm test
```

Expected: All tests pass. If any fail, fix before proceeding.

- [ ] **Step 2: Build**

```bash
cd server && npm run build
```

Expected: No errors. `server/dist/` updated.

- [ ] **Step 3: Launch game and verify**

Press **F5** in Godot. After the loading screen dismisses:

- [ ] `server/data/memory/` contains six `.json` memory graph files with `facts` and `relationships`
- [ ] Godot output shows `[Server] Autonomy loop started`
- [ ] After 30–60 seconds, server log shows `npc_moved` events being sent
- [ ] NPCs visibly tween to new room positions (verify room-3 positions are approximately correct; adjust `ROOM_POSITIONS` in `npc.gd` if needed)
- [ ] When two NPCs land in the same room, server log shows `[Conversation] npc_X ↔ npc_Y in RoomName`
- [ ] After a conversation, the NPC `.json` files in `server/data/memory/` show new facts appended
- [ ] Chatting with an NPC returns replies that reference their backstory and known facts
- [ ] Pressing C near an NPC still opens chat; Escape closes it

- [ ] **Step 4: Commit dist**

```bash
git add server/dist/
git commit -m "build: compile Phase 2 server dist"
```

---

## Done

Phase 2 is complete when: NPCs move autonomously between rooms, hold natural conversations when they meet, accumulate new facts in their memory graphs, and use that living memory to give richer, contextually aware answers when interrogated by the player.

Next: **Phase 3 — Games Master** (GM evaluation loop, spy system, heat score).

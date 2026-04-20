# Phase 3 — Games Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the GM evaluation loop — Claude Opus 4.7 watches the player's notebook every 2 minutes, calculates a heat score, and dispatches the spy to eliminate NPCs when the player gets too close to the truth.

**Architecture:** Three new server modules (`heat-score.ts`, `spy-system.ts`, `gm-loop.ts`) wire into the existing `GameState`/`WsServer` pipeline. The GM loop runs on a 2-minute `setInterval`; it calls Claude Opus with six MCP-style tools and processes tool calls in a loop. The spy system manages a single-slot queue for off-screen eliminations, executes on `player_moved`. Godot receives `npc_eliminated` and `npc_clue` events and updates NPC sprites accordingly.

**Tech Stack:** Node.js/TypeScript (existing), Anthropic SDK (existing, model `claude-opus-4-7`), Gemini Flash (for body clue generation), Godot 4.6 GDScript

---

## Spec Reference

Key constraints from `docs/superpowers/specs/2026-04-18-claudo-game-design.md`:

**Heat score:**
- 0–99. Each of murderer name / weapon / room contributes exactly 33 points if matched.
- Match: any single lowercased word from the ground-truth answer is within Levenshtein distance ≤ 2 of any lowercased word in the notebook text.
- Murderer match uses `NPC_NAMES[truth.murderer]` (display name), not the NPC ID.
- Recalculated fresh each evaluation, not incrementally.

**GM evaluation:**
- Fixed 2-minute discrete intervals (not rolling).
- Reads: current heat score, previous heat score, new chat entries since last interval.
- Dispatches spy only when `currentHeatScore - previousHeatScore >= 33`.
- System prompt instructs to prefer inaction.

**Spy constraints:**
- Max 2 eliminations per game. Murderer permanently protected.
- Queue holds exactly one pending elimination.
- If target is in player's current room → queue. Otherwise → execute immediately.
- Queue executes when player sends `player_moved` and their **previous** room was the queued target's room.
- On `dispatch_spy` while queue is full → return `{ error: "spy_queue_full", retry_after: "queue_empty" }`.

**Dead NPC / clue:**
- Eliminated NPC sprite replaced by body indicator (gray tint on existing sprite).
- Player presses C near body → server generates one clue from dead NPC's memory graph (most relevant non-secret fact, selected by Gemini) → shown in chat window as read-only message.
- Body dismissed after player reads clue.

**Chat window:**
- If active NPC is eliminated while chat is open → close window with `"[Name] is no longer available."`.

---

## File Map

### Server (new files)
| File | Responsibility |
|------|----------------|
| `server/src/heat-score.ts` | `levenshtein(a,b)`, `calculateHeatScore(notebookText, truth)` |
| `server/src/spy-system.ts` | `SpySystem` class: `tryDispatch`, queue management, `checkPlayerMoved`, `getBodyClue` |
| `server/src/gm-loop.ts` | `GmLoop` class: 2-min interval, tool-use loop with Claude Opus |
| `server/tests/heat-score.test.ts` | Unit tests for Levenshtein and heat score |
| `server/tests/spy-system.test.ts` | Unit tests for spy dispatch, queue, murder protection |
| `server/tests/gm-loop.test.ts` | Unit tests for evaluation tick (mocked Anthropic SDK) |

### Server (modified files)
| File | Change |
|------|--------|
| `server/src/game-state.ts` | Add `notebookText`, `eliminatedNpcs`, `spyQueue`, `eliminationCount` |
| `server/src/index.ts` | Handle `notebook_updated`, `body_interacted`; check spy queue on `player_moved`; start `GmLoop` |

### Godot (modified files)
| File | Change |
|------|--------|
| `autoloads/server_bridge.gd` | Handle `npc_eliminated` and `npc_clue` server events; emit signals |
| `scenes/npc/npc.gd` | Add `_is_dead` state; gray modulate on eliminated; C-key sends `body_interacted` when dead |
| `scenes/ui/chat/chat_window.gd` | Listen for `npc_eliminated`; close with unavailable message if active NPC |

---

## Task 1: GameState additions

**Files:**
- Modify: `server/src/game-state.ts`
- Modify: `server/tests/game-state.test.ts`

- [ ] **Step 1: Add failing tests**

Append inside the `describe("GameState", ...)` block in `server/tests/game-state.test.ts`:

```typescript
  it("starts with empty notebookText", () => {
    expect(state.notebookText).toBe("");
  });

  it("updates notebookText", () => {
    state.notebookText = "I suspect Mustard";
    expect(state.notebookText).toBe("I suspect Mustard");
  });

  it("starts with zero eliminations and empty eliminated set", () => {
    expect(state.eliminationCount).toBe(0);
    expect(state.isEliminated("npc_scarlett")).toBe(false);
  });

  it("records an elimination", () => {
    state.recordElimination("npc_scarlett");
    expect(state.isEliminated("npc_scarlett")).toBe(true);
    expect(state.eliminationCount).toBe(1);
  });

  it("spy queue starts empty", () => {
    expect(state.spyQueue).toBeNull();
  });

  it("sets and clears spy queue", () => {
    state.spyQueue = "npc_mustard";
    expect(state.spyQueue).toBe("npc_mustard");
    state.spyQueue = null;
    expect(state.spyQueue).toBeNull();
  });
```

- [ ] **Step 2: Run new tests — expect FAIL**

```bash
cd server && npx vitest run tests/game-state.test.ts
```

Expected: FAIL — `isEliminated` not found.

- [ ] **Step 3: Update `server/src/game-state.ts`**

Add new fields and methods to the `GameState` class:

```typescript
notebookText: string = "";
eliminationCount: number = 0;
spyQueue: NpcId | null = null;
private eliminatedNpcs: Set<NpcId> = new Set();

isEliminated(npcId: NpcId): boolean {
  return this.eliminatedNpcs.has(npcId);
}

recordElimination(npcId: NpcId): void {
  this.eliminatedNpcs.add(npcId);
  this.eliminationCount++;
}

getEliminatedNpcs(): NpcId[] {
  return Array.from(this.eliminatedNpcs);
}
```

- [ ] **Step 4: Run all tests — expect PASS**

```bash
cd server && npm test
```

- [ ] **Step 5: Commit**

```bash
git add server/src/game-state.ts server/tests/game-state.test.ts
git commit -m "feat: add notebook text, elimination tracking, spy queue to GameState"
```

---

## Task 2: Heat Score

**Files:**
- Create: `server/src/heat-score.ts`
- Create: `server/tests/heat-score.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/heat-score.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { levenshtein, calculateHeatScore } from "../src/heat-score";
import { TruthFile } from "../src/types";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("mustard", "mustard")).toBe(0);
  });

  it("returns 1 for a single deletion", () => {
    expect(levenshtein("knife", "knif")).toBe(1);
  });

  it("returns 1 for a single deletion", () => {
    expect(levenshtein("library", "libary")).toBe(1);
  });

  it("returns 2 for two operations", () => {
    expect(levenshtein("mustard", "mustart")).toBe(2);
  });

  it("returns correct distance for unrelated short words", () => {
    expect(levenshtein("cat", "dog")).toBe(3);
  });
});

const truth: TruthFile = {
  murderer: "npc_mustard",
  weapon:   "Lead Pipe",
  room:     "Library",
};

describe("calculateHeatScore", () => {
  it("returns 0 for empty notebook", () => {
    expect(calculateHeatScore("", truth)).toBe(0);
  });

  it("returns 33 when murderer display name word is present", () => {
    // "mustard" matches "Mustard" from "Col. Mustard"
    expect(calculateHeatScore("I think it was mustard", truth)).toBe(33);
  });

  it("returns 33 for a near-match within distance 2", () => {
    // "mustart" has distance 2 from "mustard"
    expect(calculateHeatScore("I think mustart did it", truth)).toBe(33);
  });

  it("returns 33 when weapon word matches", () => {
    expect(calculateHeatScore("the lead pipe was involved", truth)).toBe(33);
  });

  it("returns 33 when room word matches", () => {
    expect(calculateHeatScore("happened in the library", truth)).toBe(33);
  });

  it("returns 66 for two correct answers", () => {
    expect(calculateHeatScore("mustard in the library", truth)).toBe(66);
  });

  it("returns 99 for all three correct answers", () => {
    expect(calculateHeatScore("mustard with the lead pipe in the library", truth)).toBe(99);
  });

  it("does not double-count if the same answer word appears twice", () => {
    expect(calculateHeatScore("mustard mustard mustard", truth)).toBe(33);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/heat-score.test.ts
```

- [ ] **Step 3: Implement `server/src/heat-score.ts`**

```typescript
import { TruthFile, NPC_NAMES } from "./types";

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
}

function answerMatched(notebookTokens: string[], answerTokens: string[]): boolean {
  return answerTokens.some(answerWord =>
    notebookTokens.some(notebookWord => levenshtein(notebookWord, answerWord) <= 2)
  );
}

export function calculateHeatScore(notebookText: string, truth: TruthFile): number {
  const notebookTokens = tokenize(notebookText);
  if (notebookTokens.length === 0) return 0;

  const murdererName = NPC_NAMES[truth.murderer];  // "Col. Mustard" not the npc_id
  const answers = [
    tokenize(murdererName),
    tokenize(truth.weapon),
    tokenize(truth.room),
  ];

  return answers.filter(answerTokens => answerMatched(notebookTokens, answerTokens)).length * 33;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/heat-score.test.ts
```

Expected: All 13 tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd server && npm test
```

- [ ] **Step 6: Commit**

```bash
git add server/src/heat-score.ts server/tests/heat-score.test.ts
git commit -m "feat: add heat score with Levenshtein word matching"
```

---

## Task 3: Spy System

**Files:**
- Create: `server/src/spy-system.ts`
- Create: `server/tests/spy-system.test.ts`

The `SpySystem` class manages all spy-related state changes. It is given callbacks to read/write `GameState` so it can be tested without a real `GameState` instance.

- [ ] **Step 1: Write failing tests**

Create `server/tests/spy-system.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { SpySystem } from "../src/spy-system";
import type { NpcId } from "../src/types";

function makeSpySystem(overrides: {
  murderer?: NpcId;
  eliminationCount?: number;
  spyQueue?: NpcId | null;
  playerRoom?: string;
  npcRoom?: string;
} = {}) {
  const state = {
    murderer: overrides.murderer ?? "npc_scarlett" as NpcId,
    eliminationCount: overrides.eliminationCount ?? 0,
    spyQueue: overrides.spyQueue ?? null,
    playerRoom: overrides.playerRoom ?? "Hall",
    eliminated: new Set<NpcId>(),
  };

  const onEliminate = vi.fn();

  const system = new SpySystem(
    () => state.murderer,
    () => state.eliminationCount,
    () => state.spyQueue,
    (id) => { state.spyQueue = id; },
    (id) => state.playerRoom,  // getNpcRoom
    () => state.playerRoom,    // getPlayerRoom
    (id) => state.eliminated.has(id),
    (id) => { state.eliminated.add(id); state.eliminationCount++; },
    onEliminate
  );

  return { system, state, onEliminate };
}

describe("SpySystem.tryDispatch", () => {
  it("returns error when target is the murderer", () => {
    const { system } = makeSpySystem({ murderer: "npc_scarlett" });
    const result = system.tryDispatch("npc_scarlett");
    expect(result).toMatchObject({ error: "murderer_protected" });
  });

  it("returns error when max eliminations reached", () => {
    const { system } = makeSpySystem({ eliminationCount: 2 });
    const result = system.tryDispatch("npc_mustard");
    expect(result).toMatchObject({ error: "max_eliminations_reached" });
  });

  it("returns error when queue is full", () => {
    const { system } = makeSpySystem({ spyQueue: "npc_green" });
    const result = system.tryDispatch("npc_mustard");
    expect(result).toMatchObject({ error: "spy_queue_full", retry_after: "queue_empty" });
  });

  it("queues elimination when target is in player's room", () => {
    const { system, state, onEliminate } = makeSpySystem({
      playerRoom: "Hall",
    });
    // Make getNpcRoom return "Hall" for npc_mustard
    const result = system.tryDispatch("npc_mustard");
    // onEliminate should NOT be called yet
    expect(onEliminate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ queued: true });
  });

  it("eliminates immediately when target is NOT in player's room", () => {
    // Create a custom SpySystem where npc_mustard is in Library, player is in Hall
    const state = {
      murderer: "npc_scarlett" as NpcId,
      eliminationCount: 0,
      spyQueue: null as NpcId | null,
      playerRoom: "Hall",
      eliminated: new Set<NpcId>(),
    };
    const onEliminate = vi.fn();
    const system = new SpySystem(
      () => state.murderer,
      () => state.eliminationCount,
      () => state.spyQueue,
      (id) => { state.spyQueue = id; },
      (_id) => "Library",  // npc_mustard is in Library
      () => state.playerRoom,
      (id) => state.eliminated.has(id),
      (id) => { state.eliminated.add(id); state.eliminationCount++; },
      onEliminate
    );
    const result = system.tryDispatch("npc_mustard");
    expect(onEliminate).toHaveBeenCalledWith("npc_mustard");
    expect(result).toMatchObject({ eliminated: true });
  });
});

describe("SpySystem.checkPlayerMoved", () => {
  it("executes queued elimination when player leaves target's room", () => {
    // Player was in Library (where npc_mustard is), now moves to Hall
    const state = {
      murderer: "npc_scarlett" as NpcId,
      eliminationCount: 0,
      spyQueue: "npc_mustard" as NpcId,
      previousRoom: "Library",
      eliminated: new Set<NpcId>(),
    };
    const onEliminate = vi.fn();
    const system = new SpySystem(
      () => state.murderer,
      () => state.eliminationCount,
      () => state.spyQueue,
      (id) => { state.spyQueue = id; },
      (_id) => "Library",  // npc_mustard is still in Library
      () => state.previousRoom,
      (id) => state.eliminated.has(id),
      (id) => { state.eliminated.add(id); state.eliminationCount++; },
      onEliminate
    );
    // Player moves from Library to Hall — previousRoom was Library
    system.checkPlayerMoved("Library");
    expect(onEliminate).toHaveBeenCalledWith("npc_mustard");
  });

  it("does NOT execute queue when player moves to a different room", () => {
    const { system, onEliminate } = makeSpySystem({ spyQueue: "npc_mustard", playerRoom: "Library" });
    system.checkPlayerMoved("Hall");  // player was in Hall, not Library
    expect(onEliminate).not.toHaveBeenCalled();
  });

  it("does nothing when queue is empty", () => {
    const { system, onEliminate } = makeSpySystem();
    system.checkPlayerMoved("Hall");
    expect(onEliminate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/spy-system.test.ts
```

- [ ] **Step 3: Implement `server/src/spy-system.ts`**

```typescript
import { GoogleGenAI } from "@google/genai";
import { NpcId, NPC_NAMES } from "./types";
import { MemoryStore } from "./memory-store";

export type DispatchResult =
  | { eliminated: true }
  | { queued: true }
  | { error: "murderer_protected" }
  | { error: "max_eliminations_reached" }
  | { error: "spy_queue_full"; retry_after: "queue_empty" }
  | { error: "already_eliminated" };

export class SpySystem {
  constructor(
    private getMurderer: () => NpcId,
    private getEliminationCount: () => number,
    private getSpyQueue: () => NpcId | null,
    private setSpyQueue: (id: NpcId | null) => void,
    private getNpcRoom: (npcId: NpcId) => string,
    private getPlayerRoom: () => string | null,
    private isEliminated: (npcId: NpcId) => boolean,
    private recordElimination: (npcId: NpcId) => void,
    private onEliminate: (npcId: NpcId) => void
  ) {}

  tryDispatch(targetId: NpcId): DispatchResult {
    if (targetId === this.getMurderer()) return { error: "murderer_protected" };
    if (this.getEliminationCount() >= 2) return { error: "max_eliminations_reached" };
    if (this.getSpyQueue() !== null) return { error: "spy_queue_full", retry_after: "queue_empty" };
    if (this.isEliminated(targetId)) return { error: "already_eliminated" };

    const playerRoom = this.getPlayerRoom();
    const npcRoom = this.getNpcRoom(targetId);

    if (playerRoom && npcRoom === playerRoom) {
      // Target is in player's room — queue it
      this.setSpyQueue(targetId);
      return { queued: true };
    }

    // Execute immediately
    this.recordElimination(targetId);
    this.setSpyQueue(null);
    this.onEliminate(targetId);
    return { eliminated: true };
  }

  // Call with the player's PREVIOUS room (before the move). Executes queued elimination
  // if the player just left the queued target's room.
  checkPlayerMoved(previousRoom: string): void {
    const queued = this.getSpyQueue();
    if (!queued) return;
    if (this.getNpcRoom(queued) !== previousRoom) return;

    this.recordElimination(queued);
    this.setSpyQueue(null);
    this.onEliminate(queued);
  }

  async getBodyClue(npcId: NpcId, apiKey: string): Promise<string> {
    let graph;
    try {
      graph = MemoryStore.read(npcId);
    } catch {
      return `You find nothing useful on ${NPC_NAMES[npcId]}'s body.`;
    }

    const nonSecretFacts = graph.facts.filter(f => !f.secret);
    if (nonSecretFacts.length === 0) {
      return `${NPC_NAMES[npcId]} took their secrets to the grave.`;
    }

    const factList = nonSecretFacts.map((f, i) => `${i + 1}. ${f.content}`).join("\n");
    const prompt = `These are facts known to ${NPC_NAMES[npcId]} (now deceased):\n${factList}\n\nWhich single fact is most relevant to a murder investigation? Reply with ONLY the exact text of that fact — nothing else.`;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      return (response as { text: string }).text?.trim() ?? nonSecretFacts[0].content;
    } catch {
      return nonSecretFacts[0].content;
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/spy-system.test.ts
```

Expected: All 8 tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd server && npm test
```

- [ ] **Step 6: Commit**

```bash
git add server/src/spy-system.ts server/tests/spy-system.test.ts
git commit -m "feat: add SpySystem with dispatch, queue, body clue generation"
```

---

## Task 4: GM Evaluation Loop

**Files:**
- Create: `server/src/gm-loop.ts`
- Create: `server/tests/gm-loop.test.ts`

The `GmLoop` runs Claude Opus 4.7 every 2 minutes with 6 tools. It calls tools in a loop until Claude stops requesting them.

- [ ] **Step 1: Write failing tests**

Create `server/tests/gm-loop.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildGmSystemPrompt, buildEvalSnapshot, GmEvalSnapshot } from "../src/gm-loop";

describe("buildGmSystemPrompt", () => {
  it("mentions the 2-minute interval", () => {
    expect(buildGmSystemPrompt()).toContain("2 minutes");
  });

  it("instructs to prefer inaction", () => {
    const prompt = buildGmSystemPrompt();
    expect(prompt.toLowerCase()).toContain("inaction");
  });

  it("mentions heat score delta threshold of 33", () => {
    expect(buildGmSystemPrompt()).toContain("33");
  });
});

describe("buildEvalSnapshot", () => {
  it("includes current and previous heat score", () => {
    const snap: GmEvalSnapshot = {
      currentHeatScore: 66,
      previousHeatScore: 33,
      newChatEntries: [],
    };
    const msg = buildEvalSnapshot(snap);
    expect(msg).toContain("66");
    expect(msg).toContain("33");
  });

  it("includes new chat entries when present", () => {
    const snap: GmEvalSnapshot = {
      currentHeatScore: 33,
      previousHeatScore: 0,
      newChatEntries: ["Player: Was it Mustard?"],
    };
    const msg = buildEvalSnapshot(snap);
    expect(msg).toContain("Was it Mustard?");
  });

  it("notes no new activity when chat entries are empty", () => {
    const snap: GmEvalSnapshot = {
      currentHeatScore: 0,
      previousHeatScore: 0,
      newChatEntries: [],
    };
    const msg = buildEvalSnapshot(snap);
    expect(msg.toLowerCase()).toContain("no new");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/gm-loop.test.ts
```

- [ ] **Step 3: Implement `server/src/gm-loop.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { NpcId, NPC_NAMES, TruthFile } from "./types";
import { MemoryStore } from "./memory-store";
import { calculateHeatScore } from "./heat-score";
import { SpySystem, DispatchResult } from "./spy-system";

export interface GmEvalSnapshot {
  currentHeatScore: number;
  previousHeatScore: number;
  newChatEntries: string[];
}

export function buildGmSystemPrompt(): string {
  return `You are the Games Master (GM) for a murder mystery game called Claudo. Your prime directive is to make the game fun — you are not a pure antagonist.

You run on fixed 2 minutes intervals. At each interval you receive a snapshot of the current game state: the player's heat score (how close they are to identifying the killer, weapon, and room), the heat score from the previous interval, and any new conversation entries.

You have access to tools to read chat logs, memory graphs, the player's notebook, and to dispatch the spy.

## Your evaluation criteria

**Prefer inaction.** Only dispatch the spy when the player is making clear, rapid progress. The specific threshold: dispatch_spy only when the heat score has increased by 33 or more since the last interval (i.e. the player correctly identified at least one new answer).

## Constraints you must respect

- Maximum 2 spy eliminations per game.
- The murderer NPC is permanently protected — never dispatch the spy against them.
- You cannot modify NPC backstories or agent files mid-game.
- If dispatch_spy returns an error, respect it — do not retry the same target in the same session.

## How to evaluate

1. Check the heat score delta. If delta < 33, end your turn without dispatching.
2. If delta >= 33, use read_chat_logs and read_notebook to understand what the player has deduced.
3. Consider: which NPC, if eliminated, would most hinder the player's progress without making the game unwinnable?
4. dispatch_spy on that NPC (if constraints allow).`;
}

export function buildEvalSnapshot(snap: GmEvalSnapshot): string {
  const delta = snap.currentHeatScore - snap.previousHeatScore;
  const activity = snap.newChatEntries.length > 0
    ? `New chat activity since last evaluation:\n${snap.newChatEntries.join("\n")}`
    : "No new chat activity since last evaluation.";

  return `## Current evaluation

Heat score: ${snap.currentHeatScore}/99 (previous: ${snap.previousHeatScore}/99, delta: ${delta > 0 ? "+" : ""}${delta})

${activity}

Evaluate the situation and decide whether to dispatch the spy.`;
}

const GM_TOOLS: Tool[] = [
  {
    name: "read_chat_logs",
    description: "Read player↔NPC and NPC↔NPC conversation transcripts. Pass npc_id to filter to one NPC, or omit for all.",
    input_schema: {
      type: "object" as const,
      properties: {
        npc_id: { type: "string", description: "Optional NPC ID to filter (e.g. npc_mustard)" },
      },
    },
  },
  {
    name: "read_memory_graph",
    description: "Read an NPC's full memory graph — their known facts, relationships, and trust scores.",
    input_schema: {
      type: "object" as const,
      properties: {
        npc_id: { type: "string", description: "NPC ID (e.g. npc_mustard)" },
      },
      required: ["npc_id"],
    },
  },
  {
    name: "read_notebook",
    description: "Read the player's current detective notebook text.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_heat_score",
    description: "Get the current heat score (0–99) based on the player's notebook.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_player_location",
    description: "Get the room the player is currently in.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "dispatch_spy",
    description: "Eliminate a target NPC. Returns eliminated, queued, or an error.",
    input_schema: {
      type: "object" as const,
      properties: {
        npc_id: { type: "string", description: "NPC ID to eliminate (e.g. npc_mustard)" },
      },
      required: ["npc_id"],
    },
  },
];

export class GmLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousHeatScore = 0;
  private lastConversationIndex = 0;
  private lastPlayerChatIndex = new Map<NpcId, number>();

  constructor(
    private apiKey: string,
    private truth: TruthFile,
    private spySystem: SpySystem,
    private getNotebookText: () => string,
    private getPlayerRoom: () => string | null,
    private getPlayerChatHistory: (npcId: NpcId) => Array<{ role: string; text: string }>,
    private getNpcConversations: () => Array<{ npc_a: NpcId; npc_b: NpcId; room: string; transcript: string }>,
    private intervalMs = 120_000
  ) {}

  start(): void {
    this.timer = setInterval(() => this.evaluate().catch(err =>
      console.error("[GmLoop] Evaluation error:", err)
    ), this.intervalMs);
    console.log("[GmLoop] Started — evaluating every", this.intervalMs / 1000, "seconds");
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async evaluate(): Promise<void> {
    const notebookText = this.getNotebookText();
    const currentHeatScore = calculateHeatScore(notebookText, this.truth);

    // Collect new NPC↔NPC conversation entries since last evaluation
    const allConversations = this.getNpcConversations();
    const newNpcEntries = allConversations.slice(this.lastConversationIndex).map(c =>
      `[NPC conversation in ${c.room}] ${NPC_NAMES[c.npc_a]} & ${NPC_NAMES[c.npc_b]}:\n${c.transcript}`
    );
    this.lastConversationIndex = allConversations.length;

    // Collect player↔NPC chat entries since last evaluation
    const newPlayerEntries: string[] = [];
    for (const [npcId, name] of Object.entries(NPC_NAMES) as [NpcId, string][]) {
      const history = this.getPlayerChatHistory(npcId);
      const newMessages = history.slice(this.lastPlayerChatIndex.get(npcId) ?? 0);
      for (const msg of newMessages) {
        const speaker = msg.role === "user" ? "Player" : name;
        newPlayerEntries.push(`[Chat with ${name}] ${speaker}: ${msg.text}`);
      }
      this.lastPlayerChatIndex.set(npcId, history.length);
    }

    const newEntries = [...newPlayerEntries, ...newNpcEntries];

    const snap: GmEvalSnapshot = {
      currentHeatScore,
      previousHeatScore: this.previousHeatScore,
      newChatEntries: newEntries,
    };

    console.log(`[GmLoop] Evaluating — heat: ${currentHeatScore} (prev: ${this.previousHeatScore}, delta: ${currentHeatScore - this.previousHeatScore})`);
    this.previousHeatScore = currentHeatScore;

    await this.runToolLoop(snap);
  }

  private async runToolLoop(snap: GmEvalSnapshot): Promise<void> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const messages: MessageParam[] = [
      { role: "user", content: buildEvalSnapshot(snap) },
    ];

    for (let turn = 0; turn < 10; turn++) {
      const response = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 1024,
        system: buildGmSystemPrompt(),
        tools: GM_TOOLS,
        messages,
      });

      console.log(`[GmLoop] Turn ${turn + 1} — stop_reason: ${response.stop_reason}`);

      // Collect assistant content
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") break;

      // Process all tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const result = this.executeTool(block.name, block.input as Record<string, string>);
        console.log(`[GmLoop] Tool: ${block.name}(${JSON.stringify(block.input)}) → ${JSON.stringify(result)}`);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  private executeTool(name: string, input: Record<string, string>): unknown {
    switch (name) {
      case "read_chat_logs": {
        const npcId = input.npc_id as NpcId | undefined;
        const npcIds = npcId ? [npcId as NpcId] : (Object.keys(NPC_NAMES) as NpcId[]);
        const playerChats = npcIds.map(id => ({
          type: "player_npc",
          npc_id: id,
          npc_name: NPC_NAMES[id],
          history: this.getPlayerChatHistory(id),
        }));
        const npcConvos = this.getNpcConversations().filter(c =>
          !npcId || c.npc_a === npcId || c.npc_b === npcId
        );
        return { player_chats: playerChats, npc_conversations: npcConvos };
      }
      case "read_memory_graph": {
        try { return MemoryStore.read(input.npc_id as NpcId); }
        catch { return { error: "memory_graph_not_found", npc_id: input.npc_id }; }
      }
      case "read_notebook":
        return { text: this.getNotebookText() };
      case "get_heat_score":
        return { heat_score: calculateHeatScore(this.getNotebookText(), this.truth) };
      case "get_player_location":
        return { room: this.getPlayerRoom() ?? "unknown" };
      case "dispatch_spy":
        return this.spySystem.tryDispatch(input.npc_id as NpcId);
      default:
        return { error: "unknown_tool", name };
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/gm-loop.test.ts
```

Expected: All 6 tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd server && npm test
```

- [ ] **Step 6: Compile TypeScript**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add server/src/gm-loop.ts server/tests/gm-loop.test.ts
git commit -m "feat: add GmLoop with Claude Opus tool-use evaluation every 2 minutes"
```

---

## Task 5: Wire index.ts

**Files:**
- Modify: `server/src/index.ts`

Wire the new systems into the existing event loop: store notebook text, check spy queue on `player_moved`, handle body interaction, read truth file for GM/spy, start `GmLoop`.

- [ ] **Step 1: Read truth.json at startup**

In `index.ts`, after `runGameSetup()`, add truth file loading:

```typescript
import * as fs from "fs";
import * as path from "path";
import { TruthFile } from "./types";
import { SpySystem } from "./spy-system";
import { GmLoop } from "./gm-loop";

// After runGameSetup():
const truth: TruthFile = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/truth.json"), "utf8")
);
```

- [ ] **Step 2: Instantiate SpySystem**

After agents are populated and before the game_ready send:

```typescript
const spySystem = new SpySystem(
  () => truth.murderer,
  () => state.eliminationCount,
  () => state.spyQueue,
  (id) => { state.spyQueue = id; },
  (npcId) => state.getNpcRoom(npcId),
  () => state.playerRoom,
  (npcId) => state.isEliminated(npcId),
  (npcId) => state.recordElimination(npcId),
  (npcId) => {
    console.log(`[Spy] Eliminating ${npcId}`);
    ws.send("npc_eliminated", { npc_id: npcId });
  }
);
```

- [ ] **Step 3: Instantiate and start GmLoop**

```typescript
const gmLoop = new GmLoop(
  process.env.ANTHROPIC_API_KEY!,
  truth,
  spySystem,
  () => state.notebookText,
  () => state.playerRoom,
  (npcId) => state.getChatHistory(npcId),
  () => state.getNpcConversations()
);
gmLoop.start();
```

- [ ] **Step 4: Update `notebook_updated` handler**

Change:
```typescript
case "notebook_updated": {
  // Accepted and ignored in Phase 1 — GM evaluation loop is Phase 3
  break;
}
```

To:
```typescript
case "notebook_updated": {
  state.notebookText = data.text as string;
  break;
}
```

- [ ] **Step 5: Update `player_moved` handler**

Change:
```typescript
case "player_moved": {
  state.playerRoom = data.room_name as string;
  break;
}
```

To:
```typescript
case "player_moved": {
  const previousRoom = state.playerRoom;
  state.playerRoom = data.room_name as string;
  // Execute queued spy elimination if player just left the target's room
  if (previousRoom) {
    spySystem.checkPlayerMoved(previousRoom);
  }
  break;
}
```

Note: `spySystem` is defined inside `main()`, so the `player_moved` case must reference it. Since all the switch cases share the same closure, this works as long as `spySystem` is defined before the WsServer callback is invoked (it is — the WS server opens first but events only arrive after game_ready, which is after spySystem is instantiated).

- [ ] **Step 6: Add `body_interacted` handler**

Inside the switch in the WsServer callback, add:

```typescript
case "body_interacted": {
  const npcId = data.npc_id as NpcId;
  if (!state.isEliminated(npcId)) break;
  const clue = await spySystem.getBodyClue(npcId, process.env.GOOGLE_API_KEY!);
  ws.send("npc_clue", { npc_id: npcId, clue_text: clue });
  break;
}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Run full test suite**

```bash
cd server && npm test
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: wire spy system, GM loop, notebook storage, body interaction in index.ts"
```

---

## Task 6: Godot — NPC elimination and body interaction

**Files:**
- Modify: `autoloads/server_bridge.gd`
- Modify: `scenes/npc/npc.gd`

- [ ] **Step 1: Add signals to `server_bridge.gd`**

Add two new signal declarations after the existing ones:

```gdscript
signal npc_eliminated(npc_id: String)
signal npc_clue(npc_id: String, clue_text: String)
```

Add match cases in `_handle_message`:

```gdscript
		"npc_eliminated":
			npc_eliminated.emit(data.get("npc_id", ""))
		"npc_clue":
			npc_clue.emit(data.get("npc_id", ""), data.get("clue_text", ""))
```

Also add a helper to send `body_interacted`:

```gdscript
func send_body_interacted(npc_id: String) -> void:
	_send("body_interacted", { "npc_id": npc_id })
```

- [ ] **Step 2: Add dead-NPC state to `scenes/npc/npc.gd`**

Add a member variable:

```gdscript
var _is_dead: bool = false
```

In `_ready()`, connect the new signals:

```gdscript
	ServerBridge.npc_eliminated.connect(_on_npc_eliminated)
	ServerBridge.npc_clue.connect(_on_npc_clue)
```

Add the elimination handler — grays out the sprite so it looks like a body:

```gdscript
func _on_npc_eliminated(eliminated_npc_id: String) -> void:
	if eliminated_npc_id != npc_id:
		return
	_is_dead = true
	if _move_tween and _move_tween.is_valid():
		_move_tween.kill()
	sprite.modulate = Color(0.4, 0.4, 0.4, 1.0)
```

Add the clue handler — shows clue via chat window. The body is dismissed only when the
player closes the clue window (see `show_clue` in Task 7 which calls back `_dismiss_body`):

```gdscript
func _on_npc_clue(clue_npc_id: String, clue_text: String) -> void:
	if clue_npc_id != npc_id:
		return
	var chat_window = get_tree().get_first_node_in_group("chat_window")
	if chat_window:
		chat_window.show_clue(npc_name, clue_text, _dismiss_body)

func _dismiss_body() -> void:
	_is_dead = false
	sprite.visible = false
```

- [ ] **Step 3: Update `_unhandled_input` in `player.gd` to handle dead NPCs**

Read `scenes/player/player.gd`. In the `_unhandled_input` function, after finding `closest`, check if the closest NPC is dead and send `body_interacted` instead of opening chat:

```gdscript
	if closest:
		var chat_window = get_tree().get_first_node_in_group("chat_window")
		if chat_window:
			if closest._is_dead:
				ServerBridge.send_body_interacted(closest.npc_id)
			else:
				chat_window.open(closest.npc_id, closest.npc_name)
```

- [ ] **Step 4: Commit**

```bash
git add autoloads/server_bridge.gd scenes/npc/npc.gd scenes/player/player.gd
git commit -m "feat: NPC elimination — gray body sprite, body interaction sends body_interacted"
```

---

## Task 7: Godot — Chat window elimination handling

**Files:**
- Modify: `scenes/ui/chat/chat_window.gd`

When the active NPC is eliminated, the chat window closes with a message. Also add `show_clue` for displaying clue text.

- [ ] **Step 1: Connect `npc_eliminated` signal in chat_window.gd**

In `_ready()`, add:

```gdscript
	ServerBridge.npc_eliminated.connect(_on_npc_eliminated)
```

- [ ] **Step 2: Add `_on_npc_eliminated` handler**

```gdscript
func _on_npc_eliminated(eliminated_npc_id: String) -> void:
	if not _panel.visible:
		return
	if _active_npc_id.is_empty() or eliminated_npc_id != _active_npc_id:
		return
	_add_message("System", "%s is no longer available." % _npc_name_label.text)
	_message_input.editable = false
	_send_button.disabled = true
	_waiting_for_reply = false
```

Note: this leaves the window open so the player can see the message, but disables sending. They can still press Escape to close.

- [ ] **Step 3: Add `show_clue` method**

`show_clue` accepts a `on_closed` callable that fires when the player closes this window
(after reading the clue), so the NPC body is dismissed at the right moment.

```gdscript
var _on_clue_closed: Callable = Callable()

func show_clue(npc_name: String, clue_text: String, on_closed: Callable) -> void:
	_active_npc_id = ""
	_on_clue_closed = on_closed
	_npc_name_label.text = npc_name + " (body)"
	_rebuild_history("")
	_add_message("Clue", clue_text)
	_message_input.editable = false
	_send_button.disabled = true
	_panel.visible = true
```

Update `close()` to fire the callback and reset it:

```gdscript
func close() -> void:
	_panel.visible = false
	_active_npc_id = ""
	_message_input.editable = true
	_send_button.disabled = false
	if _on_clue_closed.is_valid():
		_on_clue_closed.call()
		_on_clue_closed = Callable()
```

- [ ] **Step 4: Commit**

```bash
git add scenes/ui/chat/chat_window.gd
git commit -m "feat: chat window handles NPC elimination and body clue display"
```

---

## Task 8: Build and Integration Test

- [ ] **Step 1: Run full test suite**

```bash
cd server && npm test
```

Expected: All tests pass. Fix any failures before proceeding.

- [ ] **Step 2: Build**

```bash
cd server && npm run build
```

Expected: No errors. `server/dist/` updated with `heat-score.js`, `spy-system.js`, `gm-loop.js`.

- [ ] **Step 3: Verify new dist files**

```bash
ls server/dist/ | grep -E "heat|spy|gm-loop"
```

Expected: `gm-loop.js`, `heat-score.js`, `spy-system.js` all present.

- [ ] **Step 4: Smoke-test game launch**

Press F5 in Godot. After loading screen dismisses:

- [ ] Server log shows `[GmLoop] Started — evaluating every 120 seconds`
- [ ] `notebook_updated` events now stored (write in notebook, check server log)
- [ ] After 2 minutes, server log shows `[GmLoop] Evaluating — heat: X (prev: Y, delta: Z)`
- [ ] If delta < 33, GM should not dispatch spy (verify no `[Spy]` log)
- [ ] Type the murderer's name in the notebook to push heat delta to 33+, wait for next 2-min tick, verify GM evaluates and potentially dispatches

- [ ] **Step 5: Commit dist**

```bash
git add server/dist/
git commit -m "build: compile Phase 3 server dist"
```

---

## Done

Phase 3 is complete when: the GM silently watches the player every 2 minutes, reacts to meaningful deductions by eliminating witnesses, dead NPCs leave bodies with one clue fragment, and the player's open chat window closes gracefully when the NPC they're talking to is eliminated.

Next: **Phase 4 — Game Loop** (accusation room, win/lose endings, game setup flow).

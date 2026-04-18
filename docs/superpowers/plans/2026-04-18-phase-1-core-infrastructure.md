# Phase 1 — Core Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Godot to a Node.js/TypeScript server so the player can chat with AI-powered NPCs; a Claude Opus 4.7 GM generates the murder scenario on startup.

**Architecture:** Modular TypeScript server (`server/src/`) communicates with Godot via WebSocket on port 9876. Godot spawns the server via a shell wrapper (`server/start.sh`) on game launch and kills it on exit. All AI logic is server-side. Compiled `server/dist/` is committed so players only need Node.js installed.

**Tech Stack:** Node.js 18+, TypeScript 5, `ws`, `@anthropic-ai/sdk`, `@google/genai`, `dotenv`, `vitest` (tests), Godot 4.6 GDScript

---

## File Map

### Server (new files)

| File | Responsibility |
|------|---------------|
| `server/package.json` | npm project, scripts, dependencies |
| `server/tsconfig.json` | TypeScript config (CommonJS, strict) |
| `server/.env.example` | API key template for players |
| `server/.gitignore` | ignore `.env`, `data/`, `node_modules/` |
| `server/start.sh` | shell wrapper so Godot can find `node` regardless of PATH |
| `server/src/types.ts` | shared TypeScript types (NpcId, WsMessage, ChatMessage, etc.) |
| `server/src/game-state.ts` | in-memory game state (chat histories, active NPC, player room) |
| `server/src/ws-server.ts` | WebSocket server on port 9876, event routing |
| `server/src/gm-agent.ts` | Claude Opus 4.7 GameSetup — assigns murder scenario, writes agent.md files |
| `server/src/npc-agent.ts` | Gemini Flash per-NPC chat, holds conversation history |
| `server/src/index.ts` | entry point — validates keys, clears old data, runs GameSetup, starts WS |
| `server/tests/game-state.test.ts` | pure unit tests for state mutations |
| `server/tests/ws-server.test.ts` | message routing tests (mocked WS socket) |
| `server/tests/gm-agent.test.ts` | GameSetup tests (mocked Anthropic SDK + fs) |
| `server/tests/npc-agent.test.ts` | NPC chat tests (mocked Google SDK) |
| `server/dist/` | compiled JS — committed to repo |

### Godot (new files)

| File | Responsibility |
|------|---------------|
| `autoloads/server_bridge.gd` | WebSocket client, signals, reconnection overlay |
| `scenes/ui/loading/loading_screen.tscn` | full-screen "Starting game…" overlay |
| `scenes/ui/loading/loading_screen.gd` | dismisses on `game_ready`, shows error on timeout |
| `scenes/ui/chat/chat_window.tscn` | scrollable chat history + text input CanvasLayer |
| `scenes/ui/chat/chat_window.gd` | opens per-NPC, sends/receives messages |

### Godot (modified files)

| File | Change |
|------|--------|
| `scenes/npc/npc.gd` | add `@export var npc_id: String`, add click handler on speech bubble |
| `scenes/main/main.gd` | spawn server via `start.sh`, store PID, kill on exit, connect loading screen |
| `project.godot` | register `ServerBridge` as autoload |

---

## Task 1: Server Project Scaffold

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/.gitignore`
- Create: `server/start.sh`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "claudo-server",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@google/genai": "^0.7.0",
    "dotenv": "^16.4.5",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.10",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `server/.env.example`**

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
```

- [ ] **Step 4: Create `server/.gitignore`**

```
node_modules/
.env
data/
```

- [ ] **Step 5: Create `server/start.sh`**

This shell wrapper lets Godot spawn the server without knowing the full path to `node` (required for nvm/Homebrew installs on macOS).

```bash
#!/usr/bin/env bash
# Resolve node from the user's PATH (handles nvm, homebrew, etc.)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/dist/index.js"
```

Make it executable:
```bash
chmod +x server/start.sh
```

- [ ] **Step 6: Install dependencies**

```bash
cd server && npm install
```

Expected: `node_modules/` created, `package-lock.json` created. No errors.

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/tsconfig.json server/.env.example server/.gitignore server/start.sh server/package-lock.json
git commit -m "feat: scaffold Node.js/TypeScript server project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `server/src/types.ts`

- [ ] **Step 1: Create `server/src/types.ts`**

```typescript
export type NpcId =
  | "npc_scarlett"
  | "npc_mustard"
  | "npc_white"
  | "npc_green"
  | "npc_peacock"
  | "npc_plum";

export const NPC_NAMES: Record<NpcId, string> = {
  npc_scarlett: "Miss Scarlett",
  npc_mustard: "Col. Mustard",
  npc_white: "Mrs. White",
  npc_green: "Rev. Green",
  npc_peacock: "Mrs. Peacock",
  npc_plum: "Prof. Plum",
};

export const WEAPONS = [
  "Candlestick",
  "Knife",
  "Lead Pipe",
  "Revolver",
  "Rope",
  "Wrench",
] as const;

export const ROOMS = [
  "Kitchen",
  "Ballroom",
  "Conservatory",
  "Billiard Room",
  "Hall",
  "Library",
  "Study",
  "Lounge",
  "Dining Room",
] as const;

export const ARCHETYPES = [
  "The Liar",
  "The Gossip",
  "The Recluse",
  "The Witness",
  "The Protector",
  "The Red Herring",
] as const;

export type Archetype = (typeof ARCHETYPES)[number];
export type Weapon = (typeof WEAPONS)[number];
export type Room = (typeof ROOMS)[number];

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface WsEnvelope {
  event: string;
  data: Record<string, unknown>;
}

export interface TruthFile {
  murderer: NpcId;
  weapon: Weapon;
  room: Room;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/types.ts
git commit -m "feat: add shared TypeScript types for server"
```

---

## Task 3: Game State

**Files:**
- Create: `server/src/game-state.ts`
- Create: `server/tests/game-state.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/game-state.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../src/game-state";

describe("GameState", () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState();
  });

  it("starts with empty chat histories for all six NPCs", () => {
    expect(state.getChatHistory("npc_scarlett")).toEqual([]);
    expect(state.getChatHistory("npc_plum")).toEqual([]);
  });

  it("appends messages to the correct NPC history", () => {
    state.appendMessage("npc_scarlett", { role: "user", text: "hello" });
    state.appendMessage("npc_scarlett", { role: "model", text: "good day" });
    expect(state.getChatHistory("npc_scarlett")).toHaveLength(2);
    expect(state.getChatHistory("npc_mustard")).toHaveLength(0);
  });

  it("tracks active NPC id", () => {
    expect(state.activeNpcId).toBeNull();
    state.activeNpcId = "npc_green";
    expect(state.activeNpcId).toBe("npc_green");
  });

  it("serialises to snapshot shape", () => {
    state.appendMessage("npc_white", { role: "user", text: "hi" });
    state.activeNpcId = "npc_white";
    const snap = state.toSnapshot();
    expect(snap.active_npc_id).toBe("npc_white");
    expect(snap.npc_chat_histories["npc_white"]).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/game-state.test.ts
```

Expected: FAIL — `GameState` not found.

- [ ] **Step 3: Implement `server/src/game-state.ts`**

```typescript
import { NpcId, ChatMessage } from "./types";

const ALL_NPC_IDS: NpcId[] = [
  "npc_scarlett",
  "npc_mustard",
  "npc_white",
  "npc_green",
  "npc_peacock",
  "npc_plum",
];

interface StateSnapshot {
  npc_chat_histories: Record<string, ChatMessage[]>;
  active_npc_id: NpcId | null;
}

export class GameState {
  private histories: Map<NpcId, ChatMessage[]> = new Map(
    ALL_NPC_IDS.map((id) => [id, []])
  );

  activeNpcId: NpcId | null = null;
  playerRoom: string | null = null;

  getChatHistory(npcId: NpcId): ChatMessage[] {
    return this.histories.get(npcId) ?? [];
  }

  appendMessage(npcId: NpcId, message: ChatMessage): void {
    const history = this.histories.get(npcId);
    if (history) history.push(message);
  }

  toSnapshot(): StateSnapshot {
    const npc_chat_histories: Record<string, ChatMessage[]> = {};
    for (const [id, history] of this.histories) {
      npc_chat_histories[id] = [...history];
    }
    return { npc_chat_histories, active_npc_id: this.activeNpcId };
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/game-state.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/game-state.ts server/tests/game-state.test.ts
git commit -m "feat: add GameState class with chat history and snapshot"
```

---

## Task 4: WebSocket Server

**Files:**
- Create: `server/src/ws-server.ts`
- Create: `server/tests/ws-server.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/tests/ws-server.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { parseMessage, buildMessage } from "../src/ws-server";

describe("parseMessage", () => {
  it("parses a valid JSON envelope", () => {
    const raw = JSON.stringify({ event: "player_chat", data: { npc_id: "npc_scarlett", message: "hi" } });
    const result = parseMessage(raw);
    expect(result?.event).toBe("player_chat");
    expect(result?.data.npc_id).toBe("npc_scarlett");
  });

  it("returns null for malformed JSON", () => {
    expect(parseMessage("not json")).toBeNull();
  });

  it("returns null if event field is missing", () => {
    expect(parseMessage(JSON.stringify({ data: {} }))).toBeNull();
  });
});

describe("buildMessage", () => {
  it("serialises event + data to JSON string", () => {
    const msg = buildMessage("npc_reply", { npc_id: "npc_mustard", text: "hello" });
    const parsed = JSON.parse(msg);
    expect(parsed.event).toBe("npc_reply");
    expect(parsed.data.text).toBe("hello");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/ws-server.test.ts
```

Expected: FAIL — `parseMessage` not found.

- [ ] **Step 3: Implement `server/src/ws-server.ts`**

```typescript
import { WebSocketServer, WebSocket } from "ws";
import { WsEnvelope } from "./types";

export function parseMessage(raw: string): WsEnvelope | null {
  try {
    const obj = JSON.parse(raw);
    if (typeof obj.event !== "string") return null;
    return obj as WsEnvelope;
  } catch {
    return null;
  }
}

export function buildMessage(event: string, data: Record<string, unknown>): string {
  return JSON.stringify({ event, data });
}

export type MessageHandler = (event: string, data: Record<string, unknown>, socket: WebSocket) => void;

export class WsServer {
  private wss: WebSocketServer;
  private handler: MessageHandler;
  private client: WebSocket | null = null;

  constructor(port: number, handler: MessageHandler) {
    this.handler = handler;
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (socket) => {
      this.client = socket;
      console.log("[WS] Client connected");

      socket.on("message", (raw) => {
        const msg = parseMessage(raw.toString());
        if (msg) this.handler(msg.event, msg.data, socket);
      });

      socket.on("close", () => {
        console.log("[WS] Client disconnected");
        if (this.client === socket) this.client = null;
      });
    });

    this.wss.on("listening", () => {
      console.log(`[WS] Listening on port ${port}`);
    });
  }

  send(event: string, data: Record<string, unknown>): void {
    if (this.client?.readyState === WebSocket.OPEN) {
      this.client.send(buildMessage(event, data));
    }
  }

  close(): void {
    this.wss.close();
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/ws-server.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/ws-server.ts server/tests/ws-server.test.ts
git commit -m "feat: add WebSocket server with message parsing and routing"
```

---

## Task 5: GM Agent — GameSetup

**Files:**
- Create: `server/src/gm-agent.ts`
- Create: `server/tests/gm-agent.test.ts`

> **Note:** Uses `@anthropic-ai/sdk` with model `claude-opus-4-7`. Verify the claude-api skill is available if you need help with prompt caching or advanced SDK usage.

- [ ] **Step 1: Write failing tests**

Create `server/tests/gm-agent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildGameSetupPrompt, parseGameSetupResponse } from "../src/gm-agent";

describe("buildGameSetupPrompt", () => {
  it("includes all six NPC names", () => {
    const prompt = buildGameSetupPrompt();
    expect(prompt).toContain("Miss Scarlett");
    expect(prompt).toContain("Prof. Plum");
  });

  it("includes all six archetypes", () => {
    const prompt = buildGameSetupPrompt();
    expect(prompt).toContain("The Liar");
    expect(prompt).toContain("The Red Herring");
  });

  it("includes the murderer-must-be-Liar constraint", () => {
    const prompt = buildGameSetupPrompt();
    expect(prompt.toLowerCase()).toContain("liar");
    expect(prompt.toLowerCase()).toContain("murderer");
  });
});

describe("parseGameSetupResponse", () => {
  it("extracts truth and six agent configs from a valid response", () => {
    const sampleResponse = JSON.stringify({
      murderer: "npc_scarlett",
      weapon: "Knife",
      room: "Library",
      agents: {
        npc_scarlett: {
          archetype: "The Liar",
          backstory: "A cunning socialite...",
          relationships: { npc_mustard: "distrusts" },
          notes: "She did it with the Knife in the Library."
        },
        npc_mustard: {
          archetype: "The Gossip",
          backstory: "A retired colonel...",
          relationships: { npc_scarlett: "admires" },
          notes: ""
        },
        npc_white: { archetype: "The Recluse", backstory: "...", relationships: {}, notes: "" },
        npc_green: { archetype: "The Witness", backstory: "...", relationships: {}, notes: "" },
        npc_peacock: { archetype: "The Protector", backstory: "...", relationships: {}, notes: "" },
        npc_plum: { archetype: "The Red Herring", backstory: "...", relationships: {}, notes: "" },
      }
    });

    const result = parseGameSetupResponse(sampleResponse);
    expect(result.truth.murderer).toBe("npc_scarlett");
    expect(result.truth.weapon).toBe("Knife");
    expect(result.truth.room).toBe("Library");
    expect(Object.keys(result.agents)).toHaveLength(6);
    expect(result.agents["npc_scarlett"].archetype).toBe("The Liar");
  });

  it("throws if murderer NPC is not assigned The Liar", () => {
    const bad = JSON.stringify({
      murderer: "npc_mustard",
      weapon: "Rope",
      room: "Kitchen",
      agents: {
        npc_scarlett: { archetype: "The Liar", backstory: "", relationships: {}, notes: "" },
        npc_mustard: { archetype: "The Gossip", backstory: "", relationships: {}, notes: "" },
        npc_white: { archetype: "The Recluse", backstory: "", relationships: {}, notes: "" },
        npc_green: { archetype: "The Witness", backstory: "", relationships: {}, notes: "" },
        npc_peacock: { archetype: "The Protector", backstory: "", relationships: {}, notes: "" },
        npc_plum: { archetype: "The Red Herring", backstory: "", relationships: {}, notes: "" },
      }
    });
    expect(() => parseGameSetupResponse(bad)).toThrow("murderer");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/gm-agent.test.ts
```

Expected: FAIL — `buildGameSetupPrompt` not found.

- [ ] **Step 3: Implement `server/src/gm-agent.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { NpcId, NPC_NAMES, WEAPONS, ROOMS, ARCHETYPES, TruthFile } from "./types";

const DATA_DIR = path.join(__dirname, "../data");
const AGENTS_DIR = path.join(DATA_DIR, "agents");

interface AgentConfig {
  archetype: string;
  backstory: string;
  relationships: Record<string, string>;
  notes: string;
}

interface GameSetupResult {
  truth: TruthFile;
  agents: Record<NpcId, AgentConfig>;
}

export function buildGameSetupPrompt(): string {
  const npcList = Object.entries(NPC_NAMES)
    .map(([id, name]) => `- ${name} (id: ${id})`)
    .join("\n");

  const archetypeList = ARCHETYPES.map((a) => `- ${a}`).join("\n");
  const weaponList = WEAPONS.map((w) => `- ${w}`).join("\n");
  const roomList = ROOMS.map((r) => `- ${r}`).join("\n");

  return `You are setting up a murder mystery game called Claudo.

## NPCs (names are fixed — do not change them):
${npcList}

## Archetypes (assign exactly one per NPC, each used exactly once):
${archetypeList}

## CRITICAL CONSTRAINT: The murderer NPC MUST be assigned "The Liar" archetype. No other NPC may have The Liar archetype.

## Weapons (pick one as the murder weapon):
${weaponList}

## Rooms (pick one as the murder room):
${roomList}

Your task:
1. Choose one NPC as the murderer (they must receive The Liar archetype).
2. Choose a weapon and room for the crime.
3. Assign the remaining five archetypes to the other five NPCs (each archetype used exactly once).
4. Write a one-paragraph backstory for each NPC consistent with their archetype and the murder scenario.
5. Write brief relationship notes for each NPC describing how they view each other NPC (one clause per pair).
6. For the murderer only, add a "notes" field with the crime details (weapon, room, motive). For all others, "notes" is empty string.

Respond with ONLY valid JSON in this exact shape:
{
  "murderer": "<npc_id>",
  "weapon": "<weapon>",
  "room": "<room>",
  "agents": {
    "<npc_id>": {
      "archetype": "<archetype>",
      "backstory": "<one paragraph>",
      "relationships": { "<other_npc_id>": "<brief description>", ... },
      "notes": "<crime details for murderer, empty string for others>"
    },
    ... (all six NPCs)
  }
}`;
}

export function parseGameSetupResponse(raw: string): GameSetupResult {
  // Claude sometimes wraps JSON in markdown code blocks — strip if present
  const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  const parsed = JSON.parse(cleaned);

  const murderer = parsed.murderer as NpcId;
  const murdererArchetype = parsed.agents[murderer]?.archetype;
  if (murdererArchetype !== "The Liar") {
    throw new Error(`murderer NPC ${murderer} must have The Liar archetype, got: ${murdererArchetype}`);
  }

  return {
    truth: { murderer, weapon: parsed.weapon, room: parsed.room },
    agents: parsed.agents as Record<NpcId, AgentConfig>,
  };
}

function buildAgentMd(npcId: NpcId, config: AgentConfig): string {
  const name = NPC_NAMES[npcId];
  const relLines = Object.entries(config.relationships)
    .map(([otherId, desc]) => `- ${NPC_NAMES[otherId as NpcId] ?? otherId}: ${desc}`)
    .join("\n");

  let md = `# ${name}\n**Archetype:** ${config.archetype}\n**Backstory:** ${config.backstory}\n**Relationships:**\n${relLines}\n`;
  if (config.notes) {
    md += `**Notes:** ${config.notes}\n`;
  }
  return md;
}

async function clearAgentsDir(): Promise<void> {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    return;
  }
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const filePath = path.join(AGENTS_DIR, file);
    fs.chmodSync(filePath, 0o644);
    fs.unlinkSync(filePath);
  }
}

export async function runGameSetup(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });

  console.log("[GM] Running GameSetup…");

  const message = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    messages: [{ role: "user", content: buildGameSetupPrompt() }],
  });

  const rawText = message.content.find((c) => c.type === "text")?.text ?? "";
  const result = parseGameSetupResponse(rawText);

  await clearAgentsDir();

  // Write agent.md files
  for (const [npcId, config] of Object.entries(result.agents) as [NpcId, AgentConfig][]) {
    const filePath = path.join(AGENTS_DIR, `${npcId}.md`);
    fs.writeFileSync(filePath, buildAgentMd(npcId, config), "utf8");
    fs.chmodSync(filePath, 0o444);
  }

  // Write truth.json (server eyes only — never sent to Godot)
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "truth.json"), JSON.stringify(result.truth, null, 2), "utf8");

  console.log(`[GM] GameSetup complete — murderer: ${result.truth.murderer}, weapon: ${result.truth.weapon}, room: ${result.truth.room}`);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/gm-agent.test.ts
```

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/gm-agent.ts server/tests/gm-agent.test.ts
git commit -m "feat: add GM agent with GameSetup, prompt builder, and agent.md writer"
```

---

## Task 6: NPC Agent

**Files:**
- Create: `server/src/npc-agent.ts`
- Create: `server/tests/npc-agent.test.ts`

> **Note:** Uses `@google/genai` SDK. The current API uses `GoogleGenAI` with `ai.models.generateContent()`. Verify against https://ai.google.dev/gemini-api/docs/quickstart if you hit import errors.

- [ ] **Step 1: Write failing tests**

Create `server/tests/npc-agent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NpcAgent } from "../src/npc-agent";
import { ChatMessage } from "../src/types";

// Mock the Google GenAI SDK
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({ text: "I know nothing of that affair." }),
    },
  })),
}));

describe("NpcAgent", () => {
  let agent: NpcAgent;

  beforeEach(() => {
    agent = new NpcAgent("npc_scarlett", "Miss Scarlett", "The Liar", "A cunning socialite.", "fake-api-key");
  });

  it("starts with an empty chat history", () => {
    expect(agent.getChatHistory()).toEqual([]);
  });

  it("appends player message and model reply to history after chat()", async () => {
    await agent.chat("Where were you last night?");
    const history = agent.getChatHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", text: "Where were you last night?" });
    expect(history[1].role).toBe("model");
  });

  it("returns the model's reply text", async () => {
    const reply = await agent.chat("Did you do it?");
    expect(typeof reply).toBe("string");
    expect(reply.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd server && npx vitest run tests/npc-agent.test.ts
```

Expected: FAIL — `NpcAgent` not found.

- [ ] **Step 3: Implement `server/src/npc-agent.ts`**

```typescript
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import { NpcId, ChatMessage } from "./types";

const AGENTS_DIR = path.join(__dirname, "../data/agents");

export class NpcAgent {
  private ai: GoogleGenAI;
  private history: ChatMessage[] = [];
  private systemPrompt: string;

  constructor(
    private npcId: NpcId,
    private name: string,
    private archetype: string,
    private backstory: string,
    apiKey: string
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    return `You are ${this.name}, a character in a murder mystery game.
Archetype: ${this.archetype}
Backstory: ${this.backstory}

Stay in character at all times. Respond as ${this.name} would — consistent with your archetype and backstory. Keep responses to 2-4 sentences. Do not break character or acknowledge that you are an AI.`;
  }

  getChatHistory(): ChatMessage[] {
    return [...this.history];
  }

  async chat(playerMessage: string): Promise<string> {
    this.history.push({ role: "user", text: playerMessage });

    const contents = this.history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const response = await this.ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: this.systemPrompt,
      },
      contents,
    });

    const replyText: string = (response as { text: string }).text ?? "...";
    this.history.push({ role: "model", text: replyText });

    return replyText;
  }

  static fromAgentMd(npcId: NpcId, name: string, apiKey: string): NpcAgent {
    const mdPath = path.join(AGENTS_DIR, `${npcId}.md`);
    const md = fs.readFileSync(mdPath, "utf8");

    const archetype = md.match(/\*\*Archetype:\*\* (.+)/)?.[1] ?? "Unknown";
    const backstory = md.match(/\*\*Backstory:\*\* (.+)/)?.[1] ?? "";

    return new NpcAgent(npcId, name, archetype, backstory, apiKey);
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd server && npx vitest run tests/npc-agent.test.ts
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/npc-agent.ts server/tests/npc-agent.test.ts
git commit -m "feat: add NpcAgent with Gemini Flash chat and history management"
```

---

## Task 7: Entry Point

**Files:**
- Create: `server/src/index.ts`

- [ ] **Step 1: Create `server/src/index.ts`**

```typescript
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env if present (development convenience — production uses env vars)
dotenv.config({ path: path.join(__dirname, "../.env") });

import { WsServer } from "./ws-server";
import { GameState } from "./game-state";
import { NpcAgent } from "./npc-agent";
import { runGameSetup } from "./gm-agent";
import { NpcId, NPC_NAMES } from "./types";

function checkEnv(): void {
  const missing: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!process.env.GOOGLE_API_KEY) missing.push("GOOGLE_API_KEY");
  if (missing.length > 0) {
    console.error(`[ERROR] Missing environment variables: ${missing.join(", ")}`);
    console.error("Create server/.env with these keys or set them in your environment.");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  checkEnv();

  const state = new GameState();
  const agents = new Map<NpcId, NpcAgent>();

  // Start WS server FIRST so port 9876 is open before Godot's 1.5s wait expires.
  // GameSetup takes 5–15 seconds; Godot connects while it runs, then waits for game_ready.
  let ws: WsServer;
  ws = new WsServer(9876, async (event, data, _socket) => {
    switch (event) {
      case "player_chat": {
        const npcId = data.npc_id as NpcId;
        const message = data.message as string;
        const agent = agents.get(npcId);
        if (!agent) break;

        state.appendMessage(npcId, { role: "user", text: message });
        const reply = await agent.chat(message);
        state.appendMessage(npcId, { role: "model", text: reply });

        ws.send("npc_reply", { npc_id: npcId, text: reply });
        break;
      }

      case "player_moved": {
        state.playerRoom = data.room_name as string;
        break;
      }

      case "notebook_updated": {
        // Accepted and ignored in Phase 1 — GM evaluation loop is Phase 3
        break;
      }

      case "reconnect": {
        ws.send("state_snapshot", state.toSnapshot() as unknown as Record<string, unknown>);
        break;
      }
    }
  });

  // Run GM GameSetup (writes agent.md files, truth.json) — Godot is already connected and waiting
  await runGameSetup();

  // Load NPC agents from freshly written agent.md files
  for (const [npcId, name] of Object.entries(NPC_NAMES) as [NpcId, string][]) {
    agents.set(npcId, NpcAgent.fromAgentMd(npcId, name, process.env.GOOGLE_API_KEY!));
  }

  // Godot client is connected — send game_ready immediately
  ws.send("game_ready", { npc_names: Object.values(NPC_NAMES) });
  console.log("[Server] game_ready sent");
}

main().catch((err) => {
  console.error("[Server] Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: add server entry point — env check, GameSetup, WS routing"
```

---

## Task 8: Build and Commit dist

**Files:**
- Create: `server/dist/` (compiled output)

- [ ] **Step 1: Run full test suite**

```bash
cd server && npm test
```

Expected: All tests pass.

- [ ] **Step 2: Build TypeScript to dist**

```bash
cd server && npm run build
```

Expected: `server/dist/` created with `index.js`, `ws-server.js`, `game-state.js`, `gm-agent.js`, `npc-agent.js`, `types.js`.

- [ ] **Step 3: Smoke-test the build**

Copy your API keys to `server/.env` (create from `.env.example`), then:

```bash
cd server && node dist/index.js
```

Expected output:
```
[WS] Listening on port 9876
[GM] Running GameSetup…
[GM] GameSetup complete — murderer: npc_X, weapon: Y, room: Z
```

Ctrl+C to stop. Verify `server/data/agents/` contains six `.md` files and `truth.json` exists.

- [ ] **Step 4: Commit dist**

```bash
git add server/dist/ server/.env.example
git commit -m "feat: add compiled server dist — players need only Node.js installed"
```

---

## Task 9: Godot — ServerBridge Autoload

**Files:**
- Create: `autoloads/server_bridge.gd`
- Modify: `project.godot`

- [ ] **Step 1: Create `autoloads/` directory and `server_bridge.gd`**

```bash
mkdir -p /Users/willfrost/CodingProjects/Claudo/autoloads
```

Create `autoloads/server_bridge.gd`:

```gdscript
extends Node

signal npc_reply(npc_id: String, text: String)
signal game_ready()

const WS_URL := "ws://127.0.0.1:9876"
const RECONNECT_INTERVAL := 3.0
const RECONNECT_TIMEOUT := 300.0

var _socket := WebSocketPeer.new()
var _connected := false
var _reconnecting := false
var _connection_started := false  # guard so _process ignores socket before connect_to_server() is called
var _reconnect_timer := 0.0
var _reconnect_elapsed := 0.0

func _ready() -> void:
	set_process(true)

func connect_to_server() -> void:
	_connection_started = true
	_socket.connect_to_url(WS_URL)

func _process(delta: float) -> void:
	if not _connection_started:
		return
	_socket.poll()
	var state := _socket.get_ready_state()

	if state == WebSocketPeer.STATE_OPEN:
		if not _connected:
			_connected = true
			_reconnecting = false
			_reconnect_timer = 0.0
			_reconnect_elapsed = 0.0
		while _socket.get_available_packet_count() > 0:
			var raw := _socket.get_packet().get_string_from_utf8()
			_handle_message(raw)

	elif state == WebSocketPeer.STATE_CLOSED:
		if _connected or not _reconnecting:
			# Either dropped mid-game or initial connection failed — start/restart reconnect loop
			if _connected:
				_connected = false
			_start_reconnect()
		else:
			# Already in reconnect loop — manage timer
			_reconnect_elapsed += delta
			_reconnect_timer += delta
			if _reconnect_elapsed >= RECONNECT_TIMEOUT:
				_on_reconnect_timeout()
			elif _reconnect_timer >= RECONNECT_INTERVAL:
				_reconnect_timer = 0.0
				_socket = WebSocketPeer.new()
				_socket.connect_to_url(WS_URL)

func _handle_message(raw: String) -> void:
	var json := JSON.new()
	if json.parse(raw) != OK:
		return
	var msg: Dictionary = json.get_data()
	match msg.get("event", ""):
		"game_ready":
			game_ready.emit()
		"npc_reply":
			var d: Dictionary = msg.get("data", {})
			npc_reply.emit(d.get("npc_id", ""), d.get("text", ""))
		"state_snapshot":
			pass  # Phase 2+ will handle restoring state

func _send(event: String, data: Dictionary) -> void:
	if _socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	var msg := JSON.stringify({ "event": event, "data": data })
	_socket.send_text(msg)

func send_player_chat(npc_id: String, message: String) -> void:
	_send("player_chat", { "npc_id": npc_id, "message": message })

func send_player_moved(room_name: String) -> void:
	_send("player_moved", { "room_name": room_name })

func send_notebook_updated(text: String) -> void:
	_send("notebook_updated", { "text": text })

func _start_reconnect() -> void:
	_reconnecting = true
	_reconnect_elapsed = 0.0
	_reconnect_timer = RECONNECT_INTERVAL  # trigger immediately

func _on_reconnect_timeout() -> void:
	_reconnecting = false
	get_tree().change_scene_to_file("res://scenes/main/main.tscn")
```

- [ ] **Step 2: Register ServerBridge as autoload**

Open `project.godot` in a text editor and add this section (or add via Godot editor: Project → Project Settings → Autoload → Add):

```ini
[autoload]

ServerBridge="*res://autoloads/server_bridge.gd"
```

- [ ] **Step 3: Commit**

```bash
git add autoloads/server_bridge.gd project.godot
git commit -m "feat: add ServerBridge autoload for WebSocket connection"
```

---

## Task 10: Godot — Loading Screen

**Files:**
- Create: `scenes/ui/loading/loading_screen.tscn`
- Create: `scenes/ui/loading/loading_screen.gd`

- [ ] **Step 1: Create loading screen scene**

In Godot editor: Scene → New Scene → Root: `CanvasLayer` → rename to `LoadingScreen` → save as `scenes/ui/loading/loading_screen.tscn`.

Scene tree:
```
LoadingScreen (CanvasLayer)
└── Panel (full screen, dark — Color #1a1a1a, alpha 0.95)
    ├── StatusLabel (Label, centered, text "Starting game…", font size 16)
    └── QuitButton (Button, text "Quit", visible false, centered below label)
```

Panel anchor preset: Full Rect.

- [ ] **Step 2: Create `scenes/ui/loading/loading_screen.gd`**

```gdscript
extends CanvasLayer

const TIMEOUT := 30.0  # GM GameSetup (Claude Opus call) can take 5–15 s; 30 s provides headroom

@onready var status_label: Label = $Panel/StatusLabel
@onready var quit_button: Button = $Panel/QuitButton

var _elapsed := 0.0
var _active := true

func _ready() -> void:
	quit_button.pressed.connect(get_tree().quit)
	ServerBridge.game_ready.connect(_on_game_ready)
	set_process(true)

func _process(delta: float) -> void:
	if not _active:
		return
	_elapsed += delta
	if _elapsed >= TIMEOUT:
		status_label.text = "Failed to start server.\nIs Node.js installed?"
		quit_button.visible = true
		set_process(false)

func _on_game_ready() -> void:
	_active = false
	queue_free()
```

Attach `loading_screen.gd` to `LoadingScreen`.

- [ ] **Step 3: Commit**

```bash
git add scenes/ui/loading/
git commit -m "feat: add loading screen with timeout and Node.js error message"
```

---

## Task 11: Godot — Chat Window

**Files:**
- Create: `scenes/ui/chat/chat_window.tscn`
- Create: `scenes/ui/chat/chat_window.gd`

- [ ] **Step 1: Create chat window scene**

In Godot editor: Scene → New Scene → Root: `CanvasLayer` → rename to `ChatWindow` → save as `scenes/ui/chat/chat_window.tscn`.

Scene tree:
```
ChatWindow (CanvasLayer)
└── Panel (anchored bottom-centre, size 600×300)
    └── VBoxContainer (full rect inside panel, margin 8px)
        ├── NpcNameLabel (Label, font size 13, bold)
        ├── ScrollContainer (size flag: expand+fill)
        │   └── HistoryVBox (VBoxContainer, size flag: expand+fill)
        └── HBoxContainer
            ├── MessageInput (LineEdit, size flag: expand+fill, placeholder "Say something…")
            └── SendButton (Button, text "Send")
```

Panel anchor preset: Bottom Centre. Size: `600 × 300`. Offset top: `-300`.

- [ ] **Step 2: Create `scenes/ui/chat/chat_window.gd`**

```gdscript
extends CanvasLayer

@onready var npc_name_label: Label = $Panel/VBoxContainer/NpcNameLabel
@onready var history_vbox: VBoxContainer = $Panel/VBoxContainer/ScrollContainer/HistoryVBox
@onready var scroll_container: ScrollContainer = $Panel/VBoxContainer/ScrollContainer
@onready var message_input: LineEdit = $Panel/VBoxContainer/HBoxContainer/MessageInput
@onready var send_button: Button = $Panel/VBoxContainer/HBoxContainer/SendButton

var _active_npc_id: String = ""
var _waiting_for_reply := false

func _ready() -> void:
	visible = false
	send_button.pressed.connect(_on_send)
	message_input.text_submitted.connect(_on_send)
	ServerBridge.npc_reply.connect(_on_npc_reply)

func open(npc_id: String, npc_name: String) -> void:
	_active_npc_id = npc_id
	npc_name_label.text = npc_name
	visible = true
	message_input.grab_focus()

func close() -> void:
	visible = false
	_active_npc_id = ""

func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		close()
		get_viewport().set_input_as_handled()

func _on_send(_submitted_text: String = "") -> void:
	var text := message_input.text.strip_edges()
	if text.is_empty() or _waiting_for_reply:
		return
	message_input.clear()
	message_input.editable = false
	_waiting_for_reply = true
	_add_message("You", text)
	ServerBridge.send_player_chat(_active_npc_id, text)

func _on_npc_reply(npc_id: String, reply_text: String) -> void:
	if npc_id != _active_npc_id:
		return
	_add_message(npc_name_label.text, reply_text)
	message_input.editable = true
	_waiting_for_reply = false
	message_input.grab_focus()

func _add_message(speaker: String, text: String) -> void:
	var label := RichTextLabel.new()
	label.bbcode_enabled = true
	label.fit_content = true
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.text = "[b]%s:[/b] %s" % [speaker, text]
	history_vbox.add_child(label)
	await get_tree().process_frame
	scroll_container.scroll_vertical = scroll_container.get_v_scroll_bar().max_value
```

Attach `chat_window.gd` to `ChatWindow`.

- [ ] **Step 3: Commit**

```bash
git add scenes/ui/chat/
git commit -m "feat: add ChatWindow UI with scrollable history and NPC reply display"
```

---

## Task 12: Godot — NPC Click Handler

**Files:**
- Modify: `scenes/npc/npc.gd`

- [ ] **Step 1: Update `scenes/npc/npc.gd`**

Replace the full file content:

```gdscript
extends Area2D

@export var npc_name: String = "Unknown"
@export var npc_id: String = ""
@export var npc_texture: Texture2D

@onready var sprite: Sprite2D = $NPCSprite

func _ready() -> void:
	if npc_texture:
		sprite.texture = npc_texture
	input_pickable = true
	input_event.connect(_on_input_event)

func _on_input_event(_viewport: Node, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var chat_window = get_tree().get_first_node_in_group("chat_window")
		if chat_window:
			chat_window.open(npc_id, npc_name)
```

- [ ] **Step 2: Set `npc_id` on all 6 NPC instances in main.tscn**

Open `scenes/main/main.tscn` in Godot. For each NPC instance under `Mansion`, set the `npc_id` export in the inspector:

| Instance | `npc_id` value |
|----------|---------------|
| NPCScarlett | `npc_scarlett` |
| NPCMustard | `npc_mustard` |
| NPCWhite | `npc_white` |
| NPCGreen | `npc_green` |
| NPCPeacock | `npc_peacock` |
| NPCPlum | `npc_plum` |

- [ ] **Step 3: Commit**

```bash
git add scenes/npc/npc.gd scenes/main/main.tscn
git commit -m "feat: add npc_id export and click handler to open ChatWindow"
```

---

## Task 13: Godot — Main Scene Wiring

**Files:**
- Modify: `scenes/main/main.gd`
- Modify: `scenes/main/main.tscn`

- [ ] **Step 1: Add LoadingScreen and ChatWindow instances to main.tscn**

In Godot editor, open `scenes/main/main.tscn`. Add two more children to Main:

1. Instance `scenes/ui/loading/loading_screen.tscn` → name `LoadingScreen`
2. Instance `scenes/ui/chat/chat_window.tscn` → name `ChatWindow`

Add `ChatWindow` to group `"chat_window"` (Node tab → Groups).

- [ ] **Step 2: Rewrite `scenes/main/main.gd`**

```gdscript
extends Node2D

@onready var mansion: Node2D = $Mansion
@onready var hud = $HUD

var _server_pid := -1

func _ready() -> void:
	get_tree().auto_accept_quit = false  # required so NOTIFICATION_WM_CLOSE_REQUEST fires instead of instant quit
	mansion.room_changed.connect(hud.update_room)
	mansion.room_changed.connect(ServerBridge.send_player_moved)
	_spawn_server()

func _spawn_server() -> void:
	var script_path := ProjectSettings.globalize_path("res://server/start.sh")
	_server_pid = OS.create_process("/bin/bash", [script_path])
	if _server_pid < 0:
		push_error("Failed to spawn server process")
		return
	# Wait 1.5s for the server to start, then connect WebSocket
	await get_tree().create_timer(1.5).timeout
	ServerBridge.connect_to_server()

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		if _server_pid > 0:
			OS.kill(_server_pid)
		get_tree().quit()
```

- [ ] **Step 3: Verify `auto_accept_quit` is set**

`get_tree().auto_accept_quit = false` is already set in `_ready()` above. This is required — without it, Godot quits immediately on window close without firing `NOTIFICATION_WM_CLOSE_REQUEST`, and the server process is never killed. No additional editor setting is needed.

- [ ] **Step 4: Wire notebook to ServerBridge**

Do **not** replace `notebook.gd` wholesale — the existing file has CLAUDE.md-documented behaviour (TextEdit focus guard, backdrop click-to-close, `gui_release_focus` on close) that must be preserved.

Instead, add three things to the existing file:

**a)** Add three `@onready` declarations at the top of the file. The exact node paths depend on your actual scene tree — open `scenes/ui/notebook/notebook.tscn` in Godot and check the node names under the `TabContainer` before adding these:

```gdscript
@onready var suspects_edit: TextEdit = $Panel/VBoxContainer/TabContainer/Suspects
@onready var weapons_edit: TextEdit = $Panel/VBoxContainer/TabContainer/Weapons
@onready var rooms_edit: TextEdit = $Panel/VBoxContainer/TabContainer/Rooms
```

**b)** In the existing `_ready()` function, append the signal connections:

```gdscript
suspects_edit.text_changed.connect(_on_notebook_changed)
weapons_edit.text_changed.connect(_on_notebook_changed)
rooms_edit.text_changed.connect(_on_notebook_changed)
```

**c)** Add the handler at the bottom of the file:

```gdscript
func _on_notebook_changed() -> void:
	var combined := suspects_edit.text + "\n" + weapons_edit.text + "\n" + rooms_edit.text
	ServerBridge.send_notebook_updated(combined)
```

- [ ] **Step 5: Commit**

```bash
git add scenes/main/main.gd scenes/main/main.tscn scenes/ui/notebook/notebook.gd
git commit -m "feat: wire main scene — server spawn, room events, notebook updates"
```

---

## Task 14: Full Integration Test

- [ ] **Step 1: Ensure `server/.env` exists with valid API keys**

```bash
cp server/.env.example server/.env
# Edit server/.env and fill in real keys
```

- [ ] **Step 2: Rebuild server dist**

```bash
cd server && npm run build
```

- [ ] **Step 3: Launch the game**

Press F5 in Godot. Verify:

- [ ] Loading screen appears ("Starting game…")
- [ ] After ~5–10 seconds, loading screen dismisses (GM ran GameSetup)
- [ ] `server/data/agents/` contains six `.md` files
- [ ] Player can walk around all 9 rooms
- [ ] HUD room name updates as player moves
- [ ] Walking to an NPC and clicking their speech bubble opens the chat window
- [ ] Typing a message and pressing Enter sends it; NPC replies appear
- [ ] Each of the six NPCs can be chatted with independently
- [ ] Pressing Escape closes the chat window
- [ ] Pressing N toggles the notebook; typing in it doesn't cause errors
- [ ] Closing the Godot window kills the server process (verify via Activity Monitor or `ps aux | grep node`)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — server spawn, GM setup, NPC chat via WebSocket"
```

---

## Done

Phase 1 is complete when: the player can launch the game, wait for GM setup, walk up to any NPC, and hold a real AI-powered conversation — with the server spawning and dying automatically with the game process.

Next: **Phase 2 — NPC Intelligence** (memory graphs, NPC autonomy loop, NPC↔NPC conversations).

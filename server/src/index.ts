import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load .env if present (development convenience — production uses env vars)
dotenv.config({ path: path.join(__dirname, "../.env") });

import { WsServer } from "./ws-server";
import { GameState } from "./game-state";
import { NpcAgent } from "./npc-agent";
import { runGameSetup } from "./gm-agent";
import { NpcId, NPC_NAMES, TruthFile } from "./types";
import { AutonomyLoop } from "./autonomy-loop";
import { MemoryStore } from "./memory-store";
import { runNpcConversation } from "./npc-conversation";
import { SpySystem } from "./spy-system";
import { GmLoop } from "./gm-loop";

const NPC_CONVERSATION_QUIET_PERIOD_MS = 60_000;
const NPC_CONVERSATION_TURN_PAUSE_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkEnv(): void {
  const missing: string[] = [];
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
  let spySystem: SpySystem;
  let gmLoop: GmLoop;

  // Start WS server FIRST so port 9876 is open before Godot's 1.5s wait expires.
  // GameSetup takes 5–15 seconds; Godot connects while it runs, then waits for game_ready.
  let ws: WsServer;
  let setupComplete = false;

  const sendGameReady = (): void => {
    ws.send("game_ready", { npc_names: Object.values(NPC_NAMES) });
    console.log("[Server] game_ready sent");
  };

  ws = new WsServer(9876, async (event, data, _socket) => {
    switch (event) {
      case "player_chat": {
        const npcId = data.npc_id as NpcId;
        const message = data.message as string;
        const agent = agents.get(npcId);
        if (!agent) break;

        if (agent.isBusy) {
          ws.send("npc_reply", { npc_id: npcId, text: "[They are currently occupied — try again in a moment.]" });
          break;
        }

        state.activeNpcId = npcId;
        state.appendMessage(npcId, { role: "user", text: message });

        try {
          const graph = MemoryStore.read(npcId);
          agent.setMemoryContext(graph);
        } catch { /* memory not yet written — shouldn't happen post-setup */ }

        try {
          const reply = await agent.chat(message);
          state.appendMessage(npcId, { role: "model", text: reply });
          ws.send("npc_reply", { npc_id: npcId, text: reply });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          console.error(`[Server] player_chat failed for ${npcId}:`, detail);

          const fallback = /429|RESOURCE_EXHAUSTED/i.test(detail)
            ? "[I'm momentarily overwhelmed — please try again in a few moments.]"
            : "[I can't respond right now. Please try again in a moment.]";

          ws.send("npc_reply", { npc_id: npcId, text: fallback });
        } finally {
          state.activeNpcId = null;
        }
        break;
      }

      case "player_moved": {
        const previousRoom = state.playerRoom;
        state.playerRoom = data.room_name as string;
        if (previousRoom) {
          spySystem.checkPlayerMoved(previousRoom);
        }
        break;
      }

      case "notebook_updated": {
        state.notebookText = data.text as string;
        break;
      }

      case "body_interacted": {
        const npcId = data.npc_id as NpcId;
        if (!state.isEliminated(npcId)) break;
        const clue = await spySystem.getBodyClue(npcId, process.env.GOOGLE_API_KEY!);
        ws.send("npc_clue", { npc_id: npcId, clue_text: clue });
        break;
      }

      case "reconnect": {
        ws.send("state_snapshot", state.toSnapshot() as unknown as Record<string, unknown>);
        break;
      }
    }
  });

  ws.onClientConnected(() => {
    if (!setupComplete) return;
    sendGameReady();
  });

  // Run GM GameSetup (writes agent.md files, truth.json) — Godot is already connected and waiting
  await runGameSetup();

  // Read truth.json written by GameSetup
  const truth: TruthFile = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../data/truth.json"), "utf8")
  );

  // Load NPC agents from freshly written agent.md files
  for (const [npcId, name] of Object.entries(NPC_NAMES) as [NpcId, string][]) {
    agents.set(npcId, NpcAgent.fromAgentMd(npcId, name, process.env.GOOGLE_API_KEY!));
  }

  // Instantiate SpySystem with callbacks into state
  spySystem = new SpySystem(
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

  // Instantiate and start GmLoop
  gmLoop = new GmLoop(
    process.env.GOOGLE_API_KEY!,
    truth,
    spySystem,
    () => state.notebookText,
    () => state.playerRoom,
    (npcId) => state.getChatHistory(npcId),
    () => state.getNpcConversations()
  );
  gmLoop.start();

  // Track in-progress NPC↔NPC conversations to prevent double-triggering
  const conversationsInProgress = new Set<string>();
  const conversationsUnlockedAt = Date.now() + NPC_CONVERSATION_QUIET_PERIOD_MS;

  function conversationKey(a: NpcId, b: NpcId): string {
    return [a, b].sort().join("+");
  }

  async function maybeStartConversation(arrivedNpc: NpcId, room: string): Promise<void> {
    if (!state.playerRoom) return;
    if (Date.now() < conversationsUnlockedAt) return;

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

      for (let i = 0; i < result.transcript.length; i++) {
        if (i > 0) {
          await sleep(NPC_CONVERSATION_TURN_PAUSE_MS);
        }
        const partialLines = result.transcript
          .slice(0, i + 1)
          .map(t => `${NPC_NAMES[t.speaker]}: ${t.text}`)
          .join("\n");
        ws.send("npc_chat_npc", { npc_a: arrivedNpc, npc_b: partner, room, transcript: partialLines });
      }

      const lines = result.transcript.map(t => `${NPC_NAMES[t.speaker]}: ${t.text}`).join("\n");
      state.recordNpcConversation(arrivedNpc, partner, room, lines);  // in-memory log; Phase 3 GM reads via state
    } catch (err) {
      console.error("[Conversation] Error:", err);
    } finally {
      agentA.isBusy = false;
      agentB.isBusy = false;
      conversationsInProgress.delete(key);
    }
  }

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

  setupComplete = true;
  sendGameReady();
}

main().catch((err) => {
  console.error("[Server] Fatal error:", err);
  process.exit(1);
});

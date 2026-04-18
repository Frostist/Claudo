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

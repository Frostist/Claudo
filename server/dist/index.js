"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
// Load .env if present (development convenience — production uses env vars)
dotenv.config({ path: path.join(__dirname, "../.env") });
const ws_server_1 = require("./ws-server");
const game_state_1 = require("./game-state");
const npc_agent_1 = require("./npc-agent");
const gm_agent_1 = require("./gm-agent");
const types_1 = require("./types");
function checkEnv() {
    const missing = [];
    if (!process.env.ANTHROPIC_API_KEY)
        missing.push("ANTHROPIC_API_KEY");
    if (!process.env.GOOGLE_API_KEY)
        missing.push("GOOGLE_API_KEY");
    if (missing.length > 0) {
        console.error(`[ERROR] Missing environment variables: ${missing.join(", ")}`);
        console.error("Create server/.env with these keys or set them in your environment.");
        process.exit(1);
    }
}
async function main() {
    checkEnv();
    const state = new game_state_1.GameState();
    const agents = new Map();
    // Start WS server FIRST so port 9876 is open before Godot's 1.5s wait expires.
    // GameSetup takes 5–15 seconds; Godot connects while it runs, then waits for game_ready.
    let ws;
    ws = new ws_server_1.WsServer(9876, async (event, data, _socket) => {
        switch (event) {
            case "player_chat": {
                const npcId = data.npc_id;
                const message = data.message;
                const agent = agents.get(npcId);
                if (!agent)
                    break;
                state.appendMessage(npcId, { role: "user", text: message });
                const reply = await agent.chat(message);
                state.appendMessage(npcId, { role: "model", text: reply });
                ws.send("npc_reply", { npc_id: npcId, text: reply });
                break;
            }
            case "player_moved": {
                state.playerRoom = data.room_name;
                break;
            }
            case "notebook_updated": {
                // Accepted and ignored in Phase 1 — GM evaluation loop is Phase 3
                break;
            }
            case "reconnect": {
                ws.send("state_snapshot", state.toSnapshot());
                break;
            }
        }
    });
    // Run GM GameSetup (writes agent.md files, truth.json) — Godot is already connected and waiting
    await (0, gm_agent_1.runGameSetup)();
    // Load NPC agents from freshly written agent.md files
    for (const [npcId, name] of Object.entries(types_1.NPC_NAMES)) {
        agents.set(npcId, npc_agent_1.NpcAgent.fromAgentMd(npcId, name, process.env.GOOGLE_API_KEY));
    }
    // Godot client is connected — send game_ready immediately
    ws.send("game_ready", { npc_names: Object.values(types_1.NPC_NAMES) });
    console.log("[Server] game_ready sent");
}
main().catch((err) => {
    console.error("[Server] Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map
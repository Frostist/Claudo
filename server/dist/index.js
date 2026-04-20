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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Load .env if present (development convenience — production uses env vars)
dotenv.config({ path: path.join(__dirname, "../.env") });
const ws_server_1 = require("./ws-server");
const game_state_1 = require("./game-state");
const npc_agent_1 = require("./npc-agent");
const gm_agent_1 = require("./gm-agent");
const types_1 = require("./types");
const autonomy_loop_1 = require("./autonomy-loop");
const memory_store_1 = require("./memory-store");
const npc_conversation_1 = require("./npc-conversation");
const spy_system_1 = require("./spy-system");
const gm_loop_1 = require("./gm-loop");
function checkEnv() {
    const missing = [];
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
    let spySystem;
    let gmLoop;
    // Start WS server FIRST so port 9876 is open before Godot's 1.5s wait expires.
    // GameSetup takes 5–15 seconds; Godot connects while it runs, then waits for game_ready.
    let ws;
    let setupComplete = false;
    const sendGameReady = () => {
        ws.send("game_ready", { npc_names: Object.values(types_1.NPC_NAMES) });
        console.log("[Server] game_ready sent");
    };
    ws = new ws_server_1.WsServer(9876, async (event, data, _socket) => {
        switch (event) {
            case "player_chat": {
                const npcId = data.npc_id;
                const message = data.message;
                const agent = agents.get(npcId);
                if (!agent)
                    break;
                if (agent.isBusy) {
                    ws.send("npc_reply", { npc_id: npcId, text: "[They are currently occupied — try again in a moment.]" });
                    break;
                }
                state.activeNpcId = npcId;
                state.appendMessage(npcId, { role: "user", text: message });
                try {
                    const graph = memory_store_1.MemoryStore.read(npcId);
                    agent.setMemoryContext(graph);
                }
                catch { /* memory not yet written — shouldn't happen post-setup */ }
                const reply = await agent.chat(message);
                state.appendMessage(npcId, { role: "model", text: reply });
                state.activeNpcId = null;
                ws.send("npc_reply", { npc_id: npcId, text: reply });
                break;
            }
            case "player_moved": {
                const previousRoom = state.playerRoom;
                state.playerRoom = data.room_name;
                if (previousRoom) {
                    spySystem.checkPlayerMoved(previousRoom);
                }
                break;
            }
            case "notebook_updated": {
                state.notebookText = data.text;
                break;
            }
            case "body_interacted": {
                const npcId = data.npc_id;
                if (!state.isEliminated(npcId))
                    break;
                const clue = await spySystem.getBodyClue(npcId, process.env.GOOGLE_API_KEY);
                ws.send("npc_clue", { npc_id: npcId, clue_text: clue });
                break;
            }
            case "reconnect": {
                ws.send("state_snapshot", state.toSnapshot());
                break;
            }
        }
    });
    ws.onClientConnected(() => {
        if (!setupComplete)
            return;
        sendGameReady();
    });
    // Run GM GameSetup (writes agent.md files, truth.json) — Godot is already connected and waiting
    await (0, gm_agent_1.runGameSetup)();
    // Read truth.json written by GameSetup
    const truth = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/truth.json"), "utf8"));
    // Load NPC agents from freshly written agent.md files
    for (const [npcId, name] of Object.entries(types_1.NPC_NAMES)) {
        agents.set(npcId, npc_agent_1.NpcAgent.fromAgentMd(npcId, name, process.env.GOOGLE_API_KEY));
    }
    // Instantiate SpySystem with callbacks into state
    spySystem = new spy_system_1.SpySystem(() => truth.murderer, () => state.eliminationCount, () => state.spyQueue, (id) => { state.spyQueue = id; }, (npcId) => state.getNpcRoom(npcId), () => state.playerRoom, (npcId) => state.isEliminated(npcId), (npcId) => state.recordElimination(npcId), (npcId) => {
        console.log(`[Spy] Eliminating ${npcId}`);
        ws.send("npc_eliminated", { npc_id: npcId });
    });
    // Instantiate and start GmLoop
    gmLoop = new gm_loop_1.GmLoop(process.env.GOOGLE_API_KEY, truth, spySystem, () => state.notebookText, () => state.playerRoom, (npcId) => state.getChatHistory(npcId), () => state.getNpcConversations());
    gmLoop.start();
    // Track in-progress NPC↔NPC conversations to prevent double-triggering
    const conversationsInProgress = new Set();
    function conversationKey(a, b) {
        return [a, b].sort().join("+");
    }
    async function maybeStartConversation(arrivedNpc, room) {
        if (!state.playerRoom)
            return;
        const others = state.getNpcsInRoom(room).filter(id => id !== arrivedNpc);
        if (others.length === 0)
            return;
        // Pick a partner. conversationsInProgress guards against double-triggering when two
        // NPCs arrive simultaneously — both ticks hit the has(key) check before any await.
        const partner = others.sort()[0];
        const agentA = agents.get(arrivedNpc);
        const agentB = agents.get(partner);
        if (!agentA || !agentB)
            return;
        if (agentA.isBusy || agentB.isBusy)
            return;
        // Spec: if the player is chatting with ANY NPC in this room, the arriving NPC idles
        const activeId = state.activeNpcId;
        if (activeId && state.getNpcRoom(activeId) === room)
            return;
        const key = conversationKey(arrivedNpc, partner);
        if (conversationsInProgress.has(key))
            return;
        conversationsInProgress.add(key);
        agentA.isBusy = true;
        agentB.isBusy = true;
        try {
            console.log(`[Conversation] ${arrivedNpc} ↔ ${partner} in ${room}`);
            const graphA = memory_store_1.MemoryStore.read(arrivedNpc);
            const graphB = memory_store_1.MemoryStore.read(partner);
            const result = await (0, npc_conversation_1.runNpcConversation)(arrivedNpc, partner, graphA, graphB, process.env.GOOGLE_API_KEY);
            const lines = result.transcript.map(t => `${types_1.NPC_NAMES[t.speaker]}: ${t.text}`).join("\n");
            state.recordNpcConversation(arrivedNpc, partner, room, lines); // in-memory log; Phase 3 GM reads via state
            ws.send("npc_chat_npc", { npc_a: arrivedNpc, npc_b: partner, room, transcript: lines });
        }
        catch (err) {
            console.error("[Conversation] Error:", err);
        }
        finally {
            agentA.isBusy = false;
            agentB.isBusy = false;
            conversationsInProgress.delete(key);
        }
    }
    const loop = new autonomy_loop_1.AutonomyLoop((npcId) => state.getNpcRoom(npcId), (npcId, room) => state.setNpcRoom(npcId, room), async (npcId, room) => {
        ws.send("npc_moved", { npc_id: npcId, room_name: room });
        await maybeStartConversation(npcId, room);
    }, (npcId) => agents.get(npcId)?.isBusy ?? false);
    loop.start(Object.keys(types_1.NPC_NAMES));
    console.log("[Server] Autonomy loop started");
    setupComplete = true;
    sendGameReady();
}
main().catch((err) => {
    console.error("[Server] Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map
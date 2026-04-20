"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmLoop = void 0;
exports.buildGmSystemPrompt = buildGmSystemPrompt;
exports.buildEvalSnapshot = buildEvalSnapshot;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const types_1 = require("./types");
const memory_store_1 = require("./memory-store");
const heat_score_1 = require("./heat-score");
function buildGmSystemPrompt() {
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
function buildEvalSnapshot(snap) {
    const delta = snap.currentHeatScore - snap.previousHeatScore;
    const activity = snap.newChatEntries.length > 0
        ? `New chat activity since last evaluation:\n${snap.newChatEntries.join("\n")}`
        : "No new chat activity since last evaluation.";
    return `## Current evaluation

Heat score: ${snap.currentHeatScore}/99 (previous: ${snap.previousHeatScore}/99, delta: ${delta > 0 ? "+" : ""}${delta})

${activity}

Evaluate the situation and decide whether to dispatch the spy.`;
}
const GM_TOOLS = [
    {
        name: "read_chat_logs",
        description: "Read player↔NPC and NPC↔NPC conversation transcripts. Pass npc_id to filter to one NPC, or omit for all.",
        input_schema: { type: "object", properties: { npc_id: { type: "string", description: "Optional NPC ID to filter" } } },
    },
    {
        name: "read_memory_graph",
        description: "Read an NPC's full memory graph.",
        input_schema: { type: "object", properties: { npc_id: { type: "string" } }, required: ["npc_id"] },
    },
    {
        name: "read_notebook",
        description: "Read the player's current detective notebook text.",
        input_schema: { type: "object", properties: {} },
    },
    {
        name: "get_heat_score",
        description: "Get the current heat score (0–99) based on the player's notebook.",
        input_schema: { type: "object", properties: {} },
    },
    {
        name: "get_player_location",
        description: "Get the room the player is currently in.",
        input_schema: { type: "object", properties: {} },
    },
    {
        name: "dispatch_spy",
        description: "Eliminate a target NPC. Returns eliminated, queued, or an error.",
        input_schema: { type: "object", properties: { npc_id: { type: "string" } }, required: ["npc_id"] },
    },
];
class GmLoop {
    constructor(apiKey, truth, spySystem, getNotebookText, getPlayerRoom, getPlayerChatHistory, getNpcConversations, intervalMs = 120000) {
        this.apiKey = apiKey;
        this.truth = truth;
        this.spySystem = spySystem;
        this.getNotebookText = getNotebookText;
        this.getPlayerRoom = getPlayerRoom;
        this.getPlayerChatHistory = getPlayerChatHistory;
        this.getNpcConversations = getNpcConversations;
        this.intervalMs = intervalMs;
        this.timer = null;
        this.previousHeatScore = 0;
        this.lastConversationIndex = 0;
        this.lastPlayerChatIndex = new Map();
    }
    start() {
        this.timer = setInterval(() => this.evaluate().catch(err => console.error("[GmLoop] Evaluation error:", err)), this.intervalMs);
        console.log("[GmLoop] Started — evaluating every", this.intervalMs / 1000, "seconds");
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async evaluate() {
        const notebookText = this.getNotebookText();
        const currentHeatScore = (0, heat_score_1.calculateHeatScore)(notebookText, this.truth);
        const allConversations = this.getNpcConversations();
        const newNpcEntries = allConversations.slice(this.lastConversationIndex).map(c => `[NPC conversation in ${c.room}] ${types_1.NPC_NAMES[c.npc_a]} & ${types_1.NPC_NAMES[c.npc_b]}:\n${c.transcript}`);
        this.lastConversationIndex = allConversations.length;
        const newPlayerEntries = [];
        for (const [npcId, name] of Object.entries(types_1.NPC_NAMES)) {
            const history = this.getPlayerChatHistory(npcId);
            const newMessages = history.slice(this.lastPlayerChatIndex.get(npcId) ?? 0);
            for (const msg of newMessages) {
                const speaker = msg.role === "user" ? "Player" : name;
                newPlayerEntries.push(`[Chat with ${name}] ${speaker}: ${msg.text}`);
            }
            this.lastPlayerChatIndex.set(npcId, history.length);
        }
        const newEntries = [...newPlayerEntries, ...newNpcEntries];
        const snap = { currentHeatScore, previousHeatScore: this.previousHeatScore, newChatEntries: newEntries };
        console.log(`[GmLoop] Evaluating — heat: ${currentHeatScore} (prev: ${this.previousHeatScore}, delta: ${currentHeatScore - this.previousHeatScore})`);
        this.previousHeatScore = currentHeatScore;
        await this.runToolLoop(snap);
    }
    async runToolLoop(snap) {
        const client = new sdk_1.default({ apiKey: this.apiKey });
        const messages = [{ role: "user", content: buildEvalSnapshot(snap) }];
        for (let turn = 0; turn < 10; turn++) {
            const response = await client.messages.create({
                model: "claude-opus-4-7",
                max_tokens: 1024,
                system: buildGmSystemPrompt(),
                tools: GM_TOOLS,
                messages,
            });
            console.log(`[GmLoop] Turn ${turn + 1} — stop_reason: ${response.stop_reason}`);
            messages.push({ role: "assistant", content: response.content });
            if (response.stop_reason !== "tool_use")
                break;
            const toolResults = [];
            for (const block of response.content) {
                if (block.type !== "tool_use")
                    continue;
                const result = this.executeTool(block.name, block.input);
                console.log(`[GmLoop] Tool: ${block.name}(${JSON.stringify(block.input)}) → ${JSON.stringify(result)}`);
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
            }
            messages.push({ role: "user", content: toolResults });
        }
    }
    executeTool(name, input) {
        switch (name) {
            case "read_chat_logs": {
                const npcId = input.npc_id;
                const npcIds = npcId ? [npcId] : Object.keys(types_1.NPC_NAMES);
                const playerChats = npcIds.map(id => ({
                    type: "player_npc", npc_id: id, npc_name: types_1.NPC_NAMES[id],
                    history: this.getPlayerChatHistory(id),
                }));
                const npcConvos = this.getNpcConversations().filter(c => !npcId || c.npc_a === npcId || c.npc_b === npcId);
                return { player_chats: playerChats, npc_conversations: npcConvos };
            }
            case "read_memory_graph": {
                try {
                    return memory_store_1.MemoryStore.read(input.npc_id);
                }
                catch {
                    return { error: "memory_graph_not_found", npc_id: input.npc_id };
                }
            }
            case "read_notebook":
                return { text: this.getNotebookText() };
            case "get_heat_score":
                return { heat_score: (0, heat_score_1.calculateHeatScore)(this.getNotebookText(), this.truth) };
            case "get_player_location":
                return { room: this.getPlayerRoom() ?? "unknown" };
            case "dispatch_spy":
                return this.spySystem.tryDispatch(input.npc_id);
            default:
                return { error: "unknown_tool", name };
        }
    }
}
exports.GmLoop = GmLoop;
//# sourceMappingURL=gm-loop.js.map
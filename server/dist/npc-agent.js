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
exports.NpcAgent = void 0;
const genai_1 = require("@google/genai");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const AGENTS_DIR = path.join(__dirname, "../data/agents");
class NpcAgent {
    constructor(npcId, name, archetype, backstory, apiKey) {
        this.npcId = npcId;
        this.name = name;
        this.archetype = archetype;
        this.backstory = backstory;
        this.history = [];
        this.isBusy = false;
        this.ai = new genai_1.GoogleGenAI({ apiKey });
        this.systemPrompt = this.buildSystemPrompt();
    }
    buildSystemPrompt() {
        return `You are ${this.name}, a character in a murder mystery game.
Archetype: ${this.archetype}
Backstory: ${this.backstory}

Stay in character at all times. Respond as ${this.name} would — consistent with your archetype and backstory. Keep responses to 2-4 sentences. Do not break character or acknowledge that you are an AI.`;
    }
    getChatHistory() {
        return [...this.history];
    }
    setMemoryContext(graph) {
        const facts = graph.facts
            .map(f => `- ${f.content}${f.secret ? " [you consider this sensitive]" : ""}`)
            .join("\n") || "(no known facts)";
        const rels = Object.entries(graph.relationships)
            .map(([id, rel]) => `- ${types_1.NPC_NAMES[id] ?? id}: trust ${Math.round(rel.trust * 100)}%`)
            .join("\n") || "(no established relationships)";
        this.systemPrompt = this.buildSystemPrompt()
            + `\n\nYour current knowledge:\n${facts}\n\nYour relationships:\n${rels}`;
    }
    async chat(playerMessage) {
        this.isBusy = true;
        try {
            this.history.push({ role: "user", text: playerMessage });
            const contents = this.history.map((m) => ({
                role: m.role,
                parts: [{ text: m.text }],
            }));
            console.log(`[NPC:${this.npcId}] >>> Gemini API request — model: gemini-2.5-flash, history turns: ${this.history.length}, message: "${playerMessage}"`);
            const response = await this.ai.models.generateContent({
                model: "gemini-2.5-flash",
                config: {
                    systemInstruction: this.systemPrompt,
                },
                contents,
            });
            const replyText = response.text ?? "...";
            console.log(`[NPC:${this.npcId}] <<< Gemini API response: "${replyText}"`);
            this.history.push({ role: "model", text: replyText });
            return replyText;
        }
        finally {
            this.isBusy = false;
        }
    }
    static fromAgentMd(npcId, name, apiKey) {
        const mdPath = path.join(AGENTS_DIR, `${npcId}.md`);
        const md = fs.readFileSync(mdPath, "utf8");
        const archetype = md.match(/\*\*Archetype:\*\* (.+)/)?.[1] ?? "Unknown";
        const backstory = md.match(/\*\*Backstory:\*\* (.+)/)?.[1] ?? "";
        return new NpcAgent(npcId, name, archetype, backstory, apiKey);
    }
}
exports.NpcAgent = NpcAgent;
//# sourceMappingURL=npc-agent.js.map
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGameSetupPrompt = buildGameSetupPrompt;
exports.parseGameSetupResponse = parseGameSetupResponse;
exports.runGameSetup = runGameSetup;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const DATA_DIR = path.join(__dirname, "../data");
const AGENTS_DIR = path.join(DATA_DIR, "agents");
function buildGameSetupPrompt() {
    const npcList = Object.entries(types_1.NPC_NAMES)
        .map(([id, name]) => `- ${name} (id: ${id})`)
        .join("\n");
    const archetypeList = types_1.ARCHETYPES.map((a) => `- ${a}`).join("\n");
    const weaponList = types_1.WEAPONS.map((w) => `- ${w}`).join("\n");
    const roomList = types_1.ROOMS.map((r) => `- ${r}`).join("\n");
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
function parseGameSetupResponse(raw) {
    // Claude sometimes wraps JSON in markdown code blocks — strip if present
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(cleaned);
    const murderer = parsed.murderer;
    const murdererArchetype = parsed.agents[murderer]?.archetype;
    if (murdererArchetype !== "The Liar") {
        throw new Error(`murderer NPC ${murderer} must have The Liar archetype, got: ${murdererArchetype}`);
    }
    return {
        truth: { murderer, weapon: parsed.weapon, room: parsed.room },
        agents: parsed.agents,
    };
}
function buildAgentMd(npcId, config) {
    const name = types_1.NPC_NAMES[npcId];
    const relLines = Object.entries(config.relationships)
        .map(([otherId, desc]) => `- ${types_1.NPC_NAMES[otherId] ?? otherId}: ${desc}`)
        .join("\n");
    let md = `# ${name}\n**Archetype:** ${config.archetype}\n**Backstory:** ${config.backstory}\n**Relationships:**\n${relLines}\n`;
    if (config.notes) {
        md += `**Notes:** ${config.notes}\n`;
    }
    return md;
}
async function clearAgentsDir() {
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
async function runGameSetup() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        throw new Error("ANTHROPIC_API_KEY not set");
    const client = new sdk_1.default({ apiKey });
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
    for (const [npcId, config] of Object.entries(result.agents)) {
        const filePath = path.join(AGENTS_DIR, `${npcId}.md`);
        fs.writeFileSync(filePath, buildAgentMd(npcId, config), "utf8");
        fs.chmodSync(filePath, 0o444);
    }
    // Write truth.json (server eyes only — never sent to Godot)
    if (!fs.existsSync(DATA_DIR))
        fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "truth.json"), JSON.stringify(result.truth, null, 2), "utf8");
    console.log(`[GM] GameSetup complete — murderer: ${result.truth.murderer}, weapon: ${result.truth.weapon}, room: ${result.truth.room}`);
}
//# sourceMappingURL=gm-agent.js.map
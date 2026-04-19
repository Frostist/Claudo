"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLearned = parseLearned;
exports.runNpcConversation = runNpcConversation;
const genai_1 = require("@google/genai");
const types_1 = require("./types");
const memory_store_1 = require("./memory-store");
function parseLearned(raw) {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter((f) => typeof f.content === "string" && typeof f.secret === "boolean");
    }
    catch {
        return [];
    }
}
function buildDialoguePrompt(npcAId, graphA, npcBId, graphB) {
    const nameA = types_1.NPC_NAMES[npcAId];
    const nameB = types_1.NPC_NAMES[npcBId];
    const factsA = memory_store_1.MemoryStore.getShareableFacts(graphA, npcBId)
        .map(f => `- ${f.content}`).join("\n") || "(nothing to share)";
    const factsB = memory_store_1.MemoryStore.getShareableFacts(graphB, npcAId)
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
function buildExtractionPrompt(learnerName, otherName, existingFacts, transcript) {
    const lines = transcript
        .map(t => `${types_1.NPC_NAMES[t.speaker] ?? t.speaker}: ${t.text}`)
        .join("\n");
    const existing = existingFacts.map(f => `- ${f.content}`).join("\n") || "(none)";
    return `After this conversation:\n\n${lines}\n\nFacts ${learnerName} already knew:\n${existing}\n\nWhat NEW factual information did ${learnerName} learn from ${otherName}? Exclude anything already known. Exclude opinions. Exclude things ${learnerName} said themselves.\n\nFor each new fact, if it contradicts an existing fact include "contradicts_existing" with the exact text of the contradicted fact. Omit the field if no contradiction.\n\nRespond ONLY with valid JSON array (empty array if nothing new learned):\n[{ "content": "...", "secret": true|false, "contradicts_existing": "<exact text or omit>" }]`;
}
function resolveContradictions(rawFacts, existingFacts, toldBy) {
    return rawFacts.map(f => {
        const result = { ...f, source: toldBy, told_by: toldBy };
        if (f.contradicts_existing) {
            const idx = existingFacts.findIndex(e => e.content === f.contradicts_existing);
            if (idx >= 0)
                result.contradicts = [idx];
            delete result.contradicts_existing;
        }
        return result;
    });
}
async function runNpcConversation(npcAId, npcBId, graphA, graphB, apiKey) {
    const ai = new genai_1.GoogleGenAI({ apiKey });
    // Step 1: Generate dialogue
    const dialogueResp = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: buildDialoguePrompt(npcAId, graphA, npcBId, graphB) }] }],
    });
    const rawDialogue = dialogueResp.text ?? "[]";
    let transcript = [];
    try {
        const cleaned = rawDialogue.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) {
            console.warn("[NpcConversation] Dialogue response was not an array — skipping");
            return { transcript: [], learnedA: [], learnedB: [] };
        }
        transcript = parsed;
    }
    catch {
        console.warn("[NpcConversation] Failed to parse dialogue JSON — skipping fact extraction");
        return { transcript: [], learnedA: [], learnedB: [] };
    }
    // Step 2: Asymmetric fact extraction — two parallel Gemini calls
    const [respA, respB] = await Promise.all([
        ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: "user", parts: [{ text: buildExtractionPrompt(types_1.NPC_NAMES[npcAId], types_1.NPC_NAMES[npcBId], graphA.facts, transcript) }] }],
        }),
        ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: "user", parts: [{ text: buildExtractionPrompt(types_1.NPC_NAMES[npcBId], types_1.NPC_NAMES[npcAId], graphB.facts, transcript) }] }],
        }),
    ]);
    const learnedA = resolveContradictions(parseLearned(respA.text ?? "[]"), graphA.facts, npcBId);
    const learnedB = resolveContradictions(parseLearned(respB.text ?? "[]"), graphB.facts, npcAId);
    // Step 3: Update memory graphs
    for (const fact of learnedA)
        memory_store_1.MemoryStore.appendFact(graphA, fact);
    for (const fact of learnedB)
        memory_store_1.MemoryStore.appendFact(graphB, fact);
    memory_store_1.MemoryStore.write(graphA);
    memory_store_1.MemoryStore.write(graphB);
    console.log(`[NpcConversation] ${npcAId} learned ${learnedA.length} facts, ${npcBId} learned ${learnedB.length} facts`);
    return { transcript, learnedA, learnedB };
}
//# sourceMappingURL=npc-conversation.js.map
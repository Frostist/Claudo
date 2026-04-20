"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpySystem = void 0;
const genai_1 = require("@google/genai");
const types_1 = require("./types");
const memory_store_1 = require("./memory-store");
class SpySystem {
    constructor(getMurderer, getEliminationCount, getSpyQueue, setSpyQueue, getNpcRoom, getPlayerRoom, isEliminated, recordElimination, onEliminate) {
        this.getMurderer = getMurderer;
        this.getEliminationCount = getEliminationCount;
        this.getSpyQueue = getSpyQueue;
        this.setSpyQueue = setSpyQueue;
        this.getNpcRoom = getNpcRoom;
        this.getPlayerRoom = getPlayerRoom;
        this.isEliminated = isEliminated;
        this.recordElimination = recordElimination;
        this.onEliminate = onEliminate;
    }
    tryDispatch(targetId) {
        if (targetId === this.getMurderer())
            return { error: "murderer_protected" };
        if (this.getEliminationCount() >= 2)
            return { error: "max_eliminations_reached" };
        if (this.getSpyQueue() !== null)
            return { error: "spy_queue_full", retry_after: "queue_empty" };
        if (this.isEliminated(targetId))
            return { error: "already_eliminated" };
        const playerRoom = this.getPlayerRoom();
        const npcRoom = this.getNpcRoom(targetId);
        if (playerRoom && npcRoom === playerRoom) {
            this.setSpyQueue(targetId);
            return { queued: true };
        }
        this.recordElimination(targetId);
        this.setSpyQueue(null);
        this.onEliminate(targetId);
        return { eliminated: true };
    }
    // Call with the player's PREVIOUS room. Executes queued elimination if the
    // player just left the queued target's room.
    checkPlayerMoved(previousRoom) {
        const queued = this.getSpyQueue();
        if (!queued)
            return;
        if (this.getNpcRoom(queued) !== previousRoom)
            return;
        this.recordElimination(queued);
        this.setSpyQueue(null);
        this.onEliminate(queued);
    }
    async getBodyClue(npcId, apiKey) {
        let graph;
        try {
            graph = memory_store_1.MemoryStore.read(npcId);
        }
        catch {
            return `You find nothing useful on ${types_1.NPC_NAMES[npcId]}'s body.`;
        }
        const nonSecretFacts = graph.facts.filter(f => !f.secret);
        if (nonSecretFacts.length === 0) {
            return `${types_1.NPC_NAMES[npcId]} took their secrets to the grave.`;
        }
        const factList = nonSecretFacts.map((f, i) => `${i + 1}. ${f.content}`).join("\n");
        const prompt = `These are facts known to ${types_1.NPC_NAMES[npcId]} (now deceased):\n${factList}\n\nWhich single fact is most relevant to a murder investigation? Reply with ONLY the exact text of that fact — nothing else.`;
        try {
            const ai = new genai_1.GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            });
            return response.text?.trim() ?? nonSecretFacts[0].content;
        }
        catch {
            return nonSecretFacts[0].content;
        }
    }
}
exports.SpySystem = SpySystem;
//# sourceMappingURL=spy-system.js.map
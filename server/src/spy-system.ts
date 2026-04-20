import { GoogleGenAI } from "@google/genai";
import { NpcId, NPC_NAMES } from "./types";
import { MemoryStore } from "./memory-store";

export type DispatchResult =
  | { eliminated: true }
  | { queued: true }
  | { error: "murderer_protected" }
  | { error: "max_eliminations_reached" }
  | { error: "spy_queue_full"; retry_after: "queue_empty" }
  | { error: "already_eliminated" };

export class SpySystem {
  constructor(
    private getMurderer: () => NpcId,
    private getEliminationCount: () => number,
    private getSpyQueue: () => NpcId | null,
    private setSpyQueue: (id: NpcId | null) => void,
    private getNpcRoom: (npcId: NpcId) => string,
    private getPlayerRoom: () => string | null,
    private isEliminated: (npcId: NpcId) => boolean,
    private recordElimination: (npcId: NpcId) => void,
    private onEliminate: (npcId: NpcId) => void
  ) {}

  tryDispatch(targetId: NpcId): DispatchResult {
    if (targetId === this.getMurderer()) return { error: "murderer_protected" };
    if (this.getEliminationCount() >= 2) return { error: "max_eliminations_reached" };
    if (this.getSpyQueue() !== null) return { error: "spy_queue_full", retry_after: "queue_empty" };
    if (this.isEliminated(targetId)) return { error: "already_eliminated" };

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
  checkPlayerMoved(previousRoom: string): void {
    const queued = this.getSpyQueue();
    if (!queued) return;
    if (this.getNpcRoom(queued) !== previousRoom) return;

    this.recordElimination(queued);
    this.setSpyQueue(null);
    this.onEliminate(queued);
  }

  async getBodyClue(npcId: NpcId, apiKey: string): Promise<string> {
    let graph;
    try {
      graph = MemoryStore.read(npcId);
    } catch {
      return `You find nothing useful on ${NPC_NAMES[npcId]}'s body.`;
    }

    const nonSecretFacts = graph.facts.filter(f => !f.secret);
    if (nonSecretFacts.length === 0) {
      return `${NPC_NAMES[npcId]} took their secrets to the grave.`;
    }

    const factList = nonSecretFacts.map((f, i) => `${i + 1}. ${f.content}`).join("\n");
    const prompt = `These are facts known to ${NPC_NAMES[npcId]} (now deceased):\n${factList}\n\nWhich single fact is most relevant to a murder investigation? Reply with ONLY the exact text of that fact — nothing else.`;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      return (response as { text: string }).text?.trim() ?? nonSecretFacts[0].content;
    } catch {
      return nonSecretFacts[0].content;
    }
  }
}

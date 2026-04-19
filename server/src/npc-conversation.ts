import { GoogleGenAI } from "@google/genai";
import { NpcId, NPC_NAMES, Fact, MemoryGraph } from "./types";
import { MemoryStore } from "./memory-store";

export interface ConversationTurn {
  speaker: NpcId;
  text: string;
}

export interface ConversationResult {
  transcript: ConversationTurn[];
  learnedA: Fact[];
  learnedB: Fact[];
}

export function parseLearned(raw: string): Fact[] {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is Fact =>
        typeof f.content === "string" && typeof f.secret === "boolean"
    );
  } catch {
    return [];
  }
}

function buildDialoguePrompt(
  npcAId: NpcId, graphA: MemoryGraph,
  npcBId: NpcId, graphB: MemoryGraph
): string {
  const nameA = NPC_NAMES[npcAId];
  const nameB = NPC_NAMES[npcBId];

  const factsA = MemoryStore.getShareableFacts(graphA, npcBId)
    .map(f => `- ${f.content}`).join("\n") || "(nothing to share)";
  const factsB = MemoryStore.getShareableFacts(graphB, npcAId)
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

function buildExtractionPrompt(
  learnerName: string,
  otherName: string,
  existingFacts: Fact[],
  transcript: ConversationTurn[]
): string {
  const lines = transcript
    .map(t => `${NPC_NAMES[t.speaker] ?? t.speaker}: ${t.text}`)
    .join("\n");
  const existing = existingFacts.map(f => `- ${f.content}`).join("\n") || "(none)";
  return `After this conversation:\n\n${lines}\n\nFacts ${learnerName} already knew:\n${existing}\n\nWhat NEW factual information did ${learnerName} learn from ${otherName}? Exclude anything already known. Exclude opinions. Exclude things ${learnerName} said themselves.\n\nFor each new fact, if it contradicts an existing fact include "contradicts_existing" with the exact text of the contradicted fact. Omit the field if no contradiction.\n\nRespond ONLY with valid JSON array (empty array if nothing new learned):\n[{ "content": "...", "secret": true|false, "contradicts_existing": "<exact text or omit>" }]`;
}

function resolveContradictions(
  rawFacts: Array<Fact & { contradicts_existing?: string }>,
  existingFacts: Fact[],
  toldBy: NpcId
): Fact[] {
  return rawFacts.map(f => {
    const result: Fact = { ...f, source: toldBy, told_by: toldBy };
    if (f.contradicts_existing) {
      const idx = existingFacts.findIndex(e => e.content === f.contradicts_existing);
      if (idx >= 0) result.contradicts = [idx];
      delete (result as Fact & { contradicts_existing?: string }).contradicts_existing;
    }
    return result;
  });
}

export async function runNpcConversation(
  npcAId: NpcId,
  npcBId: NpcId,
  graphA: MemoryGraph,
  graphB: MemoryGraph,
  apiKey: string
): Promise<ConversationResult> {
  const ai = new GoogleGenAI({ apiKey });

  // Step 1: Generate dialogue
  const dialogueResp = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: buildDialoguePrompt(npcAId, graphA, npcBId, graphB) }] }],
  });
  const rawDialogue = (dialogueResp as { text: string }).text ?? "[]";

  let transcript: ConversationTurn[] = [];
  try {
    const cleaned = rawDialogue.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      console.warn("[NpcConversation] Dialogue response was not an array — skipping");
      return { transcript: [], learnedA: [], learnedB: [] };
    }
    transcript = parsed;
  } catch {
    console.warn("[NpcConversation] Failed to parse dialogue JSON — skipping fact extraction");
    return { transcript: [], learnedA: [], learnedB: [] };
  }

  // Step 2: Asymmetric fact extraction — two parallel Gemini calls
  const [respA, respB] = await Promise.all([
    ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: buildExtractionPrompt(NPC_NAMES[npcAId], NPC_NAMES[npcBId], graphA.facts, transcript) }] }],
    }),
    ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: buildExtractionPrompt(NPC_NAMES[npcBId], NPC_NAMES[npcAId], graphB.facts, transcript) }] }],
    }),
  ]);

  const learnedA = resolveContradictions(
    parseLearned((respA as { text: string }).text ?? "[]") as Array<Fact & { contradicts_existing?: string }>,
    graphA.facts, npcBId
  );
  const learnedB = resolveContradictions(
    parseLearned((respB as { text: string }).text ?? "[]") as Array<Fact & { contradicts_existing?: string }>,
    graphB.facts, npcAId
  );

  // Step 3: Update memory graphs
  for (const fact of learnedA) MemoryStore.appendFact(graphA, fact);
  for (const fact of learnedB) MemoryStore.appendFact(graphB, fact);
  MemoryStore.write(graphA);
  MemoryStore.write(graphB);

  console.log(`[NpcConversation] ${npcAId} learned ${learnedA.length} facts, ${npcBId} learned ${learnedB.length} facts`);
  return { transcript, learnedA, learnedB };
}

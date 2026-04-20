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

const MODEL_NAME = "gemini-2.0-flash";
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const maybeErr = err as { status?: number; message?: string };
  const message = String(maybeErr.message ?? "");
  return maybeErr.status === 429 || /429|RESOURCE_EXHAUSTED|Too Many Requests/i.test(message);
}

async function generateTextWithRetry(
  ai: GoogleGenAI,
  prompt: string,
  label: string
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      return (response as { text: string }).text ?? "";
    } catch (err) {
      if (!isRateLimitError(err) || attempt === MAX_RETRIES) {
        throw err;
      }
      const delayMs = BASE_BACKOFF_MS * (2 ** attempt) + Math.floor(Math.random() * 200);
      console.warn(`[NpcConversation] ${label} rate-limited; retrying in ${delayMs}ms (${attempt + 1}/${MAX_RETRIES + 1})`);
      await sleep(delayMs);
    }
  }
  return "";
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

  try {
    const rawDialogue = await generateTextWithRetry(
      ai,
      buildDialoguePrompt(npcAId, graphA, npcBId, graphB),
      "dialogue"
    );

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

    const rawLearnedA = await generateTextWithRetry(
      ai,
      buildExtractionPrompt(NPC_NAMES[npcAId], NPC_NAMES[npcBId], graphA.facts, transcript),
      "extract-A"
    );
    const rawLearnedB = await generateTextWithRetry(
      ai,
      buildExtractionPrompt(NPC_NAMES[npcBId], NPC_NAMES[npcAId], graphB.facts, transcript),
      "extract-B"
    );

    const learnedA = resolveContradictions(
      parseLearned(rawLearnedA || "[]") as Array<Fact & { contradicts_existing?: string }>,
      graphA.facts, npcBId
    );
    const learnedB = resolveContradictions(
      parseLearned(rawLearnedB || "[]") as Array<Fact & { contradicts_existing?: string }>,
      graphB.facts, npcAId
    );

    for (const fact of learnedA) MemoryStore.appendFact(graphA, fact);
    for (const fact of learnedB) MemoryStore.appendFact(graphB, fact);
    MemoryStore.write(graphA);
    MemoryStore.write(graphB);

    console.log(`[NpcConversation] ${npcAId} learned ${learnedA.length} facts, ${npcBId} learned ${learnedB.length} facts`);
    return { transcript, learnedA, learnedB };
  } catch (err) {
    console.warn(`[NpcConversation] Skipping conversation ${npcAId}↔${npcBId} after AI failure.`, err);
    return { transcript: [], learnedA: [], learnedB: [] };
  }
}

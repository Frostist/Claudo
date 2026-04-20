import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { NpcId, NPC_NAMES, TruthFile } from "./types";
import { MemoryStore } from "./memory-store";
import { calculateHeatScore } from "./heat-score";
import { SpySystem } from "./spy-system";

export interface GmEvalSnapshot {
  currentHeatScore: number;
  previousHeatScore: number;
  newChatEntries: string[];
}

export function buildGmSystemPrompt(): string {
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

export function buildEvalSnapshot(snap: GmEvalSnapshot): string {
  const delta = snap.currentHeatScore - snap.previousHeatScore;
  const activity = snap.newChatEntries.length > 0
    ? `New chat activity since last evaluation:\n${snap.newChatEntries.join("\n")}`
    : "No new chat activity since last evaluation.";

  return `## Current evaluation

Heat score: ${snap.currentHeatScore}/99 (previous: ${snap.previousHeatScore}/99, delta: ${delta > 0 ? "+" : ""}${delta})

${activity}

Evaluate the situation and decide whether to dispatch the spy.`;
}

const GM_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "read_chat_logs",
    description: "Read player↔NPC and NPC↔NPC conversation transcripts. Pass npc_id to filter to one NPC, or omit for all.",
    parameters: { type: Type.OBJECT, properties: { npc_id: { type: Type.STRING, description: "Optional NPC ID to filter" } } },
  },
  {
    name: "read_memory_graph",
    description: "Read an NPC's full memory graph.",
    parameters: { type: Type.OBJECT, properties: { npc_id: { type: Type.STRING } }, required: ["npc_id"] },
  },
  {
    name: "read_notebook",
    description: "Read the player's current detective notebook text.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_heat_score",
    description: "Get the current heat score (0–99) based on the player's notebook.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_player_location",
    description: "Get the room the player is currently in.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "dispatch_spy",
    description: "Eliminate a target NPC. Returns eliminated, queued, or an error.",
    parameters: { type: Type.OBJECT, properties: { npc_id: { type: Type.STRING } }, required: ["npc_id"] },
  },
];

export class GmLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private previousHeatScore = 0;
  private lastConversationIndex = 0;
  private lastPlayerChatIndex = new Map<NpcId, number>();

  constructor(
    private apiKey: string,
    private truth: TruthFile,
    private spySystem: SpySystem,
    private getNotebookText: () => string,
    private getPlayerRoom: () => string | null,
    private getPlayerChatHistory: (npcId: NpcId) => Array<{ role: string; text: string }>,
    private getNpcConversations: () => Array<{ npc_a: NpcId; npc_b: NpcId; room: string; transcript: string }>,
    private intervalMs = 120_000
  ) {}

  start(): void {
    this.timer = setInterval(() => this.evaluate().catch(err =>
      console.error("[GmLoop] Evaluation error:", err)
    ), this.intervalMs);
    console.log("[GmLoop] Started — evaluating every", this.intervalMs / 1000, "seconds");
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async evaluate(): Promise<void> {
    const notebookText = this.getNotebookText();
    const currentHeatScore = calculateHeatScore(notebookText, this.truth);

    const allConversations = this.getNpcConversations();
    const newNpcEntries = allConversations.slice(this.lastConversationIndex).map(c =>
      `[NPC conversation in ${c.room}] ${NPC_NAMES[c.npc_a]} & ${NPC_NAMES[c.npc_b]}:\n${c.transcript}`
    );
    this.lastConversationIndex = allConversations.length;

    const newPlayerEntries: string[] = [];
    for (const [npcId, name] of Object.entries(NPC_NAMES) as [NpcId, string][]) {
      const history = this.getPlayerChatHistory(npcId);
      const newMessages = history.slice(this.lastPlayerChatIndex.get(npcId) ?? 0);
      for (const msg of newMessages) {
        const speaker = msg.role === "user" ? "Player" : name;
        newPlayerEntries.push(`[Chat with ${name}] ${speaker}: ${msg.text}`);
      }
      this.lastPlayerChatIndex.set(npcId, history.length);
    }

    const newEntries = [...newPlayerEntries, ...newNpcEntries];
    const snap: GmEvalSnapshot = { currentHeatScore, previousHeatScore: this.previousHeatScore, newChatEntries: newEntries };

    console.log(`[GmLoop] Evaluating — heat: ${currentHeatScore} (prev: ${this.previousHeatScore}, delta: ${currentHeatScore - this.previousHeatScore})`);
    this.previousHeatScore = currentHeatScore;

    await this.runToolLoop(snap);
  }

  private async runToolLoop(snap: GmEvalSnapshot): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    type Content = { role: string; parts: Record<string, unknown>[] };
    const contents: Content[] = [
      { role: "user", parts: [{ text: buildEvalSnapshot(snap) }] }
    ];

    for (let turn = 0; turn < 10; turn++) {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        config: {
          systemInstruction: buildGmSystemPrompt(),
          tools: [{ functionDeclarations: GM_FUNCTION_DECLARATIONS }],
        },
        contents,
      });

      console.log(`[GmLoop] Turn ${turn + 1}`);

      // Add model response to conversation history
      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent as unknown as Content);

      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) break;

      // Execute tools and send results back
      const funcResultParts = functionCalls.map(fc => {
        const name = fc.name ?? "unknown";
        const result = this.executeTool(name, fc.args as Record<string, string>);
        console.log(`[GmLoop] Tool: ${name}(${JSON.stringify(fc.args)}) → ${JSON.stringify(result)}`);
        return { functionResponse: { name, response: result } };
      });
      contents.push({ role: "user", parts: funcResultParts });
    }
  }

  private executeTool(name: string, input: Record<string, string>): unknown {
    switch (name) {
      case "read_chat_logs": {
        const npcId = input.npc_id as NpcId | undefined;
        const npcIds = npcId ? [npcId] : (Object.keys(NPC_NAMES) as NpcId[]);
        const playerChats = npcIds.map(id => ({
          type: "player_npc", npc_id: id, npc_name: NPC_NAMES[id],
          history: this.getPlayerChatHistory(id),
        }));
        const npcConvos = this.getNpcConversations().filter(c =>
          !npcId || c.npc_a === npcId || c.npc_b === npcId
        );
        return { player_chats: playerChats, npc_conversations: npcConvos };
      }
      case "read_memory_graph": {
        try { return MemoryStore.read(input.npc_id as NpcId); }
        catch { return { error: "memory_graph_not_found", npc_id: input.npc_id }; }
      }
      case "read_notebook":
        return { text: this.getNotebookText() };
      case "get_heat_score":
        return { heat_score: calculateHeatScore(this.getNotebookText(), this.truth) };
      case "get_player_location":
        return { room: this.getPlayerRoom() ?? "unknown" };
      case "dispatch_spy":
        return this.spySystem.tryDispatch(input.npc_id as NpcId);
      default:
        return { error: "unknown_tool", name };
    }
  }
}

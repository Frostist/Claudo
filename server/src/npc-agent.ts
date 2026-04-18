import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import { NpcId, ChatMessage } from "./types";

const AGENTS_DIR = path.join(__dirname, "../data/agents");

export class NpcAgent {
  private ai: GoogleGenAI;
  private history: ChatMessage[] = [];
  private systemPrompt: string;

  constructor(
    private npcId: NpcId,
    private name: string,
    private archetype: string,
    private backstory: string,
    apiKey: string
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    return `You are ${this.name}, a character in a murder mystery game.
Archetype: ${this.archetype}
Backstory: ${this.backstory}

Stay in character at all times. Respond as ${this.name} would — consistent with your archetype and backstory. Keep responses to 2-4 sentences. Do not break character or acknowledge that you are an AI.`;
  }

  getChatHistory(): ChatMessage[] {
    return [...this.history];
  }

  async chat(playerMessage: string): Promise<string> {
    this.history.push({ role: "user", text: playerMessage });

    const contents = this.history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const response = await this.ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: this.systemPrompt,
      },
      contents,
    });

    const replyText: string = (response as { text: string }).text ?? "...";
    this.history.push({ role: "model", text: replyText });

    return replyText;
  }

  static fromAgentMd(npcId: NpcId, name: string, apiKey: string): NpcAgent {
    const mdPath = path.join(AGENTS_DIR, `${npcId}.md`);
    const md = fs.readFileSync(mdPath, "utf8");

    const archetype = md.match(/\*\*Archetype:\*\* (.+)/)?.[1] ?? "Unknown";
    const backstory = md.match(/\*\*Backstory:\*\* (.+)/)?.[1] ?? "";

    return new NpcAgent(npcId, name, archetype, backstory, apiKey);
  }
}

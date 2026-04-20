import { describe, it, expect, vi, beforeEach } from "vitest";
import { NpcAgent } from "../src/npc-agent";

// Mock the Google GenAI SDK
vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    models = {
      generateContent: vi.fn().mockResolvedValue({ text: "I know nothing of that affair." }),
    };
    constructor(_opts: unknown) {}
  }
  return { GoogleGenAI: MockGoogleGenAI };
});

describe("NpcAgent", () => {
  let agent: NpcAgent;

  beforeEach(() => {
    agent = new NpcAgent("npc_scarlett", "Miss Scarlett", "The Liar", "A cunning socialite.", "fake-api-key");
  });

  it("starts with an empty chat history", () => {
    expect(agent.getChatHistory()).toEqual([]);
  });

  it("appends player message and model reply to history after chat()", async () => {
    await agent.chat("Where were you last night?");
    const history = agent.getChatHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", text: "Where were you last night?" });
    expect(history[1].role).toBe("model");
  });

  it("returns the model's reply text", async () => {
    const reply = await agent.chat("Did you do it?");
    expect(typeof reply).toBe("string");
    expect(reply.length).toBeGreaterThan(0);
  });
});

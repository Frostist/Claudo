import { describe, it, expect } from "vitest";
import { parseLearned } from "../src/npc-conversation";

describe("parseLearned", () => {
  it("parses a valid JSON array of learned facts", () => {
    const raw = JSON.stringify([
      { content: "Mrs Peacock was in the Hall at 9pm", secret: false },
      { content: "Col. Mustard has been acting strangely", secret: false },
    ]);
    const facts = parseLearned(raw);
    expect(facts).toHaveLength(2);
    expect(facts[0].content).toBe("Mrs Peacock was in the Hall at 9pm");
  });

  it("strips markdown code fences before parsing", () => {
    const raw = "```json\n[{\"content\":\"a fact\",\"secret\":false}]\n```";
    expect(parseLearned(raw)).toHaveLength(1);
  });

  it("returns empty array on malformed JSON", () => {
    expect(parseLearned("not json")).toEqual([]);
  });

  it("returns empty array when JSON is not an array", () => {
    expect(parseLearned(JSON.stringify({ content: "a fact" }))).toEqual([]);
  });

  it("filters out entries missing required fields", () => {
    const raw = JSON.stringify([
      { content: "valid", secret: false },
      { text: "missing content field" },
    ]);
    expect(parseLearned(raw)).toHaveLength(1);
  });
});

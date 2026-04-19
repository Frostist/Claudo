import { describe, it, expect, vi } from "vitest";
import { MemoryStore } from "../src/memory-store";
import { MemoryGraph, Fact } from "../src/types";

vi.mock("fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const baseGraph = (): MemoryGraph => ({
  npc_id: "npc_scarlett",
  archetype: "The Liar",
  lying: true,
  facts: [
    { content: "I was in the Library at 9pm", source: "self", secret: false },
    { content: "I committed the murder", source: "self", secret: true },
  ],
  relationships: {
    npc_mustard: { trust: 0.3, knows_secret: false },
    npc_green:   { trust: 0.8, knows_secret: false },
  },
});

describe("MemoryStore.appendFact", () => {
  it("appends a new fact to the graph", () => {
    const graph = baseGraph();
    const fact: Fact = {
      content: "Mustard was seen near the study",
      source: "npc_mustard",
      told_by: "npc_mustard",
      secret: false,
    };
    MemoryStore.appendFact(graph, fact);
    expect(graph.facts).toHaveLength(3);
    expect(graph.facts[2].content).toBe("Mustard was seen near the study");
  });

  it("preserves the contradicts field when present", () => {
    const graph = baseGraph();
    const fact: Fact = {
      content: "I was NOT in the Library",
      source: "npc_mustard",
      told_by: "npc_mustard",
      secret: false,
      contradicts: [0],
    };
    MemoryStore.appendFact(graph, fact);
    expect(graph.facts[2].contradicts).toEqual([0]);
  });
});

describe("MemoryStore.canShareSecret", () => {
  it("returns true when trust >= 0.7", () => {
    expect(MemoryStore.canShareSecret(baseGraph(), "npc_green")).toBe(true);
  });

  it("returns false when trust < 0.7", () => {
    expect(MemoryStore.canShareSecret(baseGraph(), "npc_mustard")).toBe(false);
  });

  it("returns false when NPC has no relationship entry", () => {
    expect(MemoryStore.canShareSecret(baseGraph(), "npc_white")).toBe(false);
  });
});

describe("MemoryStore.getShareableFacts", () => {
  it("always includes non-secret facts", () => {
    const shareable = MemoryStore.getShareableFacts(baseGraph(), "npc_mustard");
    expect(shareable.some(f => f.content === "I was in the Library at 9pm")).toBe(true);
  });

  it("excludes secret facts when trust < 0.7", () => {
    const shareable = MemoryStore.getShareableFacts(baseGraph(), "npc_mustard");
    expect(shareable.some(f => f.secret)).toBe(false);
  });

  it("includes secret facts when trust >= 0.7", () => {
    const shareable = MemoryStore.getShareableFacts(baseGraph(), "npc_green");
    expect(shareable.some(f => f.secret)).toBe(true);
  });
});

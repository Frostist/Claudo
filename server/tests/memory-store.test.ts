import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
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

describe("MemoryStore.write", () => {
  it("creates the memory dir when it does not exist, then writes the file", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    MemoryStore.write(baseGraph());
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("data/memory"),
      { recursive: true }
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("npc_scarlett.json"),
      expect.stringContaining('"npc_id"'),
      "utf8"
    );
  });
});

describe("MemoryStore.read", () => {
  it("returns a parsed MemoryGraph from disk", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(baseGraph()) as unknown as Buffer
    );
    const result = MemoryStore.read("npc_scarlett");
    expect(result.npc_id).toBe("npc_scarlett");
    expect(result.facts).toHaveLength(2);
  });
});

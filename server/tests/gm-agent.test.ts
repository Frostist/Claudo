import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildGameSetupPrompt, parseGameSetupResponse, buildMemoryGraph } from "../src/gm-agent";

describe("buildGameSetupPrompt", () => {
  it("includes all six NPC names", () => {
    const prompt = buildGameSetupPrompt();
    expect(prompt).toContain("Miss Scarlett");
    expect(prompt).toContain("Prof. Plum");
  });

  it("includes all six archetypes", () => {
    const prompt = buildGameSetupPrompt();
    expect(prompt).toContain("The Liar");
    expect(prompt).toContain("The Red Herring");
  });

  it("includes the murderer-must-be-Liar constraint", () => {
    const prompt = buildGameSetupPrompt();
    expect(prompt.toLowerCase()).toContain("liar");
    expect(prompt.toLowerCase()).toContain("murderer");
  });
});

describe("parseGameSetupResponse", () => {
  it("extracts truth and six agent configs from a valid response", () => {
    const sampleResponse = JSON.stringify({
      murderer: "npc_scarlett",
      weapon: "Knife",
      room: "Library",
      agents: {
        npc_scarlett: {
          archetype: "The Liar",
          backstory: "A cunning socialite...",
          relationships: { npc_mustard: { trust: 0.2, description: "distrusts" } },
          initial_facts: [{ content: "I killed Lord Blackwood in the Library", secret: true }],
          notes: "Committed the murder with the Knife in the Library."
        },
        npc_mustard:  { archetype: "The Gossip",      backstory: "...", relationships: {}, initial_facts: [], notes: "" },
        npc_white:    { archetype: "The Recluse",     backstory: "...", relationships: {}, initial_facts: [], notes: "" },
        npc_green:    { archetype: "The Witness",     backstory: "...", relationships: {}, initial_facts: [], notes: "" },
        npc_peacock:  { archetype: "The Protector",   backstory: "...", relationships: {}, initial_facts: [], notes: "" },
        npc_plum:     { archetype: "The Red Herring", backstory: "...", relationships: {}, initial_facts: [], notes: "" },
      }
    });

    const result = parseGameSetupResponse(sampleResponse);
    expect(result.truth.murderer).toBe("npc_scarlett");
    expect(result.truth.weapon).toBe("Knife");
    expect(result.truth.room).toBe("Library");
    expect(Object.keys(result.agents)).toHaveLength(6);
    expect(result.agents["npc_scarlett"].archetype).toBe("The Liar");
  });

  it("throws if murderer NPC is not assigned The Liar", () => {
    const bad = JSON.stringify({
      murderer: "npc_mustard",
      weapon: "Rope",
      room: "Kitchen",
      agents: {
        npc_scarlett: { archetype: "The Liar",       backstory: "", relationships: {}, initial_facts: [], notes: "" },
        npc_mustard:  { archetype: "The Gossip",     backstory: "", relationships: {}, initial_facts: [], notes: "" },
        npc_white:    { archetype: "The Recluse",    backstory: "", relationships: {}, initial_facts: [], notes: "" },
        npc_green:    { archetype: "The Witness",    backstory: "", relationships: {}, initial_facts: [], notes: "" },
        npc_peacock:  { archetype: "The Protector",  backstory: "", relationships: {}, initial_facts: [], notes: "" },
        npc_plum:     { archetype: "The Red Herring",backstory: "", relationships: {}, initial_facts: [], notes: "" },
      }
    });
    expect(() => parseGameSetupResponse(bad)).toThrow("murderer");
  });
});

describe("buildMemoryGraph", () => {
  const murderer = "npc_scarlett" as const;
  const config = {
    archetype: "The Liar",
    backstory: "A cunning socialite.",
    relationships: {
      npc_mustard: { trust: 0.3, description: "distrusts" },
      npc_green:   { trust: 0.8, description: "respects" },
    },
    initial_facts: [
      { content: "I was in the Library at 9pm", secret: false },
      { content: "I killed Lord Blackwood", secret: true },
    ],
    notes: "Did it in the Library with the Knife.",
  };

  it("sets lying=true for the murderer NPC", () => {
    const graph = buildMemoryGraph("npc_scarlett", config, murderer);
    expect(graph.lying).toBe(true);
  });

  it("sets lying=false for a non-murderer NPC", () => {
    const graph = buildMemoryGraph("npc_mustard", config, murderer);
    expect(graph.lying).toBe(false);
  });

  it("maps all initial_facts with source: 'self'", () => {
    const graph = buildMemoryGraph("npc_scarlett", config, murderer);
    expect(graph.facts).toHaveLength(2);
    expect(graph.facts.every(f => f.source === "self")).toBe(true);
    expect(graph.facts[1].secret).toBe(true);
  });

  it("converts relationships with trust and knows_secret: false", () => {
    const graph = buildMemoryGraph("npc_scarlett", config, murderer);
    expect(graph.relationships["npc_mustard"]).toEqual({ trust: 0.3, knows_secret: false });
    expect(graph.relationships["npc_green"]).toEqual({ trust: 0.8, knows_secret: false });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildGameSetupPrompt, parseGameSetupResponse } from "../src/gm-agent";

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

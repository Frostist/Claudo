import { describe, it, expect } from "vitest";
import { levenshtein, calculateHeatScore } from "../src/heat-score";
import { TruthFile } from "../src/types";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("mustard", "mustard")).toBe(0);
  });

  it("returns 1 for a single deletion", () => {
    expect(levenshtein("knife", "knif")).toBe(1);
  });

  it("returns 1 for a single insertion", () => {
    expect(levenshtein("library", "libary")).toBe(1);
  });

  it("returns 2 for two operations", () => {
    expect(levenshtein("mustard", "mystart")).toBe(2);
  });

  it("returns correct distance for unrelated short words", () => {
    expect(levenshtein("cat", "dog")).toBe(3);
  });
});

const truth: TruthFile = {
  murderer: "npc_mustard",
  weapon:   "Lead Pipe",
  room:     "Library",
};

describe("calculateHeatScore", () => {
  it("returns 0 for empty notebook", () => {
    expect(calculateHeatScore("", truth)).toBe(0);
  });

  it("returns 33 when murderer display name word is present", () => {
    // "mustard" matches "Mustard" from "Col. Mustard"
    expect(calculateHeatScore("I think it was mustard", truth)).toBe(33);
  });

  it("returns 33 for a near-match within distance 2", () => {
    // "mustart" has distance 1 from "mustard" (single substitution), within threshold of 2
    expect(calculateHeatScore("I think mustart did it", truth)).toBe(33);
  });

  it("returns 33 when weapon word matches", () => {
    expect(calculateHeatScore("the lead pipe was involved", truth)).toBe(33);
  });

  it("returns 33 when room word matches", () => {
    expect(calculateHeatScore("happened in the library", truth)).toBe(33);
  });

  it("returns 66 for two correct answers", () => {
    expect(calculateHeatScore("mustard in the library", truth)).toBe(66);
  });

  it("returns 99 for all three correct answers", () => {
    expect(calculateHeatScore("mustard with the lead pipe in the library", truth)).toBe(99);
  });

  it("does not double-count if the same answer word appears twice", () => {
    expect(calculateHeatScore("mustard mustard mustard", truth)).toBe(33);
  });
});

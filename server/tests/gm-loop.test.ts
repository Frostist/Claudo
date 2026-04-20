import { describe, it, expect } from "vitest";
import { buildGmSystemPrompt, buildEvalSnapshot, GmEvalSnapshot } from "../src/gm-loop";

describe("buildGmSystemPrompt", () => {
  it("mentions the 2-minute interval", () => {
    expect(buildGmSystemPrompt()).toContain("2 minutes");
  });

  it("instructs to prefer inaction", () => {
    expect(buildGmSystemPrompt().toLowerCase()).toContain("inaction");
  });

  it("mentions heat score delta threshold of 33", () => {
    expect(buildGmSystemPrompt()).toContain("33");
  });
});

describe("buildEvalSnapshot", () => {
  it("includes current and previous heat score", () => {
    const snap: GmEvalSnapshot = { currentHeatScore: 66, previousHeatScore: 33, newChatEntries: [] };
    const msg = buildEvalSnapshot(snap);
    expect(msg).toContain("66");
    expect(msg).toContain("33");
  });

  it("includes new chat entries when present", () => {
    const snap: GmEvalSnapshot = { currentHeatScore: 33, previousHeatScore: 0, newChatEntries: ["Player: Was it Mustard?"] };
    expect(buildEvalSnapshot(snap)).toContain("Was it Mustard?");
  });

  it("notes no new activity when chat entries are empty", () => {
    const snap: GmEvalSnapshot = { currentHeatScore: 0, previousHeatScore: 0, newChatEntries: [] };
    expect(buildEvalSnapshot(snap).toLowerCase()).toContain("no new");
  });
});

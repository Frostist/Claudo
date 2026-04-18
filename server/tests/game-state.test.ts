import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../src/game-state";

describe("GameState", () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState();
  });

  it("starts with empty chat histories for all six NPCs", () => {
    expect(state.getChatHistory("npc_scarlett")).toEqual([]);
    expect(state.getChatHistory("npc_plum")).toEqual([]);
  });

  it("appends messages to the correct NPC history", () => {
    state.appendMessage("npc_scarlett", { role: "user", text: "hello" });
    state.appendMessage("npc_scarlett", { role: "model", text: "good day" });
    expect(state.getChatHistory("npc_scarlett")).toHaveLength(2);
    expect(state.getChatHistory("npc_mustard")).toHaveLength(0);
  });

  it("tracks active NPC id", () => {
    expect(state.activeNpcId).toBeNull();
    state.activeNpcId = "npc_green";
    expect(state.activeNpcId).toBe("npc_green");
  });

  it("serialises to snapshot shape", () => {
    state.appendMessage("npc_white", { role: "user", text: "hi" });
    state.activeNpcId = "npc_white";
    const snap = state.toSnapshot();
    expect(snap.active_npc_id).toBe("npc_white");
    expect(snap.npc_chat_histories["npc_white"]).toHaveLength(1);
  });
});

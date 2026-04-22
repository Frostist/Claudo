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

  it("initialises NPC rooms from NPC_STARTING_ROOMS", () => {
    expect(state.getNpcRoom("npc_scarlett")).toBe("Kitchen");
    expect(state.getNpcRoom("npc_plum")).toBe("Library");
  });

  it("updates NPC room on setNpcRoom", () => {
    state.setNpcRoom("npc_mustard", "Hall");
    expect(state.getNpcRoom("npc_mustard")).toBe("Hall");
  });

  it("getNpcsInRoom returns only NPCs in that room", () => {
    state.setNpcRoom("npc_scarlett", "Hall");
    state.setNpcRoom("npc_mustard", "Hall");
    const inHall = state.getNpcsInRoom("Hall");
    expect(inHall).toContain("npc_scarlett");
    expect(inHall).toContain("npc_mustard");
    expect(inHall).not.toContain("npc_white");
  });

  it("records NPC↔NPC conversation transcript", () => {
    state.recordNpcConversation("npc_scarlett", "npc_mustard", "Hall", "Scarlett: Hello.\nMustard: Indeed.");
    expect(state.getNpcConversations()).toHaveLength(1);
    expect(state.getNpcConversations()[0].transcript).toContain("Scarlett");
  });

  it("starts with empty notebookText", () => {
    expect(state.notebookText).toBe("");
  });

  it("updates notebookText", () => {
    state.notebookText = "I suspect Mustard";
    expect(state.notebookText).toBe("I suspect Mustard");
  });

  it("starts with zero eliminations and empty eliminated set", () => {
    expect(state.eliminationCount).toBe(0);
    expect(state.isEliminated("npc_scarlett")).toBe(false);
  });

  it("records an elimination", () => {
    state.recordElimination("npc_scarlett");
    expect(state.isEliminated("npc_scarlett")).toBe(true);
    expect(state.eliminationCount).toBe(1);
  });

  it("spy queue starts empty", () => {
    expect(state.spyQueue).toBeNull();
  });

  it("sets and clears spy queue", () => {
    state.spyQueue = "npc_mustard";
    expect(state.spyQueue).toBe("npc_mustard");
    state.spyQueue = null;
    expect(state.spyQueue).toBeNull();
  });

  it("starts with no accusation submitted", () => {
    expect(state.accusationSubmitted).toBe(false);
    expect(state.accusationResult).toBeNull();
  });

  it("tracks accusation result after submission", () => {
    state.accusationSubmitted = true;
    state.accusationResult = {
      correct: false,
      murderer: "npc_mustard",
      weapon: "Knife",
      room: "Study",
    };
    expect(state.accusationSubmitted).toBe(true);
    expect(state.accusationResult).not.toBeNull();
    expect(state.accusationResult!.correct).toBe(false);
    expect(state.accusationResult!.murderer).toBe("npc_mustard");
  });
});

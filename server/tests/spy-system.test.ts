import { describe, it, expect, vi } from "vitest";
import { SpySystem } from "../src/spy-system";
import type { NpcId } from "../src/types";

function makeSpySystem(overrides: {
  murderer?: NpcId;
  eliminationCount?: number;
  spyQueue?: NpcId | null;
  playerRoom?: string;
  npcRoom?: string;
} = {}) {
  const state = {
    murderer: overrides.murderer ?? "npc_scarlett" as NpcId,
    eliminationCount: overrides.eliminationCount ?? 0,
    spyQueue: overrides.spyQueue ?? null,
    playerRoom: overrides.playerRoom ?? "Hall",
    eliminated: new Set<NpcId>(),
  };

  const onEliminate = vi.fn();

  const system = new SpySystem(
    () => state.murderer,
    () => state.eliminationCount,
    () => state.spyQueue,
    (id) => { state.spyQueue = id; },
    (_id) => state.playerRoom,  // getNpcRoom — all NPCs in player's room by default
    () => state.playerRoom,     // getPlayerRoom
    (id) => state.eliminated.has(id),
    (id) => { state.eliminated.add(id); state.eliminationCount++; },
    onEliminate
  );

  return { system, state, onEliminate };
}

describe("SpySystem.tryDispatch", () => {
  it("returns error when target is the murderer", () => {
    const { system } = makeSpySystem({ murderer: "npc_scarlett" });
    const result = system.tryDispatch("npc_scarlett");
    expect(result).toMatchObject({ error: "murderer_protected" });
  });

  it("returns error when max eliminations reached", () => {
    const { system } = makeSpySystem({ eliminationCount: 2 });
    const result = system.tryDispatch("npc_mustard");
    expect(result).toMatchObject({ error: "max_eliminations_reached" });
  });

  it("returns error when queue is full", () => {
    const { system } = makeSpySystem({ spyQueue: "npc_green" });
    const result = system.tryDispatch("npc_mustard");
    expect(result).toMatchObject({ error: "spy_queue_full", retry_after: "queue_empty" });
  });

  it("queues elimination when target is in player's room", () => {
    const { system, onEliminate } = makeSpySystem({ playerRoom: "Hall" });
    // makeSpySystem wires getNpcRoom to return playerRoom, so target is in player's room
    const result = system.tryDispatch("npc_mustard");
    expect(onEliminate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ queued: true });
  });

  it("eliminates immediately when target is NOT in player's room", () => {
    const onEliminate = vi.fn();
    const state = {
      murderer: "npc_scarlett" as NpcId,
      eliminationCount: 0,
      spyQueue: null as NpcId | null,
      playerRoom: "Hall",
      eliminated: new Set<NpcId>(),
    };
    const system = new SpySystem(
      () => state.murderer,
      () => state.eliminationCount,
      () => state.spyQueue,
      (id) => { state.spyQueue = id; },
      (_id) => "Library",  // npc_mustard is in Library, not Hall
      () => state.playerRoom,
      (id) => state.eliminated.has(id),
      (id) => { state.eliminated.add(id); state.eliminationCount++; },
      onEliminate
    );
    const result = system.tryDispatch("npc_mustard");
    expect(onEliminate).toHaveBeenCalledWith("npc_mustard");
    expect(result).toMatchObject({ eliminated: true });
  });
});

describe("SpySystem.checkPlayerMoved", () => {
  it("executes queued elimination when player leaves target's room", () => {
    const onEliminate = vi.fn();
    const state = {
      murderer: "npc_scarlett" as NpcId,
      eliminationCount: 0,
      spyQueue: "npc_mustard" as NpcId,
      eliminated: new Set<NpcId>(),
    };
    const system = new SpySystem(
      () => state.murderer,
      () => state.eliminationCount,
      () => state.spyQueue,
      (id) => { state.spyQueue = id; },
      (_id) => "Library",  // npc_mustard is in Library
      () => "Hall",        // player is now in Hall (just moved)
      (id) => state.eliminated.has(id),
      (id) => { state.eliminated.add(id); state.eliminationCount++; },
      onEliminate
    );
    // Player just moved FROM Library (where npc_mustard is)
    system.checkPlayerMoved("Library");
    expect(onEliminate).toHaveBeenCalledWith("npc_mustard");
  });

  it("does NOT execute when player moves from a different room", () => {
    const { system, onEliminate } = makeSpySystem({ spyQueue: "npc_mustard", playerRoom: "Hall" });
    // Player was in Kitchen (not where npc_mustard is)
    system.checkPlayerMoved("Kitchen");
    expect(onEliminate).not.toHaveBeenCalled();
  });

  it("does nothing when queue is empty", () => {
    const { system, onEliminate } = makeSpySystem();
    system.checkPlayerMoved("Hall");
    expect(onEliminate).not.toHaveBeenCalled();
  });
});

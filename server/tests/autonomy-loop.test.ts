import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getAdjacentRooms, pickMoveTarget, AutonomyLoop } from "../src/autonomy-loop";
import type { NpcId } from "../src/types";

describe("getAdjacentRooms", () => {
  it("returns correct adjacent rooms for Hall (centre)", () => {
    const adj = getAdjacentRooms("Hall");
    expect(adj).toContain("Ballroom");
    expect(adj).toContain("Billiard Room");
    expect(adj).toContain("Library");
    expect(adj).toContain("Lounge");
    expect(adj).not.toContain("Hall");
    expect(adj).not.toContain("Kitchen");
  });

  it("returns correct adjacent rooms for Kitchen (corner — only 2)", () => {
    const adj = getAdjacentRooms("Kitchen");
    expect(adj).toEqual(expect.arrayContaining(["Ballroom", "Billiard Room"]));
    expect(adj).toHaveLength(2);
  });

  it("returns empty array for an unknown room", () => {
    expect(getAdjacentRooms("Dungeon")).toEqual([]);
  });
});

describe("pickMoveTarget", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns an adjacent room when Math.random < 0.4", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.39)  // move check passes
      .mockReturnValueOnce(0.0);  // pick first adjacent room
    const target = pickMoveTarget("Kitchen");
    expect(["Ballroom", "Billiard Room"]).toContain(target);
  });

  it("returns null when Math.random >= 0.4 (NPC idles)", () => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.5);
    expect(pickMoveTarget("Kitchen")).toBeNull();
  });
});

describe("AutonomyLoop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("calls onNpcMoved when a tick fires and NPC is not busy", async () => {
    const rooms = new Map<NpcId, string>([["npc_scarlett", "Kitchen"]]);
    const moved = vi.fn().mockResolvedValue(undefined);

    // Force move probability to always move, pick first adjacent room
    vi.spyOn(Math, "random").mockReturnValue(0.0);

    const loop = new AutonomyLoop(
      (id) => rooms.get(id) ?? "Hall",
      (id, room) => rooms.set(id, room),
      moved,
      () => false
    );
    loop.start(["npc_scarlett"]);

    // Advance past the minimum tick interval (30s)
    await vi.advanceTimersByTimeAsync(31_000);

    expect(moved).toHaveBeenCalledOnce();
    expect(moved.mock.calls[0][0]).toBe("npc_scarlett");
  });

  it("skips movement and reschedules when NPC is busy", async () => {
    const moved = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(Math, "random").mockReturnValue(0.0);

    const loop = new AutonomyLoop(
      () => "Kitchen",
      () => {},
      moved,
      () => true  // always busy
    );
    loop.start(["npc_scarlett"]);
    await vi.advanceTimersByTimeAsync(31_000);

    expect(moved).not.toHaveBeenCalled();
  });
});

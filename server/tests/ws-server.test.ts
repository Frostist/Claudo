import { describe, it, expect, vi } from "vitest";
import { parseMessage, buildMessage } from "../src/ws-server";

describe("parseMessage", () => {
  it("parses a valid JSON envelope", () => {
    const raw = JSON.stringify({ event: "player_chat", data: { npc_id: "npc_scarlett", message: "hi" } });
    const result = parseMessage(raw);
    expect(result?.event).toBe("player_chat");
    expect(result?.data.npc_id).toBe("npc_scarlett");
  });

  it("returns null for malformed JSON", () => {
    expect(parseMessage("not json")).toBeNull();
  });

  it("returns null if event field is missing", () => {
    expect(parseMessage(JSON.stringify({ data: {} }))).toBeNull();
  });
});

describe("buildMessage", () => {
  it("serialises event + data to JSON string", () => {
    const msg = buildMessage("npc_reply", { npc_id: "npc_mustard", text: "hello" });
    const parsed = JSON.parse(msg);
    expect(parsed.event).toBe("npc_reply");
    expect(parsed.data.text).toBe("hello");
  });
});

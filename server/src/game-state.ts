import { NpcId, ChatMessage } from "./types";

const ALL_NPC_IDS: NpcId[] = [
  "npc_scarlett",
  "npc_mustard",
  "npc_white",
  "npc_green",
  "npc_peacock",
  "npc_plum",
];

interface StateSnapshot {
  npc_chat_histories: Record<string, ChatMessage[]>;
  active_npc_id: NpcId | null;
}

export class GameState {
  private histories: Map<NpcId, ChatMessage[]> = new Map(
    ALL_NPC_IDS.map((id) => [id, []])
  );

  activeNpcId: NpcId | null = null;
  playerRoom: string | null = null;

  getChatHistory(npcId: NpcId): ChatMessage[] {
    return this.histories.get(npcId) ?? [];
  }

  appendMessage(npcId: NpcId, message: ChatMessage): void {
    const history = this.histories.get(npcId);
    if (history) history.push(message);
  }

  toSnapshot(): StateSnapshot {
    const npc_chat_histories: Record<string, ChatMessage[]> = {};
    for (const [id, history] of this.histories) {
      npc_chat_histories[id] = [...history];
    }
    return { npc_chat_histories, active_npc_id: this.activeNpcId };
  }
}

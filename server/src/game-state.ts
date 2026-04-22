import { NpcId, ChatMessage, NPC_STARTING_ROOMS, Weapon, Room } from "./types";

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
  npc_rooms: Record<string, string>;
}

export class GameState {
  private histories: Map<NpcId, ChatMessage[]> = new Map(
    ALL_NPC_IDS.map((id) => [id, []])
  );

  private npcRooms: Map<NpcId, string> = new Map(
    Object.entries(NPC_STARTING_ROOMS) as [NpcId, string][]
  );

  private npcConversations: Array<{ npc_a: NpcId; npc_b: NpcId; room: string; transcript: string }> = [];

  activeNpcId: NpcId | null = null;
  playerRoom: string | null = null;

  notebookText: string = "";
  eliminationCount: number = 0;
  spyQueue: NpcId | null = null;
  private eliminatedNpcs: Set<NpcId> = new Set();

  accusationSubmitted: boolean = false;
  accusationResult: { correct: boolean; murderer: NpcId; weapon: Weapon; room: Room } | null = null;

  getChatHistory(npcId: NpcId): ChatMessage[] {
    return this.histories.get(npcId) ?? [];
  }

  appendMessage(npcId: NpcId, message: ChatMessage): void {
    const history = this.histories.get(npcId);
    if (history) history.push(message);
  }

  getNpcRoom(npcId: NpcId): string {
    return this.npcRooms.get(npcId) ?? "Hall";
  }

  setNpcRoom(npcId: NpcId, room: string): void {
    this.npcRooms.set(npcId, room);
  }

  getNpcsInRoom(room: string): NpcId[] {
    return (Array.from(this.npcRooms.entries()) as [NpcId, string][])
      .filter(([, r]) => r === room)
      .map(([id]) => id);
  }

  recordNpcConversation(npcA: NpcId, npcB: NpcId, room: string, transcript: string): void {
    this.npcConversations.push({ npc_a: npcA, npc_b: npcB, room, transcript });
  }

  getNpcConversations() {
    return [...this.npcConversations];
  }

  isEliminated(npcId: NpcId): boolean {
    return this.eliminatedNpcs.has(npcId);
  }

  recordElimination(npcId: NpcId): void {
    this.eliminatedNpcs.add(npcId);
    this.eliminationCount++;
  }

  getEliminatedNpcs(): NpcId[] {
    return Array.from(this.eliminatedNpcs);
  }

  toSnapshot(): StateSnapshot {
    const npc_chat_histories: Record<string, ChatMessage[]> = {};
    for (const [id, history] of this.histories) {
      npc_chat_histories[id] = [...history];
    }
    const npc_rooms: Record<string, string> = {};
    for (const [id, room] of this.npcRooms) {
      npc_rooms[id] = room;
    }
    return { npc_chat_histories, active_npc_id: this.activeNpcId, npc_rooms };
  }
}

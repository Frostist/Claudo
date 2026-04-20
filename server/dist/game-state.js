"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = void 0;
const types_1 = require("./types");
const ALL_NPC_IDS = [
    "npc_scarlett",
    "npc_mustard",
    "npc_white",
    "npc_green",
    "npc_peacock",
    "npc_plum",
];
class GameState {
    constructor() {
        this.histories = new Map(ALL_NPC_IDS.map((id) => [id, []]));
        this.npcRooms = new Map(Object.entries(types_1.NPC_STARTING_ROOMS));
        this.npcConversations = [];
        this.activeNpcId = null;
        this.playerRoom = null;
        this.notebookText = "";
        this.eliminationCount = 0;
        this.spyQueue = null;
        this.eliminatedNpcs = new Set();
    }
    getChatHistory(npcId) {
        return this.histories.get(npcId) ?? [];
    }
    appendMessage(npcId, message) {
        const history = this.histories.get(npcId);
        if (history)
            history.push(message);
    }
    getNpcRoom(npcId) {
        return this.npcRooms.get(npcId) ?? "Hall";
    }
    setNpcRoom(npcId, room) {
        this.npcRooms.set(npcId, room);
    }
    getNpcsInRoom(room) {
        return Array.from(this.npcRooms.entries())
            .filter(([, r]) => r === room)
            .map(([id]) => id);
    }
    recordNpcConversation(npcA, npcB, room, transcript) {
        this.npcConversations.push({ npc_a: npcA, npc_b: npcB, room, transcript });
    }
    getNpcConversations() {
        return [...this.npcConversations];
    }
    isEliminated(npcId) {
        return this.eliminatedNpcs.has(npcId);
    }
    recordElimination(npcId) {
        this.eliminatedNpcs.add(npcId);
        this.eliminationCount++;
    }
    getEliminatedNpcs() {
        return Array.from(this.eliminatedNpcs);
    }
    toSnapshot() {
        const npc_chat_histories = {};
        for (const [id, history] of this.histories) {
            npc_chat_histories[id] = [...history];
        }
        const npc_rooms = {};
        for (const [id, room] of this.npcRooms) {
            npc_rooms[id] = room;
        }
        return { npc_chat_histories, active_npc_id: this.activeNpcId, npc_rooms };
    }
}
exports.GameState = GameState;
//# sourceMappingURL=game-state.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = void 0;
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
        this.activeNpcId = null;
        this.playerRoom = null;
    }
    getChatHistory(npcId) {
        return this.histories.get(npcId) ?? [];
    }
    appendMessage(npcId, message) {
        const history = this.histories.get(npcId);
        if (history)
            history.push(message);
    }
    toSnapshot() {
        const npc_chat_histories = {};
        for (const [id, history] of this.histories) {
            npc_chat_histories[id] = [...history];
        }
        return { npc_chat_histories, active_npc_id: this.activeNpcId };
    }
}
exports.GameState = GameState;
//# sourceMappingURL=game-state.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomyLoop = void 0;
exports.getAdjacentRooms = getAdjacentRooms;
exports.pickMoveTarget = pickMoveTarget;
const types_1 = require("./types");
const MIN_TICK_MS = 30000;
const MAX_TICK_MS = 60000;
const MOVE_PROBABILITY = 0.4;
function getAdjacentRooms(room) {
    return types_1.ROOM_ADJACENCY[room] ?? [];
}
function pickMoveTarget(currentRoom) {
    if (Math.random() >= MOVE_PROBABILITY)
        return null;
    const adjacent = getAdjacentRooms(currentRoom);
    if (adjacent.length === 0)
        return null;
    return adjacent[Math.floor(Math.random() * adjacent.length)];
}
class AutonomyLoop {
    constructor(getNpcRoom, setNpcRoom, onNpcMoved, isNpcBusy) {
        this.getNpcRoom = getNpcRoom;
        this.setNpcRoom = setNpcRoom;
        this.onNpcMoved = onNpcMoved;
        this.isNpcBusy = isNpcBusy;
        this.timers = new Map();
    }
    start(npcIds) {
        for (const npcId of npcIds) {
            this.scheduleTick(npcId);
        }
    }
    stop() {
        for (const timer of this.timers.values())
            clearTimeout(timer);
        this.timers.clear();
    }
    scheduleTick(npcId) {
        const delay = MIN_TICK_MS + Math.random() * (MAX_TICK_MS - MIN_TICK_MS);
        this.timers.set(npcId, setTimeout(() => this.tick(npcId), delay));
    }
    async tick(npcId) {
        if (!this.isNpcBusy(npcId)) {
            const target = pickMoveTarget(this.getNpcRoom(npcId));
            if (target) {
                this.setNpcRoom(npcId, target);
                await this.onNpcMoved(npcId, target);
            }
        }
        this.scheduleTick(npcId);
    }
}
exports.AutonomyLoop = AutonomyLoop;
//# sourceMappingURL=autonomy-loop.js.map
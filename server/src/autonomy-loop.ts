import { NpcId, ROOM_ADJACENCY } from "./types";

const MIN_TICK_MS = 30_000;
const MAX_TICK_MS = 60_000;
const MOVE_PROBABILITY = 0.4;

export type OnNpcMoved = (npcId: NpcId, newRoom: string) => Promise<void>;

export function getAdjacentRooms(room: string): string[] {
  return ROOM_ADJACENCY[room] ?? [];
}

export function pickMoveTarget(currentRoom: string): string | null {
  if (Math.random() >= MOVE_PROBABILITY) return null;
  const adjacent = getAdjacentRooms(currentRoom);
  if (adjacent.length === 0) return null;
  return adjacent[Math.floor(Math.random() * adjacent.length)];
}

export class AutonomyLoop {
  private timers = new Map<NpcId, ReturnType<typeof setTimeout>>();

  constructor(
    private getNpcRoom: (npcId: NpcId) => string,
    private setNpcRoom: (npcId: NpcId, room: string) => void,
    private onNpcMoved: OnNpcMoved,
    private isNpcBusy: (npcId: NpcId) => boolean
  ) {}

  start(npcIds: NpcId[]): void {
    for (const npcId of npcIds) {
      this.scheduleTick(npcId);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private scheduleTick(npcId: NpcId): void {
    const delay = MIN_TICK_MS + Math.random() * (MAX_TICK_MS - MIN_TICK_MS);
    this.timers.set(npcId, setTimeout(() => this.tick(npcId), delay));
  }

  private async tick(npcId: NpcId): Promise<void> {
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

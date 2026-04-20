export type NpcId =
  | "npc_scarlett"
  | "npc_mustard"
  | "npc_white"
  | "npc_green"
  | "npc_peacock"
  | "npc_plum";

export const NPC_NAMES: Record<NpcId, string> = {
  npc_scarlett: "Miss Scarlett",
  npc_mustard: "Col. Mustard",
  npc_white: "Mrs. White",
  npc_green: "Rev. Green",
  npc_peacock: "Mrs. Peacock",
  npc_plum: "Prof. Plum",
};

export const WEAPONS = [
  "Candlestick",
  "Knife",
  "Lead Pipe",
  "Revolver",
  "Rope",
  "Wrench",
] as const;

export const ROOMS = [
  "Kitchen",
  "Ballroom",
  "Conservatory",
  "Billiard Room",
  "Hall",
  "Library",
  "Study",
  "Lounge",
  "Dining Room",
] as const;

export const ARCHETYPES = [
  "The Liar",
  "The Gossip",
  "The Recluse",
  "The Witness",
  "The Protector",
  "The Red Herring",
] as const;

export type Archetype = (typeof ARCHETYPES)[number];
export type Weapon = (typeof WEAPONS)[number];
export type Room = (typeof ROOMS)[number];

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface WsEnvelope {
  event: string;
  data: Record<string, unknown>;
}

export interface TruthFile {
  murderer: NpcId;
  weapon: Weapon;
  room: Room;
}

export interface Fact {
  content: string;
  source: "self" | NpcId;
  told_by?: NpcId;       // only present when source is another NPC
  secret: boolean;
  contradicts?: number[]; // indices into facts[] of contradicted entries
}

export interface NpcRelationship {
  trust: number;          // 0–1. ≥ 0.7 = will share secrets
  knows_secret: boolean;
}

export interface MemoryGraph {
  npc_id: NpcId;
  archetype: string;
  lying: boolean;         // true only for the murderer NPC
  facts: Fact[];
  relationships: Partial<Record<NpcId, NpcRelationship>>;
}

export const ROOM_ADJACENCY: Record<string, string[]> = {
  "Kitchen":       ["Ballroom", "Billiard Room"],
  "Ballroom":      ["Kitchen", "Conservatory", "Hall"],
  "Conservatory":  ["Ballroom", "Library"],
  "Billiard Room": ["Kitchen", "Hall", "Study"],
  "Hall":          ["Ballroom", "Billiard Room", "Library", "Lounge"],
  "Library":       ["Conservatory", "Hall", "Dining Room"],
  "Study":         ["Billiard Room", "Lounge"],
  "Lounge":        ["Hall", "Study", "Dining Room"],
  "Dining Room":   ["Library", "Lounge"],
};

export const NPC_STARTING_ROOMS: Record<NpcId, string> = {
  npc_scarlett: "Kitchen",
  npc_mustard:  "Ballroom",
  npc_white:    "Conservatory",
  npc_green:    "Billiard Room",
  npc_peacock:  "Hall",
  npc_plum:     "Library",
};

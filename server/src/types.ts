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

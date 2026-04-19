"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NPC_STARTING_ROOMS = exports.ROOM_ADJACENCY = exports.ARCHETYPES = exports.ROOMS = exports.WEAPONS = exports.NPC_NAMES = void 0;
exports.NPC_NAMES = {
    npc_scarlett: "Miss Scarlett",
    npc_mustard: "Col. Mustard",
    npc_white: "Mrs. White",
    npc_green: "Rev. Green",
    npc_peacock: "Mrs. Peacock",
    npc_plum: "Prof. Plum",
};
exports.WEAPONS = [
    "Candlestick",
    "Knife",
    "Lead Pipe",
    "Revolver",
    "Rope",
    "Wrench",
];
exports.ROOMS = [
    "Kitchen",
    "Ballroom",
    "Conservatory",
    "Billiard Room",
    "Hall",
    "Library",
    "Study",
    "Lounge",
    "Dining Room",
];
exports.ARCHETYPES = [
    "The Liar",
    "The Gossip",
    "The Recluse",
    "The Witness",
    "The Protector",
    "The Red Herring",
];
exports.ROOM_ADJACENCY = {
    "Kitchen": ["Ballroom", "Billiard Room"],
    "Ballroom": ["Kitchen", "Conservatory", "Hall"],
    "Conservatory": ["Ballroom", "Library"],
    "Billiard Room": ["Kitchen", "Hall", "Study"],
    "Hall": ["Ballroom", "Billiard Room", "Library", "Lounge"],
    "Library": ["Conservatory", "Hall", "Dining Room"],
    "Study": ["Billiard Room", "Lounge"],
    "Lounge": ["Hall", "Study", "Dining Room"],
    "Dining Room": ["Library", "Lounge"],
};
exports.NPC_STARTING_ROOMS = {
    npc_scarlett: "Kitchen",
    npc_mustard: "Ballroom",
    npc_white: "Conservatory",
    npc_green: "Billiard Room",
    npc_peacock: "Hall",
    npc_plum: "Library",
};
//# sourceMappingURL=types.js.map
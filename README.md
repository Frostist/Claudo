# Claudo

A 2D top-down murder mystery game built in Godot 4.6. 

TL;DR Someone was murdered in the mansion — your job is to find out who did it, with what weapon, and in which room.

## How it works

Every new game the **Games Master** randomly assigns a murderer, weapon, and crime scene from the six suspects, six weapons, and nine rooms. It then generates a unique personality and private memory for each **AIPC** (NPC but AI 🤖) — some witnessed something, some heard a rumour, some are just suspicious by nature.

The six suspects are autonomous AI agents powered by **Google Gemini**. They walk between rooms, gossip with each other, and remember what they've been told. If NPC A tells NPC B a secret, NPC B knows it came from NPC A and may or may not pass it on depending on how much they trust them.

The Games Master watches your progress in the background. If you're getting too close to the truth too quickly, it may send a spy to silence one of the suspects — so don't drag your feet.

## How to play

- **Walk** around the mansion with WASD or arrow keys
- **Talk** to a suspect by clicking the speech bubble above their head — then type freely to interrogate them
- **Take notes** in your detective notebook (`N` to open/close) — three pages: Suspects, Weapons, Rooms
- **Solve the case** by heading to the Accusation Room and filing your answer — one shot, no take-backs

## Tech stack

- **Godot 4.6** — game engine, rendering, input
- **Node.js / TypeScript** — AI agent server (runs locally alongside the game)
- **Google Gemini Flash** — powers the NPC suspects
- **Claude Opus 4.7** — the Games Master

## Running

Open the project in Godot 4.6 and press **F5**.

> The Node.js server is not yet implemented (Phase 1). NPC chat is coming soon.

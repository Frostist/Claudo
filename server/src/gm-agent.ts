import * as fs from "fs";
import * as path from "path";
import { NpcId, NPC_NAMES, WEAPONS, ROOMS, ARCHETYPES, TruthFile, MemoryGraph, Fact, NpcRelationship } from "./types";
import { MemoryStore, MEMORY_DIR } from "./memory-store";

const DATA_DIR = path.join(__dirname, "../data");
const AGENTS_DIR = path.join(DATA_DIR, "agents");

export interface AgentConfig {
  archetype: string;
  backstory: string;
  relationships: Record<string, { trust: number; description: string }>;
  initial_facts: Array<{ content: string; secret: boolean }>;
  notes: string;
}

interface GameSetupResult {
  truth: TruthFile;
  agents: Record<NpcId, AgentConfig>;
}

function buildFallbackGameSetup(): GameSetupResult {
  const murderer: NpcId = "npc_scarlett";
  const truth: TruthFile = {
    murderer,
    weapon: "Knife",
    room: "Library",
  };

  const archetypesByNpc: Record<NpcId, string> = {
    npc_scarlett: "The Liar",
    npc_mustard: "The Gossip",
    npc_white: "The Recluse",
    npc_green: "The Witness",
    npc_peacock: "The Protector",
    npc_plum: "The Red Herring",
  };

  const relationshipHintByNpc: Record<NpcId, string> = {
    npc_scarlett: "keeps them at arm's length",
    npc_mustard: "likes trading rumors with them",
    npc_white: "prefers to avoid them",
    npc_green: "watches them carefully",
    npc_peacock: "tries to keep peace with them",
    npc_plum: "finds them suspiciously interesting",
  };

  const trustByNpc: Record<NpcId, number> = {
    npc_scarlett: 0.35,
    npc_mustard: 0.6,
    npc_white: 0.4,
    npc_green: 0.55,
    npc_peacock: 0.7,
    npc_plum: 0.5,
  };

  const backstoryByNpc: Record<NpcId, string> = {
    npc_scarlett: "A polished socialite who manages every room through charm, timing, and carefully planted half-truths.",
    npc_mustard: "A boastful former officer who knows everybody's business and cannot resist sharing what he hears.",
    npc_white: "A withdrawn housekeeper with sharp eyes and a habit of listening from hallways no one notices.",
    npc_green: "A measured cleric who observes quietly and remembers details others dismiss.",
    npc_peacock: "A well-connected host determined to keep the manor's reputation intact at any cost.",
    npc_plum: "An absent-minded professor whose odd timing and strange experiments make him look guilty even when he is not.",
  };

  const agents = {} as Record<NpcId, AgentConfig>;
  const npcIds = Object.keys(NPC_NAMES) as NpcId[];

  for (const npcId of npcIds) {
    const relationships: Record<string, { trust: number; description: string }> = {};
    for (const otherId of npcIds) {
      if (otherId === npcId) continue;
      relationships[otherId] = {
        trust: trustByNpc[npcId],
        description: relationshipHintByNpc[npcId],
      };
    }

    const initialFacts: Array<{ content: string; secret: boolean }> = [
      { content: `${NPC_NAMES[npcId]} was near the ${truth.room} shortly before the alarm.`, secret: false },
      { content: `${NPC_NAMES[npcId]} believes one guest is hiding evidence.`, secret: false },
    ];

    if (npcId === murderer) {
      initialFacts.push({
        content: `I used the ${truth.weapon} in the ${truth.room}, and I must keep that hidden.`,
        secret: true,
      });
    }

    if (npcId === "npc_green") {
      initialFacts.push({ content: `I saw someone leave the ${truth.room} in a hurry.`, secret: false });
    }

    agents[npcId] = {
      archetype: archetypesByNpc[npcId],
      backstory: backstoryByNpc[npcId],
      relationships,
      initial_facts: initialFacts,
      notes: npcId === murderer
        ? `Committed the murder with the ${truth.weapon} in the ${truth.room}.`
        : "",
    };
  }

  return { truth, agents };
}

export function buildGameSetupPrompt(): string {
  const npcList = Object.entries(NPC_NAMES)
    .map(([id, name]) => `- ${name} (id: ${id})`)
    .join("\n");

  const archetypeList = ARCHETYPES.map((a) => `- ${a}`).join("\n");
  const weaponList = WEAPONS.map((w) => `- ${w}`).join("\n");
  const roomList = ROOMS.map((r) => `- ${r}`).join("\n");

  return `You are setting up a murder mystery game called Claudo.

## NPCs (names are fixed — do not change them):
${npcList}

## Archetypes (assign exactly one per NPC, each used exactly once):
${archetypeList}

## CRITICAL CONSTRAINT: The murderer NPC MUST be assigned "The Liar" archetype. No other NPC may have The Liar archetype.

## Weapons (pick one as the murder weapon):
${weaponList}

## Rooms (pick one as the murder room):
${roomList}

Your task:
1. Choose one NPC as the murderer (they must receive The Liar archetype).
2. Choose a weapon and room for the crime.
3. Assign the remaining five archetypes to the other five NPCs (each archetype used exactly once).
4. Write a one-paragraph backstory for each NPC consistent with their archetype and the murder scenario.
5. Write brief relationship notes for each NPC describing how they view each other NPC (one clause per pair).
6. For the murderer only, add a "notes" field with the crime details (weapon, room, motive). For all others, "notes" is empty string.

Respond with ONLY valid JSON in this exact shape:
{
  "murderer": "<npc_id>",
  "weapon": "<weapon>",
  "room": "<room>",
  "agents": {
    "<npc_id>": {
      "archetype": "<archetype>",
      "backstory": "<one paragraph>",
      "relationships": {
        "<other_npc_id>": { "trust": <0.0–1.0>, "description": "<brief clause>" },
        ...one entry per other NPC...
      },
      "initial_facts": [
        { "content": "<fact this NPC knows at game start>", "secret": <true|false> },
        ...2–4 facts per NPC...
      ],
      "notes": "<crime details for murderer only, empty string for others>"
    },
    ...all six NPCs...
  }
}

Trust score guidance:
- 0.0–0.3 hostile or distrustful
- 0.4–0.6 neutral, polite but guarded
- 0.7–1.0 friendly or allied (will share secrets)

Initial facts guidance:
- 2–4 facts per NPC; make them relevant to their archetype and the murder scenario
- Murderer: include one secret=true fact about the crime (weapon + room)
- The Witness: include one non-secret fact about something they saw
- Mark secret=true only for facts the NPC would resist sharing`;
}

export function parseGameSetupResponse(raw: string): GameSetupResult {
  // Claude sometimes wraps JSON in markdown code blocks — strip if present
  const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  const parsed = JSON.parse(cleaned);

  const murderer = parsed.murderer as NpcId;
  const murdererArchetype = parsed.agents[murderer]?.archetype;
  if (murdererArchetype !== "The Liar") {
    throw new Error(`murderer NPC ${murderer} must have The Liar archetype, got: ${murdererArchetype}`);
  }

  return {
    truth: { murderer, weapon: parsed.weapon, room: parsed.room },
    agents: parsed.agents as Record<NpcId, AgentConfig>,
  };
}

function buildAgentMd(npcId: NpcId, config: AgentConfig): string {
  const name = NPC_NAMES[npcId];
  const relLines = Object.entries(config.relationships)
    .map(([otherId, rel]) => `- ${NPC_NAMES[otherId as NpcId] ?? otherId}: ${rel.description}`)
    .join("\n");

  let md = `# ${name}\n**Archetype:** ${config.archetype}\n**Backstory:** ${config.backstory}\n**Relationships:**\n${relLines}\n`;
  if (config.notes) {
    md += `**Notes:** ${config.notes}\n`;
  }
  return md;
}

async function clearAgentsDir(): Promise<void> {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    return;
  }
  const files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const filePath = path.join(AGENTS_DIR, file);
    fs.chmodSync(filePath, 0o644);
    fs.unlinkSync(filePath);
  }
}

async function clearMemoryDir(): Promise<void> {
  if (!fs.existsSync(MEMORY_DIR)) return;
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith(".json"));
  for (const file of files) fs.unlinkSync(path.join(MEMORY_DIR, file));
}

export function buildMemoryGraph(npcId: NpcId, config: AgentConfig, murderer: NpcId): MemoryGraph {
  const facts: Fact[] = config.initial_facts.map(f => ({
    content: f.content,
    source: "self" as const,
    secret: f.secret,
  }));

  const relationships: Partial<Record<NpcId, NpcRelationship>> = {};
  for (const [otherId, rel] of Object.entries(config.relationships)) {
    relationships[otherId as NpcId] = { trust: rel.trust, knows_secret: false };
  }

  return {
    npc_id: npcId,
    archetype: config.archetype,
    lying: npcId === murderer,
    facts,
    relationships,
  };
}

export async function runGameSetup(): Promise<void> {
  console.log("[GM] Running GameSetup…");
  const result = buildFallbackGameSetup();
  console.log("[GM] Using deterministic local setup (Anthropic removed).");

  await clearAgentsDir();
  await clearMemoryDir();

  // Write agent.md files
  for (const [npcId, config] of Object.entries(result.agents) as [NpcId, AgentConfig][]) {
    const filePath = path.join(AGENTS_DIR, `${npcId}.md`);
    fs.writeFileSync(filePath, buildAgentMd(npcId, config), "utf8");
    fs.chmodSync(filePath, 0o444);
  }

  // Write truth.json (server eyes only — never sent to Godot)
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "truth.json"), JSON.stringify(result.truth, null, 2), "utf8");

  // Seed memory graphs
  for (const [npcId, config] of Object.entries(result.agents) as [NpcId, AgentConfig][]) {
    MemoryStore.write(buildMemoryGraph(npcId, config, result.truth.murderer));
  }

  console.log(`[GM] GameSetup complete — murderer: ${result.truth.murderer}, weapon: ${result.truth.weapon}, room: ${result.truth.room}`);
}

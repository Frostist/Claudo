import * as fs from "fs";
import * as path from "path";
import { NpcId, MemoryGraph, Fact } from "./types";

export const MEMORY_DIR = path.join(__dirname, "../data/memory");

export class MemoryStore {
  static read(npcId: NpcId): MemoryGraph {
    const raw = fs.readFileSync(path.join(MEMORY_DIR, `${npcId}.json`), "utf8");
    return JSON.parse(raw) as MemoryGraph;
  }

  static write(graph: MemoryGraph): void {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
    fs.writeFileSync(
      path.join(MEMORY_DIR, `${graph.npc_id}.json`),
      JSON.stringify(graph, null, 2),
      "utf8"
    );
  }

  static appendFact(graph: MemoryGraph, fact: Fact): void {
    graph.facts.push(fact);
  }

  static canShareSecret(graph: MemoryGraph, withNpc: NpcId): boolean {
    const rel = graph.relationships[withNpc];
    return rel !== undefined && rel.trust >= 0.7;
  }

  static getShareableFacts(graph: MemoryGraph, withNpc: NpcId): Fact[] {
    const canShare = MemoryStore.canShareSecret(graph, withNpc);
    return graph.facts.filter(f => !f.secret || canShare);
  }
}

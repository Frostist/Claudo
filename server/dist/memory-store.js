"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryStore = exports.MEMORY_DIR = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.MEMORY_DIR = path.join(__dirname, "../data/memory");
class MemoryStore {
    static read(npcId) {
        const raw = fs.readFileSync(path.join(exports.MEMORY_DIR, `${npcId}.json`), "utf8");
        return JSON.parse(raw);
    }
    static write(graph) {
        if (!fs.existsSync(exports.MEMORY_DIR)) {
            fs.mkdirSync(exports.MEMORY_DIR, { recursive: true });
        }
        fs.writeFileSync(path.join(exports.MEMORY_DIR, `${graph.npc_id}.json`), JSON.stringify(graph, null, 2), "utf8");
    }
    static appendFact(graph, fact) {
        graph.facts.push(fact);
    }
    static canShareSecret(graph, withNpc) {
        const rel = graph.relationships[withNpc];
        return rel !== undefined && rel.trust >= 0.7;
    }
    static getShareableFacts(graph, withNpc) {
        const canShare = MemoryStore.canShareSecret(graph, withNpc);
        return graph.facts.filter(f => !f.secret || canShare);
    }
}
exports.MemoryStore = MemoryStore;
//# sourceMappingURL=memory-store.js.map
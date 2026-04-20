import { TruthFile, NPC_NAMES } from "./types";

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
}

function answerMatched(notebookTokens: string[], answerTokens: string[]): boolean {
  return answerTokens.some(answerWord =>
    notebookTokens.some(notebookWord => levenshtein(notebookWord, answerWord) <= 2)
  );
}

export function calculateHeatScore(notebookText: string, truth: TruthFile): number {
  const notebookTokens = tokenize(notebookText);
  if (notebookTokens.length === 0) return 0;

  const murdererName = NPC_NAMES[truth.murderer];  // use display name, not npc_id
  const answers = [
    tokenize(murdererName),
    tokenize(truth.weapon),
    tokenize(truth.room),
  ];

  return answers.filter(answerTokens => answerMatched(notebookTokens, answerTokens)).length * 33;
}

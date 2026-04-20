"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.levenshtein = levenshtein;
exports.calculateHeatScore = calculateHeatScore;
const types_1 = require("./types");
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}
function tokenize(text) {
    return text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
}
function answerMatched(notebookTokens, answerTokens) {
    return answerTokens.some(answerWord => notebookTokens.some(notebookWord => levenshtein(notebookWord, answerWord) <= 2));
}
function calculateHeatScore(notebookText, truth) {
    const notebookTokens = tokenize(notebookText);
    if (notebookTokens.length === 0)
        return 0;
    const murdererName = types_1.NPC_NAMES[truth.murderer]; // use display name, not npc_id
    const answers = [
        tokenize(murdererName),
        tokenize(truth.weapon),
        tokenize(truth.room),
    ];
    return answers.filter(answerTokens => answerMatched(notebookTokens, answerTokens)).length * 33;
}
//# sourceMappingURL=heat-score.js.map
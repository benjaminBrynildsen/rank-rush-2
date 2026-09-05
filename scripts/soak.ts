/**
 * Play a lot of runs with the deterministic house player and print what the
 * board does. Not a test: a way to look at the shape of the first 30 moves.
 *
 *   npx vite-node scripts/soak.ts [runs]
 */
import { createGame, totalScore } from '../src/engine.js';
import { legalMoves } from '../src/moves.js';
import type { GameState, Square } from '../src/types.js';
import { move } from '../src/engine.js';

function step(state: GameState): boolean {
  const pieces = [...state.pieces].filter((p) => p.side === 'player').sort((a, b) => a.id - b.id);
  let chosen: { id: number; to: Square } | null = null;

  for (const piece of pieces) {
    for (const to of legalMoves(state, piece)) {
      const takes = state.pieces.some((p) => p.side === 'enemy' && p.file === to.file && p.rank === to.rank);
      if (takes && (piece.type === 'king' || piece.type === 'knight')) {
        chosen = { id: piece.id, to };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) {
    const king = pieces.find((p) => p.type === 'king');
    if (king) {
      const forward = legalMoves(state, king).filter((m) => m.rank > king.rank);
      forward.sort((a, b) => b.rank - a.rank || a.file - b.file);
      if (forward[0]) chosen = { id: king.id, to: forward[0] };
    }
  }
  if (!chosen) {
    for (const piece of pieces) {
      const options = legalMoves(state, piece);
      if (options[0]) { chosen = { id: piece.id, to: options[0] }; break; }
    }
  }
  if (!chosen) return false;
  return move(state, { pieceId: chosen.id, to: chosen.to, generationId: state.generationId }).ok;
}

const runs = Number(process.argv[2] ?? 200);
const reasons = new Map<string, number>();
let ranks = 0;
let captures = 0;
let score = 0;
let plies = 0;

for (let seed = 1; seed <= runs; seed++) {
  const state = createGame(seed);
  let n = 0;
  while (!state.gameOverReason && n < 2000 && step(state)) n++;
  reasons.set(state.gameOverReason ?? 'still going', (reasons.get(state.gameOverReason ?? 'still going') ?? 0) + 1);
  ranks += state.bestKingRank;
  captures += state.captures;
  score += totalScore(state);
  plies += n;
}

console.log(`${runs} runs`);
console.log(`  mean king rank : ${(ranks / runs).toFixed(1)}`);
console.log(`  mean captures  : ${(captures / runs).toFixed(1)}`);
console.log(`  mean score     : ${(score / runs).toFixed(0)}`);
console.log(`  mean plies     : ${(plies / runs).toFixed(1)}`);
for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason.padEnd(18)} ${count}`);
}

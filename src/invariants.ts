import { FILES, MAX_FRIENDLY, RANK_MAX } from './constants.js';
import { windowTop } from './board.js';
import { PAWN_PERIOD, WAKE_PERIOD } from './constants.js';
import type { GameState } from './types.js';

/**
 * Section 11. Asserted after every ply. If one fails we do not try to patch the
 * board mid-frame: the caller rolls the ply back or ends the run.
 */
export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];
  const friendly = state.pieces.filter((p) => p.side === 'player');
  const kings = friendly.filter((p) => p.type === 'king');

  if (!state.gameOverReason && kings.length !== 1) {
    problems.push(`expected exactly one player king, found ${kings.length}`);
  }
  if (kings.length > 1) problems.push('a second player king exists');

  const seen = new Set<string>();
  for (const piece of state.pieces) {
    const key = `${piece.file},${piece.rank}`;
    if (seen.has(key)) problems.push(`two pieces share ${key}`);
    seen.add(key);

    if (piece.file < 0 || piece.file >= FILES) {
      problems.push(`piece ${piece.id} is off the files at ${piece.file}`);
    }
    if (!Number.isInteger(piece.rank) || piece.rank < 0 || piece.rank > RANK_MAX) {
      problems.push(`piece ${piece.id} has rank ${piece.rank}`);
    }
    if (!state.gameOverReason && piece.rank <= state.wakeRank) {
      problems.push(`piece ${piece.id} is standing in the wake`);
    }
    if (piece.rank > windowTop(state)) {
      problems.push(`piece ${piece.id} is past the window top`);
    }
  }

  if (friendly.length > MAX_FRIENDLY) {
    problems.push(`friendly count ${friendly.length} over the cap`);
  }
  if (state.pendingPromotion !== null) {
    problems.push('a promotion is still pending');
  }
  if (state.movesUntilPawn < 0 || state.movesUntilPawn >= PAWN_PERIOD) {
    problems.push(`movesUntilPawn out of range: ${state.movesUntilPawn}`);
  }
  if (state.movesUntilWake < 0 || state.movesUntilWake >= WAKE_PERIOD) {
    problems.push(`movesUntilWake out of range: ${state.movesUntilWake}`);
  }
  if (state.wakeRank < 0 || state.wakeRank > RANK_MAX) {
    problems.push(`wakeRank out of range: ${state.wakeRank}`);
  }

  return problems;
}

export class InvariantError extends Error {
  constructor(public readonly problems: string[]) {
    super(`invariant failure: ${problems.join('; ')}`);
    this.name = 'InvariantError';
  }
}

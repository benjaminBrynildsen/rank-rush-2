import { MAX_ACTIVE_AI } from './constants.js';
import { inWindow, isActive, pieceAt, playerKing, typeOrder, vanguardRank } from './board.js';
import { pseudoMoves } from './moves.js';
import { AI_VALUE } from './score.js';
import type { GameState, Piece, Square } from './types.js';

export interface EnemyPhaseResult {
  kingCaptured: boolean;
  moved: number;
}

function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank));
}

/**
 * Dumb-smart, sequential, deterministic (section 7).
 *
 * One action per piece per phase, front rank first then file a-h. Take the
 * richest reachable capture, else step one toward the king, else stand still.
 * No simultaneous resolution (G31), no shuffling (G32), no random tie-breaks (G39).
 */
export function enemyPhase(state: GameState): EnemyPhaseResult {
  const actors = state.pieces
    .filter((p) => p.side === 'enemy' && isActive(state, p) && !p.stunned)
    .sort((a, b) => a.rank - b.rank || a.file - b.file || typeOrder(a.type) - typeOrder(b.type))
    // Extra units are frozen decorations until a slot frees (G33).
    .slice(0, MAX_ACTIVE_AI);

  let moved = 0;

  for (const piece of actors) {
    // It may have been taken by nothing, but stay defensive: a dead id does nothing.
    if (!state.pieces.includes(piece)) continue;

    const choice = chooseMove(state, piece);
    if (!choice) continue;

    const target = pieceAt(state, choice.file, choice.rank);
    if (target) {
      state.pieces = state.pieces.filter((p) => p.id !== target.id);
    }
    piece.file = choice.file;
    piece.rank = choice.rank;
    piece.neverMoved = false;
    moved++;

    if (target && target.side === 'player' && target.type === 'king') {
      // Stop the phase the instant the crown falls. Nothing after this matters.
      clearStun(state);
      return { kingCaptured: true, moved };
    }
  }

  clearStun(state);
  return { kingCaptured: false, moved };
}

function clearStun(state: GameState): void {
  for (const piece of state.pieces) {
    if (piece.side === 'enemy') piece.stunned = false;
  }
}

function chooseMove(state: GameState, piece: Piece): Square | null {
  const options = pseudoMoves(state, piece).filter((sq) => inWindow(state, sq.rank));
  if (options.length === 0) return null;

  const captures = options
    .map((sq) => ({ sq, victim: pieceAt(state, sq.file, sq.rank) }))
    .filter((o) => o.victim && o.victim.side === 'player');

  if (captures.length > 0) {
    captures.sort(
      (a, b) =>
        AI_VALUE[b.victim!.type] - AI_VALUE[a.victim!.type] ||
        a.sq.file - b.sq.file ||
        a.sq.rank - b.sq.rank,
    );
    return captures[0]!.sq;
  }

  const king = playerKing(state);
  const goal: Square = king
    ? { file: king.file, rank: king.rank }
    : { file: piece.file, rank: vanguardRank(state) };

  const here = chebyshev({ file: piece.file, rank: piece.rank }, goal);

  const advances = options
    // No enemy may retreat more than one rank in a phase.
    .filter((sq) => sq.rank <= piece.rank + 1)
    .filter((sq) => !pieceAt(state, sq.file, sq.rank))
    // Only move if it actually closes the gap, or the piece paces forever (G32).
    .filter((sq) => chebyshev(sq, goal) < here)
    .sort(
      (a, b) =>
        chebyshev(a, goal) - chebyshev(b, goal) || a.rank - b.rank || a.file - b.file,
    );

  return advances[0] ?? null;
}

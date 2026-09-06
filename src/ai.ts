import { AI_CANDIDATES, ENEMY_MOVES_PER_TURN } from './constants.js';
import { inWindow, isActive, pieceAt, playerKing, typeOrder, vanguardRank } from './board.js';
import { pseudoMoves } from './moves.js';
import { AI_VALUE } from './score.js';
import type { GameState, Piece, Square } from './types.js';

export interface EnemyMove {
  pieceId: number;
  type: Piece['type'];
  from: Square;
  to: Square;
  /** What it took, if anything. Always a player piece. */
  captured?: Piece['type'];
}

export interface EnemyPhaseResult {
  kingCaptured: boolean;
  moved: number;
  /** In resolution order, so the UI can replay the phase as an animation. */
  moves: EnemyMove[];
}

function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank));
}

interface Candidate {
  piece: Piece;
  to: Square;
  score: number;
}

/**
 * One reply per turn (section 7).
 *
 * The board does not swarm you: it answers the way an opponent does, one piece
 * at a time, and it picks the single most threatening move it has. Take the
 * richest capture on offer; otherwise close on the king with whichever piece
 * gets nearest. Deterministic throughout - no Math.random in the AI (G39).
 */
export function enemyPhase(state: GameState): EnemyPhaseResult {
  const moves: EnemyMove[] = [];

  for (let i = 0; i < ENEMY_MOVES_PER_TURN; i++) {
    const choice = bestMove(state);
    if (!choice) break;

    const target = pieceAt(state, choice.to.file, choice.to.rank);
    if (target) state.pieces = state.pieces.filter((p) => p.id !== target.id);

    const from: Square = { file: choice.piece.file, rank: choice.piece.rank };
    choice.piece.file = choice.to.file;
    choice.piece.rank = choice.to.rank;
    choice.piece.neverMoved = false;
    moves.push({
      pieceId: choice.piece.id,
      type: choice.piece.type,
      from,
      to: { ...choice.to },
      ...(target ? { captured: target.type } : {}),
    });

    if (target && target.side === 'player' && target.type === 'king') {
      // Stop the instant the crown falls. Nothing after this matters.
      clearStun(state);
      return { kingCaptured: true, moved: moves.length, moves };
    }
  }

  clearStun(state);
  return { kingCaptured: false, moved: moves.length, moves };
}

function clearStun(state: GameState): void {
  for (const piece of state.pieces) {
    if (piece.side === 'enemy') piece.stunned = false;
  }
}

/** The best single move on the board, or null if nothing can usefully move. */
function bestMove(state: GameState): Candidate | null {
  const king = playerKing(state);
  const goal: Square = king
    ? { file: king.file, rank: king.rank }
    : { file: 4, rank: vanguardRank(state) };

  // Nearest pieces first, and only that many: a board thick with enemies must
  // not turn one turn into a full-board search (G33).
  const actors = state.pieces
    .filter((p) => p.side === 'enemy' && isActive(state, p) && !p.stunned)
    .sort((a, b) => a.rank - b.rank || a.file - b.file || typeOrder(a.type) - typeOrder(b.type))
    .slice(0, AI_CANDIDATES);

  let best: Candidate | null = null;

  for (const piece of actors) {
    const here = chebyshev({ file: piece.file, rank: piece.rank }, goal);

    for (const to of pseudoMoves(state, piece)) {
      if (!inWindow(state, to.rank)) continue;

      const victim = pieceAt(state, to.file, to.rank);
      let score: number;

      if (victim && victim.side === 'player') {
        // A capture always beats a walk, and the richest capture wins.
        score = 10_000 + AI_VALUE[victim.type] * 10;
      } else if (victim) {
        continue; // Its own piece is standing there.
      } else {
        // No enemy may retreat more than one rank, and a move that does not
        // close the gap is not a move at all - that is how a rook ends up
        // pacing left and right forever (G32).
        if (to.rank > piece.rank + 1) continue;
        const after = chebyshev(to, goal);
        if (after >= here) continue;
        score = 100 - after;
      }

      if (!best || score > best.score || (score === best.score && tieBreak(piece, to, best) < 0)) {
        best = { piece, to, score };
      }
    }
  }

  return best;
}

/** Ties resolve by the mover's square, then its destination, then its type. */
function tieBreak(piece: Piece, to: Square, best: Candidate): number {
  return (
    piece.rank - best.piece.rank ||
    piece.file - best.piece.file ||
    to.rank - best.to.rank ||
    to.file - best.to.file ||
    typeOrder(piece.type) - typeOrder(best.piece.type)
  );
}

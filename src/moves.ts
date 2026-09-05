import { WINDOW_HEIGHT } from './constants.js';
import { forward, inWindow, onBoard, pieceAt, playerKing } from './board.js';
import type { GameState, Piece, Square } from './types.js';

const KNIGHT_STEPS: readonly [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const DIAGONALS: readonly [number, number][] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const ORTHOGONALS: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const ALL_STEPS: readonly [number, number][] = [...ORTHOGONALS, ...DIAGONALS];

/**
 * Slides raycast only inside the window and never further than the window
 * height, so a queen on an open file cannot shoot 10,000 ranks (G01, G03).
 */
function slide(state: GameState, piece: Piece, dirs: readonly [number, number][]): Square[] {
  const out: Square[] = [];
  for (const [df, dr] of dirs) {
    for (let step = 1; step <= WINDOW_HEIGHT; step++) {
      const file = piece.file + df * step;
      const rank = piece.rank + dr * step;
      if (!onBoard(file, rank)) break;
      if (!inWindow(state, rank)) break;
      const occupant = pieceAt(state, file, rank);
      if (!occupant) {
        out.push({ file, rank });
        continue;
      }
      if (occupant.side !== piece.side) out.push({ file, rank });
      break;
    }
  }
  return out;
}

function steps(state: GameState, piece: Piece, offsets: readonly [number, number][]): Square[] {
  const out: Square[] = [];
  for (const [df, dr] of offsets) {
    const file = piece.file + df;
    const rank = piece.rank + dr;
    if (!onBoard(file, rank)) continue;
    if (!inWindow(state, rank)) continue;
    const occupant = pieceAt(state, file, rank);
    if (occupant && occupant.side === piece.side) continue;
    out.push({ file, rank });
  }
  return out;
}

function pawnMoves(state: GameState, piece: Piece): Square[] {
  const dir = forward(piece.side);
  const out: Square[] = [];

  const oneFile = piece.file;
  const oneRank = piece.rank + dir;
  if (onBoard(oneFile, oneRank) && inWindow(state, oneRank) && !pieceAt(state, oneFile, oneRank)) {
    out.push({ file: oneFile, rank: oneRank });

    // Double-step only from the square it was born on, and only for the player.
    // Recruited and dripped pawns get their one double-step too (section 4).
    const twoRank = piece.rank + dir * 2;
    if (
      piece.side === 'player' &&
      piece.neverMoved &&
      piece.originRank === piece.rank &&
      onBoard(oneFile, twoRank) &&
      inWindow(state, twoRank) &&
      !pieceAt(state, oneFile, twoRank)
    ) {
      out.push({ file: oneFile, rank: twoRank });
    }
  }

  for (const df of [-1, 1]) {
    const file = piece.file + df;
    const rank = piece.rank + dir;
    if (!onBoard(file, rank) || !inWindow(state, rank)) continue;
    const target = pieceAt(state, file, rank);
    if (target && target.side !== piece.side) out.push({ file, rank });
  }
  return out;
}

/** Classic chess moves, clipped to the window. No castling, no en passant in v1. */
export function pseudoMoves(state: GameState, piece: Piece): Square[] {
  switch (piece.type) {
    case 'pawn':
      return pawnMoves(state, piece);
    case 'knight':
      return steps(state, piece, KNIGHT_STEPS);
    case 'king':
      return steps(state, piece, ALL_STEPS);
    case 'bishop':
      return slide(state, piece, DIAGONALS);
    case 'rook':
      return slide(state, piece, ORTHOGONALS);
    case 'queen':
      return slide(state, piece, ALL_STEPS);
  }
}

/** Squares a piece hits, for check tests. Pawns attack diagonals whatever sits there. */
export function attackSquares(state: GameState, piece: Piece): Square[] {
  if (piece.type !== 'pawn') return pseudoMoves(state, piece);
  const dir = forward(piece.side);
  const out: Square[] = [];
  for (const df of [-1, 1]) {
    const file = piece.file + df;
    const rank = piece.rank + dir;
    if (onBoard(file, rank) && inWindow(state, rank)) out.push({ file, rank });
  }
  return out;
}

/**
 * Is (file, rank) attacked by `side`? Only pieces inside the window count:
 * a queen sitting in unseen fog cannot reach out and take the king (G27).
 */
export function isAttacked(state: GameState, file: number, rank: number, side: Piece['side']): boolean {
  for (const piece of state.pieces) {
    if (piece.side !== side) continue;
    if (!inWindow(state, piece.rank)) continue;
    for (const square of attackSquares(state, piece)) {
      if (square.file === file && square.rank === rank) return true;
    }
  }
  return false;
}

export function inCheck(state: GameState): boolean {
  const king = playerKing(state);
  if (!king) return false;
  return isAttacked(state, king.file, king.rank, 'enemy');
}

/** Apply a move to a scratch state. Returns the captured piece, if any. */
function applyOnCopy(state: GameState, piece: Piece, to: Square): GameState {
  const copy: GameState = {
    ...state,
    pieces: state.pieces
      .filter((p) => !(p.file === to.file && p.rank === to.rank && p.id !== piece.id))
      .map((p) => (p.id === piece.id ? { ...p, file: to.file, rank: to.rank, neverMoved: false } : p)),
  };
  return copy;
}

/**
 * Legal player moves. A square on or behind the wake is not a square (G23),
 * and no move may leave the king under attack (G22).
 */
export function legalMoves(state: GameState, piece: Piece): Square[] {
  if (piece.side !== 'player') return [];
  if (state.gameOverReason) return [];
  const out: Square[] = [];
  for (const to of pseudoMoves(state, piece)) {
    if (to.rank <= state.wakeRank) continue;
    const after = applyOnCopy(state, piece, to);
    const king = playerKing(after);
    if (!king) continue;
    if (isAttacked(after, king.file, king.rank, 'enemy')) continue;
    out.push(to);
  }
  return out;
}

/** No legal safe move ends the run: mate and stalemate both (G21). */
export function hasAnyLegalMove(state: GameState): boolean {
  for (const piece of state.pieces) {
    if (piece.side !== 'player') continue;
    if (legalMoves(state, piece).length > 0) return true;
  }
  return false;
}

/** Would dropping a piece of this side on this square leave our own king in check (G11)? */
export function placementLeavesKingInCheck(state: GameState, square: Square): boolean {
  const king = playerKing(state);
  if (!king) return true;
  const probe: GameState = {
    ...state,
    pieces: [
      ...state.pieces,
      {
        id: -1,
        type: 'pawn',
        side: 'player',
        file: square.file,
        rank: square.rank,
        originRank: square.rank,
        neverMoved: true,
        stunned: false,
        packId: -1,
      },
    ],
  };
  return isAttacked(probe, king.file, king.rank, 'enemy');
}

import { FILES, MAX_FRIENDLY, MAX_PLAYER_QUEENS, PROMO_DISTANCE, RANK_MAX } from './constants.js';
import { pieceAt, playerKing, rearRank } from './board.js';
import { placementLeavesKingInCheck } from './moves.js';
import type { GameState, Piece, PieceType, PromoType, Square } from './types.js';

export interface SpawnOutcome {
  piece?: Piece;
  skipped?: string;
}

/**
 * "The rear" is the rank of the hindmost friendly piece, bumped forward one if
 * the wake is about to eat it (G08). Files walk out from the king's file.
 */
export function rearSpawnSquares(state: GameState, exclude: readonly Square[]): Square[] {
  const king = playerKing(state);
  const kingFile = king ? king.file : Math.floor(FILES / 2);

  let base = rearRank(state);
  if (base <= state.wakeRank + 1) base = state.wakeRank + 2;

  const fileOrder: number[] = [kingFile];
  for (let d = 1; d < FILES; d++) {
    fileOrder.push(kingFile + d, kingFile - d);
  }

  const squares: Square[] = [];
  // First the rear rank, then one rank up if every file there was taken.
  for (const rank of [base, base + 1]) {
    if (rank > RANK_MAX) continue;
    for (const file of fileOrder) {
      if (file < 0 || file >= FILES) continue;
      const occupant = pieceAt(state, file, rank);
      if (occupant) continue;
      if (exclude.some((sq) => sq.file === file && sq.rank === rank)) continue;
      squares.push({ file, rank });
    }
  }
  return squares;
}

/**
 * Place a friendly piece at the rear. Never on the king, never on the piece that
 * just moved, never onto a square that leaves the king in check (G09-G11).
 * If nothing fits: skip. Do not queue a pending spawn.
 */
export function spawnAtRear(state: GameState, type: PieceType, exclude: readonly Square[] = []): SpawnOutcome {
  if (type === 'king') return { skipped: 'never recruit a second king' };
  if (state.pieces.filter((p) => p.side === 'player').length >= MAX_FRIENDLY) {
    return { skipped: 'friendly cap reached' };
  }

  const actual = downgradeQueen(state, type);

  for (const square of rearSpawnSquares(state, exclude)) {
    if (placementLeavesKingInCheck(state, square)) continue;
    const piece: Piece = {
      id: state.nextPieceId++,
      type: actual,
      side: 'player',
      file: square.file,
      rank: square.rank,
      // Every pawn write sets originRank, or it never promotes (G19).
      originRank: square.rank,
      neverMoved: true,
      stunned: false,
      packId: -1,
    };
    state.pieces.push(piece);
    return { piece };
  }
  return { skipped: 'no free rear square' };
}

/** At most one player queen at a time. Further queens arrive as knights (G17). */
export function downgradeQueen(state: GameState, type: PieceType): PieceType {
  if (type !== 'queen') return type;
  const queens = state.pieces.filter((p) => p.side === 'player' && p.type === 'queen').length;
  return queens >= MAX_PLAYER_QUEENS ? 'knight' : 'queen';
}

/** Only kings and knights bring bodies home (G13). Boss kings never recruit (G14). */
export function recruits(moverType: PieceType, capturedType: PieceType): boolean {
  if (moverType !== 'king' && moverType !== 'knight') return false;
  if (capturedType === 'king') return false;
  return true;
}

export function pawnReadyToPromote(piece: Piece): boolean {
  return piece.type === 'pawn' && piece.rank >= piece.originRank + PROMO_DISTANCE;
}

/** Choices are knight, bishop, rook, queen. King is not in the menu (G18). */
export function promote(state: GameState, piece: Piece, choice: PromoType): PieceType {
  const actual = downgradeQueen(state, choice) as PieceType;
  piece.type = actual;
  return actual;
}

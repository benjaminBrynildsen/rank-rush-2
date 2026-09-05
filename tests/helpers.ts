import { refreshFog } from '../src/board.js';
import * as legalModule from '../src/moves.js';
import { createGame, move } from '../src/engine.js';
import type { GameState, Piece, PieceType, PromoType, Side, Square } from '../src/types.js';

/** A board with only what a test puts on it. No generated packs. */
export function bareGame(seed = 1): GameState {
  const state = createGame(seed);
  state.pieces = state.pieces.filter((p) => p.side === 'player');
  // Mark every chunk a test could reach as already generated, so no encounter
  // materialises underneath a fixture.
  state.generatedChunks = Array.from({ length: 512 }, (_, i) => i);
  refreshFog(state);
  return state;
}

export function put(
  state: GameState,
  side: Side,
  type: PieceType,
  file: number,
  rank: number,
  extra: Partial<Piece> = {},
): Piece {
  const piece: Piece = {
    id: state.nextPieceId++,
    type,
    side,
    file,
    rank,
    originRank: rank,
    neverMoved: true,
    stunned: false,
    packId: side === 'enemy' ? 0 : -1,
    ...extra,
  };
  state.pieces.push(piece);
  refreshFog(state);
  return piece;
}

export function at(state: GameState, file: number, rank: number): Piece | undefined {
  return state.pieces.find((p) => p.file === file && p.rank === rank);
}

export function sq(file: number, rank: number): Square {
  return { file, rank };
}

export function play(state: GameState, pieceId: number, to: Square, promo?: PromoType) {
  return move(state, { pieceId, to, promo, generationId: state.generationId });
}

export function playerKingOf(state: GameState): Piece {
  const king = state.pieces.find((p) => p.side === 'player' && p.type === 'king');
  if (!king) throw new Error('no player king');
  return king;
}

export function knightOf(state: GameState): Piece {
  const knight = state.pieces.find((p) => p.side === 'player' && p.type === 'knight');
  if (!knight) throw new Error('no player knight');
  return knight;
}

/**
 * A deterministic house player: walk the king forward when you can, take a
 * capture when you cannot, otherwise the first legal move by piece id.
 * Used for soak tests; it plays badly on purpose.
 */
export function autoPlay(state: GameState, plies: number, onPly?: (state: GameState) => void): number {
  const { legalMoves } = legalModule;
  let played = 0;
  for (let i = 0; i < plies && !state.gameOverReason; i++) {
    const pieces = [...state.pieces].filter((p) => p.side === 'player').sort((a, b) => a.id - b.id);
    let chosen: { id: number; to: Square } | null = null;

    const king = pieces.find((p) => p.type === 'king');
    if (king) {
      const forward = legalMoves(state, king).filter((m) => m.rank > king.rank);
      forward.sort((a, b) => b.rank - a.rank || a.file - b.file);
      if (forward[0]) chosen = { id: king.id, to: forward[0] };
    }
    if (!chosen) {
      outer: for (const piece of pieces) {
        for (const to of legalMoves(state, piece)) {
          chosen = { id: piece.id, to };
          break outer;
        }
      }
    }
    if (!chosen) break;
    const result = play(state, chosen.id, chosen.to);
    if (!result.ok) break;
    played++;
    onPly?.(state);
  }
  return played;
}

/** Move a fixture piece and refresh the fog, the way a real ply would. */
export function placeAt(state: GameState, piece: Piece, file: number, rank: number): Piece {
  piece.file = file;
  piece.rank = rank;
  piece.originRank = rank;
  refreshFog(state);
  return piece;
}

import { FILES, FOG_AHEAD, RANK_MAX, WINDOW_MARGIN } from './constants.js';
import type { GameState, Piece, PieceType, Side, Square } from './types.js';

export const FILE_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export function squareName(file: number, rank: number): string {
  return `${FILE_NAMES[file] ?? '?'}${rank}`;
}

/** Files clamp. Off-file is blocked, never wrapped (G04). */
export function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < FILES && rank >= 1 && rank <= RANK_MAX;
}

export function pieceAt(state: GameState, file: number, rank: number): Piece | undefined {
  return state.pieces.find((p) => p.file === file && p.rank === rank);
}

export function pieceById(state: GameState, id: number): Piece | undefined {
  return state.pieces.find((p) => p.id === id);
}

export function playerKing(state: GameState): Piece | undefined {
  return state.pieces.find((p) => p.side === 'player' && p.type === 'king');
}

export function friendlies(state: GameState): Piece[] {
  return state.pieces.filter((p) => p.side === 'player');
}

/** The farthest-forward friendly piece. Camera and fog follow it, the score does not (G41). */
export function vanguardRank(state: GameState): number {
  let best = 1;
  for (const p of state.pieces) if (p.side === 'player' && p.rank > best) best = p.rank;
  return best;
}

export function rearRank(state: GameState): number {
  let best = RANK_MAX;
  for (const p of state.pieces) if (p.side === 'player' && p.rank < best) best = p.rank;
  return best === RANK_MAX ? 1 : best;
}

/** Only a window lives in RAM: wakeRank exclusive through fogRank + 2 (G01). */
export function windowTop(state: GameState): number {
  return Math.min(RANK_MAX, state.fogRank + WINDOW_MARGIN);
}

export function inWindow(state: GameState, rank: number): boolean {
  return rank > state.wakeRank && rank <= windowTop(state);
}

/** Pieces outside the window do not move and do not capture (G27). */
export function isActive(state: GameState, piece: Piece): boolean {
  return inWindow(state, piece.rank);
}

/**
 * The fog only ever moves forward. If the vanguard dies the horizon stays where
 * it was, or packs that were already generated would fall outside the window
 * the moment their scout was taken (G01).
 */
export function refreshFog(state: GameState): void {
  const wanted = vanguardRank(state) + FOG_AHEAD;
  state.fogRank = Math.min(RANK_MAX, Math.max(state.fogRank, wanted));
}

/** Player pawns walk toward higher ranks; enemy pawns face south (section 7). */
export function forward(side: Side): 1 | -1 {
  return side === 'player' ? 1 : -1;
}

const TYPE_ORDER: Record<PieceType, number> = {
  pawn: 0,
  knight: 1,
  bishop: 2,
  rook: 3,
  queen: 4,
  king: 5,
};

/** Tie-breaks are deterministic: file, then piece type. No Math.random in AI (G39). */
export function typeOrder(type: PieceType): number {
  return TYPE_ORDER[type];
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank;
}

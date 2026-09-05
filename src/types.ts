export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

/** Everything a pawn may become. Never a king (G18). */
export type PromoType = Exclude<PieceType, 'pawn' | 'king'>;

export type Side = 'player' | 'enemy';

export interface Piece {
  id: number;
  type: PieceType;
  side: Side;
  file: number;
  rank: number;
  /** The rank this piece was born on. Every pawn write sets it (G19). */
  originRank: number;
  neverMoved: boolean;
  /** A pack that just scrolled into the window gets no move on the next enemy phase (G27). */
  stunned: boolean;
  /** Encounter this enemy belongs to, for capture streaks. */
  packId: number;
}

export type GameOverReason =
  | 'king-captured'
  | 'no-legal-move'
  | 'wake-took-the-king'
  | 'map-ends';

export interface Square {
  file: number;
  rank: number;
}

export interface GameState {
  seed: number;
  /** Number of committed player moves. */
  moveIndex: number;
  /** Bumped after every resolved ply. Player moves carry it (G24). */
  generationId: number;

  wakeRank: number;
  fogRank: number;

  /**
   * Committed player moves since the last conscript, 0..7 (section 6.1).
   * Hits PAWN_PERIOD -> spawn, reset to 0.
   */
  movesUntilPawn: number;
  /** Committed player moves since the last wake tick, 0..2. */
  movesUntilWake: number;

  pieces: Piece[];
  nextPieceId: number;

  /** Chunk indices already generated. Never generated twice (G29). */
  generatedChunks: number[];

  score: number;
  captures: number;
  /** Captures taken so far inside `streakPackId`. */
  streakInPack: number;
  streakPackId: number;
  /** Distance score uses the best king rank reached, never the vanguard (G41). */
  bestKingRank: number;
  /** Friendlies eaten by the wake. They score 0 (G43). */
  fallen: number;

  busy: boolean;
  selectedId: number | null;
  legalTargets: Square[];

  /** Set while a promotion is waiting on the player. Nothing else may run (G16). */
  pendingPromotion: number | null;

  gameOverReason: GameOverReason | null;
}

export interface MoveRequest {
  pieceId: number;
  to: Square;
  /** Defaults to 'knight' if a promotion happens and none was chosen (G16). */
  promo?: PromoType;
  /** The generation the player was looking at when they clicked. */
  generationId: number;
}

export type PlyEvent =
  | { kind: 'move'; pieceId: number; from: Square; to: Square }
  | { kind: 'capture'; by: number; type: PieceType; side: Side; at: Square; points: number }
  | { kind: 'recruit'; type: PieceType; at: Square }
  | { kind: 'recruit-skipped'; type: PieceType; why: string }
  | { kind: 'conscript'; at: Square }
  | { kind: 'conscript-skipped'; why: string }
  | { kind: 'promotion'; pieceId: number; to: PromoType; at: Square }
  | { kind: 'enemy-move'; pieceId: number; type: PieceType; from: Square; to: Square }
  | { kind: 'lost'; type: PieceType; at: Square; to: PieceType }
  | { kind: 'wake'; rank: number; eaten: number }
  | { kind: 'spawn-pack'; packId: number; name: string; count: number }
  | { kind: 'game-over'; reason: GameOverReason };

export interface PlyResult {
  ok: boolean;
  /** Why the move was rejected. Only set when ok is false. */
  rejected?: 'busy' | 'game-over' | 'stale-generation' | 'no-such-piece' | 'illegal-move';
  events: PlyEvent[];
}

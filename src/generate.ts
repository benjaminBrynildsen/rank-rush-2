import {
  BOSS_EVERY,
  CHUNK_SIZE,
  FILES,
  MAX_ESCORTS,
  NO_SPAWN_BELOW,
  RAMP_EVERY,
  RANK_MAX,
} from './constants.js';
import { pieceAt, playerKing } from './board.js';
import { attackSquares } from './moves.js';
import { hash2, mulberry32, randInt, type Rng } from './rng.js';
import type { GameState, Piece, PieceType, Square } from './types.js';

export interface PackTemplate {
  name: string;
  fromRank: number;
  build(rng: Rng, rank: number): PackMember[];
}

export interface PackMember {
  type: PieceType;
  /** Preferred file, wrapped into range by the placer. */
  file: number;
  /** Rank offset from the encounter rank. */
  dr: number;
}

function file(rng: Rng): number {
  return randInt(rng, FILES);
}

/** Section 7. Packs get richer the further the king walks. */
export const PACKS: readonly PackTemplate[] = [
  {
    name: 'Skirmish',
    fromRank: 8,
    build(rng, _rank) {
      const pawns = 2 + randInt(rng, 3);
      const members: PackMember[] = [];
      for (let i = 0; i < pawns; i++) members.push({ type: 'pawn', file: file(rng), dr: randInt(rng, 2) });
      members.push({ type: 'knight', file: file(rng), dr: 1 });
      return members;
    },
  },
  {
    name: 'Fork camp',
    fromRank: 16,
    build(rng, _rank) {
      const start = randInt(rng, FILES - 2);
      return [
        { type: 'knight', file: start + 1, dr: 1 },
        { type: 'pawn', file: start, dr: 0 },
        { type: 'pawn', file: start + 1, dr: 0 },
        { type: 'pawn', file: start + 2, dr: 0 },
      ];
    },
  },
  {
    name: 'Battery',
    fromRank: 24,
    build(rng, _rank) {
      if (rng() < 0.5) {
        return [
          { type: 'bishop', file: file(rng), dr: 0 },
          { type: 'bishop', file: file(rng), dr: 1 },
          { type: 'pawn', file: file(rng), dr: 0 },
        ];
      }
      return [
        { type: 'rook', file: file(rng), dr: 1 },
        { type: 'pawn', file: file(rng), dr: 0 },
        { type: 'pawn', file: file(rng), dr: 0 },
      ];
    },
  },
  {
    name: 'Queen raid',
    fromRank: 40,
    build(rng, _rank) {
      return [
        { type: 'queen', file: file(rng), dr: 1 },
        { type: 'knight', file: file(rng), dr: 0 },
        { type: 'pawn', file: file(rng), dr: 0 },
      ];
    },
  },
  {
    name: 'Siege wall',
    fromRank: 48,
    build(rng, _rank) {
      // A full wall softlocks the run, so the generator always leaves a hole (G35).
      const gapA = randInt(rng, FILES);
      let gapB = randInt(rng, FILES);
      if (gapB === gapA) gapB = (gapA + 1 + randInt(rng, FILES - 1)) % FILES;
      const members: PackMember[] = [];
      for (let f = 0; f < FILES; f++) {
        if (f === gapA || f === gapB) continue;
        members.push({ type: 'pawn', file: f, dr: 0 });
      }
      return members;
    },
  },
];

/**
 * The heavy pack. It has no king: there is exactly one enemy king in a run and
 * he stands on the last rank, so this is a wall, not a boss.
 */
function warband(rng: Rng): PackMember[] {
  return [
    { type: 'queen', file: 3 + randInt(rng, 2), dr: 1 },
    { type: 'rook', file: file(rng), dr: 1 },
    { type: 'rook', file: file(rng), dr: 1 },
    { type: 'bishop', file: file(rng), dr: 0 },
    { type: 'knight', file: file(rng), dr: 0 },
    { type: 'pawn', file: file(rng), dr: 0 },
    { type: 'pawn', file: file(rng), dr: 0 },
  ];
}

/**
 * How many extra bodies a pack gets for standing this far up the board. With
 * one enemy move per turn, depth cannot mean "more replies per turn" any more -
 * it means better material and a thicker wall to cut through.
 */
export function escortCount(rank: number): number {
  return Math.min(MAX_ESCORTS, Math.floor(rank / RAMP_EVERY));
}

/** Escorts improve with depth: pawns early, pieces later. */
function escortType(rng: Rng, rank: number): PieceType {
  const tier: PieceType[] =
    rank >= 100
      ? ['knight', 'bishop', 'rook', 'rook', 'queen']
      : rank >= 60
        ? ['pawn', 'knight', 'bishop', 'rook']
        : rank >= 30
          ? ['pawn', 'pawn', 'knight', 'bishop']
          : ['pawn', 'pawn', 'knight'];
  return tier[randInt(rng, tier.length)] as PieceType;
}

/**
 * The last army: a full chess set in its home formation, back rank on
 * `lastRank` with its pawns in front. There is nothing past it. The only way
 * through is to take that king.
 */
export function lastArmy(): PackMember[] {
  const back: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  const members: PackMember[] = [];
  for (let f = 0; f < FILES; f++) {
    members.push({ type: back[f] as PieceType, file: f, dr: 1 });
    members.push({ type: 'pawn', file: f, dr: 0 });
  }
  return members;
}

export interface GeneratedPack {
  packId: number;
  name: string;
  pieces: Piece[];
}

/**
 * Chunks are keyed by (seed, chunkIndex) only. No camera coordinate leaks into
 * the hash, so a rank is never generated twice with different contents (G29).
 * Cleared packs never come back (G34).
 */
export function generateChunk(state: GameState, chunkIndex: number): GeneratedPack | null {
  if (state.generatedChunks.includes(chunkIndex)) return null;
  state.generatedChunks.push(chunkIndex);

  const base = chunkIndex * CHUNK_SIZE;
  if (base + CHUNK_SIZE <= NO_SPAWN_BELOW) return null;
  // The approach to the last rank stays clear: the final army is the encounter.
  if (base + CHUNK_SIZE > state.lastRank - 1) return null;

  const rng = mulberry32(hash2(state.seed, chunkIndex));

  // Encounter ranks sit 3..5 into the chunk, so gaps run 6-10 ranks (section 7).
  let rank = base + 3 + randInt(rng, 3);
  let template: { name: string; members: PackMember[] } | null = null;

  const heavyRank = Math.ceil(Math.max(base, BOSS_EVERY) / BOSS_EVERY) * BOSS_EVERY;
  if (heavyRank >= base && heavyRank < base + CHUNK_SIZE) {
    rank = heavyRank;
    template = { name: 'Warband', members: warband(rng) };
  } else {
    const eligible = PACKS.filter((p) => p.fromRank <= rank);
    if (eligible.length === 0) return null;
    const chosen = eligible[randInt(rng, eligible.length)] as PackTemplate;
    template = { name: chosen.name, members: chosen.build(rng, rank) };
  }

  // The ramp. Every RAMP_EVERY ranks the pack brings one more body, and the
  // bodies themselves get better.
  for (let i = 0; i < escortCount(rank); i++) {
    template.members.push({ type: escortType(rng, rank), file: file(rng), dr: randInt(rng, 2) });
  }

  if (rank <= NO_SPAWN_BELOW || rank > RANK_MAX) return null;

  const placed: Piece[] = [];
  for (const member of template.members) {
    const square = findFreeSquare(state, placed, member, rank);
    // If the pack does not fit, shrink the pack. Never spawn on an occupied
    // square and never on the player king (G28).
    if (!square) continue;

    const piece: Piece = {
      id: state.nextPieceId++,
      type: member.type,
      side: 'enemy',
      file: square.file,
      rank: square.rank,
      originRank: square.rank,
      neverMoved: true,
      // Fresh packs sit out one enemy phase so they cannot shotgun out of fog (G27).
      stunned: true,
      packId: chunkIndex,
    };

    // A pack that materialises already attacking the king is a fog shotgun the
    // player cannot even answer: spawn stun stops it moving, not checking. Drop
    // the offending piece and let the pack be one smaller (G48).
    if (checksPlayerKing(state, placed, piece)) continue;

    placed.push(piece);
  }

  if (placed.length === 0) return null;
  state.pieces.push(...placed);
  return { packId: chunkIndex, name: template.name, pieces: placed };
}

/** Would standing this piece here put the player king in check right now? */
function checksPlayerKing(state: GameState, placed: readonly Piece[], piece: Piece): boolean {
  const king = playerKing(state);
  if (!king) return false;
  // Pieces placed earlier in this pack count: they may block the ray.
  const probe: GameState = { ...state, pieces: [...state.pieces, ...placed, piece] };
  return attackSquares(probe, piece).some((sq) => sq.file === king.file && sq.rank === king.rank);
}

function findFreeSquare(
  state: GameState,
  placed: readonly Piece[],
  member: PackMember,
  rank: number,
): Square | null {
  const wanted = ((member.file % FILES) + FILES) % FILES;
  for (let dr = 0; dr <= 1; dr++) {
    const r = rank + member.dr + dr;
    if (r <= NO_SPAWN_BELOW || r > RANK_MAX) continue;
    for (let i = 0; i < FILES; i++) {
      const f = (wanted + i) % FILES;
      if (pieceAt(state, f, r)) continue;
      if (placed.some((p) => p.file === f && p.rank === r)) continue;
      return { file: f, rank: r };
    }
  }
  return null;
}

/**
 * Stand the last army up on its home ranks. Exact placement, no shrinking: this
 * formation is the point, so a square that is somehow occupied is skipped and
 * nothing else moves to compensate.
 */
export function placeLastArmy(state: GameState): GeneratedPack | null {
  if (state.lastArmyPlaced) return null;
  state.lastArmyPlaced = true;

  const placed: Piece[] = [];
  for (const member of lastArmy()) {
    const rank = state.lastRank - 1 + member.dr;
    if (pieceAt(state, member.file, rank)) continue;
    placed.push({
      id: state.nextPieceId++,
      type: member.type,
      side: 'enemy',
      file: member.file,
      rank,
      originRank: rank,
      neverMoved: true,
      stunned: true,
      packId: LAST_ARMY_PACK,
    });
  }

  if (placed.length === 0) return null;
  state.pieces.push(...placed);
  return { packId: LAST_ARMY_PACK, name: 'The last rank', pieces: placed };
}

/** Its own pack id, so a streak against the last army is its own streak. */
export const LAST_ARMY_PACK = -2;

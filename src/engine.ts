import {
  CHUNK_SIZE,
  FILES,
  PAWN_PERIOD,
  RANK_MAX,
} from './constants.js';
import {
  inWindow,
  pieceById,
  playerKing,
  refreshFog,
  vanguardRank,
  windowTop,
} from './board.js';
import { hasAnyLegalMove, legalMoves } from './moves.js';
import { enemyPhase } from './ai.js';
import { generateChunk, placeLastArmy } from './generate.js';
import { pawnReadyToPromote, promote, recruits, spawnAtRear } from './growth.js';
import { captureValue, POINTS_PER_RANK } from './score.js';
import { checkInvariants, InvariantError } from './invariants.js';
import { DEFAULT_MODE, MODES, type ModeId } from './modes.js';
import type {
  GameOverReason,
  GameState,
  MoveRequest,
  Piece,
  PlyEvent,
  PlyResult,
  PromoType,
  Square,
} from './types.js';

/** Locked start for the first build: king e2, knight g2 (section 5). */
export const START_KING: Square = { file: 4, rank: 2 };
export const START_KNIGHT: Square = { file: 6, rank: 2 };

export function createGame(seed = 1, modeId: ModeId = DEFAULT_MODE): GameState {
  const mode = MODES[modeId];
  const state: GameState = {
    mode: modeId,
    seed: seed >>> 0,
    moveIndex: 0,
    generationId: 1,
    wakeRank: 0,
    fogRank: 0,
    movesUntilPawn: 0,
    movesUntilWake: 0,
    pendingWakeTicks: 0,
    lastRank: mode.lastRank,
    lastArmyPlaced: false,
    pieces: [],
    nextPieceId: 1,
    generatedChunks: [],
    score: 0,
    captures: 0,
    streakInPack: 0,
    streakPackId: -1,
    bestKingRank: START_KING.rank,
    fallen: 0,
    busy: false,
    selectedId: null,
    legalTargets: [],
    pendingPromotion: null,
    gameOverReason: null,
  };

  state.pieces.push(makePiece(state, 'king', START_KING));
  state.pieces.push(makePiece(state, 'knight', START_KNIGHT));
  refreshFog(state);
  generateVisibleChunks(state);
  return state;
}

function makePiece(state: GameState, type: Piece['type'], at: Square): Piece {
  return {
    id: state.nextPieceId++,
    type,
    side: 'player',
    file: at.file,
    rank: at.rank,
    originRank: at.rank,
    neverMoved: true,
    stunned: false,
    packId: -1,
  };
}

/** Does this move land a pawn on its promotion rank? The UI asks before committing. */
export function wouldPromote(state: GameState, pieceId: number, to: Square): boolean {
  const piece = pieceById(state, pieceId);
  if (!piece || piece.type !== 'pawn' || piece.side !== 'player') return false;
  return pawnReadyToPromote({ ...piece, rank: to.rank });
}

export function targetsFor(state: GameState, pieceId: number): Square[] {
  const piece = pieceById(state, pieceId);
  if (!piece || piece.side !== 'player') return [];
  return legalMoves(state, piece);
}

/**
 * The tick order from section 9. Do not reorder: wake mid-move,
 * recruit-before-capture, or simultaneous enemies create most of section 12.
 */
export function move(state: GameState, request: MoveRequest): PlyResult {
  const events: PlyEvent[] = [];

  // 1. Input is accepted only when the board is idle (G36, G38).
  if (state.busy) return { ok: false, rejected: 'busy', events };
  if (state.gameOverReason) return { ok: false, rejected: 'game-over', events };

  // 2. The move must be about the board the player was looking at (G24).
  if (request.generationId !== state.generationId) {
    return { ok: false, rejected: 'stale-generation', events };
  }

  const mover = pieceById(state, request.pieceId);
  if (!mover || mover.side !== 'player') {
    return { ok: false, rejected: 'no-such-piece', events };
  }

  const legal = legalMoves(state, mover);
  if (!legal.some((sq) => sq.file === request.to.file && sq.rank === request.to.rank)) {
    // A rejected click is not a move: the pawn counter must not budge (G15).
    return { ok: false, rejected: 'illegal-move', events };
  }

  state.busy = true;
  const snapshot = clone(state);

  try {
    resolvePly(state, mover, request, events);
  } catch (error) {
    // Do not try to recover mid-frame (section 11). Roll the ply back.
    restore(state, snapshot);
    state.busy = false;
    throw error;
  }

  const problems = checkInvariants(state);
  if (problems.length > 0) {
    restore(state, snapshot);
    state.busy = false;
    throw new InvariantError(problems);
  }

  // 12. Clear busy, advance the generation. Stale clicks now bounce.
  state.busy = false;
  state.selectedId = null;
  state.legalTargets = [];
  state.generationId++;
  return { ok: true, events };
}

function resolvePly(state: GameState, mover: Piece, request: MoveRequest, events: PlyEvent[]): void {
  const from: Square = { file: mover.file, rank: mover.rank };
  const moverTypeBefore = mover.type;

  // 3. Apply the move, resolve the capture.
  const victim = state.pieces.find(
    (p) => p.id !== mover.id && p.file === request.to.file && p.rank === request.to.rank,
  );
  if (victim) {
    state.pieces = state.pieces.filter((p) => p.id !== victim.id);
    const streak = bumpStreak(state, victim.packId);
    const points = captureValue(victim.type, streak);
    state.score += points;
    state.captures++;
    events.push({
      kind: 'capture',
      by: mover.id,
      type: victim.type,
      side: victim.side,
      at: { file: victim.file, rank: victim.rank },
      points,
    });
  }

  mover.file = request.to.file;
  mover.rank = request.to.rank;
  mover.neverMoved = false;
  events.push({ kind: 'move', pieceId: mover.id, from, to: { ...request.to } });

  // There is one enemy king in a run. Taking him is the only way to win.
  if (victim && victim.type === 'king' && victim.side === 'enemy') {
    recordDistance(state);
    endRun(state, 'crown-taken', events);
    return;
  }

  const king = playerKing(state);
  recordDistance(state);
  refreshFog(state);

  // 4. Trophy recruit. Only kings and knights, never off a boss king, once per ply.
  if (victim && recruits(moverTypeBefore, victim.type)) {
    const outcome = spawnAtRear(state, victim.type, [
      { file: mover.file, rank: mover.rank },
      ...(king ? [{ file: king.file, rank: king.rank }] : []),
    ]);
    if (outcome.piece) {
      events.push({
        kind: 'recruit',
        type: outcome.piece.type,
        at: { file: outcome.piece.file, rank: outcome.piece.rank },
      });
    } else {
      events.push({ kind: 'recruit-skipped', type: victim.type, why: outcome.skipped ?? 'unknown' });
    }
  }

  // 5. Promotion. Resolved here and cleared before the enemy phase (G16).
  if (pawnReadyToPromote(mover)) {
    state.pendingPromotion = mover.id;
    const choice: PromoType = request.promo ?? 'knight';
    const became = promote(state, mover, choice);
    state.pendingPromotion = null;
    events.push({
      kind: 'promotion',
      pieceId: mover.id,
      to: became as PromoType,
      at: { file: mover.file, rank: mover.rank },
    });
  }

  // 6. Count the move. Only committed legal moves count (G15).
  state.moveIndex++;
  state.movesUntilPawn++;
  if (state.movesUntilPawn >= PAWN_PERIOD) {
    state.movesUntilPawn = 0;
    const outcome = spawnAtRear(state, 'pawn', [{ file: mover.file, rank: mover.rank }]);
    if (outcome.piece) {
      events.push({ kind: 'conscript', at: { file: outcome.piece.file, rank: outcome.piece.rank } });
    } else {
      events.push({ kind: 'conscript-skipped', why: outcome.skipped ?? 'unknown' });
    }
  }

  // 7. Enemy phase, sequential, aborting the moment the king falls.
  const phase = enemyPhase(state);
  for (const enemyMove of phase.moves) {
    events.push({
      kind: 'enemy-move',
      pieceId: enemyMove.pieceId,
      type: enemyMove.type,
      from: enemyMove.from,
      to: enemyMove.to,
    });
    if (enemyMove.captured) {
      events.push({ kind: 'lost', type: enemyMove.captured, at: enemyMove.to, to: enemyMove.type });
    }
  }
  refreshFog(state);
  if (phase.kingCaptured) {
    endRun(state, 'king-captured', events);
    return;
  }

  // 8. No legal safe move is the end of the run: mate and stalemate alike (G21).
  if (!hasAnyLegalMove(state)) {
    endRun(state, 'no-legal-move', events);
    return;
  }

  // 9. Wake tick, between full turns only (G05). In the timed modes the clock
  // has already queued these; in Expedition the move counter earns them.
  const period = MODES[state.mode].wakeMoves;
  if (period !== null) {
    state.movesUntilWake++;
    if (state.movesUntilWake >= period) {
      state.movesUntilWake = 0;
      state.pendingWakeTicks++;
    }
  }
  while (state.pendingWakeTicks > 0) {
    state.pendingWakeTicks--;
    if (!applyWakeTick(state, events)) return;
  }

  // 11. Generate whatever just scrolled into view. New packs arrive stunned.
  generateVisibleChunks(state, events);

  // 11b. Step 8 checked the board as it stood before the wake and before
  // generation. Both can change what the player can do, and a board with no
  // legal move and no ending is a frozen UI, not a game (G21, G47). Re-check
  // last, so nothing that ran after step 8 can leave the run hanging.
  if (!hasAnyLegalMove(state)) {
    endRun(state, 'no-legal-move', events);
    return;
  }

  const crown = playerKing(state);
  if (crown && crown.rank >= RANK_MAX) {
    endRun(state, 'map-ends', events);
  }
}

/**
 * Move the wake up one rank. Returns false when that ended the run, so the
 * caller stops rather than working on a finished board.
 */
function applyWakeTick(state: GameState, events: PlyEvent[]): boolean {
  const newWake = state.wakeRank + 1;

  // If the wake would cover the king, end the run before deleting anything (G06).
  const crown = playerKing(state);
  if (crown && crown.rank <= newWake) {
    state.wakeRank = newWake;
    endRun(state, 'wake-took-the-king', events);
    return false;
  }

  const eaten = state.pieces.filter((p) => p.rank <= newWake);
  state.pieces = state.pieces.filter((p) => p.rank > newWake);
  state.wakeRank = newWake;
  state.fallen += eaten.filter((p) => p.side === 'player').length;
  events.push({ kind: 'wake', rank: newWake, eaten: eaten.length });

  // A selected piece that just got eaten is gone: drop the selection (G07).
  if (state.selectedId !== null && !pieceById(state, state.selectedId)) {
    state.selectedId = null;
    state.legalTargets = [];
  }

  if (!hasAnyLegalMove(state)) {
    endRun(state, 'no-legal-move', events);
    return false;
  }
  return true;
}

/**
 * The clock asking for a wake tick. It never lands inside a ply: a timer that
 * fires while a turn is resolving queues instead, and the tick is spent the
 * moment the board is idle again (G45).
 */
export function requestWakeTick(state: GameState): PlyResult {
  const events: PlyEvent[] = [];
  if (state.gameOverReason) return { ok: false, rejected: 'game-over', events };

  state.pendingWakeTicks++;
  if (state.busy) return { ok: true, events };

  state.busy = true;
  while (state.pendingWakeTicks > 0 && !state.gameOverReason) {
    state.pendingWakeTicks--;
    if (!applyWakeTick(state, events)) break;
  }
  state.busy = false;
  state.selectedId = null;
  state.legalTargets = [];
  state.generationId++;
  return { ok: true, events };
}

/** The clock ran out. Nothing dramatic: you bank what you climbed. */
export function endOnClock(state: GameState): PlyResult {
  const events: PlyEvent[] = [];
  if (state.gameOverReason) return { ok: false, rejected: 'game-over', events };
  endRun(state, 'out-of-time', events);
  state.generationId++;
  return { ok: true, events };
}

/**
 * Distance is king rank only, and it ratchets: the vanguard is camera and feel,
 * never the leaderboard number (G41).
 */
function recordDistance(state: GameState): void {
  const king = playerKing(state);
  if (king && king.rank > state.bestKingRank) state.bestKingRank = king.rank;
}

function bumpStreak(state: GameState, packId: number): number {
  if (packId >= 0 && packId === state.streakPackId) {
    state.streakInPack++;
  } else {
    state.streakPackId = packId;
    state.streakInPack = 1;
  }
  return state.streakInPack;
}

function endRun(state: GameState, reason: GameOverReason, events: PlyEvent[]): void {
  state.gameOverReason = reason;
  state.pendingPromotion = null;
  // Pieces still alive at death are worth a point each. Wake deaths are worth 0 (G43).
  state.score += state.pieces.filter((p) => p.side === 'player').length;
  events.push({ kind: 'game-over', reason });
}

/**
 * Total score = distance (best king rank) + captures + survivors at death.
 * `state.score` holds the captures and the survivor bonus; distance is derived
 * so it can never be farmed twice.
 */
export function totalScore(state: GameState): number {
  return state.score + POINTS_PER_RANK * state.bestKingRank;
}

export function generateVisibleChunks(state: GameState, events: PlyEvent[] = []): void {
  refreshFog(state);
  const top = windowTop(state);
  const first = Math.max(0, Math.floor((state.wakeRank + 1) / CHUNK_SIZE));
  const last = Math.floor(top / CHUNK_SIZE);
  for (let chunk = first; chunk <= last; chunk++) {
    // Only generate a chunk that fits entirely under the window top, or a pack
    // could be placed on a rank the window does not own yet.
    if (chunk * CHUNK_SIZE + CHUNK_SIZE - 1 > top) continue;
    const pack = generateChunk(state, chunk);
    if (pack) {
      events.push({ kind: 'spawn-pack', packId: pack.packId, name: pack.name, count: pack.pieces.length });
    }
  }

  if (!state.lastArmyPlaced && top >= state.lastRank) {
    const army = placeLastArmy(state);
    if (army) {
      events.push({ kind: 'spawn-pack', packId: army.packId, name: army.name, count: army.pieces.length });
    }
  }
}

/** Only a window lives in RAM. Everything behind the wake is already gone (G01). */
export function windowRanks(state: GameState): { from: number; to: number } {
  return { from: state.wakeRank + 1, to: windowTop(state) };
}

export function clone(state: GameState): GameState {
  return {
    ...state,
    pieces: state.pieces.map((p) => ({ ...p })),
    generatedChunks: [...state.generatedChunks],
    legalTargets: state.legalTargets.map((s) => ({ ...s })),
  };
}

function restore(state: GameState, snapshot: GameState): void {
  Object.assign(state, snapshot);
  state.pieces = snapshot.pieces.map((p) => ({ ...p }));
  state.generatedChunks = [...snapshot.generatedChunks];
}

export { FILES, inWindow, vanguardRank };

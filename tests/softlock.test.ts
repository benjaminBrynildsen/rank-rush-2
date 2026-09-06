import { describe, expect, it } from 'vitest';
import { PAWN_PERIOD } from '../src/constants.js';
import { hasAnyLegalMove, inCheck, legalMoves } from '../src/moves.js';
import { playerKing } from '../src/board.js';
import { rearSpawnSquares, spawnAtRear } from '../src/growth.js';
import { checkInvariants } from '../src/invariants.js';
import { createGame, generateVisibleChunks } from '../src/engine.js';
import { autoPlay, bareGame, placeAt, play, playerKingOf, put } from './helpers.js';

/**
 * 12.10 - the board must never be both alive and unplayable.
 *
 * Step 8 of the tick order checks legality after the enemy phase, but the wake
 * and the generator both run after it. Either can take the player's last move
 * away, and a board with no legal move and no ending is a frozen UI.
 */
describe('12.10 a live board always has a move', () => {
  it('G47 - a run never sits in checkmate without ending', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = createGame(seed);
      autoPlay(state, 600, (s) => {
        if (s.gameOverReason) return;
        expect(
          hasAnyLegalMove(s),
          `seed ${seed}: no legal move at ply ${s.moveIndex}, king rank ` +
            `${playerKing(s)?.rank}, check=${inCheck(s)}, but the run is still live`,
        ).toBe(true);
      });

      // And the house player always ran out of board, never out of moves.
      if (!state.gameOverReason) {
        expect(hasAnyLegalMove(state), `seed ${seed}: stalled without an ending`).toBe(true);
      }
    }
  });

  it('G47b - the same holds in Sprint, where the wake lands on the clock', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = createGame(seed, 'sprint');
      autoPlay(state, 200, (s) => {
        if (!s.gameOverReason) expect(hasAnyLegalMove(s)).toBe(true);
      });
    }
  });

  it('G48 - a pack never materialises with the king already in check', () => {
    // Spawn stun stops a fresh pack moving, not checking. A pack that appears
    // giving check is a shotgun the player cannot answer at all.
    for (let seed = 1; seed <= 120; seed++) {
      const state = bareGame(seed);
      state.generatedChunks = [];
      state.lastArmyPlaced = true;
      // A lone king on an open file is the worst case for a spawning slider.
      placeAt(state, playerKingOf(state), 0, 40);
      state.pieces = state.pieces.filter((p) => p.type === 'king');

      generateVisibleChunks(state);
      expect(inCheck(state), `seed ${seed}: a fresh pack spawned into check`).toBe(false);
    }
  });

  it('G48b - packs still arrive: the guard shrinks them, it does not empty them', () => {
    let spawned = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const state = bareGame(seed);
      state.generatedChunks = [];
      state.lastArmyPlaced = true;
      placeAt(state, playerKingOf(state), 0, 40);
      generateVisibleChunks(state);
      spawned += state.pieces.filter((p) => p.side === 'enemy').length;
    }
    expect(spawned).toBeGreaterThan(40 * 3);
  });
});

/**
 * 12.11 - the rear is not unbounded either.
 *
 * The wake pushes the column forward from behind; the last rank stops it from
 * the front. Between them the rear spawn point can be squeezed against the end
 * of the map, and "try one rank further up" runs out of board.
 */
describe('12.11 the rear stays on the map', () => {
  it('G49 - a spawn squeezed against the last rank never lands past it', () => {
    const state = bareGame();
    // Column jammed into the final ranks with the wake right behind it.
    placeAt(state, playerKingOf(state), 7, state.lastRank - 1);
    state.pieces = state.pieces.filter((p) => p.type === 'king');
    put(state, 'player', 'pawn', 6, state.lastRank);
    put(state, 'player', 'pawn', 5, state.lastRank);
    state.wakeRank = state.lastRank - 2;

    for (const square of rearSpawnSquares(state, [])) {
      expect(square.rank).toBeLessThanOrEqual(state.lastRank);
      expect(square.rank).toBeGreaterThan(state.wakeRank);
    }

    // And the spawn itself either fits on the map or is skipped, never both.
    const outcome = spawnAtRear(state, 'pawn');
    if (outcome.piece) {
      expect(outcome.piece.rank).toBeLessThanOrEqual(state.lastRank);
    } else {
      expect(outcome.skipped).toBeTruthy();
    }
  });

  it('G49b - a squeezed column keeps playing instead of throwing', () => {
    const state = bareGame();
    placeAt(state, playerKingOf(state), 7, state.lastRank - 1);
    state.pieces = state.pieces.filter((p) => p.type === 'king');
    put(state, 'player', 'pawn', 6, state.lastRank);
    state.wakeRank = state.lastRank - 3;
    // The next committed move is the one that earns a conscript.
    state.movesUntilPawn = PAWN_PERIOD - 1;

    const king = playerKingOf(state);
    const target = legalMoves(state, king)[0]!;
    expect(() => play(state, king.id, target)).not.toThrow();
    expect(checkInvariants(state)).toEqual([]);
  });
});

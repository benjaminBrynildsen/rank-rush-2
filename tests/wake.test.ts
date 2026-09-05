import { describe, expect, it } from 'vitest';
import { WAKE_PERIOD } from '../src/constants.js';
import { rearSpawnSquares } from '../src/growth.js';
import { move } from '../src/engine.js';
import { bareGame, knightOf, play, playerKingOf, put, sq } from './helpers.js';

describe('12.2 wake', () => {
  it('G05 - the wake only ticks after the full turn, never mid-slide', () => {
    const state = bareGame();
    state.movesUntilWake = WAKE_PERIOD - 1;
    const knight = knightOf(state);
    const result = play(state, knight.id, sq(7, 4));
    expect(result.ok).toBe(true);

    const moveAt = result.events.findIndex((e) => e.kind === 'move');
    const wakeAt = result.events.findIndex((e) => e.kind === 'wake');
    expect(moveAt).toBeGreaterThanOrEqual(0);
    expect(wakeAt).toBeGreaterThan(moveAt);
  });

  it('G06 - a wake that would cover the king ends the run before deleting him', () => {
    const state = bareGame();
    state.wakeRank = 1;
    state.movesUntilWake = WAKE_PERIOD - 1;
    const king = playerKingOf(state);
    const knight = knightOf(state);
    expect(king.rank).toBe(2);

    const result = play(state, knight.id, sq(7, 4));
    expect(result.ok).toBe(true);
    expect(state.gameOverReason).toBe('wake-took-the-king');
    // The king object is still there. Nothing downstream dereferences a ghost.
    expect(state.pieces.some((p) => p.id === king.id)).toBe(true);
  });

  it('G07 - a move naming a piece that is gone is rejected, not crashed', () => {
    const state = bareGame();
    const doomed = put(state, 'player', 'pawn', 0, 4);
    state.selectedId = doomed.id;
    state.pieces = state.pieces.filter((p) => p.id !== doomed.id);

    const result = move(state, { pieceId: doomed.id, to: sq(0, 5), generationId: state.generationId });
    expect(result.ok).toBe(false);
    expect(result.rejected).toBe('no-such-piece');
  });

  it('G08 - a spawn never lands on a rank the next wake tick eats', () => {
    const state = bareGame();
    state.wakeRank = 5;
    const king = playerKingOf(state);
    king.rank = 6;
    const knight = knightOf(state);
    knight.rank = 6;

    const squares = rearSpawnSquares(state, []);
    expect(squares.length).toBeGreaterThan(0);
    for (const square of squares) {
      expect(square.rank).toBeGreaterThan(state.wakeRank + 1);
    }
  });
});

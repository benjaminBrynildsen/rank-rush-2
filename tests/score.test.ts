import { describe, expect, it } from 'vitest';
import { WAKE_PERIOD } from '../src/constants.js';
import { captureValue, CAPTURE_POINTS, POINTS_PER_RANK } from '../src/score.js';
import { createGame, totalScore } from '../src/engine.js';
import { autoPlay, bareGame, knightOf, placeAt, play, playerKingOf, put, sq } from './helpers.js';

describe('12.7 score exploits', () => {
  it('G41 - a queen at rank 500 with the king at 2 still scores rank 2', () => {
    const state = bareGame();
    const king = playerKingOf(state);
    put(state, 'player', 'queen', 0, 2);
    expect(king.rank).toBe(2);
    expect(state.bestKingRank).toBe(2);
    expect(totalScore(state)).toBe(POINTS_PER_RANK * 2);
  });

  it('G41b - distance ratchets on the king and never on the vanguard', () => {
    const state = bareGame();
    const knight = knightOf(state);
    play(state, knight.id, sq(7, 4));
    expect(state.bestKingRank).toBe(2);
  });

  it('G42 - the wake never stops, so a pack cannot be camped', () => {
    const state = createGame(21);
    const before = state.wakeRank;
    autoPlay(state, WAKE_PERIOD * 4);
    expect(state.wakeRank).toBeGreaterThan(before);
  });

  it('G43 - pieces fed to the wake are worth nothing', () => {
    const state = bareGame();
    placeAt(state, playerKingOf(state), 4, 20);
    placeAt(state, knightOf(state), 6, 20);
    const straggler = put(state, 'player', 'pawn', 0, 2);
    state.wakeRank = 1;
    state.movesUntilWake = WAKE_PERIOD - 1;

    const scoreBefore = state.score;
    const result = play(state, knightOf(state).id, sq(7, 22));
    expect(result.ok).toBe(true);
    expect(state.pieces.some((p) => p.id === straggler.id)).toBe(false);
    expect(state.score).toBe(scoreBefore);
    expect(state.fallen).toBe(1);
  });

  it('capture points and the in-pack streak follow section 8', () => {
    expect(CAPTURE_POINTS).toEqual({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 25 });
    expect(captureValue('rook', 1)).toBe(5);
    expect(captureValue('rook', 3)).toBe(5);
    // The 4th take inside one pack is where the streak pays.
    expect(captureValue('rook', 4)).toBe(8);
    expect(captureValue('pawn', 5)).toBe(2);
  });

  it('the streak resets when the next capture comes from a different pack', () => {
    const state = bareGame();
    placeAt(state, playerKingOf(state), 4, 20);
    const knight = placeAt(state, knightOf(state), 4, 22);
    // Hold the enemies still so the test is about the streak and nothing else.
    put(state, 'enemy', 'pawn', 5, 24, { packId: 1, stunned: true });
    put(state, 'enemy', 'pawn', 3, 24, { packId: 2, stunned: true });

    expect(play(state, knight.id, sq(5, 24)).ok).toBe(true);
    expect(state.streakPackId).toBe(1);
    expect(state.streakInPack).toBe(1);

    freeze(state);
    expect(play(state, knight.id, sq(4, 22)).ok).toBe(true);
    freeze(state);
    expect(play(state, knight.id, sq(3, 24)).ok).toBe(true);

    expect(state.streakPackId).toBe(2);
    expect(state.streakInPack).toBe(1);
  });
});

function freeze(state: ReturnType<typeof createGame>): void {
  for (const piece of state.pieces) {
    if (piece.side === 'enemy') piece.stunned = true;
  }
}

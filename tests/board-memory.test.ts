import { describe, expect, it } from 'vitest';
import { RANK_MAX, WINDOW_HEIGHT } from '../src/constants.js';
import { windowTop } from '../src/board.js';
import { legalMoves } from '../src/moves.js';
import { createGame, generateVisibleChunks, move } from '../src/engine.js';
import { autoPlay, bareGame, playerKingOf, put, sq } from './helpers.js';

describe('12.1 board and memory', () => {
  it('G01 - the infinite board never eats RAM: only the window lives in state', () => {
    const state = createGame(7);
    autoPlay(state, 150, (s) => {
      for (const piece of s.pieces) {
        expect(piece.rank).toBeGreaterThan(s.wakeRank);
        expect(piece.rank).toBeLessThanOrEqual(windowTop(s));
      }
    });
    expect(state.pieces.length).toBeLessThan(64);
  });

  it('G02 - rank never overflows: the map ends at RANK_MAX', () => {
    const state = bareGame();
    state.wakeRank = RANK_MAX - 20;
    const king = playerKingOf(state);
    king.file = 4;
    king.rank = RANK_MAX - 1;
    state.pieces = state.pieces.filter((p) => p.type === 'king');
    generateVisibleChunks(state);

    const result = move(state, { pieceId: king.id, to: sq(4, RANK_MAX), generationId: state.generationId });
    expect(result.ok).toBe(true);
    expect(state.gameOverReason).toBe('map-ends');
    expect(king.rank).toBe(RANK_MAX);
  });

  it('G03 - a slider never shoots more than the window height', () => {
    const state = bareGame();
    const rook = put(state, 'player', 'rook', 0, 20);
    for (const target of legalMoves(state, rook)) {
      expect(Math.abs(target.rank - rook.rank)).toBeLessThanOrEqual(WINDOW_HEIGHT);
      expect(Math.abs(target.file - rook.file)).toBeLessThanOrEqual(WINDOW_HEIGHT);
    }
  });

  it('G04 - files clamp, they do not wrap', () => {
    const state = bareGame();
    const bishop = put(state, 'player', 'bishop', 0, 10);
    const targets = legalMoves(state, bishop);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.file).toBeGreaterThanOrEqual(0);
      expect(target.file).toBeLessThan(8);
    }
    // Nothing steps off file 0 and reappears on file 7 one rank up.
    expect(targets.some((t) => t.file === 7 && t.rank === 11)).toBe(false);
  });
});

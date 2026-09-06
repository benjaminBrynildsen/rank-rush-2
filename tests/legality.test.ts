import { describe, expect, it } from 'vitest';
import { hasAnyLegalMove, inCheck, legalMoves } from '../src/moves.js';
import { move } from '../src/engine.js';
import { bareGame, knightOf, placeAt, play, playerKingOf, put, sq } from './helpers.js';

describe('12.4 captures, check, legality', () => {
  it('G21 - no legal safe move ends the run instead of freezing the UI', () => {
    const state = bareGame();
    const king = placeAt(state, playerKingOf(state), 0, 10);
    state.pieces = state.pieces.filter((p) => p.id === king.id);
    state.wakeRank = 9;
    // Boxed in: the wake behind, a rook covering every square ahead.
    put(state, 'enemy', 'rook', 1, 20);
    put(state, 'enemy', 'rook', 0, 20);
    put(state, 'enemy', 'rook', 2, 12);

    expect(hasAnyLegalMove(state)).toBe(false);
  });

  it('G22 - you cannot leave your own king in check and keep looting', () => {
    const state = bareGame();
    const king = placeAt(state, playerKingOf(state), 4, 10);
    const knight = placeAt(state, knightOf(state), 4, 11);
    put(state, 'enemy', 'rook', 4, 16);

    expect(inCheck(state)).toBe(false);
    // Stepping the knight off the file would expose the king: not a legal move.
    const targets = legalMoves(state, knight);
    expect(targets).toHaveLength(0);
    expect(king.rank).toBe(10);
  });

  it('G23 - an escape square inside the wake is not an escape square', () => {
    const state = bareGame();
    const king = placeAt(state, playerKingOf(state), 4, 10);
    state.pieces = state.pieces.filter((p) => p.id === king.id);
    state.wakeRank = 9;

    for (const target of legalMoves(state, king)) {
      expect(target.rank).toBeGreaterThan(state.wakeRank);
    }
    expect(legalMoves(state, king).some((t) => t.rank === 9)).toBe(false);
  });

  it('G24 - a move that was legal on click is rejected if the board moved on', () => {
    const state = bareGame();
    const knight = knightOf(state);
    const stale = state.generationId;
    expect(play(state, knight.id, sq(7, 4)).ok).toBe(true);

    const result = move(state, { pieceId: knight.id, to: sq(6, 6), generationId: stale });
    expect(result.ok).toBe(false);
    expect(result.rejected).toBe('stale-generation');
  });

  it('G25 - king captures buy no immunity: the reply still comes', () => {
    const state = bareGame();
    const king = placeAt(state, playerKingOf(state), 0, 10);
    state.pieces = state.pieces.filter((p) => p.id === king.id);

    // A straggler far behind, so the trophy recruit lands back there instead of
    // accidentally screening the rook.
    put(state, 'player', 'pawn', 3, 6);
    // A free pawn one step ahead, and a rook whose rank is screened by a knight.
    put(state, 'enemy', 'pawn', 0, 11);
    put(state, 'enemy', 'knight', 5, 11);
    put(state, 'enemy', 'rook', 7, 11);

    // Taking the pawn is legal while the knight blocks rank 11.
    const result = play(state, king.id, sq(0, 11));
    expect(result.ok).toBe(true);
    expect(result.events.some((e) => e.kind === 'capture' && e.type === 'pawn')).toBe(true);

    // The board answers. Nothing about a king capture skips the enemy's turn.
    expect(result.events.filter((e) => e.kind === 'enemy-move')).toHaveLength(1);

    // The knight steps off the rank, so the rook now bears on the crown. The
    // king is in check the move after taking, with no protection for having
    // been the one who captured. That is the tax for king-loot.
    expect(inCheck(state)).toBe(true);
    expect(state.gameOverReason).toBeNull();
  });

  it('G26 - capturing the checker is legal when the square is safe afterwards', () => {
    const state = bareGame();
    const king = placeAt(state, playerKingOf(state), 4, 10);
    const knight = placeAt(state, knightOf(state), 3, 9);
    const checker = put(state, 'enemy', 'knight', 5, 12);

    expect(inCheck(state)).toBe(true);
    const targets = legalMoves(state, knight);
    expect(targets.some((t) => t.file === 5 && t.rank === 12)).toBe(false);

    // The king cannot reach it, but a rook on the file can.
    const rook = put(state, 'player', 'rook', 5, 9);
    expect(legalMoves(state, rook).some((t) => t.file === 5 && t.rank === 12)).toBe(true);
    expect(checker.id).toBeGreaterThan(0);
    expect(king.rank).toBe(10);
  });
});

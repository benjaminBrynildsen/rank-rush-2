import { describe, expect, it } from 'vitest';
import { PAWN_PERIOD, PROMO_DISTANCE, WAKE_PERIOD } from '../src/constants.js';
import { isAttacked } from '../src/moves.js';
import { rearSpawnSquares, recruits, spawnAtRear } from '../src/growth.js';
import { move } from '../src/engine.js';
import { at, bareGame, knightOf, placeAt, play, playerKingOf, put, sq } from './helpers.js';

describe('12.3 growth and spawns', () => {
  it('G09 - a full rear rank pushes the recruit one rank up, never into a queue', () => {
    const state = bareGame();
    const king = playerKingOf(state);
    for (let file = 0; file < 8; file++) {
      if (!at(state, file, 2)) put(state, 'player', 'pawn', file, 2);
    }
    const outcome = spawnAtRear(state, 'bishop');
    expect(outcome.piece).toBeDefined();
    expect(outcome.piece!.rank).toBe(3);
    expect(king.rank).toBe(2);
  });

  it('G10 - a recruit never lands on the king or on the piece that just moved', () => {
    const state = bareGame();
    const king = playerKingOf(state);
    const knight = knightOf(state);
    const squares = rearSpawnSquares(state, [
      { file: king.file, rank: king.rank },
      { file: knight.file, rank: knight.rank },
    ]);
    for (const square of squares) {
      expect(square.file === king.file && square.rank === king.rank).toBe(false);
      expect(square.file === knight.file && square.rank === knight.rank).toBe(false);
    }
  });

  it('G11 - a recruit never leaves our own king in check', () => {
    const state = bareGame();
    put(state, 'enemy', 'rook', 0, 9);
    const outcome = spawnAtRear(state, 'rook');
    expect(outcome.piece).toBeDefined();
    const king = playerKingOf(state);
    expect(isAttacked(state, king.file, king.rank, 'enemy')).toBe(false);
  });

  it('G12 - one trophy per ply, never two', () => {
    const state = bareGame();
    put(state, 'enemy', 'pawn', 7, 4);
    const knight = knightOf(state);
    const result = play(state, knight.id, sq(7, 4));
    expect(result.ok).toBe(true);
    expect(result.events.filter((e) => e.kind === 'recruit')).toHaveLength(1);
  });

  it('G13 - a rook that takes a queen brings home nothing', () => {
    expect(recruits('rook', 'queen')).toBe(false);
    expect(recruits('pawn', 'rook')).toBe(false);
    expect(recruits('queen', 'rook')).toBe(false);
    expect(recruits('knight', 'rook')).toBe(true);
    expect(recruits('king', 'pawn')).toBe(true);
  });

  it('G14 - taking a boss king never creates a second player king', () => {
    expect(recruits('knight', 'king')).toBe(false);

    const state = bareGame();
    put(state, 'enemy', 'king', 7, 4);
    const knight = knightOf(state);
    const result = play(state, knight.id, sq(7, 4));

    expect(result.ok).toBe(true);
    expect(result.events.some((e) => e.kind === 'recruit')).toBe(false);
    expect(state.pieces.filter((p) => p.side === 'player' && p.type === 'king')).toHaveLength(1);
  });

  it('G15 - illegal clicks do not move the conscript counter', () => {
    const state = bareGame();
    const knight = knightOf(state);
    for (let i = 0; i < 20; i++) {
      const result = move(state, { pieceId: knight.id, to: sq(0, 7), generationId: state.generationId });
      expect(result.ok).toBe(false);
      expect(result.rejected).toBe('illegal-move');
    }
    expect(state.movesUntilPawn).toBe(0);
    expect(state.moveIndex).toBe(0);
  });

  it('G16 - a promotion never stays pending across the enemy phase or a wake tick', () => {
    const state = bareGame();
    state.movesUntilWake = WAKE_PERIOD - 1;
    const pawn = put(state, 'player', 'pawn', 0, 10, { originRank: 3, neverMoved: false });
    const result = play(state, pawn.id, sq(0, 11));

    expect(result.ok).toBe(true);
    expect(state.pendingPromotion).toBeNull();
    const promoAt = result.events.findIndex((e) => e.kind === 'promotion');
    const wakeAt = result.events.findIndex((e) => e.kind === 'wake');
    expect(promoAt).toBeGreaterThanOrEqual(0);
    expect(wakeAt).toBeGreaterThan(promoAt);
  });

  it('G16b - a promotion with no choice defaults to knight', () => {
    const state = bareGame();
    const pawn = put(state, 'player', 'pawn', 0, 10, { originRank: 3, neverMoved: false });
    play(state, pawn.id, sq(0, 11));
    expect(pawn.type).toBe('knight');
  });

  it('G17 - the board never floods with queens', () => {
    const state = bareGame();
    const first = put(state, 'player', 'pawn', 0, 10, { originRank: 3, neverMoved: false });
    play(state, first.id, sq(0, 11), 'queen');
    expect(first.type).toBe('queen');

    const second = put(state, 'player', 'pawn', 2, 10, { originRank: 3, neverMoved: false });
    play(state, second.id, sq(2, 11), 'queen');
    expect(second.type).toBe('knight');
    expect(state.pieces.filter((p) => p.side === 'player' && p.type === 'queen')).toHaveLength(1);
  });

  it('G18 - a pawn can never become a king', () => {
    const state = bareGame();
    expect(spawnAtRear(state, 'king').piece).toBeUndefined();
    expect(spawnAtRear(state, 'king').skipped).toMatch(/second king/);
  });

  it('G19 - every pawn write sets originRank, so recruits still promote', () => {
    const state = bareGame();
    const outcome = spawnAtRear(state, 'pawn');
    expect(outcome.piece).toBeDefined();
    expect(outcome.piece!.originRank).toBe(outcome.piece!.rank);
    expect(outcome.piece!.neverMoved).toBe(true);
  });

  it('G20 - the conscript arrives on move 8 and the wake keeps coming', () => {
    const state = bareGame();
    // Park the column well ahead of the wake so the shuffle is not lethal.
    const king = placeAt(state, playerKingOf(state), 4, 20);
    const knight = placeAt(state, knightOf(state), 6, 20);
    expect(king.rank).toBe(20);
    // Shuffle the knight back and forth: standing still is not a move you can make.
    const squares = [sq(7, 22), sq(6, 20), sq(7, 22), sq(6, 20), sq(7, 22), sq(6, 20), sq(7, 22), sq(6, 20)];
    for (const target of squares) {
      const result = play(state, knight.id, target);
      expect(result.ok).toBe(true);
    }
    expect(state.moveIndex).toBe(PAWN_PERIOD);
    expect(state.movesUntilPawn).toBe(0);
    expect(state.pieces.filter((p) => p.side === 'player' && p.type === 'pawn')).toHaveLength(1);
    expect(state.wakeRank).toBe(Math.floor(PAWN_PERIOD / WAKE_PERIOD));
  });

  it('a pawn promotes exactly PROMO_DISTANCE ranks from where it was born', () => {
    const state = bareGame();
    const pawn = put(state, 'player', 'pawn', 0, 4);
    expect(pawn.originRank).toBe(4);
    play(state, pawn.id, sq(0, 5));
    expect(pawn.type).toBe('pawn');
    expect(pawn.originRank + PROMO_DISTANCE).toBe(12);
  });
});

import { describe, expect, it } from 'vitest';
import { FILES, PAWN_PERIOD, WAKE_PERIOD } from '../src/constants.js';
import { checkInvariants } from '../src/invariants.js';
import { createGame, START_KING, START_KNIGHT, move, targetsFor, wouldPromote } from '../src/engine.js';
import { autoPlay, bareGame, knightOf, play, playerKingOf, put, sq } from './helpers.js';

describe('section 5 - the locked start', () => {
  it('opens with a king on e2 and a knight on g2, and nothing else', () => {
    const state = createGame(1);
    const friendly = state.pieces.filter((p) => p.side === 'player');
    expect(friendly).toHaveLength(2);
    expect(friendly.map((p) => p.type).sort()).toEqual(['king', 'knight']);

    const king = playerKingOf(state);
    expect([king.file, king.rank]).toEqual([START_KING.file, START_KING.rank]);
    const knight = knightOf(state);
    expect([knight.file, knight.rank]).toEqual([START_KNIGHT.file, START_KNIGHT.rank]);
  });

  it('leaves rank 1 empty so the first wake tick is not instantly lethal', () => {
    const state = createGame(1);
    expect(state.pieces.some((p) => p.rank === 1)).toBe(false);
    expect(state.wakeRank).toBe(0);
  });

  it('is eight files wide with no wrap', () => {
    expect(FILES).toBe(8);
    const state = createGame(1);
    for (const piece of state.pieces) {
      expect(piece.file).toBeGreaterThanOrEqual(0);
      expect(piece.file).toBeLessThan(FILES);
    }
  });
});

describe('section 9 - the tick order', () => {
  it('resolves capture, then recruit, then conscript, then the enemy phase, then the wake', () => {
    const state = bareGame();
    state.movesUntilPawn = PAWN_PERIOD - 1;
    state.movesUntilWake = WAKE_PERIOD - 1;
    put(state, 'enemy', 'pawn', 7, 4);

    const knight = knightOf(state);
    const result = play(state, knight.id, sq(7, 4));
    expect(result.ok).toBe(true);

    const order = result.events.map((e) => e.kind);
    expect(order.indexOf('capture')).toBeLessThan(order.indexOf('recruit'));
    expect(order.indexOf('recruit')).toBeLessThan(order.indexOf('conscript'));
    expect(order.indexOf('conscript')).toBeLessThan(order.indexOf('wake'));
  });

  it('bumps the generation only on a committed move', () => {
    const state = bareGame();
    const knight = knightOf(state);
    const generationId = state.generationId;

    expect(move(state, { pieceId: knight.id, to: sq(0, 7), generationId }).ok).toBe(false);
    expect(state.generationId).toBe(generationId);

    expect(move(state, { pieceId: knight.id, to: sq(7, 4), generationId }).ok).toBe(true);
    expect(state.generationId).toBe(generationId + 1);
  });

  it('clears busy and the selection once the ply is done', () => {
    const state = bareGame();
    const knight = knightOf(state);
    state.selectedId = knight.id;
    play(state, knight.id, sq(7, 4));
    expect(state.busy).toBe(false);
    expect(state.selectedId).toBeNull();
    expect(state.legalTargets).toEqual([]);
  });
});

describe('section 11 - invariants hold every tick', () => {
  it('a fresh board is clean', () => {
    expect(checkInvariants(createGame(2))).toEqual([]);
  });

  it('stay clean across a long run on many seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = createGame(seed);
      autoPlay(state, 120, (s) => {
        const problems = checkInvariants(s);
        expect(problems, `seed ${seed}: ${problems.join('; ')}`).toEqual([]);
      });
    }
  });

  it('a run always ends for a reason we named', () => {
    const reasons = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const state = createGame(seed);
      autoPlay(state, 400);
      if (state.gameOverReason) reasons.add(state.gameOverReason);
    }
    expect(reasons.size).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(['king-captured', 'no-legal-move', 'wake-took-the-king', 'map-ends']).toContain(reason);
    }
  });
});

describe('the UI contract', () => {
  it('targetsFor only ever offers legal squares', () => {
    const state = createGame(6);
    const king = playerKingOf(state);
    for (const target of targetsFor(state, king.id)) {
      expect(move({ ...state, pieces: state.pieces.map((p) => ({ ...p })) }, {
        pieceId: king.id,
        to: target,
        generationId: state.generationId,
      }).ok).toBe(true);
    }
  });

  it('wouldPromote warns before the move is committed, so no dialog outlives a ply', () => {
    const state = bareGame();
    const pawn = put(state, 'player', 'pawn', 0, 10, { originRank: 3, neverMoved: false });
    expect(wouldPromote(state, pawn.id, sq(0, 11))).toBe(true);
    expect(wouldPromote(state, pawn.id, sq(0, 10))).toBe(false);
    expect(wouldPromote(state, knightOf(state).id, sq(7, 4))).toBe(false);
  });
});

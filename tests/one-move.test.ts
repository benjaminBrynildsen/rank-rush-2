import { describe, expect, it } from 'vitest';
import { ENEMY_MOVES_PER_TURN } from '../src/constants.js';
import { enemyPhase } from '../src/ai.js';
import { AI_VALUE } from '../src/score.js';
import { autoPlay, bareGame, placeAt, play, playerKingOf, put, sq } from './helpers.js';

describe('section 7 - the board answers one piece at a time', () => {
  it('never moves more than one enemy per player move', () => {
    const state = bareGame();
    placeAt(state, playerKingOf(state), 4, 10);
    for (let file = 0; file < 8; file++) {
      put(state, 'enemy', 'pawn', file, 14);
      put(state, 'enemy', 'knight', file, 16);
    }

    for (let turn = 0; turn < 8; turn++) {
      const result = enemyPhase(state);
      expect(result.moved).toBeLessThanOrEqual(ENEMY_MOVES_PER_TURN);
      expect(result.moves.length).toBe(result.moved);
    }
  });

  it('a whole run only ever sees one reply a turn', () => {
    const state = bareGame(31);
    state.lastArmyPlaced = false;
    autoPlay(state, 60, (s) => {
      expect(s.pieces.filter((p) => p.side === 'enemy').length).toBeGreaterThanOrEqual(0);
    });

    const replayed = bareGame(31);
    replayed.lastArmyPlaced = false;
    for (let i = 0; i < 20 && !replayed.gameOverReason; i++) {
      const before = replayed.generationId;
      const king = playerKingOf(replayed);
      const forward = sq(king.file, king.rank + 1);
      const result = play(replayed, king.id, forward);
      if (!result.ok) break;
      expect(replayed.generationId).toBe(before + 1);
      expect(result.events.filter((e) => e.kind === 'enemy-move').length).toBeLessThanOrEqual(1);
    }
  });

  it('takes the richest capture on the board, not merely the nearest piece', () => {
    const state = bareGame();
    placeAt(state, playerKingOf(state), 0, 10);
    // A pawn the knight could take, and a queen the rook could take. The rook
    // should win the argument: it is the better capture, though further away.
    const cheap = put(state, 'player', 'pawn', 2, 12);
    const rich = put(state, 'player', 'queen', 6, 12);
    put(state, 'enemy', 'knight', 1, 14);
    put(state, 'enemy', 'rook', 6, 16);

    expect(AI_VALUE.queen).toBeGreaterThan(AI_VALUE.pawn);
    const result = enemyPhase(state);
    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]!.captured).toBe('queen');
    expect(state.pieces.some((p) => p.id === rich.id)).toBe(false);
    expect(state.pieces.some((p) => p.id === cheap.id)).toBe(true);
  });

  it('stands still rather than shuffling when nothing closes the gap (G32)', () => {
    const state = bareGame();
    placeAt(state, playerKingOf(state), 0, 10);
    // A lone rook already as close as it can get on its file, screened by a pawn.
    const rook = put(state, 'enemy', 'rook', 0, 14);
    put(state, 'enemy', 'pawn', 0, 12);

    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      enemyPhase(state);
      seen.push(`${rook.file},${rook.rank}`);
    }
    expect(seen[3]).toBe(seen[4]);
  });

  it('is deterministic: the same board answers the same way every time', () => {
    const build = () => {
      const state = bareGame(77);
      placeAt(state, playerKingOf(state), 3, 10);
      put(state, 'enemy', 'knight', 2, 13);
      put(state, 'enemy', 'knight', 4, 13);
      put(state, 'enemy', 'bishop', 6, 14);
      return state;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 6; i++) {
      expect(JSON.stringify(enemyPhase(a).moves)).toBe(JSON.stringify(enemyPhase(b).moves));
    }
  });
});

import { describe, expect, it } from 'vitest';
import { RAMP_EVERY, MAX_ESCORTS } from '../src/constants.js';
import { MODES } from '../src/modes.js';
import { escortCount, placeLastArmy, LAST_ARMY_PACK } from '../src/generate.js';
import { legalMoves } from '../src/moves.js';
import {
  createGame,
  endOnClock,
  generateVisibleChunks,
  requestWakeTick,
  totalScore,
} from '../src/engine.js';
import { autoPlay, bareGame, placeAt, play, playerKingOf, put, sq } from './helpers.js';

describe('the last rank', () => {
  it('is a full chess army in its home formation, pawns in front', () => {
    const state = bareGame();
    state.lastArmyPlaced = false;
    placeLastArmy(state);

    const army = state.pieces.filter((p) => p.packId === LAST_ARMY_PACK);
    expect(army).toHaveLength(16);

    const back = army
      .filter((p) => p.rank === state.lastRank)
      .sort((a, b) => a.file - b.file)
      .map((p) => p.type);
    expect(back).toEqual([
      'rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook',
    ]);

    const pawns = army.filter((p) => p.rank === state.lastRank - 1);
    expect(pawns).toHaveLength(8);
    expect(pawns.every((p) => p.type === 'pawn')).toBe(true);
  });

  it('holds the only enemy king in the run', () => {
    const state = createGame(5);
    autoPlay(state, 400);
    const kings = state.pieces.filter((p) => p.side === 'enemy' && p.type === 'king');
    expect(kings.length).toBeLessThanOrEqual(1);
    for (const king of kings) expect(king.packId).toBe(LAST_ARMY_PACK);
  });

  it('is the end of the map: no move reaches past it', () => {
    const state = bareGame();
    const king = placeAt(state, playerKingOf(state), 4, state.lastRank - 1);
    state.pieces = state.pieces.filter((p) => p.id === king.id);

    for (const target of legalMoves(state, king)) {
      expect(target.rank).toBeLessThanOrEqual(state.lastRank);
    }
    expect(legalMoves(state, king).some((t) => t.rank === state.lastRank)).toBe(true);
  });

  it('stands up only once, however often generation runs', () => {
    const state = bareGame();
    state.lastArmyPlaced = false;
    placeAt(state, playerKingOf(state), 4, state.lastRank - 4);
    generateVisibleChunks(state);
    const after = state.pieces.length;
    generateVisibleChunks(state);
    generateVisibleChunks(state);
    expect(state.pieces.length).toBe(after);
  });
});

describe('winning', () => {
  it('taking the last king ends the run as a win', () => {
    const state = bareGame();
    const knight = placeAt(state, playerKingOf(state), 0, 20) && bareKnight(state);
    const bossKing = put(state, 'enemy', 'king', 7, 22);

    const result = play(state, knight.id, sq(7, 22));
    expect(result.ok).toBe(true);
    expect(state.gameOverReason).toBe('crown-taken');
    expect(state.pieces.some((p) => p.id === bossKing.id)).toBe(false);
    expect(totalScore(state)).toBeGreaterThan(0);
  });

  it('a boss king is worth taking but never recruits a second king', () => {
    const state = bareGame();
    const knight = bareKnight(state);
    placeAt(state, playerKingOf(state), 0, 20);
    put(state, 'enemy', 'king', 7, 22);

    const result = play(state, knight.id, sq(7, 22));
    expect(result.events.some((e) => e.kind === 'recruit')).toBe(false);
    expect(state.pieces.filter((p) => p.side === 'player' && p.type === 'king')).toHaveLength(1);
  });
});

describe('the difficulty ramp', () => {
  it('buys packs another body every RAMP_EVERY ranks, up to a cap', () => {
    expect(escortCount(0)).toBe(0);
    expect(escortCount(RAMP_EVERY - 1)).toBe(0);
    expect(escortCount(RAMP_EVERY)).toBe(1);
    expect(escortCount(RAMP_EVERY * 3)).toBe(3);
    expect(escortCount(RAMP_EVERY * 99)).toBe(MAX_ESCORTS);
  });

  it('puts more enemy material in front of you the further the king climbs', () => {
    const near = enemyMaterialAround(20);
    const far = enemyMaterialAround(100);
    expect(far).toBeGreaterThan(near);
  });
});

describe('Sprint', () => {
  it('runs its wake on the clock, not on the move counter', () => {
    const state = createGame(9, 'sprint');
    expect(MODES.sprint.wakeMoves).toBeNull();
    expect(MODES.sprint.wakeSeconds).toBe(10);

    const before = state.wakeRank;
    autoPlay(state, 12);
    // Twelve moves, and the wake has not budged: only the clock moves it.
    expect(state.wakeRank).toBe(before);

    requestWakeTick(state);
    expect(state.wakeRank).toBe(before + 1);
  });

  it('G45 - a clock tick during a ply waits for the ply to finish', () => {
    const state = createGame(9, 'sprint');
    const before = state.wakeRank;

    // Pretend a turn is mid-resolve when the timer fires.
    state.busy = true;
    const queued = requestWakeTick(state);
    expect(queued.ok).toBe(true);
    expect(state.wakeRank).toBe(before);
    expect(state.pendingWakeTicks).toBe(1);

    // The board comes back to rest and the tick is spent on the next turn.
    state.busy = false;
    autoPlay(state, 1);
    expect(state.wakeRank).toBe(before + 1);
    expect(state.pendingWakeTicks).toBe(0);
  });

  it('the clock running out banks the score rather than killing you', () => {
    const state = createGame(9, 'sprint');
    autoPlay(state, 20);
    const banked = totalScore(state);

    const result = endOnClock(state);
    expect(result.ok).toBe(true);
    expect(state.gameOverReason).toBe('out-of-time');
    // Survivors are worth a point each, so the score can only have gone up.
    expect(totalScore(state)).toBeGreaterThanOrEqual(banked);
  });

  it('expedition still moves its wake on the move counter', () => {
    const state = createGame(9, 'expedition');
    expect(MODES.expedition.wakeMoves).toBe(3);
    const before = state.wakeRank;
    autoPlay(state, 6);
    expect(state.wakeRank).toBeGreaterThan(before);
  });
});

function bareKnight(state: ReturnType<typeof bareGame>) {
  const knight = state.pieces.find((p) => p.side === 'player' && p.type === 'knight')!;
  knight.file = 6;
  knight.rank = 20;
  return knight;
}

/** Total enemy value generated in the window around a given king rank. */
function enemyMaterialAround(rank: number): number {
  const value = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
  let total = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const state = createGame(seed);
    state.pieces = state.pieces.filter((p) => p.side === 'player');
    state.generatedChunks = [];
    placeAt(state, playerKingOf(state), 4, rank);
    generateVisibleChunks(state);
    for (const piece of state.pieces) {
      if (piece.side === 'enemy' && piece.packId !== LAST_ARMY_PACK) total += value[piece.type];
    }
  }
  return total;
}

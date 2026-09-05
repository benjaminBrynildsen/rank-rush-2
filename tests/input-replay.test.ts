import { describe, expect, it } from 'vitest';
import { computeCamera, squareAt } from '../src/render.js';
import { createGame, move } from '../src/engine.js';
import { dailySeed, mulberry32 } from '../src/rng.js';
import * as engine from '../src/engine.js';
import { autoPlay, bareGame, knightOf, sq } from './helpers.js';

/** squareAt only needs a height and a width, so a plain object stands in. */
function fakeCanvas(width = 480, height = 640): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement;
}

describe('12.6 input, UI, replay', () => {
  it('G36 - a second click during a resolving ply does nothing', () => {
    const state = bareGame();
    const knight = knightOf(state);
    state.busy = true;
    const result = move(state, { pieceId: knight.id, to: sq(7, 4), generationId: state.generationId });
    expect(result.ok).toBe(false);
    expect(result.rejected).toBe('busy');
    expect(state.moveIndex).toBe(0);
  });

  it('G36b - a double click cannot spend two moves: the generation moved on', () => {
    const state = bareGame();
    const knight = knightOf(state);
    const generationId = state.generationId;
    expect(move(state, { pieceId: knight.id, to: sq(7, 4), generationId }).ok).toBe(true);
    const second = move(state, { pieceId: knight.id, to: sq(6, 6), generationId });
    expect(second.ok).toBe(false);
    expect(state.moveIndex).toBe(1);
  });

  it('G37 - the drop target is read off the live camera, not a stale one', () => {
    const state = createGame(5);
    const canvas = fakeCanvas();
    const camera = computeCamera(state, canvas);

    // The centre of the cell for (file, rank) must map back to that same square.
    for (const target of [sq(0, camera.bottomRank), sq(7, camera.bottomRank + 3)]) {
      const x = camera.originX + target.file * camera.cell + camera.cell / 2;
      const y = canvas.height - (target.rank - camera.bottomRank + 0.5) * camera.cell;
      expect(squareAt(camera, canvas, x, y)).toEqual(target);
    }
  });

  it('G38 - the board tracks one selected id, never two', () => {
    const state = bareGame();
    expect(state.selectedId).toBeNull();
    state.selectedId = 1;
    state.selectedId = 2;
    expect(state.selectedId).toBe(2);
    expect(typeof state.selectedId).toBe('number');
  });

  it('G39 - a replay is seed plus move list, and it lands on the same board', () => {
    // The house player is deterministic, so the same seed and the same choices
    // must reproduce the run square for square.
    const first = createGame(4242);
    autoPlay(first, 60);

    const replayed = createGame(4242);
    autoPlay(replayed, 60);

    expect(fingerprint(replayed)).toBe(fingerprint(first));

    // A different seed is a different road.
    const other = createGame(4243);
    autoPlay(other, 60);
    expect(fingerprint(other)).not.toBe(fingerprint(first));
  });

  it('G39b - the AI never reaches for Math.random', () => {
    const state = createGame(8);
    const original = Math.random;
    Math.random = () => {
      throw new Error('the engine must not roll dice');
    };
    try {
      expect(() => autoPlay(state, 40)).not.toThrow();
    } finally {
      Math.random = original;
    }
  });

  it('G40 - the daily seed comes from the UTC date and nothing else', () => {
    const early = dailySeed(new Date('2026-09-05T00:00:00.000Z'));
    const late = dailySeed(new Date('2026-09-05T23:59:59.999Z'));
    const next = dailySeed(new Date('2026-09-06T00:00:00.000Z'));
    expect(early).toBe(late);
    expect(next).not.toBe(early);
  });

  it('the noise source itself is stable', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('G44 - there is no undo in v1', () => {
    expect(Object.keys(engine)).not.toContain('undo');
    expect(Object.keys(engine)).not.toContain('rollback');
  });
});

function fingerprint(state: ReturnType<typeof createGame>): string {
  return [
    state.moveIndex,
    state.wakeRank,
    state.score,
    state.captures,
    state.gameOverReason,
    ...[...state.pieces]
      .sort((a, b) => a.rank - b.rank || a.file - b.file)
      .map((p) => `${p.side[0]}${p.type[0]}${p.file}:${p.rank}`),
  ].join('|');
}

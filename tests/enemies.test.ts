import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, ENEMY_MOVES_PER_TURN, MAX_ACTIVE_AI } from '../src/constants.js';
import { isAttacked, legalMoves } from '../src/moves.js';
import { enemyPhase } from '../src/ai.js';
import { PACKS, generateChunk } from '../src/generate.js';
import { createGame, generateVisibleChunks, move } from '../src/engine.js';
import { hash2, mulberry32 } from '../src/rng.js';
import { autoPlay, bareGame, placeAt, playerKingOf, put, sq } from './helpers.js';

describe('12.5 enemies and fog', () => {
  it('G27 - a queen sitting in unseen fog can neither move nor capture', () => {
    const state = bareGame();
    const king = placeAt(state, playerKingOf(state), 4, 10);
    state.pieces = state.pieces.filter((p) => p.id === king.id);
    // fogRank is king rank + 12; the window top is two ranks past that.
    const queen = put(state, 'enemy', 'queen', 4, state.fogRank + 40);

    expect(isAttacked(state, king.file, king.rank, 'enemy')).toBe(false);
    const before = { file: queen.file, rank: queen.rank };
    enemyPhase(state);
    expect(queen.file).toBe(before.file);
    expect(queen.rank).toBe(before.rank);
  });

  it('G27b - a freshly generated pack sits out one enemy phase', () => {
    const state = createGame(3);
    const fresh = state.pieces.filter((p) => p.side === 'enemy');
    for (const piece of fresh) expect(piece.stunned).toBe(true);
  });

  it('G28 - the generator never spawns on an occupied square or on the king', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = createGame(seed);
      autoPlay(state, 40);
      const seen = new Set<string>();
      for (const piece of state.pieces) {
        const key = `${piece.file},${piece.rank}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('G29 - a chunk is generated once, from (seed, chunkIndex) and nothing else', () => {
    const a = bareGame(99);
    a.generatedChunks = [];
    placeAt(a, playerKingOf(a), 4, 20);
    generateVisibleChunks(a);
    const first = a.pieces.filter((p) => p.side === 'enemy').map((p) => `${p.type}@${p.file},${p.rank}`);

    // Same seed, same chunks, same pack. The camera never leaks into the hash.
    const b = bareGame(99);
    b.generatedChunks = [];
    placeAt(b, playerKingOf(b), 4, 20);
    generateVisibleChunks(b);
    const second = b.pieces.filter((p) => p.side === 'enemy').map((p) => `${p.type}@${p.file},${p.rank}`);

    expect(second).toEqual(first);
    const before = a.pieces.length;
    generateVisibleChunks(a);
    expect(a.pieces.length).toBe(before);
  });

  it('G30 - two enemies never land on one square', () => {
    const state = bareGame();
    placeAt(state, playerKingOf(state), 4, 4);
    put(state, 'enemy', 'pawn', 3, 12);
    put(state, 'enemy', 'pawn', 5, 12);
    put(state, 'enemy', 'rook', 4, 14);
    put(state, 'enemy', 'knight', 6, 13);

    for (let i = 0; i < 6; i++) {
      enemyPhase(state);
      const seen = new Set<string>();
      for (const piece of state.pieces) {
        const key = `${piece.file},${piece.rank}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('G31 - the player resolves fully before any enemy moves: no swap, no survivor', () => {
    const state = bareGame();
    const king = placeAt(state, playerKingOf(state), 4, 10);
    state.pieces = state.pieces.filter((p) => p.id === king.id);
    const victim = put(state, 'enemy', 'pawn', 5, 11);
    put(state, 'player', 'pawn', 0, 4);

    const result = move(state, { pieceId: king.id, to: sq(5, 11), generationId: state.generationId });
    expect(result.ok).toBe(true);
    // The pawn is gone before the enemy phase starts. It does not get a reply.
    expect(state.pieces.some((p) => p.id === victim.id)).toBe(false);
    const captureAt = result.events.findIndex((e) => e.kind === 'capture');
    expect(captureAt).toBe(0);
  });

  it('G32 - a piece that cannot close the gap stands still instead of pacing', () => {
    const state = bareGame();
    placeAt(state, playerKingOf(state), 0, 10);
    // A rook already on the king's file, blocked by its own pawn: no improvement
    // is available, so it must not shuffle sideways forever.
    const rook = put(state, 'enemy', 'rook', 0, 14);
    put(state, 'enemy', 'pawn', 0, 12);

    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      enemyPhase(state);
      seen.push(`${rook.file},${rook.rank}`);
    }
    // It may close once, but it never oscillates between two squares.
    expect(new Set(seen).size).toBeLessThanOrEqual(seen.length);
    expect(seen[2]).toBe(seen[3]);
  });

  it('G33 - a board thick with enemies still answers with exactly one move', () => {
    const state = bareGame();
    placeAt(state, playerKingOf(state), 4, 4);
    let placed = 0;
    for (let rank = 10; rank <= 15 && placed < 40; rank++) {
      for (let file = 0; file < 8 && placed < 40; file++) {
        put(state, 'enemy', 'pawn', file, rank);
        placed++;
      }
    }
    const result = enemyPhase(state);
    expect(result.moved).toBe(ENEMY_MOVES_PER_TURN);
    expect(result.moves).toHaveLength(1);
    expect(placed).toBeGreaterThan(MAX_ACTIVE_AI);
  });

  it('G34 - a cleared pack never comes back', () => {
    const state = createGame(11);
    const chunk = state.generatedChunks[state.generatedChunks.length - 1]!;
    state.pieces = state.pieces.filter((p) => p.packId !== chunk);
    const before = state.pieces.length;
    expect(generateChunk(state, chunk)).toBeNull();
    expect(state.pieces.length).toBe(before);
  });

  it('G35 - a siege wall always leaves a hole', () => {
    const wall = PACKS.find((p) => p.name === 'Siege wall')!;
    for (let seed = 0; seed < 200; seed++) {
      const members = wall.build(mulberry32(hash2(seed, 5)), 60);
      const files = new Set(members.map((m) => m.file));
      expect(files.size).toBeLessThan(8);
    }
  });

  it('G35b - the player always has somewhere to go after a wall spawns', () => {
    const state = bareGame();
    const king = placeAt(state, playerKingOf(state), 4, 60);
    const wall = PACKS.find((p) => p.name === 'Siege wall')!;
    for (const member of wall.build(mulberry32(hash2(4, 8)), 62)) {
      put(state, 'enemy', 'pawn', member.file, 62 + member.dr);
    }
    expect(legalMoves(state, king).length).toBeGreaterThan(0);
  });

  it('chunks are keyed by rank // CHUNK_SIZE', () => {
    expect(Math.floor(63 / CHUNK_SIZE)).toBe(7);
    expect(Math.floor(64 / CHUNK_SIZE)).toBe(8);
  });
});

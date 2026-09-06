/** Same seed + same move list must land on the same board, every time. */
import { createGame, move, requestWakeTick, totalScore } from '../src/engine.js';
import { legalMoves } from '../src/moves.js';
import { mulberry32 } from '../src/rng.js';
import type { GameState } from '../src/types.js';
import type { ModeId } from '../src/modes.js';

function fingerprint(state: GameState): string {
  return [
    state.moveIndex, state.wakeRank, state.fogRank, state.score, state.captures,
    state.fallen, state.bestKingRank, state.gameOverReason, state.generatedChunks.length,
    ...[...state.pieces].sort((a, b) => a.rank - b.rank || a.file - b.file)
      .map((p) => `${p.side[0]}${p.type[0]}${p.file}:${p.rank}:${p.originRank}:${p.stunned ? 1 : 0}`),
  ].join('|');
}

function play(seed: number, mode: ModeId, plies: number): { fp: string; score: number } {
  const rng = mulberry32(seed * 2654435761);
  const state = createGame(seed, mode);
  for (let n = 0; n < plies && !state.gameOverReason; n++) {
    const movers = state.pieces.filter((p) => p.side === 'player')
      .map((p) => ({ p, opts: legalMoves(state, p) })).filter((m) => m.opts.length > 0);
    if (!movers.length) break;
    const all = movers.flatMap((m) => m.opts.map((o) => ({ m, o })));
    const fwd = all.filter((c) => c.o.rank > c.m.p.rank);
    const pool = fwd.length && rng() < 0.8 ? fwd : all;
    const c = pool[Math.floor(rng() * pool.length)]!;
    if (!move(state, { pieceId: c.m.p.id, to: c.o, promo: 'queen', generationId: state.generationId }).ok) break;
    if (mode === 'sprint' && n % 7 === 0) requestWakeTick(state);
  }
  return { fp: fingerprint(state), score: totalScore(state) };
}

let mismatches = 0;
for (const mode of ['expedition', 'sprint'] as ModeId[]) {
  for (let seed = 1; seed <= 150; seed++) {
    const a = play(seed, mode, 250);
    const b = play(seed, mode, 250);
    const c = play(seed, mode, 250);
    if (a.fp !== b.fp || a.fp !== c.fp) {
      mismatches++;
      console.log(`MISMATCH ${mode} seed ${seed}`);
    }
  }
}
// And a different seed must genuinely be a different road.
const distinct = new Set<string>();
for (let seed = 1; seed <= 60; seed++) distinct.add(play(seed, 'expedition', 120).fp);
console.log(`determinism: ${mismatches} mismatches over 300 replays`);
console.log(`distinct boards from 60 seeds: ${distinct.size}`);

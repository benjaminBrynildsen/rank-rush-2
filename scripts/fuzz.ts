/** Uniformly-random legal play, with random promotions and interleaved clock ticks. */
import { createGame, endOnClock, move, requestWakeTick, totalScore } from '../src/engine.js';
import { hasAnyLegalMove, legalMoves } from '../src/moves.js';
import { checkInvariants } from '../src/invariants.js';
import { MODES, type ModeId } from '../src/modes.js';
import { mulberry32 } from '../src/rng.js';
import type { GameState, PromoType } from '../src/types.js';

const PROMOS: PromoType[] = ['knight', 'bishop', 'rook', 'queen'];
const runs = Number(process.argv[2] ?? 300);
const mode = (process.argv[3] ?? 'expedition') as ModeId;

const problems: string[] = [];
const reasons = new Map<string, number>();
let plies = 0;
let worstMs = 0;

for (let seed = 1; seed <= runs; seed++) {
  const rng = mulberry32(seed * 2654435761);
  const state: GameState = createGame(seed, mode);
  let n = 0;

  try {
    while (!state.gameOverReason && n < 1500) {
      const movers = state.pieces
        .filter((p) => p.side === 'player')
        .map((p) => ({ p, opts: legalMoves(state, p) }))
        .filter((m) => m.opts.length > 0);

      if (movers.length === 0) {
        if (!state.gameOverReason) problems.push(`seed ${seed}: no legal move but run is live`);
        break;
      }

      // Pure random play never advances the king, so the wake ends every run in
      // a handful of plies and nothing deep is ever reached. Bias toward
      // progress most of the time, and stay random the rest.
      let pickMover = movers[Math.floor(rng() * movers.length)]!;
      let to = pickMover.opts[Math.floor(rng() * pickMover.opts.length)]!;

      if (rng() < 0.75) {
        const forward = movers
          .flatMap((m) => m.opts.map((o) => ({ m, o })))
          .filter((c) => c.o.rank > c.m.p.rank);
        const captures = forward.filter((c) =>
          state.pieces.some((q) => q.side === 'enemy' && q.file === c.o.file && q.rank === c.o.rank),
        );
        const pool = captures.length && rng() < 0.6 ? captures : forward;
        if (pool.length) {
          const chosen = pool[Math.floor(rng() * pool.length)]!;
          pickMover = chosen.m;
          to = chosen.o;
        }
      }
      const promo = PROMOS[Math.floor(rng() * PROMOS.length)]!;

      const t0 = performance.now();
      const result = move(state, { pieceId: pickMover.p.id, to, promo, generationId: state.generationId });
      worstMs = Math.max(worstMs, performance.now() - t0);

      if (!result.ok) {
        problems.push(`seed ${seed}: legalMoves offered a move the engine rejected (${result.rejected})`);
        break;
      }
      n++;

      const bad = checkInvariants(state);
      if (bad.length) problems.push(`seed ${seed} ply ${n}: ${bad.join('; ')}`);
      if (!state.gameOverReason && !hasAnyLegalMove(state)) {
        problems.push(`seed ${seed} ply ${n}: live board with no legal move`);
        break;
      }

      // In a timed mode, fire the clock at random moments including mid-run.
      if (MODES[mode].wakeSeconds !== null && rng() < 0.25) requestWakeTick(state);
      if (MODES[mode].clockSeconds !== null && n > 120 && rng() < 0.02) endOnClock(state);
    }
  } catch (error) {
    problems.push(`seed ${seed}: threw ${(error as Error).message}`);
  }

  plies += n;
  reasons.set(state.gameOverReason ?? 'still going', (reasons.get(state.gameOverReason ?? 'still going') ?? 0) + 1);
  if (totalScore(state) < 0) problems.push(`seed ${seed}: negative score`);
}

console.log(`fuzz: ${runs} runs of ${mode}, ${plies} plies, worst ply ${worstMs.toFixed(1)}ms`);
for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason.padEnd(20)} ${count}`);
}
console.log(problems.length ? `\nPROBLEMS (${problems.length}):` : '\nno problems found');
for (const line of problems.slice(0, 25)) console.log('  ' + line);

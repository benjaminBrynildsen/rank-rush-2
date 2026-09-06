import { createGame, move, generateVisibleChunks } from '../src/engine.js';
import { hasAnyLegalMove, legalMoves } from '../src/moves.js';
import { playerKing, refreshFog } from '../src/board.js';
import { mulberry32 } from '../src/rng.js';
import type { GameState, PieceType } from '../src/types.js';

/** Worst realistic board: a big army jammed against the full last rank. */
function heavy(seed: number): GameState {
  const state = createGame(seed);
  const king = playerKing(state)!;
  king.file = 4; king.rank = state.lastRank - 10;
  state.pieces = state.pieces.filter((p) => p.type === 'king');
  const army: PieceType[] = ['queen','rook','rook','bishop','bishop','knight','knight',
    'pawn','pawn','pawn','pawn','pawn','pawn','pawn','pawn','rook','bishop','knight','pawn','pawn'];
  army.forEach((type, i) => {
    const rank = king.rank - 1 - Math.floor(i / 8);
    state.pieces.push({ id: state.nextPieceId++, type, side: 'player', file: i % 8, rank,
      originRank: rank, neverMoved: true, stunned: false, packId: -1 });
  });
  state.generatedChunks = Array.from({ length: 512 }, (_, i) => i);
  refreshFog(state);
  generateVisibleChunks(state);
  return state;
}

const samples: number[] = [];
let hal = 0;
for (let seed = 1; seed <= 40; seed++) {
  const state = heavy(seed);
  const rng = mulberry32(seed);
  for (let n = 0; n < 60 && !state.gameOverReason; n++) {
    const movers = state.pieces.filter((p) => p.side === 'player')
      .map((p) => ({ p, opts: legalMoves(state, p) })).filter((m) => m.opts.length > 0);
    if (!movers.length) break;
    const all = movers.flatMap((m) => m.opts.map((o) => ({ m, o })));
    const c = all[Math.floor(rng() * all.length)]!;
    const t0 = performance.now();
    if (!move(state, { pieceId: c.m.p.id, to: c.o, promo: 'queen', generationId: state.generationId }).ok) break;
    samples.push(performance.now() - t0);
  }
  const t1 = performance.now();
  hasAnyLegalMove(state);
  hal = Math.max(hal, performance.now() - t1);
}

samples.sort((a, b) => a - b);
const at = (q: number) => samples[Math.floor(samples.length * q)]!.toFixed(2);
console.log(`heavy-board plies: ${samples.length}`);
console.log(`  p50 ${at(0.5)}ms  p95 ${at(0.95)}ms  p99 ${at(0.99)}ms  max ${samples[samples.length - 1]!.toFixed(2)}ms`);
console.log(`  worst single hasAnyLegalMove: ${hal.toFixed(2)}ms`);
console.log(`  pieces on a heavy board: ${heavy(1).pieces.length}`);

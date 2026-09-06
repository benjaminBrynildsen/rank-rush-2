/** Drop varied armies in front of the last rank and play the fight out. */
import { createGame, generateVisibleChunks, move } from '../src/engine.js';
import { hasAnyLegalMove, legalMoves } from '../src/moves.js';
import { checkInvariants } from '../src/invariants.js';
import { playerKing, refreshFog } from '../src/board.js';
import { LAST_ARMY_PACK } from '../src/generate.js';
import { mulberry32 } from '../src/rng.js';
import type { GameState, PieceType, PromoType } from '../src/types.js';

const ARMIES: PieceType[][] = [
  [],
  ['knight'],
  ['queen', 'rook', 'rook', 'bishop', 'knight'],
  ['pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn'],
  ['queen', 'rook', 'bishop', 'bishop', 'knight', 'knight', 'pawn', 'pawn', 'pawn', 'pawn'],
];
const PROMOS: PromoType[] = ['knight', 'bishop', 'rook', 'queen'];

const problems: string[] = [];
const reasons = new Map<string, number>();
let armyOk = 0;

for (let seed = 1; seed <= 240; seed++) {
  const rng = mulberry32(seed * 40503);
  const state: GameState = createGame(seed);
  const army = ARMIES[seed % ARMIES.length]!;

  // Strip the road and stand the player just short of the last rank.
  state.pieces = state.pieces.filter((p) => p.side === 'player' && p.type === 'king');
  const king = playerKing(state)!;
  king.file = 4;
  king.rank = state.lastRank - 12;
  state.wakeRank = king.rank - 6;
  state.generatedChunks = Array.from({ length: 512 }, (_, i) => i);

  let file = 0;
  for (const type of army) {
    const rank = king.rank - 2 - Math.floor(file / 8);
    state.pieces.push({
      id: state.nextPieceId++, type, side: 'player', file: file % 8, rank,
      originRank: rank, neverMoved: true, stunned: false, packId: -1,
    });
    file++;
  }
  refreshFog(state);
  generateVisibleChunks(state);

  const standing = state.pieces.filter((p) => p.packId === LAST_ARMY_PACK);
  if (standing.length !== 16) problems.push(`seed ${seed}: last army has ${standing.length} pieces`);
  else armyOk++;
  if (standing.filter((p) => p.type === 'king').length !== 1) {
    problems.push(`seed ${seed}: last army has no single king`);
  }

  let n = 0;
  try {
    while (!state.gameOverReason && n < 400) {
      const movers = state.pieces
        .filter((p) => p.side === 'player')
        .map((p) => ({ p, opts: legalMoves(state, p) }))
        .filter((m) => m.opts.length > 0);
      if (movers.length === 0) {
        problems.push(`seed ${seed}: live board with no legal move`);
        break;
      }
      const all = movers.flatMap((m) => m.opts.map((o) => ({ m, o })));
      const caps = all.filter((c) =>
        state.pieces.some((q) => q.side === 'enemy' && q.file === c.o.file && q.rank === c.o.rank));
      const pool = caps.length && rng() < 0.7 ? caps : all.filter((c) => c.o.rank > c.m.p.rank).length
        ? all.filter((c) => c.o.rank > c.m.p.rank) : all;
      const chosen = pool[Math.floor(rng() * pool.length)]!;

      const r = move(state, {
        pieceId: chosen.m.p.id, to: chosen.o,
        promo: PROMOS[Math.floor(rng() * PROMOS.length)]!,
        generationId: state.generationId,
      });
      if (!r.ok) { problems.push(`seed ${seed}: rejected ${r.rejected}`); break; }
      n++;

      const bad = checkInvariants(state);
      if (bad.length) problems.push(`seed ${seed} ply ${n}: ${bad.join('; ')}`);
      if (!state.gameOverReason && !hasAnyLegalMove(state)) {
        problems.push(`seed ${seed} ply ${n}: live board with no legal move`);
        break;
      }
      // Victory must mean the enemy king is actually gone.
      if (state.gameOverReason === 'crown-taken') {
        if (state.pieces.some((p) => p.side === 'enemy' && p.type === 'king')) {
          problems.push(`seed ${seed}: won but the enemy king is still standing`);
        }
      }
      // And the enemy king vanishing must mean victory.
      if (!state.pieces.some((p) => p.side === 'enemy' && p.type === 'king')
          && state.gameOverReason !== 'crown-taken') {
        problems.push(`seed ${seed} ply ${n}: enemy king gone but ending is ${state.gameOverReason}`);
        break;
      }
    }
  } catch (error) {
    problems.push(`seed ${seed}: threw ${(error as Error).message}`);
  }
  reasons.set(state.gameOverReason ?? 'still going', (reasons.get(state.gameOverReason ?? 'still going') ?? 0) + 1);
}

console.log(`endgame: 240 fights, last army intact in ${armyOk}`);
for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason.padEnd(20)} ${count}`);
}
console.log(problems.length ? `\nPROBLEMS (${problems.length}):` : '\nno problems found');
for (const line of problems.slice(0, 20)) console.log('  ' + line);

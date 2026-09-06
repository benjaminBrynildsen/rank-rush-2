# Rank Rush

**An 8-wide endless chess expedition. Start with a king and a knight. Loot an army.
Outrun the wake.**

Not checkmate chess, and not infinite-plane chess. The board is eight files wide and
endless ahead. Enemies sit in packs. You score by how far the king climbs and how
much you take. Behind you the board collapses one rank at a time, and anything you
leave back there is gone.

The loop in one sentence: jump or step in, steal a body, drop it at the tail, walk
the king up, do not let the wake take the crown.

## Status

This repo is the **first playable slice** from section 14 of the design bible: the
tick order, the wake, both growth rules, the greedy enemy phase, seeded encounters,
the invariant asserts, and a canvas UI that lets you actually play it. No modes, no
leaderboards, no sound.

## Run it

```bash
npm install
npm run dev        # play it at the printed localhost URL
npm test           # 68 tests, one per glitch in the bible plus the tick order
npm run typecheck
npm run build
npm run build:single   # dist/rank-rush.html, one self-contained file you can open
```

`npx vite-node scripts/soak.ts 200` plays 200 seeded runs with a deliberately dumb
house player and prints what the board does. Current shape: mean king rank ~208,
~57 captures, ~417 plies per run.

## How to play

The rules live in the game, in the **How to play** panel beside the board. It hands
over to the field report once you make your first move, and you can switch back any
time. The short version:

The board is a chess board: drag a piece where you want it, or click it and click
the square. A dot marks a quiet move, a ring marks a capture, and the square you
came from and the square you landed on stay highlighted until you move again. Your
king glows red when he is in check. Press Escape or right-click to put a piece back
down.

Everything Rank Rush adds is layered over that board rather than replacing it: the
haze ahead is fog you have not seen into, and the charred ranks behind you are the
wake.

- Pieces move exactly as in chess. No castling, no en passant.
- **Only the king and the knight recruit.** When either of them captures something,
  that piece type shows up at the back of your column and walks up from there.
- Every 8 committed moves a conscript pawn arrives at the rear whether you earned
  it or not.
- A pawn promotes 8 ranks from wherever it was born, not on some far home rank.
- The wake advances one rank every 3 moves. It never stops, it never reverses, and
  anything it reaches is worth zero.
- Check is real. No legal safe move ends the run — mate and stalemate both.

Losing the knight is survivable and it is supposed to hurt.

## The bible is the source of truth

[`docs/DESIGN_BIBLE.md`](docs/DESIGN_BIBLE.md) is the design and engine spec, kept
alongside the original `.docx` it was transcribed from. **If the code and the bible
disagree, the bible wins until we change the bible on purpose.** Where the build had
to decide something the bible left open, or had to bend a rule to keep an invariant
true, it is written down in [`docs/DEVIATIONS.md`](docs/DEVIATIONS.md) rather than
left in the code for someone to find later.

## Layout

```
src/
  constants.ts   every locked number from sections 2-3, with the lock it enforces
  types.ts       the state object from section 10
  rng.ts         hash + mulberry32 + the daily seed. No Math.random anywhere
  board.ts       geometry, the window, the fog, deterministic tie-break order
  moves.ts       piece movement, attack squares, check, legal-move filtering
  generate.ts    seeded encounters, packs, the siege-wall gap guarantee
  ai.ts          the sequential greedy enemy phase
  growth.ts      trophy recruits, conscripts, promotion, the queen cap
  score.ts       capture values and the in-pack streak
  invariants.ts  section 11, asserted after every ply
  engine.ts      the tick order from section 9. Do not reorder it
  theme.ts       the board palette and the shell it sits in
  render.ts      canvas drawing and the pointer-to-square mapping
  main.ts        drag and drop, move animations, HUD, promotion, field report
tests/           one test per glitch in section 12, named after it
scripts/
  soak.ts          a dumb house player, for looking at run shape
  bundle-single.mjs  folds a build into one self-contained HTML file
```

The tick order in `engine.ts` is numbered to match section 9 step for step. It is
load-bearing: a wake tick moved inside a slide, or a recruit resolved before a
capture, reintroduces most of section 12 on its own.

## Glitch coverage

Section 12 lists 44 ways this design can explode, farm, freeze, or desync. Every one
has a lock in the code and a test named after it:

| Bible section | Glitches | Tests |
| --- | --- | --- |
| 12.1 board and memory | G01–G04 | `tests/board-memory.test.ts` |
| 12.2 wake | G05–G08 | `tests/wake.test.ts` |
| 12.3 growth and spawns | G09–G20 | `tests/growth.test.ts` |
| 12.4 captures, check, legality | G21–G26 | `tests/legality.test.ts` |
| 12.5 enemies and fog | G27–G35 | `tests/enemies.test.ts` |
| 12.6 input, UI, replay | G36–G40, G44 | `tests/input-replay.test.ts` |
| 12.7 score exploits | G41–G43 | `tests/score.test.ts` |
| 9, 11, 5 | tick order, invariants, the locked start, the enemy phase's own report | `tests/engine.test.ts` |

The invariant suite replays 25 seeds for 120 plies each and asserts section 11 after
every single ply. That is how the fog-recession bug in `DEVIATIONS.md` was found.

## Not built, on purpose

Castling. En passant. Enemy promotions. Map holes. Wrapping files. Real-time moves.
Undo. Modes. Leaderboards. Section 12.8 explains why the first six will stay gone;
the rest wait until the tick order and the invariants are boring.

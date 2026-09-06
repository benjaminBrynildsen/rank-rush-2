# Bible changes

The bible wins until we change it on purpose. This is the record of the times we
did, and what the change cost or bought. Design decisions the build had to make
where the bible was silent live in [`DEVIATIONS.md`](./DEVIATIONS.md) instead.

## v2 — the run can be won

Four locks reopened at once, after playing v1. They interlock: taking any one
without the others gives a worse game than either v1 or v2.

### 1. §2 "There is no win. High score." → capture the last king

**Was:** an endless climb scored on distance and loot. The run only ended badly.

**Now:** there is exactly one enemy king in a run, standing on the last rank
behind a full chess army in home formation. Taking him wins.

**Why:** an endless runner has no shape. A run that can be *finished* gives the
looting a purpose — you are not collecting pieces to survive longer, you are
assembling the army you will need for one specific fight you can see coming.

**Cost:** "high score" is no longer the whole game, so the leaderboard needs a
second axis (won/lost, and how fast). Not built yet.

### 2. §7 the enemy phase → one reply per turn

**Was:** every enemy inside the window moved, capped at 24 per phase.

**Now:** exactly one enemy piece moves per player move — the best move on the
board, richest capture first.

**Why:** asked for directly, and correct. A swarm is not chess. One reply per
turn makes every enemy move legible: you can see what they chose and why, and you
can plan against it.

**Cost, and it is real:** enemy *count* stopped being pressure. Twenty pieces and
two pieces both answer once. So "harder" had to be rebuilt out of material
quality and board geometry — hence change 3.

**Second consequence, unplanned:** with one reply and check enforced correctly,
the player king can no longer be captured outright in normal play. Every legal
move must leave him safe, and a single enemy move cannot both open a line and
exploit it. You get **mated** instead. `king-captured` survives as an ending but
is close to unreachable — which is exactly how chess behaves, so it stays.

### 3. §7 flat encounters → a depth ramp

**Was:** pack contents gated on minimum rank, nothing else.

**Now:** every 25 ranks a pack brings one more body (capped at 5), and the bodies
improve with depth — pawns and knights early, rooks and queens past rank 100.

**Why:** change 2 removed the difficulty curve that enemy density used to supply.
Something had to replace it.

### 4. §13 Sprint → built, on a real clock

**Was:** a line item. "3-minute clock, king-rank only."

**Now:** 3 minutes, and the wake advances every 10 seconds of *real time* rather
than every 3 moves.

**Why:** it makes hesitation cost something specific. In Expedition, thinking is
free and only moving advances the wake. In Sprint the wake eats your rear column
while you think — soak runs lose an average of 36 pieces to it.

**Cost:** real time entered a design that was strictly turn-based, which is a new
class of bug. Two locks came with it, G45 and G46 in §12.9.

### Tuning

Numbers from 150-run soaks with the deliberately bad house player in
`scripts/soak.ts`:

| | Expedition | Sprint (brisk) | Sprint (thoughtful) |
| --- | --- | --- | --- |
| Last rank | 121 | 85 | 85 |
| Mean king rank | 96 | 78 | 49 |
| Won | 14% | 3% | 0% |
| Ran out of time | — | 79% | 88% |
| Mean pieces lost to the wake | — | 36 | 12 |

The house player only walks the king forward and takes what is in front of it, so
a real player should do considerably better. Sprint is tuned so its last rank is
*visible* to most runs and *reachable* by good ones.

### What v2 broke, and how it was caught

Three bugs, all consequences of the four changes above, none found by the test
suite. They were found by fuzzing — random legal play asserting the invariants
after every ply — which is why those harnesses now live in `scripts/` and are
part of the workflow rather than a one-off.

**G47 — checkmate with no ending.** The tick order checks legality at step 8, but
generation runs at step 11. A pack scrolling in could cover the king's last
escape squares after the check had already passed, leaving the player in
checkmate with no game-over screen: a frozen board. Present in 14 of the first
200 Expedition seeds. This is not new to v2 in principle — the ordering was
always like that — but v2's depth ramp made packs big enough to actually do it.

**G48 — packs spawning into check.** The fairness half of the same bug. Spawn
stun stops a fresh pack moving; nothing stopped one materialising already
attacking the king. Worse than a fog shotgun, since the player cannot answer at
all. The generator now refuses to place a piece that gives check, and the pack
is one smaller.

**G49 — spawns off the end of the map.** New to v2, and it took both changes to
reach: the last rank capped the board from the front, and Sprint's clock-driven
wake pushed the column against it from behind. Squeezed between them, the
"try one rank further up" fallback for a full rear rank pointed past the end of
the map. The invariant caught it, the ply rolled back, and the engine rethrew —
into a click handler with no catch, so in the real UI the player's move would
silently fail and they would be stuck. Two fixes: bound the rear spawn by the
window, and let the UI report a refused ply instead of throwing.

The last one is the argument for asserting invariants every tick rather than at
the end. It only reproduces with a full column, a clock-driven wake, and the last
rank all in play at once — about 1 run in 300, roughly 220 plies deep.

### Coverage after the fixes

155,000 fuzzed plies across both modes, 300 replayed runs, 240 endgame fights:
no invariant failures, no stalls, no rejected-but-legal moves, no exceptions.
Heaviest realistic board profiles at p50 0.44ms and p99 1.4ms a ply.

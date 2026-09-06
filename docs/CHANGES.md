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

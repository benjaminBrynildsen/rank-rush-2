# Where the build deviates from the bible

The bible wins until we change it on purpose. These are the places the first build
had to choose something it did not specify, or bend something it did, and why. Each
one is a candidate edit to the bible rather than a private decision in the code.

## 1. The fog ratchets forward and never recedes

**Bible:** section 3 — the camera tracks the vanguard and the player sees 8–12 ranks
ahead. Section 11 — `wakeRank < every living piece rank <= fogRank + 2`.

**Build:** `fogRank` is `max(fogRank, vanguard + 12)`. It never moves backward.

**Why:** those two rules contradict each other. Packs are generated when their chunk
enters the window. If the vanguard is then captured, the fog snaps back toward the
king and every enemy that was legitimately generated ahead is suddenly outside the
window — the section 11 invariant fails through no fault of the ply that triggered
it. The 25-seed invariant soak found this within a few dozen plies.

A ratcheting fog is also the better fiction: you do not unsee ground you already
walked up to. The window still cannot grow without bound, because the wake advances
from below on a fixed cadence.

## 2. Encounter spacing is 6–10 ranks, not 6–12

**Bible:** section 7 — an encounter every 6–12 ranks.

**Build:** one encounter per 8-rank chunk, placed 3–5 ranks into the chunk, which
puts consecutive encounters 6–10 ranks apart.

**Why:** chunks are the unit of generation and caching, and keying encounters to
them is what makes `hash(seed, chunkIndex)` sufficient (G29). Allowing a 12-rank gap
would mean an encounter that skips a chunk, which reintroduces cross-chunk state.
The observed range sits inside the bible's, so this is a narrowing rather than a
break — but section 7 should probably say 6–10.

## 3. Boss kings stand and fight

**Bible:** section 16, open question — "whether boss kings flee or stand."

**Build:** a boss king takes the richest capture available and otherwise steps
toward the player king, exactly like every other enemy piece.

**Why:** it is the option with no extra code and no extra failure mode. Fleeing needs
its own "is this cheap" test and a backward-move exception, and section 7 already
says enemies do not care about their own check.

## 4. The two counters count up, not down

**Bible:** section 6.1 — "the counter increments… when the counter hits 8, reset to
0", and "store `movesUntilPawn` as 0–7". Section 11 — `movesUntilPawn` in 0–7.

**Build:** `movesUntilPawn` and `movesUntilWake` hold moves *since* the last spawn
and the last wake tick, in 0–7 and 0–2. The HUD subtracts to show a countdown.

**Why:** a genuine countdown lives in 1–8, which fails the section 11 range check.
The field keeps its name so save data and the invariant list still match, and the
semantics are the ones section 6.1 actually describes.

## 5. The promotion choice travels with the move

**Bible:** section 6.4 and G16 — promotion is chosen before the enemy phase, with a
timer default of knight, and nothing may run while the dialog is open.

**Build:** the engine takes an optional `promo` on the move request and defaults to
knight. The UI calls `wouldPromote()` *before* committing and opens its dialog then,
so a ply never starts until the choice exists.

**Why:** it makes G16 structural instead of guarded. There is no window in which a
promotion can be pending, because the engine never yields mid-ply. `pendingPromotion`
still exists in the state and is still asserted null, so a future async promotion
path cannot quietly skip the check.

## 6. The queen cap counts living queens

**Bible:** section 6.4 — "cap: 1 extra queen on the board".

**Build:** a queen result becomes a knight whenever a player queen is already alive.
Losing your queen makes the next one available again.

**Why:** "on the board" reads as a live count rather than a lifetime budget, and the
lifetime reading would silently punish a player whose queen died to the wake.

## 7. A chunk generates only once it fits entirely inside the window

**Bible:** section 7 — generate once, cache while in the window, discard behind the
wake.

**Build:** a chunk is skipped until its whole 8-rank span sits under the window top.

**Why:** a pack straddling the window edge would place pieces on ranks the window
does not own yet, which fails the same section 11 invariant as deviation 1. The cost
is that the first skirmish appears when the vanguard reaches rank 3 rather than
rank 2.

## 8. Distance score ratchets on the best king rank

**Bible:** section 8 — king rank, +15 per rank.

**Build:** the best king rank reached, not the current one.

**Why:** the bible's rule read literally refunds points for retreating, and G41 is
about stopping the *vanguard* from paying, not about making a step backward cost 15.
Retreat still costs you tempo against the wake, which is the real price.

## 9. Enemy pawns have no double-step

**Bible:** section 4 gives the double-step to pawns that have never moved; section 7
says enemy pawns face south and do not promote.

**Build:** the double-step is player-only.

**Why:** enemy pawns are generated mid-board rather than on a home rank, so
"never moved" is not a meaningful gate for them, and a two-rank opening lunge out of
a fresh pack is exactly the fog shotgun G27 exists to prevent.

## 10. `encountersCleared[]` is implied by `generatedChunks[]`

**Bible:** section 10 lists both `encountersCleared[]` and `chunkCache`.

**Build:** one `generatedChunks[]` array.

**Why:** packs never respawn (G34) and everything behind the wake is deleted, so a
chunk that has been generated is either still on the board or cleared forever. A
second list would be state that can only ever disagree with the first.

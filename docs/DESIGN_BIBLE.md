# Rank Rush — Design + Engine Bible

> An 8-wide endless chess expedition. Start with a king and a knight. Loot an army. Outrun the wake.

This document is the single source of truth for the build. **If code and this doc
disagree, the doc wins until we change the doc on purpose.**

> **v2, deliberately changed.** Four locked decisions were reopened on purpose
> after playing v1: the run can now be **won**, the board answers with **one move
> per turn**, encounters **ramp with depth**, and **Sprint** is built. The rows
> below are the current locks; [`CHANGES.md`](./CHANGES.md) records what moved and
> why.

The original is kept verbatim alongside this file as
[`Rank_Rush_Design_Bible_v1.docx`](./Rank_Rush_Design_Bible_v1.docx). This markdown
is a transcription for reading and diffing.

**Working title.** Rank Rush / The Long File / Forward. Corridor chess: 8 files ×
endless ranks. Score distance + captures. King dies = run over.

---

## 1. Pitch

This is not checkmate chess and not infinite-plane chess. It is an expedition. You
command a growing army on a board that is eight squares wide and endless ahead.
Enemy pieces are scattered in packs. You score by how far the king climbs and how
much you capture. The run ends when the king is captured, or when the wake
swallows him.

Same piece moves as chess. Different purpose: raid, recruit, keep walking.

## 2. Locked design decisions

| Decision | Lock |
| --- | --- |
| Board | 8 files (a–h) × ranks forward to the last rank. Edges on left/right. No wrap. |
| Start | 1 king + 1 knight on ranks 1–2. |
| Win | Capture the enemy king on the last rank. That is the only win. |
| Distance score | King rank only. Vanguard is camera/feel, not the leaderboard number. |
| Recruiters | King and knight only. Other pieces never recruit. |
| Pawn drip | Every 8 committed player moves, a pawn spawns at the rear. |
| Trophy | King or knight capture → that piece type appears at the rear. |
| No second king | Capturing a boss king scores; it does not recruit a king. |
| Wake | Board behind the army collapses. Left-behind pieces die, score 0. |
| Check | Real. No legal escape = run over. |
| Castling | Off for v1. |
| Enemy promotion | Off for v1. |
| Holes / biomes | Off for v1. |
| Pack respawn | Never. |
| Enemy reply | Exactly one enemy piece moves per player move. |
| Difficulty | Packs gain a body every 25 ranks, and better bodies with depth. |
| Last rank | One enemy king, in a full home formation. Nothing past it. |
| Window | Keep wake → fog + 2 ranks in memory only. |

## 3. Board and camera

### Geometry

- Files 0–7 (display as a–h). Rank 1 is the start row. Ranks increase forward.
- A piece off file 0–7 is illegal. Sliders stop at the edge. No cylinder wrap.
- Rank IDs are integers. Hard cap `RANK_MAX = 1,000,000`. Hitting the cap ends the
  run cleanly ("the map ends") with the current score.
- Only a window lives in RAM: from `wakeRank` through `fogRank + 2`.

### Camera

- Track the vanguard (farthest-forward friendly piece) plus a few ranks of fog ahead.
- Also keep the king on-screen if he is inside the window.
- Fog of war: the player sees about 8–12 ranks ahead. Packs outside the window do
  not move or capture.

### Wake

- `wakeRank` starts at 0. Everything on a rank `<= wakeRank` is deleted.
- Default: the wake advances +1 rank every 3 committed player moves.
- The wake only advances between full turns, never mid-move.
- If the wake would cover the king: game over first. Do not delete him and then
  crash the check logic.
- Pieces eaten by the wake score 0 and count as fallen.

## 4. Pieces and movement

Classic chess moves. Knights jump. Kings step one. Pawns move forward (increasing
rank) one, capture diagonally forward. Bishops/rooks/queens slide. Max slide
distance = window height (about 16). Raycast only inside the window.

### Pawns

- Double-step only if `pawn.originRank == currentRank` (never moved) and both
  squares are empty.
- Recruited and dripped pawns do get a double-step from their spawn square, once.
- No en passant in v1. One less special case.
- Pawns never move backward.

### Banned in v1

Castling. En passant. Enemy promotions. Holes, wrapping files, exploding captures,
piece-spawning pieces, simultaneous real-time moves.

## 5. Starting position

Suggested v1 start (white / player): king on e2 (file 4, rank 2); knight on d2 or
g2 (pick g2 so the king has a little air).

**Locked start for the first build: King e2, Knight g2.**

No other friendly pieces. Rank 1 is empty on purpose so the first wake tick is not
instantly lethal.

## 6. Growth systems

### 6.1 Pawn conscript (every 8 moves)

- The counter increments only on a committed legal player move. Not on cancelled
  clicks, not on enemy moves, not on rejected illegal clicks.
- When the counter hits 8, reset to 0 and spawn one friendly pawn at the rear.
- Store `movesUntilPawn` as 0–7 in save data.

### 6.2 Trophy recruit (king or knight capture)

| Who captures | What you get |
| --- | --- |
| Knight takes pawn / N / B / R / Q | That type appears at the rear |
| King takes pawn / N / B / R / Q | That type appears at the rear |
| Rook / bishop / pawn / queen takes anything | Capture only. No recruit |
| King or knight takes a boss king | Score spike / wave clear. No second king |

The recruited piece is yours, full moves, same type. It appears after the capture
resolves and before the enemy phase.

### 6.3 Where "the rear" is

- `rearRank = min(all living friendly piece ranks)`.
- If `rearRank <= wakeRank + 1`, use `rearRank + 1` so the spawn is not eaten next tick.
- File preference: the king's file, then adjacent files outward
  (`kingFile`, `kingFile+1`, `kingFile-1`, …).
- Skip occupied squares. Skip out-of-file. Never spawn on the king or on the piece
  that just moved.
- If 8 file attempts fail, try `rearRank + 1`. If that fails too: skip the spawn. Do
  not crash. Do not queue a pending spawn.
- A recruit may not be placed such that it leaves your king in check. If it would,
  try the next square; if none, skip.

### 6.4 Promotion

- Each pawn stores `originRank`.
- Promote when the pawn reaches `originRank + 8`.
- Choices: knight, bishop, rook, queen. **Never promote to king.**
- Cap: 1 extra queen on the board (the first Q recruit or Q promo). Further queen
  results become knights — this is good; knights recruit.
- Promotion is chosen before the enemy phase. No pending promotion across a wake
  tick. If the UI is skipped by timer, default to knight.

### 6.5 Knight dies

The run continues. Pawn drip still happens. The king can still trophy-recruit. You
just lost the jumper. Do not auto-replace the knight in v1. Losing the horse should
hurt.

## 7. Enemies and generation

### Encounters

Do not sprinkle random pieces forever. Generate an encounter every 6–12 ranks,
seeded by `hash(seed, chunkIndex)`.

| Name | Typical contents | From rank |
| --- | --- | --- |
| Skirmish | 2–4 pawns + 1 knight | 8+ |
| Fork camp | Knight + pawn chain | 16+ |
| Battery | Bishop pair or rook on an open file | 24+ |
| Queen raid | Queen + 2 escorts | 40+ |
| Siege wall | Pawn line across files, with at least one gap | 48+ |
| Warband | Queen, two rooks, escorts. **No king.** | every 50 |
| The last rank | A full chess set in home formation, the run's only king. | the end |

### The ramp

- Every 25 ranks a pack gains one more body, capped at 5 extra.
- Escorts improve with depth: pawns and knights below rank 30, bishops and rooks
  by 60, rooks and queens past 100.
- There is exactly **one enemy king in a run**, and he stands on the last rank.
  Warbands replaced the old boss court so that stays true.

### The last rank

- The enemy back rank stands on `mode.lastRank`, its pawns one rank in front, in
  standard chess formation: R N B Q K B N R.
- **It is the end of the map.** No move, slide or spawn reaches past it, so there
  is no walking around the army. The only way through is through the king.
- Capturing that king ends the run as a win, with the score kept.
- It is stood up once, exactly, when the window first reaches it.

### Generator locks

- Spawn only on empty squares. If the pack does not fit, shrink the pack.
- Never spawn on the player king or on an occupied square.
- Never spawn a pack with zero capture holes if it is a full pawn wall. The
  generator must leave at least one gap or a knight-jump hole so the player cannot
  softlock.
- Chunks keyed by `rank // CHUNK_SIZE` (use 8). Generate once, cache while in the
  window, discard behind the wake.
- Spawn stun: a pack that just scrolled into the window gets no move on that same
  enemy phase. Stops fog shotguns.
- Packs never respawn. A cleared rank stays cleared.
- Enemy pawns face south (toward the player) and do not promote in v1.
- Enemies do not recruit.

### Enemy AI (dumb-smart)

- **Exactly one enemy piece moves per player move.** The board answers the way an
  opponent does, not the way a swarm does. This is what makes it read as chess.
- Only pieces inside the window + 2 ranks are considered.
- Consider at most 24 candidates, nearest first. The rest are scenery.
- Of every legal enemy move on the board, play the single best one: the richest
  capture if any capture exists, otherwise the move that gets a piece closest to
  the king. A move that does not close the gap is not played.
- Depth cannot mean "more replies per turn" any more, so it means better material
  and a thicker wall instead. See the ramp below.
- No enemy may move backward more than 1 rank.
- If the destination is taken this phase, skip.
- If a piece has zero legal moves: stay. Never throw.
- Tie-breaks are deterministic: file, then piece type. No `Math.random` in the AI.
- Enemy pieces do not care about their own check except a boss king, which flees one
  step if cheap.
- After each enemy move, if the player king is captured, stop the phase immediately.
  Game over.

## 8. Check, game over, score

### Check

Check is real. After your move the king must not be adjacent to an enemy attack. If
you have no legal move that leaves the king safe, the run is over (mate and
stalemate both end the run). Do not allow ignoring check — that becomes an infinite
farm.

If the only escape square is on or behind the wake, it is illegal. The king dies.

### Run over

**Won:** the king on the last rank is captured (`crown-taken`).

**Lost:**

- Player king captured by an enemy move.
- Player king has no legal safe move (checkmate or stalemate).
- Wake covers the king.
- The clock runs out in a timed mode (`out-of-time`) — a benign ending, keep score.
- `RANK_MAX` reached (benign ending, keep score).

With one reply per turn and check enforced properly, being captured outright is
close to unreachable: you are mated instead, exactly as in chess.

### Score

| Source | Points |
| --- | --- |
| King rank | +15 per rank |
| Capture pawn / N / B / R / Q | 1 / 3 / 3 / 5 / 9 |
| Boss king | 25 |
| Capture streak in one encounter | ×1.5 after the 3rd take in that pack |
| Pieces still alive at death | +1 each |
| Wake deaths | 0 and no bonus |

Leaderboards: best king-rank, best captures, best total. The daily seed uses
`hash(date)`.

## 9. Tick order (do not reorder)

This order is load-bearing. Wake mid-move, recruit-before-capture, or
enemy-simultaneous will create most of the bugs in section 12.

1. Player input accepted only if `!busy`.
2. Validate the move against the current `generationId`. If the state changed,
   reject and redraw highlights.
3. Apply the player move. Resolve the capture if any.
4. If the mover was king or knight **and** it captured a non-king: spawn a recruit
   at the rear (or skip).
5. If a pawn reached `originRank + 8`: promotion UI, or default knight.
6. Increment the move counter. If it hits 8: spawn a conscript pawn, reset the counter.
7. Enemy phase, sequential. Abort immediately if the player king dies.
8. If the king has no legal safe move now: game over.
9. Wake tick if this move completed a 3-move wake cycle. Delete ranks `<= newWakeRank`.
10. If king rank `<= wakeRank`: game over.
11. Generate any newly visible chunk. Mark new packs spawn-stunned.
12. Clear `busy`. Advance `generationId`.

## 10. State object (minimum)

Persist / assert on these fields:

- `seed`, `moveIndex`, `generationId`
- `wakeRank`, `fogRank`, `RANK_MAX`
- `movesUntilPawn` (0–7), `movesUntilWake` (0–2)
- `pieces[]`: `{ id, type, side, file, rank, originRank, neverMoved }`
- exactly one piece with `type=king` and `side=player`
- `encountersCleared[]`, `chunkCache`
- `score`, `captures`, `streakInPack`
- `busy`, `selectedId`, `legalTargets[]`
- `gameOverReason` or null

Replay = seed + list of `{ pieceId, fromFile, fromRank, toFile, toRank, promo }`.
Deterministic.

## 11. Invariants (assert every tick)

If any fail: do not try to recover mid-frame. Roll back the ply or end the run.

- Exactly one living player king, inside the window.
- No two pieces share a square.
- No piece outside files 0–7.
- `wakeRank < every living piece rank <= fogRank + 2`.
- No pending promotion when the enemy phase starts.
- No second player king.
- Piece count `<=` cap (e.g. 32 friendly + 24 active enemy).
- Rank values in `0 .. RANK_MAX`.
- `movesUntilPawn` in 0–7.

## 12. Glitch bible

Every known way this design can explode, farm, freeze, or desync — and the lock.
Implement the lock, then add a test named after the glitch.

### 12.1 Board and memory

- **G01 — Infinite board eats RAM.** Storing every rank that ever existed kills the
  tab around rank 5,000. *Lock:* window only. Discard behind the wake. Sliders
  raycast only inside the window.
- **G02 — Rank overflow.** Rank becomes `Infinity` or wraps a 32-bit int.
  *Lock:* `RANK_MAX`. Hitting it ends the run with the current score.
- **G03 — Slider shoots 10,000 ranks.** A queen on an open file hangs the frame.
  *Lock:* max slide = window height.
- **G04 — File wrap.** A bishop steps to file -1 or 8 and appears on the other side.
  *Lock:* files clamp. Off-file is blocked, not wrapped.

### 12.2 Wake

- **G05 — Wake during a slide.** The wake deletes a square the queen is passing
  through. *Lock:* the wake only ticks after the full turn.
- **G06 — Wake deletes the king, then the check code crashes.** *Lock:* if the wake
  would cover the king, set game over first. Do not delete the king object until the
  over-screen is shown.
- **G07 — Piece pointer after a wake delete.** The selected piece is eaten mid-drag.
  *Lock:* selection is by piece id. If the id is gone, cancel the drag. Input is busy
  during resolve.
- **G08 — Spawn then immediately wake-killed.** A conscript lands on a `rearRank`
  that the coming wake tick eats. *Lock:* spawn at `rearRank + 1` when the rear is
  within 1 of the wake.

### 12.3 Growth and spawns

- **G09 — Recruit on a full rear rank.** *Lock:* try rear+1, then skip. Never queue
  a pending recruit.
- **G10 — Recruit lands on the king or the capturer.** *Lock:* exclude those squares
  from the file walk.
- **G11 — Recruit puts your own king in check.** Rare at the rear, fatal if it
  happens. *Lock:* reject that square, try the next, else skip.
- **G12 — Double recruit in one turn.** Should be impossible (one move). Guard
  anyway: one trophy flag per ply.
- **G13 — Non-recruiter trophy.** A rook takes a queen and a queen appears at the
  rear. *Lock:* trophy only if `mover.type` is king or knight.
- **G14 — Second king.** The king takes a boss king and the recruit creates a second
  player king; the check code dies. *Lock:* captured type == king → no recruit.
- **G15 — 8-move counter on illegal clicks.** The player mash-clicks, the counter
  races, pawns flood. *Lock:* increment only after a legal move commits.
- **G16 — Promotion pending across a wake.** The dialog is open, the wake eats the
  pawn. *Lock:* no enemy or wake until the promo is chosen. Timer default = knight.
  Pause the fuse during the UI, or auto-pick.
- **G17 — Queen flood.** Every pawn promotes to Q; the board becomes 12 queens.
  *Lock:* max 1 extra queen. Further Q results become knights.
- **G18 — Promote to king.** *Lock:* not in the menu.
- **G19 — `originRank` missing.** A recruited pawn has no origin, so it never
  promotes or promotes instantly. *Lock:* every pawn write sets
  `originRank = spawn rank`.
- **G20 — Conscript while standing still.** The player idles to farm pawns.
  *Lock:* the wake still advances on move count. No pause. Standing still is death.

### 12.4 Captures, check, legality

- **G21 — Stalemate freeze.** The king is not in check, has no legal moves, and the
  UI waits forever. *Lock:* no legal safe move = game over.
- **G22 — Ignore-check farm.** The player leaves the king in check and keeps looting.
  *Lock:* illegal. Resolve the check or die.
- **G23 — Escape square is in the wake.** *Lock:* that square is not legal. If there
  is no other square, game over.
- **G24 — Move legal on click, illegal on resolve.** The generation changed under the
  pointer. *Lock:* moves carry `generationId`. A mismatch is a reject + redraw.
- **G25 — King takes, then three enemies take him.** This is allowed. Do not add
  "king captures are safe." It is the tax for king-loot.
- **G26 — Capturing the checker.** Must be legal if the destination is safe after the
  captured piece is gone. Use the normal chess "is this square attacked after the
  move" test.

### 12.5 Enemies and fog

- **G27 — Fog shotgun.** A queen in unseen fog slides onto the king. *Lock:* pieces
  outside the window do not move or capture. Spawn stun for one phase.
- **G28 — Spawn on occupied / on the king.** *Lock:* empty-square only. Shrink the
  pack. Never on the king.
- **G29 — Duplicate chunk.** The same rank is generated twice because the camera X
  leaked into the hash. *Lock:* `hash(seed, chunkIndex)` only.
- **G30 — Two enemies onto one square.** *Lock:* sequential resolve. An occupied
  destination is a skip.
- **G31 — Simultaneous swap.** The player and an enemy exchange squares and both
  live. *Lock:* the player resolves fully first, then the enemies. No simultaneity.
- **G32 — AI infinite shuffle.** A rook walks left-right forever, or the pathfinder
  loops. *Lock:* one action per piece per phase. Backward cap 1. No move = stay.
- **G33 — 40 enemies full-search one frame.** *Lock:* 24 active AI cap.
- **G34 — Pack respawn farm.** The player kites one pawn 400 ranks for infinite
  trophies. *Lock:* no respawn. Distance score is king rank, not vanguard.
- **G35 — Full pawn wall softlock.** Eight pawns, no captures, the king stares.
  *Lock:* the generator always leaves a gap or a knight-hole.

### 12.6 Input, UI, replay

- **G36 — Double-click, two moves.** *Lock:* busy from pointer-down until the enemy
  phase ends.
- **G37 — Drop on a scrolled square.** The camera moved under the pointer.
  *Lock:* the drop target is a board coord remapped from the pointer; if the camera
  moved, recompute from the current hover, still under one busy flag.
- **G38 — Multi-touch, two pieces.** *Lock:* one selected id.
- **G39 — Replay desync.** The AI used `random()` for equal captures.
  *Lock:* deterministic ties. Replay is seed + move list.
- **G40 — Daily seed differs per client.** *Lock:* seed from the UTC date string
  only; no locale, no clock timezone drift in the hash input besides the date key.

### 12.7 Score exploits (fun-killers)

- **G41 — Queen to rank 500, king at 2.** *Lock:* distance = king rank.
- **G42 — Camp a pack with the wake off.** *Lock:* the wake is always on. Packs do
  not respawn.
- **G43 — Feed pieces to the wake for a bonus.** *Lock:* wake deaths score 0.
- **G44 — Undo forever.** *Lock:* no undo in v1 (tutorial-only later).

### 12.9 Real time

- **G45 — A clock tick lands inside a ply.** In a timed mode the wake runs on a
  wall clock, which does not care that a turn is half-resolved. *Lock:* a tick
  arriving while the board is busy queues in `pendingWakeTicks` and is spent the
  moment the board is idle. The wake still only ever moves between full turns
  (G05).
- **G46 — A backgrounded tab kills the run.** The clock keeps running while the
  player is on another tab, and they come back to eighteen queued wake ticks.
  *Lock:* the clock stops while `document.hidden`. Losing to a background tab is
  not difficulty, it is a bug.

### 12.8 v1 features we are not building because they glitch more than they add

Castling after the home row is gone. En passant ghost squares vs the wake. Enemy
promotions off-screen. Map holes under standing pieces. Wrapping files. Real-time
simultaneous moves. Pieces that spawn pieces besides the two growth rules.

## 13. Modes

Both modes end at the same place: the last rank.

### Expedition (built)

The long road. The wake advances one rank every 3 committed moves — it only moves
when you do. No clock. Last rank at **121**.

### Sprint (built)

Three minutes. The wake advances one rank **every 10 seconds of real time**,
whether you move or not, so hesitating costs ranks off the back of your column
rather than nothing at all. At 0:00 the run ends and the score is banked — the
clock is a horizon, not a death. Last rank at **85**, which a good player can
reach and a careful one cannot.

The clock never touches the tick order: it queues wake ticks (G45) and the engine
spends them between turns like any other.

### Not built

- **Caravan** — keep more pieces alive for a bonus.
- **Daily seed** — the same road for everyone that day. The seed function exists
  and both modes already use it; there is no leaderboard to hang it on yet.

## 14. First playable build

Ship this slice, nothing else:

- 8-wide grid that grows ranks as you move. Window of ~16 ranks.
- Start: king e2, knight g2.
- You move one piece. Then each visible enemy takes one greedy move.
- King captured or no legal escape = game over.
- Knight or king capture → recruit that type at the rear.
- Every 8 player moves → a pawn at the rear.
- Seeded encounters every 8 ranks. Spawn stun. No respawn.
- Wake +1 every 3 player moves.
- HUD: king rank, captures, score, moves-to-pawn, moves-to-wake.
- Assert the invariants after every ply.

## 15. Feel of the first 30 moves

- **Moves 1–8:** only the king and the knight. The first skirmish. Maybe the knight
  takes a pawn and a pawn appears at the tail. Then the conscript arrives anyway.
- **Moves 9–16:** two pawns plus the horse. You can screen. The knight hunts a bishop
  or another knight.
- **First bishop recruit:** a long-range tool born at the back. You still have to
  walk it up.
- **If the knight dies:** the run gets quiet. The king scavenges. That is correct.

The loop in one sentence: jump or step in, steal a body, drop it at the tail, walk
the king up, do not let the wake take the crown.

## 16. Open questions (do not block v1)

- Exact start squares if e2/g2 feels cramped.
- Wake every 3 moves vs every 2 vs a visible fuse bar.
- Whether boss kings flee or stand.
- Whether a later mercy rule replaces a dead knight with the next conscript.
  Default: no.
- Name. Rank Rush is fine until it is not.

---

*End of v1 bible. Build the tick. Then play it. Then change the doc.*

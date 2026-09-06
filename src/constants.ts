/**
 * Locked numbers from the design bible (docs/DESIGN_BIBLE.md, sections 2-3).
 * If code and the bible disagree, the bible wins until we change the bible on purpose.
 */

/** Files a-h. A piece off 0..7 is illegal. No wrap (G04). */
export const FILES = 8;

/** Hard cap on rank. Hitting it ends the run cleanly with the current score (G02). */
export const RANK_MAX = 1_000_000;

/** Max slide distance, and the height of the simulated window (G01, G03). */
export const WINDOW_HEIGHT = 16;

/** Ranks of fog the player can see past the vanguard. */
export const FOG_AHEAD = 12;

/** "keep wake -> fog + 2 ranks in memory only" */
export const WINDOW_MARGIN = 2;

/** Chunks are keyed by rank // CHUNK_SIZE. */
export const CHUNK_SIZE = 8;

/** The wake advances +1 rank every WAKE_PERIOD committed player moves. */
export const WAKE_PERIOD = 3;

/** A conscript pawn spawns every PAWN_PERIOD committed player moves. */
export const PAWN_PERIOD = 8;

/** A pawn promotes when it reaches originRank + PROMO_DISTANCE. */
export const PROMO_DISTANCE = 8;

/** Enemies past this many actors are frozen decorations for the phase (G33). */
export const MAX_ACTIVE_AI = 24;

/** Friendly piece cap (invariant, section 11). */
export const MAX_FRIENDLY = 32;

/** Ranks 1..NO_SPAWN_BELOW are the starting yard: the generator never spawns there. */
export const NO_SPAWN_BELOW = 7;

/** A warband - the heavy pack, no king - sits on every BOSS_EVERY ranks. */
export const BOSS_EVERY = 50;

/**
 * Exactly one enemy piece acts per player move. The board answers you the way
 * an opponent does, not the way a swarm does (section 7).
 */
export const ENEMY_MOVES_PER_TURN = 1;

/** Enemy pieces considered each turn, nearest first. The rest are scenery. */
export const AI_CANDIDATES = 24;

/** Ranks between difficulty steps: every step buys the packs another escort. */
export const RAMP_EVERY = 25;

/** Escorts a pack can gain from the ramp, on top of its own contents. */
export const MAX_ESCORTS = 5;

/** At most this many player queens may exist at once (G17). */
export const MAX_PLAYER_QUEENS = 1;

/**
 * Deterministic noise. No Math.random anywhere in the engine: a replay is
 * seed + move list and nothing else (G39).
 */

/** FNV-1a over two 32-bit words, then a scramble. */
export function hash2(a: number, b: number): number {
  let h = 2166136261 >>> 0;
  h = Math.imul(h ^ (a >>> 0), 16777619) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 16777619) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

export function hashString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from empty list');
  return items[randInt(rng, items.length)] as T;
}

/**
 * The daily seed is the UTC date string and nothing else. No locale, no local
 * clock, so every client walks the same road on the same day (G40).
 */
export function dailySeed(now: Date = new Date()): number {
  return hashString(now.toISOString().slice(0, 10));
}

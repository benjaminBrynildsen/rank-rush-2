import type { PieceType } from './types.js';

/** Section 8. Boss kings are a score spike, not a win condition. */
export const CAPTURE_POINTS: Record<PieceType, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 25,
};

/** What the AI thinks a target is worth when it picks the richest capture. */
export const AI_VALUE: Record<PieceType, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 1000,
};

export const POINTS_PER_RANK = 15;

/** The 4th and later capture inside one pack is worth 1.5x (section 8). */
export const STREAK_MULTIPLIER = 1.5;
export const STREAK_THRESHOLD = 3;

export function captureValue(type: PieceType, captureIndexInPack: number): number {
  const base = CAPTURE_POINTS[type];
  return captureIndexInPack > STREAK_THRESHOLD ? Math.round(base * STREAK_MULTIPLIER) : base;
}

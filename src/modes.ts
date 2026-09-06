import { WAKE_PERIOD } from './constants.js';

export type ModeId = 'expedition' | 'sprint';

export interface Mode {
  id: ModeId;
  name: string;
  blurb: string;
  /**
   * Moves between wake ticks, or null when the wake runs on the clock instead.
   * Exactly one of this and `wakeSeconds` is set.
   */
  wakeMoves: number | null;
  /** Seconds of real time between wake ticks, for the timed modes. */
  wakeSeconds: number | null;
  /** Seconds on the clock, or null for an untimed run. */
  clockSeconds: number | null;
  /**
   * The rank the enemy back rank stands on. This is the end of the map: there
   * is nothing past it, so the only way through is to take the king.
   */
  lastRank: number;
}

export const MODES: Record<ModeId, Mode> = {
  expedition: {
    id: 'expedition',
    name: 'Expedition',
    blurb: 'The long road. The wake moves when you do.',
    wakeMoves: WAKE_PERIOD,
    wakeSeconds: null,
    clockSeconds: null,
    lastRank: 121,
  },
  sprint: {
    id: 'sprint',
    name: 'Sprint',
    blurb: 'Three minutes. The wake moves whether you do or not.',
    wakeMoves: null,
    wakeSeconds: 10,
    clockSeconds: 180,
    lastRank: 85,
  },
};

export const DEFAULT_MODE: ModeId = 'expedition';

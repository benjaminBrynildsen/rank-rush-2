/**
 * The board reads as a chess board first and a roguelike second, so the palette
 * is the familiar green-and-cream one every player already knows, sitting in a
 * dark shell. Everything Rank Rush adds on top - the fog, the wake - is layered
 * over that board rather than replacing its colours.
 */
export const THEME = {
  /** Board squares. */
  light: '#ebecd0',
  dark: '#739552',

  /** Ranks the wake has already taken: charred, and out of play. */
  wakeLight: '#4a423c',
  wakeDark: '#3a3430',
  wakeEdge: 'rgba(200, 68, 56, 0.9)',

  /** Haze over ground you have not seen yet. */
  fog: 'rgba(38, 36, 33, 0.66)',
  beyond: 'rgba(38, 36, 33, 0.88)',

  /** The square you picked up from, and the move just played. */
  highlight: 'rgba(255, 255, 51, 0.5)',
  /** Where a legal quiet move lands. */
  moveDot: 'rgba(0, 0, 0, 0.16)',
  /** Where a legal capture lands. */
  captureRing: 'rgba(0, 0, 0, 0.16)',
  /** The square under the pointer. */
  hover: 'rgba(255, 255, 255, 0.68)',
  /** The glow under a king in check. */
  check: 'rgba(231, 66, 47, 0.92)',

  /** Pieces. Solid Staunton silhouettes, outlined so they read on both squares. */
  playerFill: '#ffffff',
  playerLine: '#312e2b',
  enemyFill: '#2b2926',
  enemyLine: 'rgba(255, 255, 255, 0.22)',

  /** Coordinates are painted in the opposite square's colour, as on a real board. */
  coordOnLight: '#739552',
  coordOnDark: '#ebecd0',

  shell: '#302e2b',
} as const;

import { FILES } from './constants.js';
import { playerKing, vanguardRank, windowTop } from './board.js';
import { THEME } from './theme.js';
import type { GameState, Piece, Square } from './types.js';

/** Solid Staunton glyphs for both sides. The fill and the outline pick the colour. */
const GLYPHS: Record<Piece['type'], string> = {
  king: '♚',
  queen: '♛',
  rook: '♜',
  bishop: '♝',
  knight: '♞',
  pawn: '♟',
};

const PIECE_FONT =
  '"Noto Sans Symbols 2", "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", serif';

export interface Camera {
  /** Lowest rank drawn at the bottom of the canvas. */
  bottomRank: number;
  cell: number;
  originX: number;
}

/** A piece sliding between two squares. `t` runs 0 to 1. */
export interface PieceAnimation {
  pieceId: number;
  from: Square;
  to: Square;
  t: number;
}

export interface Scene {
  state: GameState;
  camera: Camera;
  targets: readonly Square[];
  hover: Square | null;
  lastMove: { from: Square; to: Square } | null;
  /** The piece in hand, drawn at the pointer instead of on its square. */
  dragging: { pieceId: number; x: number; y: number } | null;
  animations: readonly PieceAnimation[];
  /** Paint the red glow under the king. */
  checkGlow: boolean;
}

/** Track the vanguard, but never lose the king off the bottom of the screen. */
export function computeCamera(state: GameState, canvas: HTMLCanvasElement): Camera {
  const cell = Math.floor(Math.min(canvas.width / FILES, canvas.height / 10));
  const rows = Math.max(6, Math.floor(canvas.height / cell));
  const king = playerKing(state);

  let bottom = Math.max(state.wakeRank + 1, vanguardRank(state) - rows + 4);
  if (king) bottom = Math.min(bottom, king.rank);
  bottom = Math.max(bottom, state.wakeRank);

  return { bottomRank: bottom, cell, originX: Math.floor((canvas.width - cell * FILES) / 2) };
}

export function squareAt(
  camera: Camera,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): Square | null {
  const file = Math.floor((x - camera.originX) / camera.cell);
  const rank = camera.bottomRank + Math.floor((canvas.height - y) / camera.cell);
  if (file < 0 || file >= FILES || rank < 1) return null;
  return { file, rank };
}

function screenX(camera: Camera, file: number): number {
  return camera.originX + file * camera.cell;
}

function screenY(camera: Camera, canvas: HTMLCanvasElement, rank: number): number {
  return canvas.height - (rank - camera.bottomRank + 1) * camera.cell;
}

const FILE_LETTERS = 'abcdefgh';

export function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, scene: Scene): void {
  const { state, camera } = scene;
  const { cell, originX } = camera;
  const rows = Math.ceil(canvas.height / cell) + 1;
  const top = windowTop(state);
  const king = playerKing(state);

  ctx.fillStyle = THEME.shell;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1. The board itself, then the two things Rank Rush layers over it.
  for (let row = 0; row < rows; row++) {
    const rank = camera.bottomRank + row;
    const y = screenY(camera, canvas, rank);
    const drowned = rank <= state.wakeRank;

    for (let file = 0; file < FILES; file++) {
      const x = screenX(camera, file);
      const isLight = (file + rank) % 2 === 0;

      if (drowned) {
        ctx.fillStyle = isLight ? THEME.wakeLight : THEME.wakeDark;
      } else {
        ctx.fillStyle = isLight ? THEME.light : THEME.dark;
      }
      ctx.fillRect(x, y, cell, cell);

      if (rank > top) {
        ctx.fillStyle = THEME.beyond;
        ctx.fillRect(x, y, cell, cell);
      } else if (rank > state.fogRank) {
        ctx.fillStyle = THEME.fog;
        ctx.fillRect(x, y, cell, cell);
      }
    }

    // The lip of the wake, so you can see how close it is.
    if (rank === state.wakeRank) {
      ctx.fillStyle = THEME.wakeEdge;
      ctx.fillRect(originX, y, cell * FILES, Math.max(2, cell * 0.06));
    }
  }

  // 2. Highlights sit on the squares, under the pieces.
  if (scene.lastMove) {
    paintSquare(ctx, canvas, camera, scene.lastMove.from, THEME.highlight);
    paintSquare(ctx, canvas, camera, scene.lastMove.to, THEME.highlight);
  }
  if (state.selectedId !== null) {
    const held = state.pieces.find((p) => p.id === state.selectedId);
    if (held) paintSquare(ctx, canvas, camera, held, THEME.highlight);
  }
  if (king && scene.checkGlow) {
    const x = screenX(camera, king.file);
    const y = screenY(camera, canvas, king.rank);
    const gradient = ctx.createRadialGradient(
      x + cell / 2, y + cell / 2, cell * 0.1,
      x + cell / 2, y + cell / 2, cell * 0.62,
    );
    gradient.addColorStop(0, THEME.check);
    gradient.addColorStop(1, 'rgba(231, 66, 47, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, cell, cell);
  }

  // 3. Coordinates, painted into the squares the way a real board carries them.
  drawCoordinates(ctx, canvas, camera, rows);

  // 4. Dots for quiet moves, rings for captures.
  for (const target of scene.targets) {
    const x = screenX(camera, target.file);
    const y = screenY(camera, canvas, target.rank);
    const cx = x + cell / 2;
    const cy = y + cell / 2;
    const occupied = state.pieces.some((p) => p.file === target.file && p.rank === target.rank);

    ctx.beginPath();
    if (occupied) {
      ctx.strokeStyle = THEME.captureRing;
      ctx.lineWidth = cell * 0.09;
      ctx.arc(cx, cy, cell * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = THEME.moveDot;
      ctx.arc(cx, cy, cell * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (scene.hover) {
    const x = screenX(camera, scene.hover.file);
    const y = screenY(camera, canvas, scene.hover.rank);
    ctx.strokeStyle = THEME.hover;
    ctx.lineWidth = Math.max(2, cell * 0.045);
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, cell - ctx.lineWidth, cell - ctx.lineWidth);
  }

  // 5. Pieces. Anything in hand or mid-slide is drawn afterwards, on top.
  const animating = new Map(scene.animations.map((a) => [a.pieceId, a]));
  for (const piece of state.pieces) {
    if (scene.dragging?.pieceId === piece.id) continue;
    if (animating.has(piece.id)) continue;
    if (piece.rank < camera.bottomRank || piece.rank > camera.bottomRank + rows) continue;
    if (piece.side === 'enemy' && piece.rank > state.fogRank) continue;
    drawPiece(ctx, piece, screenX(camera, piece.file), screenY(camera, canvas, piece.rank), cell, 1);
  }

  for (const animation of scene.animations) {
    const piece = state.pieces.find((p) => p.id === animation.pieceId);
    if (!piece) continue;
    if (piece.side === 'enemy' && animation.to.rank > state.fogRank) continue;
    const eased = easeOut(animation.t);
    const x = lerp(screenX(camera, animation.from.file), screenX(camera, animation.to.file), eased);
    const y = lerp(
      screenY(camera, canvas, animation.from.rank),
      screenY(camera, canvas, animation.to.rank),
      eased,
    );
    drawPiece(ctx, piece, x, y, cell, 1);
  }

  if (scene.dragging) {
    const piece = state.pieces.find((p) => p.id === scene.dragging!.pieceId);
    if (piece) {
      drawPiece(ctx, piece, scene.dragging.x - cell / 2, scene.dragging.y - cell / 2, cell, 1.1);
    }
  }
}

function paintSquare(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  square: Square,
  colour: string,
): void {
  ctx.fillStyle = colour;
  ctx.fillRect(screenX(camera, square.file), screenY(camera, canvas, square.rank), camera.cell, camera.cell);
}

function drawCoordinates(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  rows: number,
): void {
  const { cell } = camera;
  ctx.font = `600 ${Math.floor(cell * 0.2)}px ui-sans-serif, system-ui, sans-serif`;

  // Rank numbers up the a-file.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let row = 0; row < rows; row++) {
    const rank = camera.bottomRank + row;
    if (rank < 1) continue;
    ctx.fillStyle = rank % 2 === 0 ? THEME.coordOnLight : THEME.coordOnDark;
    ctx.fillText(String(rank), screenX(camera, 0) + cell * 0.07, screenY(camera, canvas, rank) + cell * 0.06);
  }

  // File letters along the bottom row on screen.
  const bottom = camera.bottomRank;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  for (let file = 0; file < FILES; file++) {
    ctx.fillStyle = (file + bottom) % 2 === 0 ? THEME.coordOnLight : THEME.coordOnDark;
    ctx.fillText(
      FILE_LETTERS[file] as string,
      screenX(camera, file) + cell * 0.93,
      screenY(camera, canvas, bottom) + cell * 0.96,
    );
  }
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  x: number,
  y: number,
  cell: number,
  scale: number,
): void {
  const size = cell * 0.78 * scale;
  ctx.save();
  ctx.font = `${Math.floor(size)}px ${PIECE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, cell * 0.07);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
  ctx.shadowBlur = cell * (scale > 1 ? 0.16 : 0.05);
  ctx.shadowOffsetY = cell * (scale > 1 ? 0.06 : 0.02);

  const cx = x + cell / 2;
  const cy = y + cell / 2 + cell * 0.03;
  const glyph = GLYPHS[piece.type];

  // Outline first, fill over it. Stroking last eats the thin details inside a
  // king's crown and turns a white piece into a black one.
  ctx.strokeStyle = piece.side === 'player' ? THEME.playerLine : THEME.enemyLine;
  ctx.strokeText(glyph, cx, cy);

  ctx.shadowColor = 'transparent';
  ctx.fillStyle = piece.side === 'player' ? THEME.playerFill : THEME.enemyFill;
  ctx.fillText(glyph, cx, cy);
  ctx.restore();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Chess UIs land pieces rather than drift into them. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

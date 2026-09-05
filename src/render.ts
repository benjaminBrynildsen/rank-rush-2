import { FILES } from './constants.js';
import { playerKing, vanguardRank, windowTop } from './board.js';
import type { GameState, Piece, Square } from './types.js';

const GLYPHS: Record<string, string> = {
  'player-king': '♔',
  'player-queen': '♕',
  'player-rook': '♖',
  'player-bishop': '♗',
  'player-knight': '♘',
  'player-pawn': '♙',
  'enemy-king': '♚',
  'enemy-queen': '♛',
  'enemy-rook': '♜',
  'enemy-bishop': '♝',
  'enemy-knight': '♞',
  'enemy-pawn': '♟',
};

export interface Camera {
  /** Lowest rank drawn at the bottom of the canvas. */
  bottomRank: number;
  cell: number;
  originX: number;
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

export function squareAt(camera: Camera, canvas: HTMLCanvasElement, x: number, y: number): Square | null {
  const file = Math.floor((x - camera.originX) / camera.cell);
  const rowsFromBottom = Math.floor((canvas.height - y) / camera.cell);
  const rank = camera.bottomRank + rowsFromBottom;
  if (file < 0 || file >= FILES || rank < 1) return null;
  return { file, rank };
}

function screenY(camera: Camera, canvas: HTMLCanvasElement, rank: number): number {
  return canvas.height - (rank - camera.bottomRank + 1) * camera.cell;
}

export function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: GameState,
  camera: Camera,
  targets: readonly Square[],
): void {
  const { cell, originX } = camera;
  const rows = Math.ceil(canvas.height / cell) + 1;
  const fog = state.fogRank;
  const top = windowTop(state);

  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < rows; row++) {
    const rank = camera.bottomRank + row;
    const y = screenY(camera, canvas, rank);
    for (let file = 0; file < FILES; file++) {
      const x = originX + file * cell;
      const dark = (file + rank) % 2 === 0;
      if (rank <= state.wakeRank) {
        ctx.fillStyle = dark ? '#120608' : '#180a0d';
      } else if (rank > fog) {
        ctx.fillStyle = dark ? '#101319' : '#141821';
      } else {
        ctx.fillStyle = dark ? '#1d2531' : '#27303e';
      }
      ctx.fillRect(x, y, cell, cell);

      if (rank > top) {
        ctx.fillStyle = 'rgba(6,8,12,0.72)';
        ctx.fillRect(x, y, cell, cell);
      } else if (rank > fog) {
        ctx.fillStyle = 'rgba(6,8,12,0.45)';
        ctx.fillRect(x, y, cell, cell);
      }
    }

    if (rank === state.wakeRank) {
      ctx.fillStyle = 'rgba(210,60,70,0.55)';
      ctx.fillRect(originX, y, cell * FILES, Math.max(2, cell * 0.08));
    }

    ctx.fillStyle = 'rgba(150,165,190,0.5)';
    ctx.font = `${Math.floor(cell * 0.24)}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(rank), originX - cell * 0.42, y + 3);
  }

  for (const target of targets) {
    const y = screenY(camera, canvas, target.rank);
    const x = originX + target.file * cell;
    const occupied = state.pieces.some((p) => p.file === target.file && p.rank === target.rank);
    ctx.strokeStyle = occupied ? '#ff7a59' : '#6fe3a1';
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
  }

  for (const piece of state.pieces) {
    if (piece.rank < camera.bottomRank || piece.rank > camera.bottomRank + rows) continue;
    if (piece.side === 'enemy' && piece.rank > fog) continue;
    drawPiece(ctx, canvas, camera, piece, state.selectedId === piece.id);
  }
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  piece: Piece,
  selected: boolean,
): void {
  const x = camera.originX + piece.file * camera.cell;
  const y = screenY(camera, canvas, piece.rank);

  if (selected) {
    ctx.fillStyle = 'rgba(111,227,161,0.22)';
    ctx.fillRect(x, y, camera.cell, camera.cell);
  }

  ctx.font = `${Math.floor(camera.cell * 0.74)}px "Segoe UI Symbol", "Apple Symbols", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = piece.side === 'player' ? '#f4f7ff' : '#ff9d8a';
  ctx.fillText(
    GLYPHS[`${piece.side}-${piece.type}`] ?? '?',
    x + camera.cell / 2,
    y + camera.cell / 2 + camera.cell * 0.04,
  );
}

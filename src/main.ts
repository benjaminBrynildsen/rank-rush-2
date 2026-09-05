import { PAWN_PERIOD, WAKE_PERIOD } from './constants.js';
import { playerKing, squareName } from './board.js';
import { createGame, move, targetsFor, totalScore, wouldPromote } from './engine.js';
import { computeCamera, draw, squareAt } from './render.js';
import { dailySeed } from './rng.js';
import type { GameState, PlyEvent, PromoType, Square } from './types.js';

const canvas = document.getElementById('board') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud') as HTMLElement;
const log = document.getElementById('log') as HTMLElement;
const promoBox = document.getElementById('promo') as HTMLElement;
const overBox = document.getElementById('over') as HTMLElement;

let state: GameState = createGame(dailySeed());
let targets: Square[] = [];
/** One selected id at a time, so two fingers cannot drive two pieces (G38). */
let selected: number | null = null;
let pendingMove: { pieceId: number; to: Square } | null = null;

function resize(): void {
  const rect = canvas.parentElement!.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  render();
}

function render(): void {
  const camera = computeCamera(state, canvas);
  draw(ctx, canvas, state, camera, targets);

  const king = playerKing(state);
  hud.innerHTML = [
    ['king rank', king ? king.rank : '—'],
    ['score', totalScore(state)],
    ['captures', state.captures],
    ['pawn in', PAWN_PERIOD - state.movesUntilPawn],
    ['wake in', WAKE_PERIOD - state.movesUntilWake],
    ['wake at', state.wakeRank],
    ['fallen', state.fallen],
  ]
    .map(([label, value]) => `<span><b>${value}</b>${label}</span>`)
    .join('');

  overBox.hidden = !state.gameOverReason;
  if (state.gameOverReason) {
    overBox.innerHTML =
      `<h2>${reasonText(state.gameOverReason)}</h2>` +
      `<p>king rank ${state.bestKingRank} · ${state.captures} captures · ${totalScore(state)} points</p>` +
      `<button id="again">new run</button>`;
    (document.getElementById('again') as HTMLButtonElement).onclick = restart;
  }
}

function reasonText(reason: NonNullable<GameState['gameOverReason']>): string {
  switch (reason) {
    case 'king-captured':
      return 'The crown fell.';
    case 'no-legal-move':
      return 'Nowhere left to stand.';
    case 'wake-took-the-king':
      return 'The wake took the king.';
    case 'map-ends':
      return 'The map ends.';
  }
}

function restart(): void {
  state = createGame(dailySeed());
  selected = null;
  targets = [];
  pendingMove = null;
  log.textContent = '';
  render();
}

function onPointerDown(event: PointerEvent): void {
  // Input is refused while a ply resolves or a promotion is open (G07, G36).
  if (state.busy || state.gameOverReason || !promoBox.hidden) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const camera = computeCamera(state, canvas);
  // The drop target is recomputed from the pointer against the current camera,
  // so a scroll under the finger cannot land the move somewhere else (G37).
  const square = squareAt(camera, canvas, (event.clientX - rect.left) * dpr, (event.clientY - rect.top) * dpr);
  if (!square) return;

  const clicked = state.pieces.find((p) => p.file === square.file && p.rank === square.rank);

  if (selected !== null && targets.some((t) => t.file === square.file && t.rank === square.rank)) {
    commit(selected, square);
    return;
  }

  if (clicked && clicked.side === 'player') {
    // Selection is by piece id. If the id is gone, there is nothing selected (G07).
    selected = clicked.id;
    state.selectedId = clicked.id;
    targets = targetsFor(state, clicked.id);
  } else {
    selected = null;
    state.selectedId = null;
    targets = [];
  }
  render();
}

function commit(pieceId: number, to: Square): void {
  if (wouldPromote(state, pieceId, to)) {
    pendingMove = { pieceId, to };
    promoBox.hidden = false;
    render();
    return;
  }
  send(pieceId, to);
}

function send(pieceId: number, to: Square, promo?: PromoType): void {
  const result = move(state, { pieceId, to, promo, generationId: state.generationId });
  selected = null;
  state.selectedId = null;
  targets = [];
  if (!result.ok) {
    write(`rejected: ${result.rejected}`);
  } else {
    for (const event of result.events) write(describe(event));
  }
  render();
}

for (const button of Array.from(promoBox.querySelectorAll('button'))) {
  button.addEventListener('click', () => {
    const choice = button.dataset.promo as PromoType;
    promoBox.hidden = true;
    if (pendingMove) {
      const { pieceId, to } = pendingMove;
      pendingMove = null;
      send(pieceId, to, choice);
    }
  });
}

function describe(event: PlyEvent): string {
  switch (event.kind) {
    case 'move':
      return `move ${squareName(event.from.file, event.from.rank)} → ${squareName(event.to.file, event.to.rank)}`;
    case 'capture':
      return `took a ${event.type} at ${squareName(event.at.file, event.at.rank)} (+${event.points})`;
    case 'recruit':
      return `a ${event.type} joins at ${squareName(event.at.file, event.at.rank)}`;
    case 'recruit-skipped':
      return `no room for the ${event.type} (${event.why})`;
    case 'conscript':
      return `conscript pawn at ${squareName(event.at.file, event.at.rank)}`;
    case 'conscript-skipped':
      return `no room for the conscript (${event.why})`;
    case 'promotion':
      return `pawn becomes a ${event.to}`;
    case 'wake':
      return `the wake reaches rank ${event.rank}${event.eaten ? ` and takes ${event.eaten}` : ''}`;
    case 'spawn-pack':
      return `${event.name} ahead (${event.count})`;
    case 'game-over':
      return `run over: ${event.reason}`;
  }
}

function write(line: string): void {
  const row = document.createElement('div');
  row.textContent = line;
  log.prepend(row);
  while (log.childElementCount > 60) log.lastElementChild?.remove();
}

canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('resize', resize);
resize();

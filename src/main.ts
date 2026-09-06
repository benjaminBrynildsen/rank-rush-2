import { PAWN_PERIOD, WAKE_PERIOD } from './constants.js';
import { playerKing, squareName } from './board.js';
import { inCheck } from './moves.js';
import { createGame, move, targetsFor, totalScore, wouldPromote } from './engine.js';
import { computeCamera, draw, squareAt, type Camera, type PieceAnimation } from './render.js';
import { dailySeed } from './rng.js';
import type { GameState, PlyEvent, PromoType, Square } from './types.js';

const canvas = document.getElementById('board') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud') as HTMLElement;
const log = document.getElementById('log') as HTMLElement;
const promoBox = document.getElementById('promo') as HTMLElement;
const overBox = document.getElementById('over') as HTMLElement;

const TABS: { tab: HTMLButtonElement; panel: HTMLElement }[] = [
  { tab: byId('tab-rules'), panel: document.getElementById('rules') as HTMLElement },
  { tab: byId('tab-log'), panel: document.getElementById('log-panel') as HTMLElement },
];

function byId(id: string): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

function showTab(which: 'tab-rules' | 'tab-log'): void {
  for (const { tab, panel } of TABS) {
    const on = tab.id === which;
    tab.setAttribute('aria-selected', String(on));
    panel.hidden = !on;
  }
}

for (const { tab } of TABS) {
  tab.addEventListener('click', () => showTab(tab.id as 'tab-rules' | 'tab-log'));
}

const MOVE_MS = 130;
const ENEMY_STAGGER_MS = 45;
/** Past this many pixels a press is a drag, not a click. */
const DRAG_SLOP = 4;

let state: GameState = createGame(dailySeed());
let targets: Square[] = [];
/** One selected id at a time, so two fingers cannot drive two pieces (G38). */
let selected: number | null = null;
let hover: Square | null = null;
let lastMove: { from: Square; to: Square } | null = null;
let pendingMove: { pieceId: number; to: Square } | null = null;
let handedOverToReport = false;

interface Drag {
  pieceId: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** True when this press landed on the piece that was already in hand. */
  wasSelected: boolean;
}
let drag: Drag | null = null;

interface Slide extends PieceAnimation {
  startedAt: number;
  duration: number;
  delay: number;
}
let slides: Slide[] = [];

function resize(): void {
  const rect = canvas.parentElement!.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
}

function camera(): Camera {
  return computeCamera(state, canvas);
}

/** Pointer coordinates in the canvas's own pixels. */
function toCanvas(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return { x: (event.clientX - rect.left) * dpr, y: (event.clientY - rect.top) * dpr };
}

function frame(now: number): void {
  slides = slides.filter((s) => now - s.startedAt < s.delay + s.duration);
  for (const slide of slides) {
    const elapsed = now - s0(slide);
    slide.t = Math.max(0, Math.min(1, elapsed / slide.duration));
  }
  render();
  requestAnimationFrame(frame);
}

function s0(slide: Slide): number {
  return slide.startedAt + slide.delay;
}

function render(): void {
  const cam = camera();
  draw(ctx, canvas, {
    state,
    camera: cam,
    targets,
    // The drop ring only shows while a piece is in hand, the way it does on a
    // chess board. A ring following an idle cursor is just noise.
    hover: selected === null ? null : hover,
    lastMove,
    dragging: drag && drag.moved ? { pieceId: drag.pieceId, x: drag.x, y: drag.y } : null,
    animations: slides,
    checkGlow: !state.gameOverReason && inCheck(state),
  });
  renderHud();
}

function renderHud(): void {
  const king = playerKing(state);
  hud.innerHTML = (
    [
      ['king rank', king ? king.rank : '—'],
      ['score', totalScore(state)],
      ['captures', state.captures],
      ['pawn in', PAWN_PERIOD - state.movesUntilPawn],
      ['wake in', WAKE_PERIOD - state.movesUntilWake],
      ['wake at', state.wakeRank],
      ['fallen', state.fallen],
    ] as [string, string | number][]
  )
    .map(([label, value]) => {
      const king = playerKing(state);
      const closing = label === 'wake in' && value === 1 && !!king && king.rank <= state.wakeRank + 2;
      return `<span${closing ? ' class="urgent"' : ''}><b>${value}</b>${label}</span>`;
    })
    .join('');

  overBox.hidden = !state.gameOverReason;
  if (state.gameOverReason && !overBox.dataset.done) {
    overBox.dataset.done = '1';
    overBox.innerHTML =
      `<h2>${reasonText(state.gameOverReason)}</h2>` +
      `<p>king rank ${state.bestKingRank} · ${state.captures} captures · ${totalScore(state)} points</p>` +
      `<button id="again">New run</button>`;
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
  clearSelection();
  lastMove = null;
  pendingMove = null;
  slides = [];
  delete overBox.dataset.done;
  log.textContent = '';
  handedOverToReport = true;
}

function clearSelection(): void {
  selected = null;
  state.selectedId = null;
  targets = [];
  drag = null;
}

function select(pieceId: number): void {
  selected = pieceId;
  state.selectedId = pieceId;
  targets = targetsFor(state, pieceId);
}

function isTarget(square: Square): boolean {
  return targets.some((t) => t.file === square.file && t.rank === square.rank);
}

function idle(): boolean {
  return !state.busy && !state.gameOverReason && promoBox.hidden;
}

function onPointerDown(event: PointerEvent): void {
  if (!idle()) return;
  if (event.button !== 0) {
    clearSelection();
    return;
  }

  const point = toCanvas(event);
  // The drop target is read off the live camera, so a scroll under the pointer
  // cannot land the move somewhere else (G37).
  const square = squareAt(camera(), canvas, point.x, point.y);
  if (!square) return;

  const clicked = state.pieces.find((p) => p.file === square.file && p.rank === square.rank);

  if (selected !== null && isTarget(square)) {
    commit(selected, square, true);
    return;
  }

  if (clicked && clicked.side === 'player') {
    // Pressing the piece already in hand starts a drag too. It only goes back
    // down if the press is released without travelling.
    const wasSelected = selected === clicked.id;
    select(clicked.id);
    drag = {
      pieceId: clicked.id,
      x: point.x,
      y: point.y,
      startX: point.x,
      startY: point.y,
      moved: false,
      wasSelected,
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
    return;
  }

  clearSelection();
}

function onPointerMove(event: PointerEvent): void {
  const point = toCanvas(event);
  hover = idle() ? squareAt(camera(), canvas, point.x, point.y) : null;

  if (drag) {
    drag.x = point.x;
    drag.y = point.y;
    if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) > DRAG_SLOP * (window.devicePixelRatio || 1)) {
      drag.moved = true;
    }
    return;
  }

  const over = hover && state.pieces.some(
    (p) => p.side === 'player' && p.file === hover!.file && p.rank === hover!.rank,
  );
  canvas.style.cursor = over ? 'grab' : 'default';
}

function onPointerUp(event: PointerEvent): void {
  canvas.style.cursor = 'default';
  if (!drag) return;
  const held = drag;
  drag = null;

  if (!held.moved) {
    // A press with no travel is a click. Clicking the piece already in hand is
    // how you put it back down; clicking a different one keeps it selected.
    if (held.wasSelected) clearSelection();
    return;
  }

  const point = toCanvas(event);
  const square = squareAt(camera(), canvas, point.x, point.y);
  // A drag onto an illegal square returns the piece and keeps it in hand.
  if (square && isTarget(square)) commit(held.pieceId, square, false);
}

function onPointerCancel(): void {
  drag = null;
  canvas.style.cursor = 'default';
}

function commit(pieceId: number, to: Square, animate: boolean): void {
  if (wouldPromote(state, pieceId, to)) {
    pendingMove = { pieceId, to };
    promoBox.hidden = false;
    return;
  }
  send(pieceId, to, animate);
}

function send(pieceId: number, to: Square, animate: boolean, promo?: PromoType): void {
  const from = state.pieces.find((p) => p.id === pieceId);
  const origin: Square | null = from ? { file: from.file, rank: from.rank } : null;

  const result = move(state, { pieceId, to, promo, generationId: state.generationId });
  clearSelection();

  if (!result.ok) {
    write(`rejected: ${result.rejected}`);
    return;
  }

  if (origin) lastMove = { from: origin, to: { ...to } };

  if (!handedOverToReport) {
    handedOverToReport = true;
    showTab('tab-log');
  }

  const now = performance.now();
  // A piece you dragged is already where you put it. A piece you clicked slides.
  if (animate && origin) {
    slides.push({ pieceId, from: origin, to: { ...to }, t: 0, startedAt: now, duration: MOVE_MS, delay: 0 });
  }

  let enemyIndex = 0;
  for (const event of result.events) {
    if (event.kind === 'enemy-move') {
      slides.push({
        pieceId: event.pieceId,
        from: event.from,
        to: event.to,
        t: 0,
        startedAt: now,
        duration: MOVE_MS,
        delay: (animate ? MOVE_MS : 0) + enemyIndex * ENEMY_STAGGER_MS,
      });
      enemyIndex++;
    }
    const line = describe(event);
    if (line) write(line);
  }
}

for (const button of Array.from(promoBox.querySelectorAll('button'))) {
  button.addEventListener('click', () => {
    const choice = button.dataset.promo as PromoType;
    promoBox.hidden = true;
    if (pendingMove) {
      const { pieceId, to } = pendingMove;
      pendingMove = null;
      send(pieceId, to, true, choice);
    }
  });
}

/** Returns null for events the field report should not narrate. */
function describe(event: PlyEvent): string | null {
  switch (event.kind) {
    case 'move':
      return `${squareName(event.from.file, event.from.rank)} → ${squareName(event.to.file, event.to.rank)}`;
    case 'capture':
      return `took a ${event.type} on ${squareName(event.at.file, event.at.rank)} (+${event.points})`;
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
    case 'lost':
      return `lost a ${event.type} on ${squareName(event.at.file, event.at.rank)} to their ${event.to}`;
    case 'wake':
      return `the wake reaches rank ${event.rank}${event.eaten ? ` and takes ${event.eaten}` : ''}`;
    case 'spawn-pack':
      return `${event.name} ahead (${event.count})`;
    case 'game-over':
      return `run over: ${event.reason}`;
    case 'enemy-move':
      // Shown on the board, not in the report: it would drown everything else.
      return null;
  }
}

function write(line: string): void {
  const row = document.createElement('div');
  row.textContent = line;
  log.prepend(row);
  while (log.childElementCount > 60) log.lastElementChild?.remove();
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerCancel);
canvas.addEventListener('pointerleave', () => { hover = null; });
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); clearSelection(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearSelection(); });
// The stage is sized by the grid, so watch it rather than the window: a
// sidebar collapsing at a breakpoint resizes the board without a window resize.
new ResizeObserver(resize).observe(canvas.parentElement!);
window.addEventListener('resize', resize);

resize();
requestAnimationFrame(frame);

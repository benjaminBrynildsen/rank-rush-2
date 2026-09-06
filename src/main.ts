import { PAWN_PERIOD } from './constants.js';
import { playerKing, squareName } from './board.js';
import { inCheck } from './moves.js';
import {
  createGame,
  endOnClock,
  move,
  requestWakeTick,
  targetsFor,
  totalScore,
  wouldPromote,
} from './engine.js';
import { DEFAULT_MODE, MODES, type ModeId } from './modes.js';
import { computeCamera, draw, squareAt, type Camera, type PieceAnimation } from './render.js';
import { dailySeed } from './rng.js';
import type { GameState, PlyEvent, PlyResult, PromoType, Square } from './types.js';

const canvas = document.getElementById('board') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud') as HTMLElement;
const log = document.getElementById('log') as HTMLElement;
const promoBox = document.getElementById('promo') as HTMLElement;
const overBox = document.getElementById('over') as HTMLElement;
const menuBox = document.getElementById('menu') as HTMLElement;

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

let state: GameState = createGame(dailySeed(), DEFAULT_MODE);
let targets: Square[] = [];
/** One selected id at a time, so two fingers cannot drive two pieces (G38). */
let selected: number | null = null;
let hover: Square | null = null;
let lastMove: { from: Square; to: Square } | null = null;
let pendingMove: { pieceId: number; to: Square } | null = null;
let handedOverToReport = false;
/** No clock and no wake tick until the player has picked a mode and started. */
let running = false;

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

/**
 * The Sprint clock. Driven off the render loop rather than an interval, and
 * stopped while the tab is hidden - losing a run to a background tab is not a
 * difficulty, it is a bug.
 */
const clock = { remaining: 0, wakeOwed: 0, lastAt: 0 };

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
  advanceClock(now);

  slides = slides.filter((s) => now - s.startedAt < s.delay + s.duration);
  for (const slide of slides) {
    const elapsed = now - (slide.startedAt + slide.delay);
    slide.t = Math.max(0, Math.min(1, elapsed / slide.duration));
  }
  render();
  requestAnimationFrame(frame);
}

function advanceClock(now: number): void {
  const mode = MODES[state.mode];
  if (!running || state.gameOverReason || mode.wakeSeconds === null || document.hidden) {
    clock.lastAt = now;
    return;
  }

  const dt = Math.min(1, (now - clock.lastAt) / 1000);
  clock.lastAt = now;

  clock.wakeOwed += dt;
  while (clock.wakeOwed >= mode.wakeSeconds && !state.gameOverReason) {
    clock.wakeOwed -= mode.wakeSeconds;
    report(requestWakeTick(state));
  }

  if (mode.clockSeconds !== null) {
    clock.remaining = Math.max(0, clock.remaining - dt);
    if (clock.remaining <= 0 && !state.gameOverReason) report(endOnClock(state));
  }
}

function render(): void {
  draw(ctx, canvas, {
    state,
    camera: camera(),
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

function clockText(): string {
  const total = Math.ceil(clock.remaining);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function renderHud(): void {
  const mode = MODES[state.mode];
  const king = playerKing(state);
  const cells: { label: string; value: string | number; urgent?: boolean }[] = [];

  if (mode.clockSeconds !== null) {
    cells.push({ label: 'time', value: clockText(), urgent: clock.remaining <= 30 });
  }
  cells.push({ label: 'king rank', value: king ? king.rank : '—' });
  cells.push({ label: 'last rank', value: state.lastRank });
  cells.push({ label: 'score', value: totalScore(state) });
  cells.push({ label: 'captures', value: state.captures });
  cells.push({ label: 'pawn in', value: PAWN_PERIOD - state.movesUntilPawn });
  if (mode.wakeMoves !== null) {
    const left = mode.wakeMoves - state.movesUntilWake;
    cells.push({
      label: 'wake in',
      value: left,
      urgent: left === 1 && !!king && king.rank <= state.wakeRank + 1,
    });
  }
  cells.push({
    label: 'wake at',
    value: state.wakeRank,
    urgent: !!king && king.rank <= state.wakeRank + 1,
  });
  cells.push({ label: 'fallen', value: state.fallen });

  hud.innerHTML = cells
    .map((c) => `<span${c.urgent ? ' class="urgent"' : ''}><b>${c.value}</b>${c.label}</span>`)
    .join('');

  overBox.hidden = !state.gameOverReason;
  if (state.gameOverReason && !overBox.dataset.done) {
    overBox.dataset.done = '1';
    const won = state.gameOverReason === 'crown-taken';
    overBox.classList.toggle('won', won);
    overBox.innerHTML =
      `<h2>${reasonText(state.gameOverReason)}</h2>` +
      `<p>king rank ${state.bestKingRank} of ${state.lastRank} · ${state.captures} captures · ` +
      `${totalScore(state)} points</p>` +
      `<button id="again">New run</button>`;
    byId('again').onclick = openMenu;
  }
}

function reasonText(reason: NonNullable<GameState['gameOverReason']>): string {
  switch (reason) {
    case 'crown-taken':
      return 'The last king falls.';
    case 'king-captured':
      return 'The crown fell.';
    case 'no-legal-move':
      return 'Nowhere left to stand.';
    case 'wake-took-the-king':
      return 'The wake took the king.';
    case 'out-of-time':
      return 'Time.';
    case 'map-ends':
      return 'The map ends.';
  }
}

function openMenu(): void {
  running = false;
  menuBox.hidden = false;
  overBox.hidden = true;
  delete overBox.dataset.done;
}

function start(modeId: ModeId): void {
  state = createGame(dailySeed(), modeId);
  clearSelection();
  lastMove = null;
  pendingMove = null;
  slides = [];
  log.textContent = '';
  handedOverToReport = false;
  delete overBox.dataset.done;
  overBox.classList.remove('won');
  overBox.hidden = true;
  menuBox.hidden = true;
  showTab('tab-rules');

  const mode = MODES[modeId];
  clock.remaining = mode.clockSeconds ?? 0;
  clock.wakeOwed = 0;
  clock.lastAt = performance.now();
  running = true;
}

for (const button of Array.from(menuBox.querySelectorAll('button[data-mode]'))) {
  button.addEventListener('click', () => start((button as HTMLElement).dataset.mode as ModeId));
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
  return running && !state.busy && !state.gameOverReason && promoBox.hidden;
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
    const slop = DRAG_SLOP * (window.devicePixelRatio || 1);
    if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) > slop) {
      drag.moved = true;
    }
    return;
  }

  const over =
    hover &&
    state.pieces.some((p) => p.side === 'player' && p.file === hover!.file && p.rank === hover!.rank);
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

  // A piece you dragged is already where you put it. A piece you clicked slides.
  if (animate && origin) {
    slides.push({
      pieceId,
      from: origin,
      to: { ...to },
      t: 0,
      startedAt: performance.now(),
      duration: MOVE_MS,
      delay: 0,
    });
  }
  report(result, animate ? MOVE_MS : 0);
}

/** Turn a resolved ply into slides and field-report lines. */
function report(result: PlyResult, delayBase = 0): void {
  if (!result.ok) return;
  const now = performance.now();
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
        delay: delayBase + enemyIndex * ENEMY_STAGGER_MS,
      });
      enemyIndex++;
    }
    const line = describe(event);
    if (line) write(line);
  }
}

for (const button of Array.from(promoBox.querySelectorAll('button[data-promo]'))) {
  button.addEventListener('click', () => {
    const choice = (button as HTMLElement).dataset.promo as PromoType;
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
canvas.addEventListener('pointercancel', () => {
  drag = null;
  canvas.style.cursor = 'default';
});
canvas.addEventListener('pointerleave', () => {
  hover = null;
});
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  clearSelection();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') clearSelection();
});
// The stage is sized by the grid, so watch it rather than the window: a
// sidebar collapsing at a breakpoint resizes the board without a window resize.
new ResizeObserver(resize).observe(canvas.parentElement!);
window.addEventListener('resize', resize);

resize();
requestAnimationFrame(frame);

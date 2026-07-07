// 薄胶水层：加载数据 → 建状态 → 绑输入 → 主循环。
// 规则在 core/，画面在 render/，界面在 ui/，输入在 input/，数值文案在 data/。
import './styles/app.css';
import { gameConfig, texts } from './data';
import type { GameEvent, GameState } from './core/types';
import { createInitialState, createDefaultConfig } from './core/createInitialState';
import { updateGame } from './core/updateGame';
import { startNextWave } from './core/systems/waveSystem';
import { moveOrSwap, quickEquip, quickUnequip } from './core/systems/equipmentSystem';
import { collectNearest, spawnTestDrops } from './core/systems/dropSystem';
import { applyPerk } from './core/systems/progressionSystem';
import { createRenderer } from './render/canvasRenderer';
import { getDomRefs } from './ui/domRefs';
import { createToast } from './ui/toast';
import { renderHud } from './ui/renderHud';
import { renderCards } from './ui/renderCards';
import { renderEquipment } from './ui/renderEquipment';
import { renderTempSlot } from './ui/renderTempSlot';
import { createTunerPanel } from './ui/tunerPanel';
import { createModals } from './ui/modals';
import { formatToast, SLOT_CHANGING } from './ui/eventText';
import type { SlotHandlers } from './ui/slotFactory';
import { createPointerDrag } from './input/pointerDrag';
import { createDropClick } from './input/dropClick';
import { createKeyboard } from './input/keyboard';

const rng: () => number = Math.random;
const refs = getDomRefs();
const ctx = refs.canvas.getContext('2d');
if (!ctx) throw new Error('无法获取 canvas 2D 上下文');
const render = createRenderer(ctx);
const toast = createToast(refs);

const config = createDefaultConfig();
let state: GameState = createInitialState();

// —— 表现副作用统一由事件驱动 ——
function dispatch(events: GameEvent[]): void {
  let slotsChanged = false;
  for (const ev of events) {
    const text = formatToast(ev);
    if (text) toast(text);
    if (ev.type === 'levelUp') modals.showLevel();
    if (ev.type === 'gameEnd') modals.showResult(ev.win, state);
    if (SLOT_CHANGING.has(ev.type)) slotsChanged = true;
  }
  if (slotsChanged) refreshSlots();
}

function refreshSlots(): void {
  renderCards(refs, state, slotHandlers);
  renderEquipment(refs, state, slotHandlers);
  renderTempSlot(refs, state);
}

const slotHandlers: SlotHandlers = {
  quickAction(source, index) {
    dispatch(source === 'cards' ? quickEquip(state, index) : quickUnequip(state, index));
  },
  dragStart(e, source, index, el) {
    pointerDrag.begin(e, source, index, el);
  },
};

const modals = createModals(refs, {
  onPerk(id) {
    dispatch(applyPerk(state, config, id));
    modals.hideLevel();
    renderHud(refs, state, config);
  },
  onRestart() {
    reset();
    start();
  },
});

const tuner = createTunerPanel(refs, config, {
  onChange() { renderHud(refs, state, config); },
  onReset() { toast(texts.toast.tunerReset); },
});

const pointerDrag = createPointerDrag((source, index, targetKind, targetIndex) => {
  dispatch(moveOrSwap(state, source, index, targetKind, targetIndex));
});

createDropClick(refs.canvas, (x, y) => {
  dispatch(collectNearest(state, x, y, gameConfig.drops.pickupRadius));
});
createKeyboard(togglePause);

refs.startBtn.addEventListener('click', start);
refs.pauseBtn.addEventListener('click', togglePause);
refs.testCardBtn.addEventListener('click', () => dispatch(spawnTestDrops(state, config, rng)));

function reset(): void {
  state = createInitialState();
  modals.hideResult();
  modals.hideLevel();
  refs.startBtn.textContent = texts.buttons.start;
  refs.pauseBtn.textContent = texts.buttons.pause;
  modals.message(texts.center.readyTitle, texts.center.readyBody, true);
  refreshSlots();
  renderHud(refs, state, config);
}

function start(): void {
  if (state.mode !== 'ready') reset();
  state.mode = 'playing';
  dispatch(startNextWave(state));
  refs.startBtn.textContent = texts.buttons.restart;
  modals.message('', '', false);
}

function togglePause(): void {
  if (state.mode !== 'playing') return;
  state.paused = !state.paused;
  refs.pauseBtn.textContent = state.paused ? texts.buttons.resume : texts.buttons.pause;
  modals.message(state.paused ? texts.center.pausedTitle : '', texts.center.pausedBody, state.paused);
}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(gameConfig.combat.dtCap, (now - last) / 1000);
  last = now;
  dispatch(updateGame(state, config, rng, dt));
  renderHud(refs, state, config);
  render(state, config);
  requestAnimationFrame(loop);
}

tuner.syncInputs();
reset();
requestAnimationFrame(loop);

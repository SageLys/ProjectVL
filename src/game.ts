// 游戏本体入口：加载配置 → 注册技能定义 → 建状态 → 绑输入 → 主循环。
// 规则在 core/，画面在 render/，界面在 ui/，输入在 input/，数值在 config/，皮肤文案在 data/。
import './styles/app.css';
import { activeVariants, cfg } from './config';
import { texts } from './data';
import type { GameEvent, GameState } from './core/types';
import { createInitialState, createDefaultConfig } from './core/createInitialState';
import { updateGame } from './core/updateGame';
import { registerSkillDefs } from './core/effects/interpreter';
import { startNextWave } from './core/systems/waveSystem';
import { moveOrSwap, unequipDestroy, consumeCard } from './core/systems/equipmentSystem';
import { collectNearest, spawnTestDrops, spawnGroundDrop } from './core/systems/dropSystem';
import { applyPerk } from './core/systems/progressionSystem';
import { createRenderer } from './render/canvasRenderer';
import { getDomRefs } from './ui/domRefs';
import { createToast } from './ui/toast';
import { renderHud } from './ui/renderHud';
import { renderCards } from './ui/renderCards';
import { renderEquipment } from './ui/renderEquipment';
import { createTunerPanel } from './ui/tunerPanel';
import { createModals } from './ui/modals';
import { formatToast, SLOT_CHANGING } from './ui/eventText';
import type { SlotHandlers } from './ui/slotFactory';
import { createPointerRouter, type PreviewSpec } from './input/pointerRouter';
import { createKeyboard } from './input/keyboard';

// 技能 = 数据 + 解释器：把配置里的卡定义注入解释器（P5 实装 12 张正式卡后自动生效）。
registerSkillDefs(cfg.skills.cards);

const rng: () => number = Math.random;
const refs = getDomRefs();
const ctx = refs.canvas.getContext('2d');
if (!ctx) throw new Error('无法获取 canvas 2D 上下文');
const render = createRenderer(ctx);
const toast = createToast(refs);

const config = createDefaultConfig();
let state: GameState = createInitialState();

refs.totalWavesText.textContent = String(cfg.waves.totalWaves);
refs.equipmentHint.textContent = `拖入 ${cfg.economy.equipThreshold}★+ 卡装备`;
refs.cardsHint.textContent = '拖到战场释放 · 同型同星自动合成';

const destroyLayer = document.createElement('div');
destroyLayer.className = 'destroy-hud';
destroyLayer.hidden = true;
document.body.append(destroyLayer);

function closeDestroyConfirm(): void { destroyLayer.hidden = true; }

function openDestroyConfirm(index: number): void {
  const card=state.equipment[index]; if(!card)return; const meta=cfg.skills.legacy.types[card.type];
  const slot = refs.equipmentSlots.querySelector<HTMLElement>(`[data-index="${index}"]`);
  if (slot) {
    const rect = slot.getBoundingClientRect();
    destroyLayer.style.left = `${Math.min(innerWidth - 12, Math.max(12, rect.left + rect.width / 2))}px`;
    destroyLayer.style.top = `${Math.max(8, rect.top - 8)}px`;
  }
  destroyLayer.dataset.testid='destroy-confirm';
  destroyLayer.innerHTML=`<span><b>永久销毁 ${card.star}★ ${meta.name}</b><small>失去「${meta.desc}强化」· 无返还</small></span><button class="destroy-confirm-btn" data-testid="destroy-confirm-button">销毁</button><button class="confirm-cancel" aria-label="取消销毁">取消</button>`;
  destroyLayer.hidden=false;
  destroyLayer.querySelector('.destroy-confirm-btn')!.addEventListener('click',()=>{dispatch(unequipDestroy(state,index));closeDestroyConfirm();});
  destroyLayer.querySelector('.confirm-cancel')!.addEventListener('click',closeDestroyConfirm);
}

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
}

const slotHandlers: SlotHandlers = {
  destroyRequest: openDestroyConfirm,
  dragStart(e, source, index, el) {
    pointerRouter.begin(e, source, index, el);
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

function previewFor(source: 'cards' | 'equipment', index: number): PreviewSpec {
  const card = source === 'cards' ? state.cards[index] : state.equipment[index];
  const def = card && cfg.skills.cards.find(item => item.id === card.type);
  const tier = card && def?.consumable?.byStar[String(card.star) as '1' | '2' | '3'];
  return tier?.radius == null ? { placement: 'screen' } : { placement: 'point', radius: tier.radius };
}

const pointerRouter = createPointerRouter({
  canvas: refs.canvas, dock: refs.dock, aimPreview: refs.aimPreview, screenPreview: refs.screenPreview,
  input: cfg.input, bountyEnabled: cfg.skills.mechanisms.bounty.enabled,
  onBountyTap: (_x, _y) => false, // S5 启用 bounty 后在此命中并接单。
  onArenaTap: (x, y) => dispatch(collectNearest(state, config, rng, x, y, cfg.economy.drops.pickupRadius)),
  onDrop: (source, index, target) => {
    if (target.kind === 'arena' && source === 'cards') dispatch(consumeCard(state, config, rng, index, target.x, target.y));
    else if (target.kind === 'slot' && target.slotKind === 'equipment' && source === 'cards') {
      const events = moveOrSwap(state, config, rng, source, index, 'equipment', target.index);
      if (events.some(event => event.type === 'equipRejected' || event.type === 'equipFull')) state.equipTelemetry.rejects++;
      dispatch(events);
    } else if (target.kind === 'slot') dispatch(moveOrSwap(state, config, rng, source, index, target.slotKind, target.index));
  },
  previewFor,
});
createKeyboard(togglePause);

refs.startBtn.addEventListener('click', start);
refs.pauseBtn.addEventListener('click', togglePause);
refs.testCardBtn.addEventListener('click', () => dispatch(spawnTestDrops(state, config, rng)));

function reset(): void {
  state = createInitialState();
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('evidence') === 'equip') {
    state.cards[0] = { id: state.nextCardId++, type: 'damage', star: 4 };
  }
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
  dispatch(startNextWave(state, config, rng));
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
  const dt = Math.min(cfg.combat.dtCap, (now - last) / 1000);
  last = now;
  dispatch(updateGame(state, config, rng, dt));
  renderHud(refs, state, config);
  render(state, config);
  requestAnimationFrame(loop);
}

// 调试接口（仅 DEV 注入）：供控制台与浏览器自动化驱动。
if (import.meta.env.DEV) void import('./debug/exposeDebugApi').then(({ exposeDebugApi }) => exposeDebugApi({
  getState: () => ({ ...state, enemies: state.enemies.length, bullets: state.bullets.length, config: { ...config } }), start, reset,
  spawnGroundDrop: (x, y, type = null, star) => spawnGroundDrop(state, config, rng, x, y, type, star),
  addTestPair: () => dispatch(spawnTestDrops(state, config, rng)),
  moveOrSwap: (source, index, targetKind, targetIndex) => dispatch(moveOrSwap(state, config, rng, source, index, targetKind, targetIndex)),
  consumeAt: (index, x, y) => dispatch(consumeCard(state, config, rng, index, x, y)),
  destroyEquipment: index => dispatch(unequipDestroy(state, index)),
  setConfig: patch => { Object.assign(config, patch); tuner.syncInputs(); renderHud(refs, state, config); },
  getVariants: () => activeVariants,
}));

tuner.syncInputs();
reset();
requestAnimationFrame(loop);

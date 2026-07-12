// 薄胶水层：加载配置 → 注册技能定义 → 建状态 → 绑输入 → 主循环。
// 规则在 core/，画面在 render/，界面在 ui/，输入在 input/，数值在 config/，皮肤文案在 data/。
import './styles/app.css';
import { activeVariants, cfg } from './config';
import { texts } from './data';
import type { GameEvent, GameState } from './core/types';
import { createInitialState, createDefaultConfig } from './core/createInitialState';
import { updateGame } from './core/updateGame';
import { getSkillDef, registerSkillDefs } from './core/effects/interpreter';
import { startNextWave } from './core/systems/waveSystem';
import { moveOrSwap, quickEquip, quickUnequip, toggleLock, consumeCard } from './core/systems/equipmentSystem';
import { collectNearest, spawnTestDrops, spawnGroundDrop } from './core/systems/dropSystem';
import { acceptBountyAt } from './core/systems/bountySystem';
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
import type { SlotHandlers, SlotSource } from './ui/slotFactory';
import {
  createBrowserPointerRouter,
  cssRadiusToCanvas,
  type BrowserPointerRouter,
  type PointerActionResult,
} from './input/pointerRouter';
import { resolveArenaTapTarget } from './input/arenaTapResolver';
import { createKeyboard } from './input/keyboard';
import { exposeDebugApi } from './debug/exposeDebugApi';
import { offerDebugBounty } from './debug/debugGameActions';
import {
  clearAttentionTelemetry,
  getAttentionTelemetry,
  recordAttentionEvent,
  recordPointerTelemetry,
} from './telemetry/attentionTelemetry';

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
let pointerRouter: BrowserPointerRouter | null = null;

function gameplayInputEnabled(): boolean {
  return state.mode === 'playing' && (!cfg.input.strictPause || !state.paused);
}

function recordSemanticAction(action: string, outcome?: string, targetKind?: string, targetId?: number | string, interactionId?: string): void {
  recordAttentionEvent({
    gameTime: state.time,
    wave: state.wave,
    kind: 'semantic-action',
    action,
    outcome,
    targetKind,
    targetId,
    interactionId,
  });
}

refs.totalWavesText.textContent = String(cfg.waves.totalWaves);
refs.equipmentHint.textContent = `${cfg.economy.equipSlots}栏 · ${cfg.economy.equipThreshold}星起可装备`;
if (cfg.economy.equipMode === 'lock') {
  refs.cardsHint.textContent = `自动合成 · 单击锁定=装备（上限${cfg.economy.maxLocked}）· 拖入战场=消耗释放`;
}

// —— 表现副作用统一由事件驱动 ——
function dispatch(events: GameEvent[], interactionId?: string): void {
  let slotsChanged = false;
  let cancelPointerAfterDispatch = false;
  for (const ev of events) {
    const text = formatToast(ev);
    if (text) toast(text);
    if (ev.type === 'levelUp') {
      modals.showLevel();
      cancelPointerAfterDispatch = true;
    }
    if (ev.type === 'gameEnd') {
      modals.showResult(ev.win, state);
      cancelPointerAfterDispatch = true;
      recordAttentionEvent({
        gameTime: state.time,
        wave: state.wave,
        kind: 'game-state',
        action: 'game-end',
        outcome: ev.win ? 'win' : 'loss',
        interactionId,
        detail: { kills: state.kills, merges: state.merges, consumes: state.consumes, collected: state.collected, expired: state.expired },
      });
    }
    if (SLOT_CHANGING.has(ev.type)) slotsChanged = true;
    if (ev.type.startsWith('bounty')) {
      const targetId = 'enemyId' in ev ? ev.enemyId : undefined;
      const outcome = 'reason' in ev ? ev.reason : 'dropCount' in ev ? `${ev.dropCount}-drops` : undefined;
      recordSemanticAction(ev.type, outcome, 'bounty', targetId, interactionId);
    }
  }
  if (slotsChanged) refreshSlots();
  // dispatch 可在 pointer 回调内部触发；延迟到当前回调 cleanup 后再取消，避免重入释放 capture。
  if (cancelPointerAfterDispatch) queueMicrotask(() => pointerRouter?.cancelActive('disabled'));
}

function refreshSlots(): void {
  renderCards(refs, state, slotHandlers);
  renderEquipment(refs, state, slotHandlers);
}

const slotHandlers: SlotHandlers = {
  pointerDown(e, source, index, el) {
    pointerRouter?.beginCard(e, source, index, el);
  },
  activate(source, index) {
    const result = handleCardTap(source, index, 'keyboard');
    recordSemanticAction(result.action, 'keyboard', result.targetKind, result.targetId);
  },
};

const modals = createModals(refs, {
  onPerk(id) {
    const events = applyPerk(state, config, id);
    if (!events.some(event => event.type === 'perkApplied')) return;
    dispatch(events);
    recordSemanticAction('perk-choice', 'applied', 'perk', id);
    if (!events.some(event => event.type === 'levelUp')) modals.hideLevel();
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

function handleCardTap(source: SlotSource, index: number, interactionId?: string): PointerActionResult {
  const cardId = source === 'cards' ? state.cards[index]?.id : state.equipment[index]?.id;
  if (cfg.economy.equipMode === 'lock') {
    if (source !== 'cards') return { action: 'card-tap-ignored', targetKind: source, targetId: cardId };
    const events = toggleLock(state, index);
    dispatch(events, interactionId);
    return {
      action: events.some(event => event.type === 'locked')
        ? 'card-lock'
        : events.some(event => event.type === 'unlocked')
          ? 'card-unlock'
          : 'card-lock-rejected',
      targetKind: source,
      targetId: cardId,
    };
  }
  const events = source === 'cards'
    ? quickEquip(state, config, rng, index)
    : quickUnequip(state, config, rng, index);
  dispatch(events, interactionId);
  const rejected = events.length === 0 || events.some(event =>
    event.type === 'equipRejected' || event.type === 'equipFull' || event.type === 'unequipFull');
  return {
    action: rejected ? `card-${source === 'cards' ? 'equip' : 'unequip'}-rejected` : `card-${source === 'cards' ? 'equip' : 'unequip'}`,
    targetKind: source,
    targetId: cardId,
  };
}

pointerRouter = createBrowserPointerRouter(refs.canvas, cfg.input, {
  isEnabled: gameplayInputEnabled,
  onArenaTap({ point, pointerId }) {
    const interactionId = `pointer:${pointerId}`;
    const minRadius = cssRadiusToCanvas(refs.canvas, cfg.input.minTargetCssPx / 2);
    const bountyPadding = Math.max(
      cfg.skills.mechanisms.bounty.hitRadiusPadding,
      minRadius - cfg.enemies.types.normal.r,
    );
    const pickupRadius = Math.max(cfg.economy.drops.pickupRadius, minRadius);
    const target = resolveArenaTapTarget(state, point.x, point.y, pickupRadius, bountyPadding);
    if (target.ambiguous) {
      recordSemanticAction('arena-tap-ambiguous', `resolved-${target.kind}`, target.kind,
        target.kind === 'bounty' ? target.enemy.id : target.drop.id, interactionId);
    }
    if (target.kind === 'bounty') {
      const bountyEvents = acceptBountyAt(state, config, point.x, point.y, bountyPadding);
      dispatch(bountyEvents, interactionId);
      const accepted = bountyEvents.find(event => event.type === 'bountyAccepted');
      return {
        action: 'bounty-accept',
        targetKind: 'bounty',
        targetId: accepted?.type === 'bountyAccepted' ? accepted.enemyId : undefined,
      };
    }

    const events = collectNearest(state, config, rng, point.x, point.y, pickupRadius);
    dispatch(events, interactionId);
    return {
      action: events.some(event => event.type === 'collected')
        ? 'drop-pickup'
        : events.some(event => event.type === 'cardsFull')
          ? 'drop-blocked-full'
          : 'empty-tap',
      targetKind: target.kind === 'drop' ? 'drop' : 'arena',
      targetId: target.kind === 'drop' ? target.drop.id : undefined,
    };
  },
  onCardTap({ source, index, pointerId }) {
    return handleCardTap(source, index, `pointer:${pointerId}`);
  },
  onCardDrop({ source, index, target, pointerId }) {
    const interactionId = `pointer:${pointerId}`;
    const events = target.kind === 'arena'
      ? consumeCard(state, config, rng, index, target.x, target.y)
      : moveOrSwap(state, config, rng, source, index, target.slotKind, target.index);
    dispatch(events, interactionId);
    const moved = events.some(event => event.type === 'moved' || event.type === 'swapped' || event.type === 'fed');
    return {
      action: events.some(event => event.type === 'skillConsumed')
        ? 'card-cast'
        : target.kind === 'slot'
          ? moved ? 'card-move' : 'card-move-rejected'
          : 'card-cast-rejected',
      targetKind: target.kind,
    };
  },
  onTelemetry(event) {
    recordPointerTelemetry(event, state.time, state.wave);
  },
}, {
  getReticleDiameterCss(source, index) {
    if (source !== 'cards') return cfg.input.minTargetCssPx;
    const card = state.cards[index];
    if (!card) return cfg.input.minTargetCssPx;
    const tier = getSkillDef(card.type)?.consumable.byStar[String(card.star) as '1' | '2' | '3'];
    if (!tier?.radius) return cfg.input.minTargetCssPx;
    const rect = refs.canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / refs.canvas.width, rect.height / refs.canvas.height);
    return Math.max(cfg.input.minTargetCssPx, tier.radius * 2 * scale);
  },
});
createKeyboard(togglePause);

refs.startBtn.addEventListener('click', start);
refs.pauseBtn.addEventListener('click', togglePause);
refs.testCardBtn.addEventListener('click', () => {
  if (gameplayInputEnabled()) dispatch(spawnTestDrops(state, config, rng));
});
refs.testBountyBtn.addEventListener('click', () => {
  // Keep the deterministic QA target briefly outside the default turret range so
  // a mobile tester has time to see and deliberately accept it.
  if (gameplayInputEnabled()) dispatch(offerDebugBounty(state, cfg.combat.canvas.width * 0.94, cfg.combat.canvas.height * 0.12));
});

function reset(): void {
  pointerRouter?.cancelActive('disabled');
  state = createInitialState();
  recordSemanticAction('game-reset', 'ready');
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
  recordSemanticAction('game-start', 'playing');
  dispatch(startNextWave(state, config, rng));
  refs.startBtn.textContent = texts.buttons.restart;
  modals.message('', '', false);
}

function togglePause(): void {
  if (state.mode !== 'playing' || state.pauseReason === 'perk') return;
  state.paused = !state.paused;
  state.pauseReason = state.paused ? 'manual' : null;
  pointerRouter?.cancelActive('disabled');
  recordSemanticAction(state.paused ? 'game-pause' : 'game-resume', state.paused ? 'paused' : 'playing');
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
exposeDebugApi({
  getState: () => structuredClone({ state, config }),
  start,
  reset,
  spawnGroundDrop: (x, y, type = null, star) => spawnGroundDrop(state, config, rng, x, y, type, star),
  offerBounty: (x, y) => dispatch(offerDebugBounty(state, x, y)),
  addTestPair: () => dispatch(spawnTestDrops(state, config, rng)),
  moveOrSwap: (source, index, targetKind, targetIndex) => dispatch(moveOrSwap(state, config, rng, source, index, targetKind, targetIndex)),
  consumeAt: (index, x, y) => dispatch(consumeCard(state, config, rng, index, x, y)),
  toggleLock: index => dispatch(toggleLock(state, index)),
  setConfig: patch => { Object.assign(config, patch); tuner.syncInputs(); renderHud(refs, state, config); },
  getVariants: () => activeVariants,
  getAttentionTelemetry,
  getRunStats: () => ({
    session: getAttentionTelemetry().sessionId,
    ended: state.mode === 'ended', gameTime: state.time, wave: state.wave,
    level: state.level, hp: state.hp, kills: state.kills, merges: state.merges,
    consumes: state.consumes, collected: state.collected, expired: state.expired,
    equipOps: state.equipOps,
    bounty: { offered: state.bountyOffered, accepted: state.bountyAccepted, completed: state.bountyCompleted, failed: state.bountyFailed },
    build: [...state.cards, ...state.equipment].filter(Boolean).map(card => ({
      type: card!.type, star: card!.star,
      equipped: !!card!.locked || state.equipment.includes(card),
    })),
  }),
  clearAttentionTelemetry,
});

tuner.syncInputs();
reset();
requestAnimationFrame(loop);

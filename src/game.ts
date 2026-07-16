// 游戏本体入口：加载配置 → 注册技能定义 → 建状态 → 绑输入 → 主循环。
// 规则在 core/，画面在 render/，界面在 ui/，输入在 input/，数值在 config/，皮肤文案在 data/。
import './styles/app.css';
import { activeVariants, cfg } from './config';
import { texts } from './data';
import type { GameEvent, GameState, Rng } from './core/types';
import { createInitialState, createDefaultConfig } from './core/createInitialState';
import { updateGame } from './core/updateGame';
import { registerSkillDefs, resolveConsumableTier } from './core/effects/interpreter';
import { jumpToWave, restartWave, startNextWave } from './core/systems/waveSystem';
import { budgetAdmission } from './core/systems/budgetRules';
import { moveOrSwap, consumeCard } from './core/systems/equipmentSystem';
import { collectNearest, spawnTestDrops, spawnGroundDrop } from './core/systems/dropSystem';
import { acceptBountyTap } from './core/systems/enemySystem';
import { applyPerk } from './core/systems/progressionSystem';
import { totalRange } from './core/stats';
import { createRenderer } from './render/canvasRenderer';
import { getDomRefs } from './ui/domRefs';
import { createToast } from './ui/toast';
import { createUpgradeFeedback } from './ui/upgradeFeedback';
import { renderHud } from './ui/renderHud';
import { renderCards } from './ui/renderCards';
import { renderEquipment } from './ui/renderEquipment';
import type { TunerPanel } from './ui/tunerPanel';
import { createModals } from './ui/modals';
import { formatToast, SLOT_CHANGING } from './ui/eventText';
import type { SlotHandlers } from './ui/slotFactory';
import { createPointerRouter, type PreviewSpec } from './input/pointerRouter';
import { createKeyboard } from './input/keyboard';
import type { DevTelemetry } from './telemetry/devTelemetry';
import type { PerkDef } from './config/types';

// 技能 = 数据 + 解释器：把配置里的卡定义注入解释器（P5 实装 12 张正式卡后自动生效）。
registerSkillDefs(cfg.skills.cards);

let rngSource: Rng = Math.random;
const rng: Rng = import.meta.env.DEV ? () => rngSource() : Math.random;
let tuner: TunerPanel | null = null;
let telemetry: DevTelemetry | null = null;
let devSeed = 1;
let devTimeScale = 1;
let devInvincible = false;
const evidenceMode = import.meta.env.DEV ? new URLSearchParams(location.search).get('evidence') : null;
const refs = getDomRefs();
if (import.meta.env.DEV) {
  refs.testCardBtn.removeAttribute('hidden');
  refs.dropTelemetry.removeAttribute('hidden');
}
const ctx = refs.canvas.getContext('2d');
if (!ctx) throw new Error('无法获取 canvas 2D 上下文');
const render = createRenderer(ctx);
const toast = createToast(refs);
const upgradeFeedback = createUpgradeFeedback(refs);

const config = createDefaultConfig();
let state: GameState = createInitialState();

refs.totalWavesText.textContent = String(cfg.waves.totalWaves);
refs.equipmentHint.textContent = `拖入 ${cfg.economy.equipThreshold}★+ 卡装备`;
refs.cardsHint.textContent = '拖到战场释放 · 同型同星自动合成';

// —— 表现副作用统一由事件驱动 ——
function dispatch(events: GameEvent[]): void {
  if (import.meta.env.DEV) telemetry?.recordGameEvents(events);
  let slotsChanged = false;
  for (const ev of events) {
    const text = formatToast(ev);
    if (text) toast(text);
    if (ev.type === 'levelUp') modals.showLevel(resolveOfferedPerks(state));
    if (ev.type === 'gameEnd') {
      refs.pauseBtn.disabled = true;
      modals.showResult(ev.win, state);
    }
    if (SLOT_CHANGING.has(ev.type)) slotsChanged = true;
  }
  if (slotsChanged) refreshSlots();
  upgradeFeedback.handle(events);
}

function resolveOfferedPerks(currentState: GameState): PerkDef[] {
  return currentState.offeredPerks
    .map(id => cfg.progression.perks.find(perk => perk.id === id))
    .filter((perk): perk is PerkDef => perk !== undefined);
}

function refreshSlots(): void {
  renderCards(refs, state, slotHandlers);
  renderEquipment(refs, state, slotHandlers);
}

const slotHandlers: SlotHandlers = {
  dragStart(e, source, index, el) {
    pointerRouter.begin(e, source, index, el);
  },
};

const modals = createModals(refs, {
  onPerk(id) {
    const events = applyPerk(state, config, id, rng);
    dispatch(events);
    if (import.meta.env.DEV && events.some(event => event.type === 'perkApplied')) telemetry?.recordInput('perkSelect', id);
    if (!events.some(event => event.type === 'levelUp')) modals.hideLevel();
    renderHud(refs, state, config);
  },
  onRestart() {
    reset();
    start();
  },
});

function previewFor(source: 'cards' | 'equipment', index: number): PreviewSpec {
  const card = source === 'cards' ? state.cards[index] : state.equipment[index];
  const def = card && cfg.skills.cards.find(item => item.id === card.type);
  const tier = card && def ? resolveConsumableTier(def, card.star) : undefined;
  return tier?.radius == null ? { placement: 'screen' } : { placement: 'point', radius: tier.radius };
}

const pointerRouter = createPointerRouter({
  canvas: refs.canvas, dock: refs.dock, aimPreview: refs.aimPreview, screenPreview: refs.screenPreview,
  input: cfg.input, bountyEnabled: cfg.skills.mechanisms.bounty.enabled,
  isPaused: () => state.paused,
  onBountyTap: (x, y) => {
    const accepted = acceptBountyTap(state, x, y);
    if (accepted && import.meta.env.DEV) telemetry?.recordInput('bountyAccept');
    return accepted;
  },
  onArenaTap: (x, y) => {
    const events = collectNearest(state, config, rng, x, y, cfg.economy.drops.pickupRadius);
    dispatch(events);
    if (import.meta.env.DEV && events.some(event => event.type === 'collected')) telemetry?.recordInput('pickupClick');
  },
  onDrop: (source, index, target) => {
    let events: GameEvent[] = [];
    if (target.kind === 'arena') events = consumeCard(state, config, rng, index, target.x, target.y, source);
    else if (target.kind === 'slot' && target.slotKind === 'equipment' && source === 'cards') {
      events = moveOrSwap(state, config, rng, source, index, 'equipment', target.index);
      if (events.some(event => event.type === 'equipRejected' || event.type === 'equipFull')) state.equipTelemetry.rejects++;
    } else if (target.kind === 'slot') events = moveOrSwap(state, config, rng, source, index, target.slotKind, target.index);
    dispatch(events);
    if (import.meta.env.DEV && events.some(event => event.type === 'skillConsumed')) telemetry?.recordInput('consumeRelease');
    else if (import.meta.env.DEV && events.some(event => SLOT_CHANGING.has(event.type))) telemetry?.recordInput('dragDrop');
  },
  previewFor,
});
createKeyboard(togglePause);

refs.startBtn.addEventListener('click', start);
refs.pauseBtn.addEventListener('click', togglePause);
refs.testCardBtn.addEventListener('click', () => dispatch(spawnTestDrops(state, config, rng)));

function reset(): void {
  state = createInitialState();
  if (import.meta.env.DEV) telemetry?.reset();
  if (evidenceMode === 'equip') {
    state.cards[0] = { id: state.nextCardId++, type: 'pierce', star: 4 };
  } else if (evidenceMode === 'upgrade4' || evidenceMode === 'upgrade5' || evidenceMode === 'upgrade6') {
    const sourceStar = Number(evidenceMode.charAt(evidenceMode.length - 1)) - 1;
    state.equipment[0] = { id: state.nextCardId++, type: 'pierce', star: sourceStar };
    state.cards[0] = { id: state.nextCardId++, type: 'pierce', star: sourceStar };
    state.cards[1] = { id: state.nextCardId++, type: 'frost', star: 1 };
  }
  modals.hideResult();
  modals.hideLevel();
  refs.startBtn.textContent = texts.buttons.start;
  refs.startBtn.parentElement?.removeAttribute('hidden');
  refs.pauseBtn.textContent = texts.buttons.pause;
  refs.pauseBtn.setAttribute('aria-pressed', 'false');
  refs.pauseBtn.title = texts.buttons.pause;
  refs.pauseBtn.disabled = true;
  modals.message(texts.center.readyTitle, texts.center.readyBody, true);
  refreshSlots();
  renderHud(refs, state, config);
}

function start(): void {
  if (state.mode !== 'ready') reset();
  tuner?.applyPendingWaveChanges();
  state.mode = 'playing';
  state.paused = false;
  refs.pauseBtn.disabled = false;
  dispatch(startNextWave(state, config, rng));
  refs.startBtn.textContent = texts.buttons.restart;
  refs.startBtn.parentElement?.setAttribute('hidden', '');
  modals.message('', '', false);
}

function togglePause(): void {
  if (state.mode !== 'playing') return;
  state.paused = !state.paused;
  refs.pauseBtn.textContent = state.paused ? texts.buttons.resume : texts.buttons.pause;
  refs.pauseBtn.setAttribute('aria-pressed', String(state.paused));
  refs.pauseBtn.title = state.paused ? texts.buttons.resume : texts.buttons.pause;
  modals.message(state.paused ? texts.center.pausedTitle : '', texts.center.pausedBody, state.paused);
}

let last = performance.now();
function loop(now: number): void {
  const scale = import.meta.env.DEV ? devTimeScale : 1;
  const dt = Math.min(cfg.combat.dtCap, ((now - last) / 1000) * scale);
  last = now;
  const lockedHp = state.hp;
  if (import.meta.env.DEV) telemetry?.beforeUpdate();
  let events = updateGame(state, config, rng, dt, () => tuner?.applyPendingWaveChanges());
  if (import.meta.env.DEV) telemetry?.afterUpdate();
  if (import.meta.env.DEV && devInvincible && state.hp < lockedHp) {
    state.hp = Math.max(1, lockedHp);
    if (events.some(event => event.type === 'gameEnd' && !event.win)) {
      state.mode = 'playing'; state.paused = false;
      events = events.filter(event => event.type !== 'gameEnd' || event.win);
    }
  }
  dispatch(events);
  renderHud(refs, state, config);
  render(state, config);
  if (import.meta.env.DEV) telemetry?.updateFrame(now);
  requestAnimationFrame(loop);
}

// 调试接口（仅 DEV 注入）：供控制台与浏览器自动化驱动。
if (import.meta.env.DEV) void Promise.all([import('./debug/exposeDebugApi'), import('./ui/tunerPanel'), import('./telemetry/devTelemetry')]).then(([debugModule, tunerModule, telemetryModule]) => {
  rngSource = debugModule.createSeededRng(devSeed);

  function syncEnemyConfig(path: string): void {
    const match = /^enemies\.types\.(normal|fast|tank|boss)\.(.+)$/.exec(path);
    if (!match) return;
    const [type, key] = [match[1] as keyof typeof cfg.enemies.types, match[2]];
    const def = cfg.enemies.types[type];
    for (const enemy of state.enemies.filter(item => item.type === type)) {
      if (key === 'hpBase' || key === 'hpPerWave') {
        const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
        enemy.maxHp = def.hpBase + state.wave * def.hpPerWave;
        enemy.hp = enemy.maxHp * ratio;
      } else if (key === 'speedBase' || key === 'speedPerWave') enemy.speed = def.speedBase + state.wave * def.speedPerWave;
      else if (key === 'damage') enemy.damage = def.damage;
      else if (key === 'r') enemy.r = def.r;
      else if (key === 'xp') enemy.xp = def.xp;
    }
  }

  const devTools = document.createElement('details');
  devTools.className = 'dev-tools';
  document.body.append(devTools);
  tuner = tunerModule.createTunerPanel(devTools, config, {
    isWaveActive: () => state.mode === 'playing',
    onImmediateChange(path) {
      if (path === 'combat.hp.max') { state.maxHp = cfg.combat.hp.max; state.hp = Math.min(state.hp, state.maxHp); }
      if (path === 'economy.defaults.dropLifetime') for (const drop of state.groundDrops) {
        const ratio = drop.maxLife > 0 ? drop.life / drop.maxLife : 1;
        drop.maxLife = config.dropLifetime; drop.life = config.dropLifetime * ratio;
      }
      syncEnemyConfig(path);
      renderHud(refs, state, config);
    },
    onWaveConfigApplied() { refs.totalWavesText.textContent = String(cfg.waves.totalWaves); },
    onReset() { toast(texts.toast.tunerReset); },
    debug: {
      getSeed: () => devSeed,
      setSeed(seed) { devSeed = Math.trunc(Number.isFinite(seed) ? seed : 1); rngSource = debugModule.createSeededRng(devSeed); },
      getTimeScale: () => devTimeScale,
      setTimeScale(scale) { devTimeScale = Math.max(0.25, Math.min(3, scale)); },
      getInvincible: () => devInvincible,
      setInvincible(value) { devInvincible = value; },
      jumpToWave(wave) { dispatch(jumpToWave(state, config, rng, wave)); modals.hideResult(); modals.hideLevel(); modals.message('', '', false); },
      restartWave() { dispatch(restartWave(state, config, rng)); modals.hideResult(); modals.hideLevel(); modals.message('', '', false); },
      getSpawnTelemetry() { const admission = budgetAdmission(state.wave, state.spawnLeft, state.enemies.length, cfg.waves.budget); return { wave: state.wave, spawnLeft: state.spawnLeft, alive: state.enemies.length, spawnTimer: state.spawnTimer, lastSpawnCheckCount: state.lastSpawnCheckCount, normalTarget: admission.normalTarget, effectiveTarget: admission.effectiveTarget, inEndSprint: admission.inEndSprint }; },
    },
  });
  if (evidenceMode?.startsWith('upgrade')) devTools.hidden = true;

  telemetry = telemetryModule.createDevTelemetry({
    getState: () => state,
    getConfig: () => cfg,
    getSeed: () => devSeed,
    getPresetName: () => tuner?.getActivePresetName() ?? '',
    getRange: () => totalRange(state, config),
  });
  if (evidenceMode?.startsWith('upgrade')) {
    document.querySelector<HTMLElement>('.telemetry-hud')?.setAttribute('hidden', '');
    const telemetryActions = document.querySelector<HTMLElement>('.telemetry-actions');
    if (telemetryActions) telemetryActions.style.display = 'none';
  }

  debugModule.exposeDebugApi({
      getState: () => ({ ...state, enemyTypes: state.enemies.map(enemy => enemy.type), enemies: state.enemies.length, bullets: state.bullets.length, config: { ...config }, waves: { spawnMode: cfg.waves.spawnMode, pendingSpawnMode: tuner?.getPendingSpawnMode() ?? null, budget: cfg.waves.budget } }), start, reset,
    spawnGroundDrop: (x, y, type = null, star) => spawnGroundDrop(state, config, rng, x, y, type, star),
    addTestPair: () => dispatch(spawnTestDrops(state, config, rng)),
    moveOrSwap: (source, index, targetKind, targetIndex) => dispatch(moveOrSwap(state, config, rng, source, index, targetKind, targetIndex)),
    consumeAt: (index, x, y) => dispatch(consumeCard(state, config, rng, index, x, y)),
    setConfig: patch => {
      Object.assign(config, patch);
      if (patch.damage != null) cfg.combat.defaults.damage = patch.damage;
      if (patch.fireRate != null) cfg.combat.defaults.fireRate = patch.fireRate;
      if (patch.range != null) cfg.combat.defaults.range = patch.range;
      if (patch.dropChance != null) cfg.economy.defaults.dropChance = patch.dropChance;
      if (patch.dropLifetime != null) cfg.economy.defaults.dropLifetime = patch.dropLifetime;
      if (patch.enemySpeed != null) cfg.enemies.defaults.enemySpeed = patch.enemySpeed;
      tuner?.syncInputs(); renderHud(refs, state, config);
    },
    getVariants: () => activeVariants,
    jumpToWave: wave => { tuner?.applyPendingWaveChanges(); dispatch(jumpToWave(state, config, rng, wave)); },
    restartWave: () => { tuner?.applyPendingWaveChanges(); dispatch(restartWave(state, config, rng)); },
    setInvincible: value => { devInvincible = value; tuner?.syncInputs(); },
    setTimeScale: scale => { devTimeScale = Math.max(0.25, Math.min(3, scale)); tuner?.syncInputs(); },
    setSeed: seed => { devSeed = Math.trunc(seed); rngSource = debugModule.createSeededRng(devSeed); tuner?.syncInputs(); },
    getDebugSettings: () => ({ seed: devSeed, timeScale: devTimeScale, invincible: devInvincible }),
  });
});

reset();
requestAnimationFrame(loop);

// 游戏本体入口：加载配置 → 注册技能定义 → 建状态 → 绑输入 → 主循环。
// 规则在 core/，画面在 render/，界面在 ui/，输入在 input/，数值在 config/，皮肤文案在 data/。
import './styles/app.css';
import { activeVariants, cfg } from './config';
import { texts } from './data';
import type { GameEvent, GameState, Rng } from './core/types';
import { createInitialState, createDefaultConfig } from './core/createInitialState';
import { reconcileMaxHp } from './core/stats';
import { updateGame } from './core/updateGame';
import { registerSkillDefs, resolveConsumableTier } from './core/effects/interpreter';
import { jumpToWave, restartWave } from './core/systems/waveSystem';
import { budgetAdmission } from './core/systems/budgetRules';
import { resolveActiveWavePlan } from './core/runStage';
import { moveOrSwap, consumeCard } from './core/systems/equipmentSystem';
import { collectNearest, spawnTestDrops, spawnGroundDrop } from './core/systems/dropSystem';
import { recordCardDropShown, selectUniformCardType } from './core/systems/dropTypePolicy';
import { acceptBountyOfferAt, calculateOfferChance } from './core/systems/bountySystem';
import { resolveCurrentDecision } from './core/systems/decisionQueueSystem';
import { beginOpeningIntermission, confirmIntermissionReady, confirmValidationRewardSettle } from './core/systems/intermissionSystem';
import { checkWildcardTarget, grantWildcards, useWildcardOnSlot, type WildcardGrant } from './core/systems/wildcardSystem';
import { evolveRecipePair, matchRecipeDrop } from './core/systems/recipeEvolutionSystem';
import { createCardWithAffixes } from './core/systems/cardAffixSystem';
import { totalRange } from './core/stats';
import { createRenderer } from './render/canvasRenderer';
import { getDomRefs } from './ui/domRefs';
import { createToast } from './ui/toast';
import { createUpgradeFeedback } from './ui/upgradeFeedback';
import { renderHud } from './ui/renderHud';
import { renderCards } from './ui/renderCards';
import { renderEquipment } from './ui/renderEquipment';
import { renderMergeHints } from './ui/renderMergeHints';
import type { TunerPanel } from './ui/tunerPanel';
import { createModals } from './ui/modals';
import { createRewardCelebration } from './ui/rewardCelebration';
import { confirmRewardReceipt } from './core/systems/rewardMeterSystem';
import { createCardDetailModal } from './ui/cardDetailModal';
import { resolvePauseState } from './ui/pauseState';
import { formatToast, resetToastDedupe, SLOT_CHANGING } from './ui/eventText';
import type { SlotHandlers, SlotSource } from './ui/slotFactory';
import { createPointerRouter, type PreviewSpec } from './input/pointerRouter';
import { createKeyboard } from './input/keyboard';
import { createIntermissionPanel } from './ui/intermissionPanel';
import { formatPlaySpeed, nextPlaySpeed } from './ui/gameSpeed';
import type { DevTelemetry } from './telemetry/devTelemetry';
import type { DifficultyId } from './config/types';
import { createEnemy, resyncEnemyStats, type EnemyStatConfigKey } from './core/systems/enemySystem';
import { DEV_TOOLS_ENABLED } from './debug/devToolsMode';
import { cardDisplayName } from './ui/cardMeta';
import { simulationSteps } from './core/simulationClock';
import { resizeCanvasBackingStore } from './render/renderMetrics';
import { makeRng } from './core/rng';

// 技能 = 数据 + 解释器：把配置里的卡定义注入解释器（P5 实装 12 张正式卡后自动生效）。
registerSkillDefs(cfg.skills.cards);

let rngSource: Rng = DEV_TOOLS_ENABLED ? makeRng(1) : Math.random;
const rng: Rng = DEV_TOOLS_ENABLED ? () => rngSource() : Math.random;
let tuner: TunerPanel | null = null;
let telemetry: DevTelemetry | null = null;
let devSeed = 1;
let timeScale = 1;
let devInvincible = false;
let manualPaused = false;
const uiPauseReasons = new Set<'cardDetail'>();
const evidenceMode = DEV_TOOLS_ENABLED ? new URLSearchParams(location.search).get('evidence') : null;
if (evidenceMode) document.documentElement.dataset.evidence = evidenceMode;
const refs = getDomRefs();
let selectedDifficulty: DifficultyId = cfg.difficulty.defaultDifficulty;
const difficultyButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="radio"][data-difficulty]'));
function selectDifficulty(id: DifficultyId, focus = false): void {
  selectedDifficulty = id;
  for (const button of difficultyButtons) {
    const selected = button.dataset.difficulty === id;
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  }
}
for (const button of difficultyButtons) {
  const id = button.dataset.difficulty as DifficultyId;
  button.textContent = cfg.difficulty.profiles[id].label;
  button.addEventListener('click', () => selectDifficulty(id));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = difficultyButtons.indexOf(button);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? difficultyButtons.length - 1
      : (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + difficultyButtons.length) % difficultyButtons.length;
    selectDifficulty(difficultyButtons[next].dataset.difficulty as DifficultyId, true);
  });
}
selectDifficulty(selectedDifficulty);
if (DEV_TOOLS_ENABLED) {
  refs.testCardBtn.removeAttribute('hidden');
  refs.testWildcardBtn.removeAttribute('hidden');
  refs.testWildcardBtn.textContent = texts.buttons.testWildcard;
  refs.dropTelemetry.removeAttribute('hidden');
}
const ctx = refs.canvas.getContext('2d');
if (!ctx) throw new Error('无法获取 canvas 2D 上下文');
const render = createRenderer(ctx, refs.canvas);
const toast = createToast(refs);
const upgradeFeedback = createUpgradeFeedback(refs);

const config = createDefaultConfig();
let state: GameState = createInitialState();
const syncCanvasLayout = (): void => {
  resizeCanvasBackingStore(refs.canvas);
  renderMergeHints(refs.dock, state);
};
syncCanvasLayout();
window.addEventListener('resize', syncCanvasLayout);
window.visualViewport?.addEventListener('resize', syncCanvasLayout);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncCanvasLayout).observe(refs.canvas);

refs.totalWavesText.textContent = String(cfg.waves.totalWaves);
refs.equipmentHint.textContent = `拖入 ${cfg.economy.equipThreshold}★+ 卡装备`;
refs.cardsHint.textContent = '拖到战场释放 · 同型同星自动合成';

// —— 表现副作用统一由事件驱动 ——
function dispatch(events: GameEvent[]): void {
  if (DEV_TOOLS_ENABLED) telemetry?.recordGameEvents(events);
  let slotsChanged = false;
  for (const ev of events) {
    const text = formatToast(ev);
    if (text) toast(text);
    if (ev.type === 'gameEnd') {
      refs.pauseBtn.disabled = true;
      refs.speedBtn.disabled = true;
      modals.showResult(ev.win, state);
    }
    if (SLOT_CHANGING.has(ev.type)) slotsChanged = true;
  }
  if (slotsChanged) refreshSlots();
  upgradeFeedback.handle(events);
  syncDecisionUi();
  intermissionPanel.render(state);
}

function refreshSlots(): void {
  renderCards(refs, state, slotHandlers);
  renderEquipment(refs, state, slotHandlers);
  renderMergeHints(refs.dock, state);
}

function syncDecisionUi(): void {
  if (state.rewardMeter.currentReceipt) rewardCelebration.show(state.rewardMeter.currentReceipt);
  else rewardCelebration.hide();
  if (state.decisions.current) modals.showDecision(state.decisions.current, state);
  else modals.hideDecision();
}

window.addEventListener('resize', () => renderMergeHints(refs.dock, state));

const slotHandlers: SlotHandlers = {
  dragStart(e, source, index, el) {
    pointerRouter.begin(e, source, index, el);
  },
  inspect(source, index, el) {
    const card = source === 'cards' ? state.cards[index] : state.equipment[index];
    if (card) cardDetail.open(card, source, el);
  },
};

const modals = createModals(refs, {
  onDecision(choice) {
    dispatch(resolveCurrentDecision(state, config, rng, choice));
    syncDecisionUi();
  },
  onRestart() {
    reset();
    start();
  },
});
const rewardCelebration = createRewardCelebration(refs.arena, () => dispatch(confirmRewardReceipt(state, config, rng)));

const cardDetail = createCardDetailModal({
  onOpen() {
    uiPauseReasons.add('cardDetail');
    syncPauseState();
  },
  onClose() {
    uiPauseReasons.delete('cardDetail');
    syncPauseState();
  },
});

const intermissionPanel = createIntermissionPanel(refs.arena, {
  onReady() {
    dispatch(confirmIntermissionReady(state));
  },
});

function previewFor(source: SlotSource, index: number): PreviewSpec {
  if (source === 'wildcard') return { placement: 'none' };
  const card = source === 'cards' ? state.cards[index] : state.equipment[index];
  const def = card && cfg.skills.cards.find(item => item.id === card.type);
  const tier = card && def ? resolveConsumableTier(def, card.star) : undefined;
  return tier?.radius == null ? { placement: 'screen' } : { placement: 'point', radius: tier.radius };
}

const pointerRouter = createPointerRouter({
  canvas: refs.canvas, dock: refs.dock, aimPreview: refs.aimPreview, screenPreview: refs.screenPreview,
  input: cfg.input,
  isPaused: () => state.paused || (state.intermission.active && state.intermission.step !== 'free'),
  onBountyOfferTap: (x, y) => {
    if (!cfg.bounty.enabled) return false;
    const events = acceptBountyOfferAt(state, x, y);
    if (!events.length) return false;
    dispatch(events);
    if (DEV_TOOLS_ENABLED) telemetry?.recordInput('bountyAccept');
    return true;
  },
  onArenaTap: (x, y) => {
    const events = collectNearest(state, config, rng, x, y, cfg.economy.drops.pickupRadius);
    dispatch(events);
    if (DEV_TOOLS_ENABLED && events.some(event => event.type === 'collected')) telemetry?.recordInput('pickupClick');
  },
  onDrop: (source, index, target, context) => {
    let events: GameEvent[] = [];
    if (source === 'wildcard') {
      if (target.kind === 'slot') events = useWildcardOnSlot(state, config, rng, target.slotKind, target.index);
    } else if (target.kind === 'arena') events = consumeCard(state, config, rng, index, target.x, target.y, source);
    else if (target.kind === 'slot') {
      const sourceCard = (source === 'cards' ? state.cards : state.equipment)[index];
      const targetCard = (target.slotKind === 'cards' ? state.cards : state.equipment)[target.index];
      const sourceRef = sourceCard ? { slotKind: source, index, cardId: sourceCard.id } : null;
      const targetRef = targetCard ? { slotKind: target.slotKind, index: target.index, cardId: targetCard.id } : null;
      const recipe = sourceRef && targetRef ? matchRecipeDrop(state, sourceRef, targetRef) : null;
      if (recipe) events = evolveRecipePair(state, config, rng, recipe.recipeId, recipe.source, recipe.target);
      else if (context?.recipeIntent) {
        events = [{ type: 'recipeRejected', recipeId: context.recipeId ?? '', reason: 'stale' }];
      }
      else if (target.slotKind === 'equipment' && source === 'cards') {
        events = moveOrSwap(state, config, rng, source, index, 'equipment', target.index);
        if (events.some(event => event.type === 'equipRejected' || event.type === 'equipFull')) state.equipTelemetry.rejects++;
      } else events = moveOrSwap(state, config, rng, source, index, target.slotKind, target.index);
    }
    dispatch(events);
    if (DEV_TOOLS_ENABLED && events.some(event => event.type === 'skillConsumed')) telemetry?.recordInput('consumeRelease');
    else if (DEV_TOOLS_ENABLED && events.some(event => SLOT_CHANGING.has(event.type))) telemetry?.recordInput('dragDrop');
  },
  previewFor,
  getDropValidity: (source, _index, target) => source !== 'wildcard' || checkWildcardTarget(state, target.slotKind, target.index).ok,
  getWildcardDropWarning: target => {
    const card = (target.slotKind === 'cards' ? state.cards : state.equipment)[target.index];
    if (!card || card.star !== 5) return null;
    const materialOfReadyRecipe = state.recipes.readyRecipeIds.some(recipeId => {
      const recipe = cfg.evolutionRecipes.recipes.find(item => item.id === recipeId);
      return recipe?.ingredientVariable.cardId === card.type || recipe?.ingredientAnchor.cardId === card.type;
    });
    return materialOfReadyRecipe ? '升到 6★ 不会提升进化产物' : null;
  },
  getRecipeDropPreview: (source, index, target) => {
    if (source === 'wildcard') return null;
    const sourceCard = (source === 'cards' ? state.cards : state.equipment)[index];
    const targetCard = (target.slotKind === 'cards' ? state.cards : state.equipment)[target.index];
    if (!sourceCard || !targetCard) return null;
    const match = matchRecipeDrop(
      state,
      { slotKind: source, index, cardId: sourceCard.id },
      { slotKind: target.slotKind, index: target.index, cardId: targetCard.id },
    );
    if (!match) return null;
    const recipe = cfg.evolutionRecipes.recipes.find(item => item.id === match.recipeId);
    return recipe ? { recipeId: recipe.id, label: `立即进化：${cardDisplayName(recipe.outputCardId)}` } : null;
  },
});
createKeyboard(togglePause);

refs.startBtn.addEventListener('click', start);
refs.pauseBtn.addEventListener('click', togglePause);
refs.validationSettleBtn.addEventListener('click', () => dispatch(confirmValidationRewardSettle(state)));
refs.speedBtn.addEventListener('click', () => setTimeScale(nextPlaySpeed(timeScale)));
refs.testCardBtn.addEventListener('click', () => dispatch(spawnTestDrops(state, config, rng)));
refs.testWildcardBtn.addEventListener('click', () => {
  const grants: WildcardGrant[] = [];
  for (let star = 1; star < cfg.economy.maxStar; star++) grants.push({ star, count: 1 });
  dispatch(grantWildcards(state, grants));
});

function reset(): void {
  cardDetail.close();
  resetToastDedupe();
  manualPaused = false;
  uiPauseReasons.clear();
  state = createInitialState(selectedDifficulty);
  if (DEV_TOOLS_ENABLED) telemetry?.reset();
  const createEvidenceCard = (type: string, star: number) => {
    const created = createCardWithAffixes(state, rng, type, star);
    if (DEV_TOOLS_ENABLED) telemetry?.recordGameEvents(created.events);
    return created.card;
  };
  const addEvidenceEnemies = (count: number, wave: number, kind: 'regular' | 'validationElite' | 'bounty' = 'regular'): void => {
    const { width, height } = cfg.combat.canvas;
    for (let index = 0; index < count; index++) {
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
      const ring = index % 3;
      const radiusX = width * (0.34 + ring * 0.055);
      const radiusY = height * (0.32 + ring * 0.04);
      const type = kind === 'validationElite' ? (index % 4 === 0 ? 'boss' : 'tank') : index % 5 === 0 ? 'tank' : index % 3 === 0 ? 'fast' : 'normal';
      state.enemies.push(createEnemy(state, type, wave, {
        x: width / 2 + Math.cos(angle) * radiusX,
        y: height / 2 + Math.sin(angle) * radiusY,
      }, kind === 'bounty'
        ? { hpMul: cfg.bounty.encounter.hpMul, speedMul: cfg.bounty.encounter.speedMul, damageMul: cfg.bounty.encounter.damageMul, bountyEncounterId: 1, bountyRewardType: 'chainLightning', spawnKind: 'bounty' }
        : { spawnKind: kind }));
    }
  };
  const stageEvidence = (wave: number): void => {
    state.mode = 'playing';
    state.wave = wave;
    state.paused = true;
    state.combatTelemetry.wave = wave;
  };
  if (evidenceMode === 'equip') {
    state.cards[0] = createEvidenceCard('pierce', 4);
  } else if (evidenceMode === 'upgrade4' || evidenceMode === 'upgrade5' || evidenceMode === 'upgrade6') {
    const sourceStar = Number(evidenceMode.charAt(evidenceMode.length - 1)) - 1;
    state.equipment[0] = createEvidenceCard('pierce', sourceStar);
    state.cards[0] = createEvidenceCard('pierce', sourceStar);
    state.cards[1] = createEvidenceCard('frost', 1);
  } else if (evidenceMode === 'mobileLayout') {
    stageEvidence(6);
    const cardTypes = ['emberMoat', 'chainLightning', 'pierce', 'frozenBulwark', 'springOfLife', 'stormLattice', 'bountyCall'];
    state.cards = cardTypes.map((type, index) => createEvidenceCard(type, index === 0 ? 6 : 1 + index % 5));
    state.equipment = ['pierce', 'frozenBulwark', 'bountyCall'].map((type, index) => createEvidenceCard(type, 3 + index));
    state.wildcards[1] = 2;
    state.wildcards[3] = 1;
    spawnGroundDrop(state, config, rng, 150, 250, 'emberMoat', 3);
    state.bountyOffers.push({
      id: 1,
      rewardCardType: 'chainLightning',
      rewardCardStar: 5,
      rewardCardCount: 1,
      wildcardStar: 3,
      wildcardCount: 2,
      side: 'right',
      x: 508,
      y: 180,
      remaining: 8,
      guaranteed: true,
      createdAt: 0,
    });
    addEvidenceEnemies(14, 6);
  } else if (evidenceMode === 'selection') {
    // 截图 01 / 案例 A：手空出来后，选择期仍有拾取与手牌取舍。
    stageEvidence(2);
    state.cards.splice(0, 4, ...['pierce', 'frost', 'scorch', 'aegis'].map(type => createEvidenceCard(type, 1)));
    [[115, 190, 'pierce'], [420, 230, 'frost'], [150, 475, 'scorch'], [390, 520, 'aegis'], [270, 145, 'chainLightning']].forEach(([x, y, type], index) => spawnGroundDrop(state, config, rng, Number(x), Number(y), String(type), index % 2 + 1));
    addEvidenceEnemies(10, 2);
  } else if (evidenceMode === 'build') {
    // 截图 02 / 案例 D：构筑期承担整局最高压力，同屏超过 20 敌人。
    stageEvidence(7);
    state.cards.splice(0, 5, ...['pierce', 'frost', 'scorch', 'chainLightning', 'impact'].map((type, index) => createEvidenceCard(type, index % 3 + 2)));
    state.equipment.splice(0, 2, createEvidenceCard('chainLightning', 4), createEvidenceCard('impact', 4));
    addEvidenceEnemies(28, 7);
  } else if (evidenceMode === 'validation') {
    // 截图 05 / 案例 E：验证期关闭普通掉落，只留下高强敌人检验 Build。
    stageEvidence(9);
    state.equipment.splice(0, 3, createEvidenceCard('chainLightning', 5), createEvidenceCard('pierce', 5), createEvidenceCard('frost', 4));
    state.groundDrops = [];
    addEvidenceEnemies(16, 9, 'validationElite');
  } else if (evidenceMode === 'bounty') {
    // 截图 03 / 案例 A：接单前看清确定奖励，并保留拒绝权。
    stageEvidence(3);
    addEvidenceEnemies(9, 3);
    state.bountyOffers.push({ id: 1, rewardCardType: 'chainLightning', rewardCardStar: 3, rewardCardCount: 1, wildcardStar: 2, wildcardCount: 2, side: 'right', x: 500, y: 285, remaining: cfg.bounty.offer.markWindowSeconds, guaranteed: true, createdAt: 0 });
  } else if (evidenceMode === 'bountyActive') {
    // 截图 04 / 案例 A：接受后，对应方向的强化敌群带着赏金标记推进。
    stageEvidence(4);
    state.bountyEncounters.push({ id: 1, offerId: 1, rewardCardType: 'chainLightning', rewardCardStar: 3, rewardCardCount: 1, wildcardStar: 2, wildcardCount: 2, side: 'right', status: 'active', memberIds: [], pendingSpawnCount: 0, spawnTimer: 0, guaranteed: true, acceptedAt: 0, hpAtAccept: state.hp, lastKillX: 500, lastKillY: 365 });
    addEvidenceEnemies(14, 4, 'bounty');
    state.bountyEncounters[0].memberIds = state.enemies.map(enemy => enemy.id);
  } else if (evidenceMode === 'handFull') {
    // 截图 06 / 案例 B：固定 7 格已经全满，同型同星合成机会仍清晰可见。
    stageEvidence(5);
    state.cards = ['pierce', 'pierce', 'frost', 'scorch', 'aegis', 'impact', 'chainLightning'].map((type, index) => createEvidenceCard(type, index < 2 ? 2 : index % 3 + 1));
    addEvidenceEnemies(14, 5);
  } else if (evidenceMode === 'cardDetail') {
    // 截图 07 / 案例 B：二级详情展开，技能描述、路线与数值词条同屏可读。
    stageEvidence(5);
    state.cards[0] = createEvidenceCard('chainLightning', 5);
    state.cards[0]!.evolutionPath = ['3:chainLightningA', '5:chainLightning1x'];
    addEvidenceEnemies(12, 5);
  } else if (evidenceMode === 'evolution') {
    // 截图 08 / 案例 B：3★ 检查点把内容深度压进同一个槽的分叉选择。
    stageEvidence(5);
    const card = createEvidenceCard('pierce', 3);
    card.provisional = true;
    state.cards[0] = card;
    const options = cfg.skills.cards.find(item => item.id === card.type)?.evolutionTree?.checkpoints.find(item => item.star === 3)?.options.map(item => item.id) ?? [];
    state.decisions.current = { kind: 'evolutionBranch', cardType: card.type, checkpointStar: 3, options, provisionalCardId: card.id };
  } else if (evidenceMode === 'fusion') {
    // 截图 09 / 案例 C：三件装备占满，光束与榴弹在主炮上正交融合。
    stageEvidence(8);
    state.equipment = [createEvidenceCard('chainLightning', 6), createEvidenceCard('pierce', 6), createEvidenceCard('frost', 5)];
    addEvidenceEnemies(22, 8);
  } else if (evidenceMode === 'tuner') {
    // 截图 10–11 / 副题与案例 A：完全展开几十项参数及掉落、出怪、TTK 派生读数。
    stageEvidence(4);
    addEvidenceEnemies(15, 4);
  } else if (evidenceMode === 'telemetryHud') {
    // 截图 12 / 案例 D：E1–E7 实时读数是用来检验体验曲线的自建尺子。
    stageEvidence(7);
    state.cards.splice(0, 4, createEvidenceCard('pierce', 2), createEvidenceCard('pierce', 2), createEvidenceCard('frost', 3), createEvidenceCard('scorch', 2));
    state.equipment.splice(0, 2, createEvidenceCard('chainLightning', 5), createEvidenceCard('pierce', 5));
    addEvidenceEnemies(24, 7);
  }
  modals.hideResult();
  modals.hideDecision();
  rewardCelebration.hide();
  refs.startBtn.textContent = texts.buttons.start;
  refs.readyOverlay.hidden = false;
  refs.pauseBtn.textContent = texts.buttons.pause;
  refs.pauseBtn.setAttribute('aria-pressed', 'false');
  refs.pauseBtn.title = texts.buttons.pause;
  refs.pauseBtn.disabled = true;
  refs.speedBtn.disabled = true;
  syncSpeedButton();
  modals.message(texts.center.readyTitle, texts.center.readyBody, true);
  refreshSlots();
  renderHud(refs, state, config);
  intermissionPanel.render(state);
  if (evidenceMode && !['equip', 'upgrade4', 'upgrade5', 'upgrade6'].includes(evidenceMode)) {
    refs.readyOverlay.hidden = true;
    refs.pauseBtn.disabled = false;
    refs.speedBtn.disabled = false;
    modals.message('', '', false);
    syncDecisionUi();
    if (evidenceMode === 'cardDetail') requestAnimationFrame(() => cardDetail.open(state.cards[0]!, 'cards', refs.cards));
    if (evidenceMode === 'bounty') requestAnimationFrame(showBountyEvidenceOffer);
  }
}

function showBountyEvidenceOffer(): void {
  document.querySelector('[data-evidence-bounty-dialog]')?.remove();
  const offer = state.bountyOffers[0];
  if (!offer) return;
  const dialog = document.createElement('aside');
  dialog.className = 'evidence-bounty-dialog';
  dialog.dataset.evidenceBountyDialog = '';
  dialog.innerHTML = `<small>精英悬赏契约 · 确定奖励</small><h2>${cardDisplayName(offer.rewardCardType)} ${offer.rewardCardStar}★ × ${offer.rewardCardCount}</h2><p>附赠万能卡 ${offer.wildcardStar}★ × ${offer.wildcardCount}。接受后，右侧将生成一组定向强化敌群；任一突破则整组失败。</p><div><button type="button">拒绝 · 无惩罚</button><button type="button" class="accept">接受悬赏</button></div>`;
  document.body.append(dialog);
}

function start(): void {
  if (state.mode !== 'ready') reset();
  else if (state.difficultyId !== selectedDifficulty) reset();
  tuner?.applyPendingWaveChanges();
  state.mode = 'playing';
  manualPaused = false;
  uiPauseReasons.clear();
  syncPauseState();
  refs.pauseBtn.disabled = false;
  refs.speedBtn.disabled = false;
  dispatch(beginOpeningIntermission(state));
  refs.startBtn.textContent = texts.buttons.restart;
  refs.readyOverlay.hidden = true;
  modals.message('', '', false);
}

function togglePause(): void {
  if (state.mode !== 'playing' || state.intermission.active || state.decisions.current) return;
  manualPaused = !manualPaused;
  syncPauseState();
}

function syncPauseState(): void {
  state.paused = resolvePauseState(manualPaused, uiPauseReasons);
  refs.pauseBtn.textContent = state.paused ? texts.buttons.resume : texts.buttons.pause;
  refs.pauseBtn.setAttribute('aria-pressed', String(state.paused));
  refs.pauseBtn.title = state.paused ? texts.buttons.resume : texts.buttons.pause;
  const showManualPause = manualPaused && !uiPauseReasons.size;
  modals.message(showManualPause ? texts.center.pausedTitle : '', texts.center.pausedBody, showManualPause);
}

function setTimeScale(scale: number): void {
  timeScale = Math.max(0.25, Math.min(3, scale));
  syncSpeedButton();
  tuner?.syncInputs();
}

function syncSpeedButton(): void {
  const label = formatPlaySpeed(timeScale);
  refs.speedBtn.textContent = label;
  refs.speedBtn.setAttribute('aria-label', `游戏速度：${label}`);
  refs.speedBtn.title = `游戏速度 ${label}，点击切换`;
}

let last = performance.now();
function loop(now: number): void {
  const elapsed = Math.max(0, ((now - last) / 1000) * timeScale);
  last = now;
  const lockedHp = state.hp;
  if (DEV_TOOLS_ENABLED) telemetry?.beforeUpdate();
  let events: GameEvent[] = [];
  for (const dt of simulationSteps(elapsed, cfg.combat.dtCap)) {
    events.push(...updateGame(state, config, rng, dt, () => tuner?.applyPendingWaveChanges()));
  }
  if (DEV_TOOLS_ENABLED) telemetry?.afterUpdate();
  if (DEV_TOOLS_ENABLED && devInvincible && state.hp < lockedHp) {
    state.hp = Math.max(1, lockedHp);
    if (events.some(event => event.type === 'gameEnd' && !event.win)) {
      state.mode = 'playing'; state.paused = false;
      events = events.filter(event => event.type !== 'gameEnd' || event.win);
    }
  }
  dispatch(events);
  renderHud(refs, state, config);
  intermissionPanel.render(state);
  render(state, config);
  if (DEV_TOOLS_ENABLED) telemetry?.updateFrame(now);
  requestAnimationFrame(loop);
}

// 调试面板启用时注入接口：供控制台与浏览器自动化驱动。
if (DEV_TOOLS_ENABLED) void Promise.all([import('./debug/exposeDebugApi'), import('./ui/tunerPanel'), import('./telemetry/devTelemetry')]).then(([debugModule, tunerModule, telemetryModule]) => {
  rngSource = debugModule.createSeededRng(devSeed);

  function syncEnemyConfig(path: string): void {
    const match = /^enemies\.types\.(normal|fast|tank|boss)\.(.+)$/.exec(path);
    if (!match) return;
    const [type, key] = [match[1] as keyof typeof cfg.enemies.types, match[2]];
    for (const enemy of state.enemies.filter(item => item.type === type)) {
      if (['hpBase', 'hpPerWave', 'speedBase', 'speedPerWave', 'damage', 'r', 'xp'].includes(key)) {
        resyncEnemyStats(enemy, state, key as EnemyStatConfigKey);
      }
    }
  }

  const devTools = document.createElement('details');
  devTools.className = 'dev-tools';
  document.body.append(devTools);
  function getBountyTelemetry() {
    const encounter = state.bountyEncounters.find(item => item.status === 'spawning' || item.status === 'active');
    const encounterTotal = encounter
      ? Math.min(cfg.bounty.encounter.enemyCountMax, cfg.bounty.encounter.enemyCountBase + Math.floor((state.wave - 1) * cfg.bounty.encounter.enemyCountPerWave))
      : 0;
    return {
      chance: calculateOfferChance(state),
      noDamageSeconds: Math.max(0, state.time - state.bountyDirector.lastHpLossAt),
      offersThisWave: state.bountyDirector.offersThisWave,
      maxOffersPerWave: cfg.bounty.offer.maxOffersPerWave,
      checkTimer: Math.max(0, state.bountyDirector.checkTimer),
      cooldownRemaining: Math.max(0, state.bountyDirector.cooldownRemaining),
      currentRewardType: state.bountyOffers[0]?.rewardCardType ?? null,
      encounterAlive: encounter?.memberIds.length ?? 0,
      encounterTotal,
      guaranteedThisWave: state.bountyDirector.guaranteedThisWave,
    };
  }
  tuner = tunerModule.createTunerPanel(devTools, config, {
    isWaveActive: () => state.mode === 'playing',
    onImmediateChange(path) {
      if (path === 'combat.hp.max') {
        state.baseMaxHp = cfg.combat.hp.max;
        reconcileMaxHp(state);
      }
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
      getTimeScale: () => timeScale,
      setTimeScale,
      getInvincible: () => devInvincible,
      setInvincible(value) { devInvincible = value; },
      jumpToWave(wave) { dispatch(jumpToWave(state, config, rng, wave)); modals.hideResult(); modals.message('', '', false); },
      restartWave() { dispatch(restartWave(state, config, rng)); modals.hideResult(); modals.message('', '', false); },
      getSpawnTelemetry() { const admission = budgetAdmission(resolveActiveWavePlan(cfg, state.wave), state.spawnLeft, state.enemies.length); return { wave: state.wave, spawnLeft: state.spawnLeft, alive: state.enemies.length, spawnTimer: state.spawnTimer, lastSpawnCheckCount: state.lastSpawnCheckCount, normalTarget: admission.normalTarget, effectiveTarget: admission.effectiveTarget, inEndSprint: admission.inEndSprint }; },
      getBountyTelemetry,
      getDifficultyId: () => state.difficultyId,
    },
  });
  if (evidenceMode === 'tuner') {
    devTools.open = true;
    devTools.querySelectorAll<HTMLDetailsElement>('details').forEach(details => { details.open = true; });
  }
  if (evidenceMode?.startsWith('upgrade') || evidenceMode === 'mobileLayout') devTools.hidden = true;

  telemetry = telemetryModule.createDevTelemetry({
    getState: () => state,
    getConfig: () => cfg,
    getSeed: () => devSeed,
    getPresetName: () => tuner?.getActivePresetName() ?? '',
    getRange: () => totalRange(state, config),
    getDifficultyId: () => state.difficultyId,
  });
  const telemetryActions = document.querySelector<HTMLElement>('.telemetry-actions');
  if (telemetryActions) {
    const testActions = document.createElement('div');
    testActions.className = 'telemetry-test-actions';
    testActions.append(refs.testCardBtn, refs.testWildcardBtn);
    telemetryActions.prepend(testActions);
  }
  if (evidenceMode?.startsWith('upgrade') || evidenceMode === 'mobileLayout') {
    document.querySelector<HTMLElement>('.telemetry-hud')?.setAttribute('hidden', '');
    if (telemetryActions) telemetryActions.style.display = 'none';
  }

  debugModule.exposeDebugApi({
      getState: () => ({ ...state, enemyTypes: state.enemies.map(enemy => enemy.type), enemies: state.enemies.length, bullets: state.bullets.length, config: { ...config }, waves: { spawnMode: cfg.waves.spawnMode, pendingSpawnMode: tuner?.getPendingSpawnMode() ?? null, budget: cfg.waves.budget } }), start, reset,
    setDifficulty: id => {
      if (!cfg.difficulty.profiles[id]) throw new Error(`未知难度: ${id}`);
      selectDifficulty(id);
      reset();
    },
    spawnGroundDrop: (x, y, type = null, star) => {
      const selectedType = type ?? selectUniformCardType(state, rng);
      spawnGroundDrop(state, config, rng, x, y, selectedType, star);
      recordCardDropShown(state, selectedType, 'debug');
    },
    addTestPair: () => dispatch(spawnTestDrops(state, config, rng)),
    grantWildcard: (star, count = 1) => dispatch(grantWildcards(state, [{ star, count }])),
    moveOrSwap: (source, index, targetKind, targetIndex) => {
      if (source !== 'wildcard') dispatch(moveOrSwap(state, config, rng, source, index, targetKind, targetIndex));
    },
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
    setTimeScale,
    setSeed: seed => { devSeed = Math.trunc(seed); rngSource = debugModule.createSeededRng(devSeed); tuner?.syncInputs(); },
    getDebugSettings: () => ({ seed: devSeed, timeScale, invincible: devInvincible }),
    getBountyTelemetry,
  });
});

reset();
requestAnimationFrame(loop);

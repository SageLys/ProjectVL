import { cfg } from '../../config';
import type { CardDropSource, CardType, Config, Enemy, GameEvent, GameState, GroundDrop, Rng } from '../types';
import { totalDropChance, totalDropLifetime } from '../stats';
import { autoMergeCards, getActiveMergeCopies } from './cardSystem';
import { fireTrigger, getModifiers } from '../effects/interpreter';
import { addRewardPoints } from './rewardMeterSystem';
import { grantWildcards } from './wildcardSystem';
import {
  getCardPool, getOrCreateCardTypeRunStats, recordCardDropShown, selectNormalEnemyDropType,
} from './dropTypePolicy';
import { getActivePool, getRunRoster } from './activePoolSystem';
import { stageForWave } from '../runStage';
import { createCardWithAffixes } from './cardAffixSystem';
import { finalizeEvolutionUpgrade } from './evolutionTreeSystem';

const TAU = Math.PI * 2;
/** 正式卡池（P5 批次1+批次2，共 11 张技能卡）。 */
/** 过期折算奖励积分的基准值（丰收 5★ 落穗：expiryConvert.ratio × 星级 × 本常数）。 */

/** 在 (x,y) 生成一枚限时地面掉落。type 缺省随机；star 缺省按掉落星级策略（普通=1★）。 */
export function spawnGroundDrop(
  state: GameState,
  config: Config,
  rng: Rng,
  x: number,
  y: number,
  type: CardType,
  star?: number,
  source?: CardDropSource,
): void {
  const life = totalDropLifetime(state, config);
  state.groundDrops.push({
    id: state.nextDropId++,
    kind: 'card',
    x, y, type, source,
    star: star ?? normalDropStar(rng),
    life,
    maxLife: life,
    pulse: rng() * TAU,
  });
}

/** Spawn a ground wildcard bundle; it bypasses hand capacity when collected. */
export function spawnWildcardDrop(state: GameState, x: number, y: number, star: number, count: number, lifetime: number): void {
  state.groundDrops.push({
    id: state.nextDropId++,
    kind: 'wildcard',
    x,
    y,
    star,
    count,
    life: lifetime,
    maxLife: lifetime,
    pulse: 0,
  });
}

function normalDropStar(rng: Rng): number {
  if (cfg.economy.placeholderAssumptions.normalDropsOnlyOneStar) return 1;
  return rng() < cfg.economy.dropStarPolicy.star2Share ? 2 : cfg.economy.dropStarPolicy.normal;
}

/** 击杀掉落判定：概率命中或 boss 必掉，则在敌人位置生成掉落。 */
export function rollDropOnKill(state: GameState, config: Config, rng: Rng, enemy: Enemy): void {
  const rate = cfg.economy.ordinaryDropRate;
  if (!rate.enabled) {
    if (rng() < totalDropChance(state, config)) {
      const type = selectNormalEnemyDropType(state, rng);
      spawnGroundDrop(state, config, rng, enemy.x, enemy.y, type, undefined, 'normalKill');
    }
    return;
  }
  if (enemy.spawnKind !== 'regular') return;
  if (stageForWave(state.wave, cfg.waves.totalWaves, cfg.waves.stagePlan) === 'validation') return;
  state.ordinaryDrop.eligibleKillsThisWave++;
  if (state.ordinaryDrop.credit >= 1) {
    state.ordinaryDrop.credit -= 1;
    const type = selectNormalEnemyDropType(state, rng);
    spawnGroundDrop(state, config, rng, enemy.x, enemy.y, type, undefined, 'normalKill');
    state.ordinaryDrop.shownThisWave++;
  }
}

/** Accumulates time-based ordinary-drop credit only during active regular combat. */
export function tickOrdinaryDropBudget(state: GameState, dt: number): void {
  const rate = cfg.economy.ordinaryDropRate;
  if (!rate.enabled || state.mode !== 'playing' || state.paused || state.wavePhase !== 'regular') return;
  const stage = stageForWave(state.wave, cfg.waves.totalWaves, cfg.waves.stagePlan);
  if (stage === 'validation') return;
  let base = rate.selectionPerMinute;
  if (stage === 'build') {
    const transition = rate.buildTransitionSeconds <= 0 ? 1 : Math.min(1, state.ordinaryDrop.buildStageSeconds / rate.buildTransitionSeconds);
    base += (rate.buildPerMinute - rate.selectionPerMinute) * transition;
    state.ordinaryDrop.buildStageSeconds += dt;
  }
  const target = base * (rate.modifiersAffectTarget ? getModifiers(state).dropRateMul : 1);
  state.ordinaryDrop.credit = Math.min(rate.carryCap, state.ordinaryDrop.credit + target / 60 * dt);
  state.ordinaryDrop.activeRegularSeconds += dt;
}

/**
 * 推进掉落寿命与浮动相位；超时移除并计入 expired。
 * 丰收 5★ 落穗（expiryConvert）：命中时按 ratio 把过期掉落折算奖励积分，而非纯损失。
 */
export function tickDrops(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = state.groundDrops.length - 1; i >= 0; i--) {
    const drop = state.groundDrops[i];
    drop.pulse += dt * 3;
    if (drop.secure) continue;
    drop.life -= dt;
    if (drop.life <= 0) {
      state.groundDrops.splice(i, 1);
      state.expired++;
      events.push({
        type: 'dropExpired', dropId: drop.id, source: drop.source, star: drop.star,
        secure: drop.secure, validationRewardWave: drop.validationRewardWave,
      });
      const convert = getModifiers(state).expiryConvert;
      if (convert && rng() < convert.ratio) {
        events.push(...addRewardPoints(state, config, rng, drop.star * cfg.rewardMeter.expiryConvertPointsPerStar));
      }
    }
  }
  return events;
}

/**
 * 拾取一枚掉落到卡槽空位并触发自动合成 + onPickup 触发。
 * 卡槽已满则拒绝（掉落保留）。返回语义事件。
 */
export function collectDrop(state: GameState, config: Config, rng: Rng, drop: GroundDrop): GameEvent[] {
  if (drop.kind === 'wildcard') {
    state.groundDrops = state.groundDrops.filter(item => item.id !== drop.id);
    state.collected++;
    const events = grantWildcards(state, [{ star: drop.star, count: drop.count }]);
    for (const event of events) if (event.type === 'wildcardsGranted') {
      event.dropId = drop.id;
      event.source = drop.source;
      event.star = drop.star;
      event.secure = drop.secure;
      event.validationRewardWave = drop.validationRewardWave;
    }
    if (drop.bossRewardWave !== undefined) {
      events.push({ type: 'bossRewardGranted', wave: drop.bossRewardWave, grants: [{ star: drop.star, count: drop.count }] });
    }
    if (drop.bountyEncounterId !== undefined) {
      for (const event of events) if (event.type === 'wildcardsGranted') event.bountyEncounterId = drop.bountyEncounterId;
    }
    return events;
  }
  const empty = state.cards.findIndex(card => card === null);
  const originalLength = state.cards.length;
  if (empty < 0) {
    const unresolvedCheckpoint = cfg.skills.cards.find(card => card.id === drop.type)?.evolutionTree?.checkpoints
      .some(checkpoint => checkpoint.star <= drop.star);
    const canMergeImmediately = drop.star < cfg.economy.maxStar
      && !unresolvedCheckpoint
      && state.cards.filter(card => card?.type === drop.type && card.star === drop.star).length >= getActiveMergeCopies() - 1;
    if (!canMergeImmediately) return [{
      type: 'cardsFull', dropId: drop.id, source: drop.source, star: drop.star, secure: drop.secure,
    }];
  }
  state.groundDrops = state.groundDrops.filter(d => d.id !== drop.id);
  const created = createCardWithAffixes(state, rng, drop.type, drop.star);
  const collectedCard = created.card;
  if (empty >= 0) state.cards[empty] = collectedCard;
  else state.cards.push(collectedCard);
  state.collected++;
  const stats = getOrCreateCardTypeRunStats(state, drop.type);
  stats.collected++;
  stats.highestStarReached = Math.max(stats.highestStarReached, drop.star);
  const evolutionEvents = finalizeEvolutionUpgrade(state, collectedCard);
  const { merged, events: mergeEvents } = autoMergeCards(state, config, rng);
  while (state.cards.length > originalLength) {
    const removableNullIndex = state.cards.lastIndexOf(null);
    if (removableNullIndex < 0) throw new Error('Full-hand merge did not free a temporary slot');
    state.cards.splice(removableNullIndex, 1);
  }
  const collected: GameEvent = {
    type: 'collected', cardType: drop.type, merges: merged, dropId: drop.id,
    source: drop.source, star: drop.star, secure: drop.secure,
    validationRewardWave: drop.validationRewardWave,
    validationTypePolicy: drop.validationTypePolicy,
  };
  if (drop.bountyEncounterId !== undefined) collected.bountyEncounterId = drop.bountyEncounterId;
  const events: GameEvent[] = [collected];
  state.effectRuntime.pickupsThisWave++;
  events.push(...created.events);
  events.push(...evolutionEvents);
  events.push(...mergeEvents);
  events.push(...fireTrigger(state, config, rng, 'onPickup', { drop, point: { x: drop.x, y: drop.y } }));
  return events;
}

/** 拾取画布上离 (x,y) 最近且在半径内的掉落；无则不动作。 */
export function collectNearest(state: GameState, config: Config, rng: Rng, x: number, y: number, radius: number): GameEvent[] {
  let nearest: GroundDrop | null = null;
  let best = Infinity;
  for (const drop of state.groundDrops) {
    const d = Math.hypot(drop.x - x, drop.y - y);
    if (d < radius && d < best) { nearest = drop; best = d; }
  }
  return nearest ? collectDrop(state, config, rng, nearest) : [];
}

export type DebugCardPool = 'global' | 'run' | 'active';

/** 调试用：显式选择池档；默认遵守正常玩法的活跃池。 */
export function spawnTestDrops(
  state: GameState,
  config: Config,
  rng: Rng,
  pool: DebugCardPool = 'active',
): GameEvent[] {
  const cardPool = pool === 'global'
    ? getCardPool()
    : pool === 'run'
      ? getRunRoster(state)
      : getActivePool(state);
  const type = cardPool[state.merges % cardPool.length];
  for (const x of [360, 440, 520, 600]) {
    spawnGroundDrop(state, config, rng, x, 370, type, undefined, 'debug');
    recordCardDropShown(state, type, 'debug');
  }
  return [{ type: 'testDrops', cardType: type }];
}

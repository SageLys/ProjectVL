import { cfg } from '../../config';
import type { CardType, Config, DropSource, Enemy, GameEvent, GameState, GroundDrop, Rng } from '../types';
import { totalDropChance, totalDropLifetime } from '../stats';
import { autoMergeCards } from './cardSystem';
import { addXp } from './progressionSystem';
import { fireTrigger, getModifiers } from '../effects/interpreter';
import { canIssueGameplayCommand } from '../gameplayCommand';

const TAU = Math.PI * 2;
export const CARD_KEYS: CardType[] = cfg.skills.cards.map(card => card.id).filter(id => id !== 'wildcard');

/** 计算某类卡当前持有的 1★ 等价值。锁定模式的锁卡仍在手牌中；独立装备格模式另计装备。 */
function ownedStar1Value(state: GameState, type: CardType): number {
  const cards = cfg.economy.equipMode === 'slots'
    ? [...state.cards, ...state.equipment]
    : state.cards;
  let value = 0;
  for (const card of cards) {
    if (!card || card.type !== type) continue;
    if (card.star === 1) value += 1;
    else if (card.star === 2) value += 2;
    else if (card.star >= 3) value += 4;
  }
  return value;
}

/** 固定 CARD_KEYS 顺序的一次加权抽样；仅首张 3★ 恰缺一份（总等价值=3）的类型获得加权。 */
function randomDropType(state: GameState, rng: Rng): CardType {
  const targeting = cfg.economy.dropTargeting;
  const canCompleteThreeStar = cfg.economy.maxStar >= 3;
  const catalog = cfg.skills.cards.map(card => card.id).filter(id => id !== 'wildcard');
  if (state.activeCardPool.length === 0) {
    const shuffled = [...catalog];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    state.activeCardPool = shuffled.slice(0, Math.max(1, Math.min(shuffled.length, cfg.economy.dropPool.activePoolSize)));
  }
  const activeKeys = state.activeCardPool;
  const weights = activeKeys.map(type =>
    targeting.enabled && canCompleteThreeStar && ownedStar1Value(state, type) === 3
      ? targeting.nearCompletionWeight
      : 1,
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < activeKeys.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) return activeKeys[i];
  }
  return activeKeys[activeKeys.length - 1];
}

/** 在 (x,y) 生成一枚限时地面掉落。type 缺省随机；star 缺省按掉落星级策略（普通=1★）。 */
export function spawnGroundDrop(
  state: GameState,
  config: Config,
  rng: Rng,
  x: number,
  y: number,
  forcedType: CardType | null = null,
  star?: number,
  lifetimeMultiplier = 1,
  source: DropSource = 'normal',
): void {
  const type = forcedType ?? randomDropType(state, rng);
  const life = totalDropLifetime(state, config) * Math.max(0, lifetimeMultiplier);
  state.groundDrops.push({
    id: state.nextDropId++,
    x, y, type,
    star: star ?? cfg.economy.dropStarPolicy.normal,
    life,
    maxLife: life,
    pulse: rng() * TAU,
    source,
  });
}

/**
 * 接单 bounty 的“肥而急”保障奖励：固定生成 dropCount 张；2★ 基础权重按
 * starWeightShift 相乘，最终星级仍受 bountyBossMax 硬上限约束，寿命单独缩短。
 */
export function spawnBountyRewards(
  state: GameState,
  config: Config,
  rng: Rng,
  enemy: Enemy,
): number {
  const rewards = cfg.skills.mechanisms.bounty.rewards;
  const count = Math.max(0, Math.floor(rewards.dropCount));
  const policy = cfg.economy.dropStarPolicy;
  const star2Chance = Math.min(1, Math.max(0, policy.star2Share * rewards.starWeightShift));
  for (let i = 0; i < count; i++) {
    const rolledStar = rng() < star2Chance ? 2 : policy.normal;
    const star = Math.min(policy.bountyBossMax, rolledStar);
    const x = enemy.x + (rng() - 0.5) * 50;
    const y = enemy.y + (rng() - 0.5) * 50;
    spawnGroundDrop(state, config, rng, x, y, null, star, rewards.dropLifetimeMul, 'bounty');
  }
  return count;
}

/** 击杀掉落判定：概率命中或 boss 必掉，则在敌人位置生成掉落。 */
export function rollDropOnKill(state: GameState, config: Config, rng: Rng, enemy: Enemy): void {
  const wildcardRule = getModifiers(state).mergeRules.find(rule => rule.rule === 'wildcardDrop');
  if (wildcardRule && (enemy.type === 'boss' || enemy.bounty?.phase === 'accepted')) {
    spawnGroundDrop(state, config, rng, enemy.x, enemy.y, 'wildcard', 1, 1, enemy.type === 'boss' ? 'boss' : 'bounty');
  }
  if (enemy.type === 'boss') {
    const star = rng() < cfg.economy.dropStarPolicy.bossStar2Chance
      ? 2
      : cfg.economy.dropStarPolicy.normal;
    spawnGroundDrop(state, config, rng, enemy.x, enemy.y, null, star, 1, 'boss');
    return;
  }
  if (rng() < totalDropChance(state, config)) spawnGroundDrop(state, config, rng, enemy.x, enemy.y);
}

/**
 * 推进掉落寿命与浮动相位；超时移除并计入 expired。
 * expiryConvert 修饰（丰收 3★）：过期掉落按 ratio 概率转化为经验（破「过期即损失」）。
 */
export function tickDrops(state: GameState, _config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const convert = getModifiers(state).expiryConvert;
  for (let i = state.groundDrops.length - 1; i >= 0; i--) {
    const drop = state.groundDrops[i];
    drop.life -= dt;
    drop.pulse += dt * 3;
    if (drop.life <= 0) {
      state.groundDrops.splice(i, 1);
      state.expired++;
      if (drop.source === 'bounty') {
        state.bountyRewardExpired++;
        events.push({ type: 'bountyRewardExpired', dropId: drop.id, cardType: drop.type });
      }
      if (convert && rng() < convert.ratio) {
        state.expiredConverted++;
        events.push(...addXp(state, 1));
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
  if (!canIssueGameplayCommand(state)) return [];
  const empty = state.cards.findIndex(card => card === null);
  if (empty < 0) return [{ type: 'cardsFull' }];
  state.groundDrops = state.groundDrops.filter(d => d.id !== drop.id);
  state.cards[empty] = { id: state.nextCardId++, type: drop.type, star: drop.star };
  state.collected++;
  if (drop.source === 'bounty') state.bountyRewardCollected++;
  const { merged, events: mergeEvents } = autoMergeCards(state, config, rng);
  const events: GameEvent[] = [{ type: 'collected', cardType: drop.type, merges: merged }];
  if (drop.source === 'bounty') {
    events.push({ type: 'bountyRewardCollected', dropId: drop.id, cardType: drop.type });
  }
  events.push(...mergeEvents);
  events.push(...fireTrigger(state, config, rng, 'onPickup', { drop, point: { x: drop.x, y: drop.y } }));
  return events;
}

/** 拾取画布上离 (x,y) 最近且在半径内的掉落；无则不动作。 */
export function collectNearest(state: GameState, config: Config, rng: Rng, x: number, y: number, radius: number): GameEvent[] {
  if (!canIssueGameplayCommand(state)) return [];
  let nearest: GroundDrop | null = null;
  let best = Infinity;
  for (const drop of state.groundDrops) {
    const d = Math.hypot(drop.x - x, drop.y - y);
    if (d < radius && d < best) { nearest = drop; best = d; }
  }
  return nearest ? collectDrop(state, config, rng, nearest) : [];
}

/** 调试用：在固定位置生成 4 份同类型 1 星掉落，类型按已合成次数轮换。 */
export function spawnTestDrops(state: GameState, config: Config, rng: Rng): GameEvent[] {
  const type = CARD_KEYS[state.merges % CARD_KEYS.length];
  for (const x of [360, 440, 520, 600]) spawnGroundDrop(state, config, rng, x, 370, type);
  return [{ type: 'testDrops', cardType: type }];
}

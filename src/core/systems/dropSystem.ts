import { cfg } from '../../config';
import type { CardType, Config, Enemy, GameEvent, GameState, GroundDrop, Rng } from '../types';
import { totalDropChance, totalDropLifetime } from '../stats';
import { autoMergeCards, getActiveMergeCopies } from './cardSystem';
import { fireTrigger, getModifiers } from '../effects/interpreter';
import { addXp } from './progressionSystem';

const TAU = Math.PI * 2;
/** 正式卡池（P5 批次1+批次2，共 11 张技能卡）。 */
export const CARD_KEYS: CardType[] = [
  'pierce', 'chainLightning', 'frost', 'decoy', 'scorch', 'harvest', 'aegis',
  'splitBlast', 'impact', 'sanctum', 'thorns',
];
/** 过期折算经验的基准值（丰收 5★ 落穗：expiryConvert.ratio × 星级 × 本常数）。 */
const EXPIRY_CONVERT_XP_PER_STAR = 4;

/** 在 (x,y) 生成一枚限时地面掉落。type 缺省随机；star 缺省按掉落星级策略（普通=1★）。 */
export function spawnGroundDrop(state: GameState, config: Config, rng: Rng, x: number, y: number, forcedType: CardType | null = null, star?: number): void {
  const type = forcedType ?? CARD_KEYS[Math.floor(rng() * CARD_KEYS.length)];
  const life = totalDropLifetime(state, config);
  state.groundDrops.push({
    id: state.nextDropId++,
    x, y, type,
    star: star ?? normalDropStar(rng),
    life,
    maxLife: life,
    pulse: rng() * TAU,
  });
}

function normalDropStar(rng: Rng): number {
  if (cfg.economy.placeholderAssumptions.normalDropsOnlyOneStar) return 1;
  return rng() < cfg.economy.dropStarPolicy.star2Share ? 2 : cfg.economy.dropStarPolicy.normal;
}

/** 击杀掉落判定：概率命中或 boss 必掉，则在敌人位置生成掉落。 */
export function rollDropOnKill(state: GameState, config: Config, rng: Rng, enemy: Enemy): void {
  if (rng() < totalDropChance(state, config) || enemy.type === 'boss') {
    spawnGroundDrop(state, config, rng, enemy.x, enemy.y);
  }
}

/**
 * Bounty 精英击杀掉落：肥而急——dropCount 份、2★ 权重按 starWeightShift 放大、寿命 ×dropLifetimeMul。
 * 星级仍受 economy.dropStarPolicy.bountyBossMax 封顶（R8）。
 */
export function rollBountyDrops(state: GameState, config: Config, rng: Rng, enemy: Enemy): void {
  const { rewards } = cfg.skills.mechanisms.bounty;
  const star2Weight = cfg.economy.dropStarPolicy.star2Share * rewards.starWeightShift;
  for (let i = 0; i < rewards.dropCount; i++) {
    const star = rng() < star2Weight ? Math.min(2, cfg.economy.dropStarPolicy.bountyBossMax) : cfg.economy.dropStarPolicy.normal;
    const x = enemy.x + (rng() - 0.5) * 40;
    const y = enemy.y + (rng() - 0.5) * 40;
    spawnGroundDrop(state, config, rng, x, y, null, star);
    const drop = state.groundDrops[state.groundDrops.length - 1];
    drop.life *= rewards.dropLifetimeMul;
    drop.maxLife = drop.life;
  }
}

/**
 * 推进掉落寿命与浮动相位；超时移除并计入 expired。
 * 丰收 5★ 落穗（expiryConvert）：命中时按 ratio 把过期掉落折算经验，而非纯损失。
 */
export function tickDrops(state: GameState, _config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = state.groundDrops.length - 1; i >= 0; i--) {
    const drop = state.groundDrops[i];
    drop.life -= dt;
    drop.pulse += dt * 3;
    if (drop.life <= 0) {
      state.groundDrops.splice(i, 1);
      state.expired++;
      const convert = getModifiers(state).expiryConvert;
      if (convert && rng() < convert.ratio) {
        events.push(...addXp(state, drop.star * EXPIRY_CONVERT_XP_PER_STAR, rng));
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
  const empty = state.cards.findIndex(card => card === null);
  const originalLength = state.cards.length;
  if (empty < 0) {
    const canMergeImmediately = drop.star < cfg.economy.maxStar
      && state.cards.filter(card => card?.type === drop.type && card.star === drop.star).length >= getActiveMergeCopies() - 1;
    if (!canMergeImmediately) return [{ type: 'cardsFull' }];
  }
  state.groundDrops = state.groundDrops.filter(d => d.id !== drop.id);
  const collectedCard = { id: state.nextCardId++, type: drop.type, star: drop.star };
  if (empty >= 0) state.cards[empty] = collectedCard;
  else state.cards.push(collectedCard);
  state.collected++;
  const { merged, events: mergeEvents } = autoMergeCards(state, config, rng);
  while (state.cards.length > originalLength) {
    const removableNullIndex = state.cards.lastIndexOf(null);
    if (removableNullIndex < 0) throw new Error('Full-hand merge did not free a temporary slot');
    state.cards.splice(removableNullIndex, 1);
  }
  const events: GameEvent[] = [{ type: 'collected', cardType: drop.type, merges: merged }];
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

/** 调试用：在固定位置生成 4 份同类型 1 星掉落，类型按已合成次数轮换。 */
export function spawnTestDrops(state: GameState, config: Config, rng: Rng): GameEvent[] {
  const type = CARD_KEYS[state.merges % CARD_KEYS.length];
  for (const x of [360, 440, 520, 600]) spawnGroundDrop(state, config, rng, x, 370, type);
  return [{ type: 'testDrops', cardType: type }];
}

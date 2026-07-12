// 装备/卡槽操作：移动交换、装备门槛（equipThreshold，配置变量）、
// 同类型唯一（R9）、喂养合成（R10）、锁定即装备（方案B）、消耗释放（R1–R4）。
// 临时栏已随 P0-3/P0-6 移除；消耗入口 = 拖入主画面（落点 = 技能空间锚点）。
import { cfg } from '../../config';
import type { Card, Config, GameEvent, GameState, Rng, SlotKind } from '../types';
import { autoMergeCards } from './cardSystem';
import { getSkillDef, releaseConsumable, fireTrigger } from '../effects/interpreter';
import { canIssueGameplayCommand } from '../gameplayCommand';

function collectionFor(state: GameState, kind: SlotKind): (Card | null)[] {
  return kind === 'cards' ? state.cards : state.equipment;
}

/** 喂养合成（R10）：同型同星喂给已装备/锁定的卡 → 目标升 1 星，源卡消失。 */
function feed(state: GameState, config: Config, rng: Rng, source: (Card | null)[], sourceIndex: number, target: Card): GameEvent[] {
  target.star++;
  source[sourceIndex] = null;
  state.merges++;
  state.equipOps++;
  const events: GameEvent[] = [{ type: 'fed', cardType: target.type, resultStar: target.star }];
  events.push(...fireTrigger(state, config, rng, 'onMerge', { merge: { cardType: target.type, resultStar: target.star } }));
  return events;
}

/** 目标集合中是否已有同类型的其他生效装备卡（R9 同类型唯一）。 */
function duplicateEquippedType(cards: (Card | null)[], moving: Card, skipIndex: number): Card | null {
  for (let i = 0; i < cards.length; i++) {
    if (i === skipIndex) continue;
    const c = cards[i];
    if (c && c.type === moving.type) return c;
  }
  return null;
}

/**
 * 在卡槽/装备栏之间移动或交换（slots 模式；lock 模式下卡槽内移动仍可用）。
 * - 目标为装备栏：星级 < equipThreshold → 拒绝；同类型已装备 → 同星喂养 / 否则拒绝
 * - 目标有卡 → 交换（同型同星且目标锁定 → 喂养）；否则移动
 * 涉及卡槽的操作后触发自动合成；每次成功计入 equipOps。锁定卡不可被移动。
 */
export function moveOrSwap(state: GameState, config: Config, rng: Rng, sourceKind: SlotKind, sourceIndex: number, targetKind: SlotKind, targetIndex: number): GameEvent[] {
  if (!canIssueGameplayCommand(state)) return [];
  if (sourceKind === targetKind && sourceIndex === targetIndex) return [];
  const source = collectionFor(state, sourceKind);
  const target = collectionFor(state, targetKind);
  const moving = source[sourceIndex];
  if (!moving) return [];
  if (moving.locked) return [{ type: 'lockRejected', reason: 'locked' }];

  const replaced = target[targetIndex];

  // 喂养：拖到锁定卡（lock 模式）或装备栏同型卡上。
  if (replaced && cfg.economy.feedEquipped && replaced.type === moving.type && replaced.star === moving.star
    && replaced.star < cfg.economy.maxStar && (replaced.locked || targetKind === 'equipment')) {
    return feed(state, config, rng, source, sourceIndex, replaced);
  }

  if (targetKind === 'equipment') {
    if (moving.star < cfg.economy.equipThreshold) return [{ type: 'equipRejected', reason: 'star' }];
    if (cfg.economy.equipDistinctTypes && duplicateEquippedType(state.equipment, moving, targetIndex)) {
      return [{ type: 'equipRejected', reason: 'duplicate' }];
    }
  }
  if (replaced?.locked) return [{ type: 'lockRejected', reason: 'locked' }];

  target[targetIndex] = moving;
  source[sourceIndex] = replaced || null;
  state.equipOps++;
  const events: GameEvent[] = replaced
    ? [{ type: 'swapped', a: moving.type, b: replaced.type }]
    : [];
  const { merged, events: mergeEvents } = (targetKind === 'cards' || sourceKind === 'cards')
    ? autoMergeCards(state, config, rng)
    : { merged: 0, events: [] as GameEvent[] };
  if (!replaced) events.push({ type: 'moved', cardType: moving.type, merges: merged });
  events.push(...mergeEvents);
  return events;
}

/**
 * 锁定即装备（方案B）：单击切换锁定态。
 * 校验：星级 ≥ equipThreshold；锁定数 < maxLocked；锁定集内同类型唯一（R9）。
 * 锁定卡 = 生效装备；不参与自动合成、不可移动、不可直接消耗。
 */
export function toggleLock(state: GameState, index: number): GameEvent[] {
  if (!canIssueGameplayCommand(state)) return [];
  if (cfg.economy.equipMode !== 'lock') return [];
  const card = state.cards[index];
  if (!card) return [];
  if (card.locked) {
    card.locked = false;
    state.equipOps++;
    return [{ type: 'unlocked', cardType: card.type }];
  }
  if (card.star < cfg.economy.equipThreshold) return [{ type: 'lockRejected', reason: 'star' }];
  const locked = state.cards.filter((c): c is Card => !!c?.locked);
  if (locked.length >= cfg.economy.maxLocked) return [{ type: 'lockRejected', reason: 'limit' }];
  if (cfg.economy.equipDistinctTypes && locked.some(c => c.type === card.type)) {
    return [{ type: 'lockRejected', reason: 'duplicate' }];
  }
  card.locked = true;
  state.equipOps++;
  return [{ type: 'locked', cardType: card.type }];
}

/** 双击/快捷装备：lock 模式 = 切换锁定；slots 模式 = 移到装备栏空位。 */
export function quickEquip(state: GameState, config: Config, rng: Rng, cardIndex: number): GameEvent[] {
  if (!canIssueGameplayCommand(state)) return [];
  if (cfg.economy.equipMode === 'lock') return toggleLock(state, cardIndex);
  const target = state.equipment.findIndex(card => card === null);
  if (target < 0) return [{ type: 'equipFull' }];
  return moveOrSwap(state, config, rng, 'cards', cardIndex, 'equipment', target);
}

/** 快速卸下（slots 模式）：装备卡 → 卡槽空位（满则失败且不改状态）。 */
export function quickUnequip(state: GameState, config: Config, rng: Rng, equipIndex: number): GameEvent[] {
  if (!canIssueGameplayCommand(state)) return [];
  const target = state.cards.findIndex(card => card === null);
  if (target < 0) return [{ type: 'unequipFull' }];
  return moveOrSwap(state, config, rng, 'equipment', equipIndex, 'cards', target);
}

/**
 * 消耗释放（R1–R4）：拖入主画面抬指，落点 (x,y) = 效果空间锚点。
 * 失去该卡（R3）；锁定卡拒绝（防误耗装备，先解锁）。
 * 效果结算走解释器 releaseConsumable；无定义的卡类型仅移除并计数（不应出现）。
 */
export function consumeCard(state: GameState, config: Config, rng: Rng, sourceIndex: number, x: number, y: number): GameEvent[] {
  if (!canIssueGameplayCommand(state)) return [];
  const card = state.cards[sourceIndex];
  if (!card) return [];
  if (card.locked) return [{ type: 'lockRejected', reason: 'locked' }];
  state.cards[sourceIndex] = null;
  state.consumes++;
  const events: GameEvent[] = [{ type: 'skillConsumed', cardType: card.type, star: card.star, x, y }];
  if (getSkillDef(card.type)) {
    events.push(...releaseConsumable(state, config, rng, card.type, card.star, x, y));
  }
  return events;
}

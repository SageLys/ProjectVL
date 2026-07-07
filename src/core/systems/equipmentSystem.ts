import { gameConfig } from '../../data';
import type { Card, GameEvent, GameState, SlotKind } from '../types';
import { autoMergeCards } from './cardSystem';

function collectionFor(state: GameState, kind: SlotKind): (Card | null)[] | null {
  if (kind === 'cards') return state.cards;
  if (kind === 'equipment') return state.equipment;
  return null;
}

/** 把卡牌投入临时栏（任意星级可入，本波生效）。计入 uses；源为卡槽时触发合成。 */
export function absorbTempCard(state: GameState, sourceKind: SlotKind, sourceIndex: number): GameEvent[] {
  const source = collectionFor(state, sourceKind);
  if (!source) return [];
  const moving = source[sourceIndex];
  if (!moving) return [];
  source[sourceIndex] = null;
  state.tempCards.push(moving);
  state.uses++;
  const merges = sourceKind === 'cards' ? autoMergeCards(state) : 0;
  return [{ type: 'tempInvest', cardType: moving.type, merges }];
}

/**
 * 在卡槽/装备栏/临时栏之间移动或交换。
 * - 目标为临时栏 → 投入临时栏
 * - 目标为装备栏且卡牌非 3 星 → 拒绝
 * - 目标有卡 → 交换；否则移动
 * 涉及卡槽的移动/交换后触发自动合成；每次成功计入 uses。
 */
export function moveOrSwap(state: GameState, sourceKind: SlotKind, sourceIndex: number, targetKind: SlotKind, targetIndex: number): GameEvent[] {
  if (sourceKind === targetKind && sourceIndex === targetIndex) return [];
  if (targetKind === 'temp') return absorbTempCard(state, sourceKind, sourceIndex);
  const source = collectionFor(state, sourceKind);
  const target = collectionFor(state, targetKind);
  if (!source || !target) return [];
  const moving = source[sourceIndex];
  if (!moving) return [];
  if (targetKind === 'equipment' && moving.star < gameConfig.maxStar) {
    return [{ type: 'equipRejected' }];
  }
  const replaced = target[targetIndex];
  target[targetIndex] = moving;
  source[sourceIndex] = replaced || null;
  const merges = targetKind === 'cards' || sourceKind === 'cards' ? autoMergeCards(state) : 0;
  state.uses++;
  return replaced
    ? [{ type: 'swapped', a: moving.type, b: replaced.type }]
    : [{ type: 'moved', cardType: moving.type, merges }];
}

/** 双击快速装备：卡槽卡牌 → 装备栏空位（满则失败且不改状态）。 */
export function quickEquip(state: GameState, cardIndex: number): GameEvent[] {
  const target = state.equipment.findIndex(card => card === null);
  if (target < 0) return [{ type: 'equipFull' }];
  return moveOrSwap(state, 'cards', cardIndex, 'equipment', target);
}

/** 双击快速卸下：装备卡 → 卡槽空位（满则失败且不改状态）。 */
export function quickUnequip(state: GameState, equipIndex: number): GameEvent[] {
  const target = state.cards.findIndex(card => card === null);
  if (target < 0) return [{ type: 'unequipFull' }];
  return moveOrSwap(state, 'equipment', equipIndex, 'cards', target);
}

/** 清空临时栏（下一波开始时调用）。返回被清空的数量事件（无则空）。 */
export function clearTempCards(state: GameState): GameEvent[] {
  if (!state.tempCards.length) return [];
  const count = state.tempCards.length;
  state.tempCards = [];
  return [{ type: 'tempCleared', count }];
}

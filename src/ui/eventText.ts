import { cards as cardsData, texts } from '../data';
import type { CardType, GameEvent } from '../core/types';
import { fmt } from './format';

const name = (t: CardType) => cardsData.types[t].name;
const T = texts.toast;

/** 事件类型中会改变卡槽/装备/临时栏内容、需要重绘槽位的集合。 */
export const SLOT_CHANGING = new Set<GameEvent['type']>(['collected', 'moved', 'swapped', 'tempInvest', 'tempCleared']);

/** 把语义事件翻译成 toast 文案；无需 toast 的事件（升级/结算）返回 null。 */
export function formatToast(ev: GameEvent): string | null {
  switch (ev.type) {
    case 'tempCleared': return fmt(T.tempCleared, { count: ev.count });
    case 'waveStart': return fmt(T.waveStart, { wave: ev.wave });
    case 'waveCleared': return fmt(T.waveClear, { wave: ev.wave });
    case 'breakthrough': return fmt(T.breakthrough, { damage: ev.damage });
    case 'cardsFull': return T.cardsFull;
    case 'collected': return ev.merges ? fmt(T.collectMerged, { count: ev.merges }) : fmt(T.collect, { name: name(ev.cardType) });
    case 'equipFull': return T.equipFull;
    case 'unequipFull': return T.unequipFull;
    case 'equipRejected': return T.equipOnly3Star;
    case 'tempInvest': return fmt(T.tempInvest, { name: name(ev.cardType), mergeSuffix: ev.merges ? fmt(T.mergeSuffix, { count: ev.merges }) : '' });
    case 'moved': return fmt(T.moved, { name: name(ev.cardType), mergeSuffix: ev.merges ? fmt(T.mergeSuffix, { count: ev.merges }) : '' });
    case 'swapped': return fmt(T.swapped, { a: name(ev.a), b: name(ev.b) });
    case 'testDrops': return fmt(T.testDrops, { name: name(ev.cardType) });
    case 'perkApplied': return fmt(T.perkApplied, { title: ev.title });
    case 'levelUp':
    case 'gameEnd':
      return null;
  }
}

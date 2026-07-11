import { cfg } from '../config';
import { texts } from '../data';
import type { CardType, GameEvent } from '../core/types';
import { fmt } from './format';

const name = (t: CardType) => cfg.skills.legacy.types[t]?.name ?? t;
const T = texts.toast;

/** 事件类型中会改变卡槽/装备内容、需要重绘槽位的集合。 */
export const SLOT_CHANGING = new Set<GameEvent['type']>([
  'collected', 'moved', 'swapped', 'merged', 'fed', 'skillConsumed', 'locked', 'unlocked',
]);

/** 把语义事件翻译成 toast 文案；无需 toast 的事件返回 null。 */
export function formatToast(ev: GameEvent): string | null {
  switch (ev.type) {
    case 'waveStart': return fmt(T.waveStart, { wave: ev.wave });
    case 'waveCleared': return fmt(T.waveClear, { wave: ev.wave });
    case 'breakthrough': return fmt(T.breakthrough, { damage: Math.round(ev.damage) });
    case 'cardsFull': return T.cardsFull;
    case 'collected': return ev.merges ? fmt(T.collectMerged, { count: ev.merges }) : fmt(T.collect, { name: name(ev.cardType) });
    case 'equipFull': return T.equipFull;
    case 'unequipFull': return T.unequipFull;
    case 'equipRejected':
      return ev.reason === 'duplicate' ? T.equipRejectedDuplicate : fmt(T.equipRejectedStar, { threshold: cfg.economy.equipThreshold });
    case 'moved': return fmt(T.moved, { name: name(ev.cardType), mergeSuffix: ev.merges ? fmt(T.mergeSuffix, { count: ev.merges }) : '' });
    case 'swapped': return fmt(T.swapped, { a: name(ev.a), b: name(ev.b) });
    case 'merged': return null; // 合成提示已并入 collected/moved 的 mergeSuffix
    case 'fed': return fmt(T.fed, { name: name(ev.cardType), star: ev.resultStar });
    case 'skillConsumed': return fmt(T.skillConsumed, { name: name(ev.cardType), star: ev.star });
    case 'locked': return fmt(T.locked, { name: name(ev.cardType) });
    case 'unlocked': return fmt(T.unlocked, { name: name(ev.cardType) });
    case 'lockRejected':
      switch (ev.reason) {
        case 'star': return fmt(T.lockRejectedStar, { threshold: cfg.economy.equipThreshold });
        case 'limit': return fmt(T.lockRejectedLimit, { max: cfg.economy.maxLocked });
        case 'duplicate': return T.lockRejectedDuplicate;
        case 'locked': return T.lockRejectedLocked;
      }
      return null;
    case 'shieldBroken': return T.shieldBroken;
    case 'testDrops': return fmt(T.testDrops, { name: name(ev.cardType) });
    case 'perkApplied': return fmt(T.perkApplied, { title: ev.title });
    case 'levelUp':
    case 'gameEnd':
      return null;
  }
}
